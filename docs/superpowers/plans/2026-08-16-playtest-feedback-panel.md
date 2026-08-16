# Phase 10 — Playtest feedback panel

## Decisions

| Question | Decision | Why |
|---|---|---|
| Where does the panel live? | Fixed column on the right of the viewport; `#app` shifts left. Desktop only. | Spec says "to the right of the game", "full-size desktop browser". |
| How is it turned on? | `?playtest=1` query param. Lazy `import()`, like the dev panel. | Players must never load it. Keeps the shipped bundle unchanged. |
| Does it pause the game? | No. It is NOT an overlay. The tick loop keeps running. | `js/main.js:122` halts on `ui.overlays.anyOpen()`. A tester must talk while the game runs. |
| Where does the entry queue live? | IndexedDB `tf-playtest`, `MemoryStore` fallback. | Audio blobs must survive a reload. Clone of `alignment-issues/game/js/telemetry/store.js`. |
| What is a "gameplay marker"? | `markerStart` + `markerEnd` + a 180 s rolling `trail` sampled every 2 s. | The spec's delay problem. One end-marker cannot locate an issue the tester noticed 40 s ago. |
| Audio format | `MediaRecorder`, `audio/mp4` → `.m4a`, else `audio/webm;codecs=opus` → `.webm`. | Same probe order as alignment-issues; `ffmpeg` handles both. |
| Submit transport | Broker Lambda Function URL → one-shot presigned POST → direct S3 upload. | Exactly the alignment-issues design. No AWS keys in the browser. |
| Offline path | `FileSink` writes a dependency-free STORE-only zip via a download. | Playtesting must work before any infra exists. |
| Bucket | New, dedicated: `earchibald-tf-session-submissions`. Own broker, own analyst user. | Reusing the HYT broker means editing another project's Lambda regex. |
| Transcription | Local `mlx_whisper --model mlx-community/whisper-base.en-mlx`, `whisper-cli` fallback. | No API key, no upload. `--model` is load-bearing; the default `tiny` mangles words. |
| Testability | All logic in pure DOM-free modules under `js/playtest/`; `panel.js` is a thin shell. | The repo has zero DOM tests and no jsdom. |

## Context

`tooth-fairy` is vanilla ESM, zero deps, no build, `node --test`, 200 ms tick, `#app` is a
480 px phone column. The Laws apply: no `innerHTML`, `createElement` only, engine stays pure,
UI modules are `createX(root, ctx) -> { update(state) }`, every control gets a `data-testid`.

The panel reads state; it never mutates it. It needs no reducer and no `sfx` event.

`alignment-issues` already solved submission and voice triage. This phase clones that design
rather than inventing one. Source files worth reading before writing code:

- `~/work/alignment-issues/infra/{main.tf,variables.tf,outputs.tf,run.sh}`
- `~/work/alignment-issues/infra/lambda/{broker.mjs,validate.mjs}`
- `~/work/alignment-issues/game/js/telemetry/{sinks.js,submit-env.js,zip.js,store.js}`
- `~/work/alignment-issues/scripts/{sessions.mjs,session-merge.mjs}`
- `~/work/alignment-issues/.claude/skills/analyze-session/SKILL.md`

## 1. Marker capture — `js/playtest/marker.js` (pure)

```js
export function captureMarker(state, clock)   // -> flat JSON-safe marker
export function createTrail(opts)             // -> { sample(state, clock), window(atMs), all() }
```

`captureMarker` returns:

```
{ atMs, sessionMs, tick, gameS, act, town, night, nightPhase,
  teeth, lifetime, taps, wakes, tiptoes, belief, stir, stars, beats, ended }
```

- `gameS = tick * TICK_MS / 1000`.
- `beats = state.beatsSeen.length`.
- Read only. Never touch `state.rngState`; never call engine RNG.

`createTrail({ everyMs = 2000, spanMs = 180000 })` keeps a ring buffer of markers.
`window(atMs)` returns the samples inside `[atMs - spanMs, atMs]`, oldest first.

Tests: sampling honours `everyMs`; the buffer evicts past `spanMs`; `window()` is inclusive
at both bounds; a marker is deep-equal JSON-round-trippable.

## 2. Entry model — `js/playtest/entries.js` (pure)

```js
export function newSessionId(nowMs, rand)     // `${nowMs}-${4 base36 chars}`, mirrors HYT
export function makeTextEntry({ id, text, markerStart, markerEnd, trail, createdAt })
export function makeVoiceEntry({ id, blob, mime, ext, durationMs, markerStart, markerEnd, trail, createdAt })
export function editText(entry, text, editedAt)   // returns a NEW entry, sets edited: true
export function voiceIndex(entries, id)           // 1-based index among voice entries only
```

Entry shape (`kind: 'text' | 'voice'`):

```
{ id, kind, seq, createdAt, editedAt, edited,
  text?,  blob?, mime?, ext?, durationMs?,
  markerStart, markerEnd, trail }
```

`id` is `${createdAt}-${seq}`. `seq` is monotonic per session.

Rules:
- Text entries refuse to submit when `text.trim()` is empty (return `null`, no throw).
- `editText` on a voice entry throws — that is a programming error, not user input.
- `voiceIndex` drives the `-v<k>` filename suffix and must stay stable after a delete, so
  it is computed from `seq` order over surviving voice entries at bundle time and frozen
  into the bundle manifest.

Tests: id format, empty-text refusal, edit produces a new object and preserves markers,
voice numbering after deletes, `seq` monotonicity.

## 3. Store — `js/playtest/store.js`

Clone `alignment-issues/game/js/telemetry/store.js` shape. DB `tf-playtest` v1, one object
store `entries` keyed by `id`, one `meta` store keyed by `k` (holds `{k:'session', id, startedAt}`).
Blobs go straight into `entries` — IndexedDB stores `Blob` natively, so no chunking is needed
for a per-entry recording.

```js
export function createStore()   // -> IdbStore, or MemoryStore when indexedDB is unavailable
// { openSession(nowMs, rand), putEntry(e), deleteEntry(id), allEntries(), clear() }
```

`allEntries()` returns entries sorted by `seq`.

Tests: `MemoryStore` only (Node has no IndexedDB). Cover put/get/delete/sort and session reuse.

## 4. Bundle — `js/playtest/bundle.js` (pure)

```js
export function bundleFilenames(bundle)   // { events, audio: [...] }
export function bundleToJsonl(bundle)     // string
```

Filenames:
- events: `tf-session-${id}.jsonl`
- audio:  `tf-session-${id}-v${k}.${ext}`  (k = 1-based voice index)

JSONL, one JSON object per line:

1. `{"type":"header", v:1, sessionId, startedAt, endedAt, game:{version, seed, act, town, tick}, save:"<base64 of serialize(state)>", ua, viewport}`
2. one `{"type":"entry", ...}` per entry, in `seq` order. Voice entries carry `audioFile`
   instead of a blob, plus `durationMs`.
3. `{"type":"trail", entryId, samples:[...]}` per entry — kept on separate lines so the
   entry lines stay readable.

The header embeds the base64 save so a report can reproduce the exact run.

Tests: line count, parse-round-trip, filename numbering, header carries the save.

## 5. Zip fallback — `js/playtest/zip.js`

Copy `alignment-issues/game/js/telemetry/zip.js` verbatim (STORE-only, dependency-free,
CRC32 + local headers + central directory). Copy its test too. Do not rewrite it.

## 6. Sinks — `js/playtest/sinks.js`

```js
export function createFileSink()            // zip -> anchor download, always available
export function createS3Sink(env)           // broker grant -> presigned POST, per file
export const SubmitSink                     // S3 when SUBMIT_ENV.enabled, else file
```

`createS3Sink` is a direct port of `alignment-issues/game/js/telemetry/sinks.js:139-197`:
per file, POST `{token, sessionId, filename, size, contentType}` to `env.brokerUrl`, receive
`{url, fields}`, `FormData` them plus the file, POST to S3. Keep `baseType()` — it strips
`;codecs=opus`, without which the broker refuses with 415. No retry loop. Report progress
through `onProgress(phase, file, done, total)`.

`js/playtest/submit-env.js` is a committed inactive stub:

```js
export const SUBMIT_ENV = { enabled: false, brokerUrl: '', token: '' };
```

Never commit a real token. Deploy-time injection mirrors the HYT workflow step.

Tests: `createS3Sink` with an injected `fetch` — grant refusal surfaces `reason`, content
type is normalised, upload failure throws with the status, progress fires per file.

## 7. Recorder — `js/playtest/recorder.js`

```js
export function pickMime()   // { mime:'audio/mp4', ext:'m4a' } | webm/opus | null
export function createRecorder(deps)   // deps: { getUserMedia, MediaRecorderCtor, now }
```

`createRecorder` returns `{ start(), stop(), cancel(), isRecording(), durationMs() }`.
`stop()` resolves `{ blob, mime, ext, durationMs }`. `cancel()` discards chunks, stops the
tracks, and resolves `null`. Both always release the mic tracks — a live mic light after
cancel is the bug this guards.

Injected deps make it node-testable with fakes. `pickMime()` returns `null` when
`MediaRecorder` is undefined; the panel then hides the record button and says so.

Tests: mime probe order; cancel discards and releases tracks; stop returns accumulated
chunks; duration excludes nothing (there is no pause in this UI).

## 8. Panel DOM — `js/playtest/panel.js`

`export function mountPlaytestPanel(ctx)` where `ctx = { app, box, cfg, names, save, getState }`.

Self-injects its own `<style>` (dev-panel precedent, `js/dev/panel.js:67-137`) so
`css/main.css` stays player-only. Adds `playtest` class to `document.body`.

Layout:
- `aside.ptPanel` — `position:fixed; top:0; right:0; bottom:0; width:clamp(360px,32vw,460px)`,
  own `overflow:hidden`, internal flex column.
- `body.playtest #app { margin-right: calc(clamp(360px,32vw,460px) + 24px); }` so the game
  column moves out from under the panel instead of being covered.
- Below `1100px` viewport width the panel becomes a bottom drawer and prints a note that it
  is designed for a desktop window. Do not try to make it good on a phone.

Structure, top to bottom:

| Region | Contents | `data-testid` |
|---|---|---|
| Header | title, session id, entry count, **Submit session** button | `pt-submit-top` |
| Compose: voice | one toggle button `● record` / `■ stop & submit`, live `mm:ss`, `cancel` button (enabled only while recording) | `pt-rec`, `pt-rec-time`, `pt-rec-cancel` |
| Compose: text | `<textarea>` + `Submit` button | `pt-text`, `pt-text-submit` |
| Queue | scrollable `<ol class="ptQueue">`, oldest first, auto-scrolled to the newest on add | `pt-queue` |
| Footer | **Submit session** button (duplicate of the header one), status line | `pt-submit-bottom`, `pt-status` |

Queue item:
- header line: `#<seq>`, kind icon, clock time, `t=<gameS>s act <act> night <night>`
- voice: `<audio controls src=objectURL>` + duration
- text: `<textarea>` bound to the entry, saving on `change`/blur; shows `edited` when dirty
- `delete` button (`data-testid="pt-del-<id>"`)

Delete confirmation: an in-panel confirm row replacing the item's buttons
(`Delete? [yes] [no]`) — never `window.confirm`, which blocks the tick loop and the
browser-automation tools. `event.shiftKey` on the delete button deletes immediately.
Object URLs are revoked on delete and on unmount.

Marker capture:
- voice: `markerStart` on `start()`, `markerEnd` on `stop()`.
- text: `markerStart` on the first input into an empty textarea, `markerEnd` on submit.
- `trail` = `trail.window(markerEnd.atMs)` at submit time.
- The trail sampler runs on its own 2 s interval, independent of the render loop, so a
  stalled rAF cannot blind it.

Submit session: disables both submit buttons, streams progress into `pt-status`
(`2/5 tf-session-…-v1.m4a`), and on success marks the session submitted and keeps the
entries in IndexedDB (deleting local data on a successful upload is not this phase's job).

Mount from `js/main.js`, beside the existing dev gate:

```js
const PLAYTEST = params.get('playtest') === '1';
if (PLAYTEST) {
  import('./playtest/panel.js')
    .then((m) => m.mountPlaytestPanel({ app, box, cfg, names, save, getState: () => box.state }))
    .catch((err) => console.warn('[playtest] panel failed to load', err));
}
```

All player-visible copy goes in a new `names.playtest` block in `js/config/names.js` so
`test/config.test.js` covers it.

## 9. Infra — `infra/`

Clone the HYT terraform, renamed and re-parameterised.

- `infra/variables.tf`: `bucket_name` (default `earchibald-tf-session-submissions`),
  `region` (`us-east-1`, matching the account default), `allowed_origins` (**list**, default
  `["http://localhost:8123"]`), `submit_token` (sensitive), `expire_days` (90).
  The list is the one real change from HYT — local playtesting needs `http://localhost:8123`
  and a deployed build needs `https://earchibald.github.io`.
- `infra/main.tf`: bucket + public-access block + AES256 SSE + lifecycle expiry +
  TLS-only deny policy + CORS (POST, `allowed_origins`) + broker Lambda (`nodejs22.x`,
  10 s, env `BUCKET`/`SUBMIT_TOKEN`) + Function URL (`authorization_type = "NONE"`,
  CORS POST, `content-type`) + IAM: Lambda may only `s3:PutObject` on `submissions/*`;
  analyst user `tf-analyst` may `GetObject`/`DeleteObject` on `submissions/*` and
  `ListBucket` under that prefix.
- `infra/lambda/validate.mjs`: port with tooth-fairy names.
  - `SESSION_ID_RE = /^\d{13}-[a-z0-9]{4}$/`
  - `filenameRe = new RegExp('^tf-session-' + sessionId + '(\\.jsonl|-v\\d+\\.(m4a|webm))$')`
  - `JSONL_MAX_BYTES = 25MB`, `AUDIO_MAX_BYTES = 200MB`
  - key = `submissions/${YYYY-MM-DD}/${sessionId}/${filename}`
  - constant-time token compare over SHA-256 digests
- `infra/lambda/broker.mjs`: port unchanged apart from the import of the new validator.
- `infra/run.sh`: `init|plan|apply|outputs|destroy`, writes git-ignored `infra/outputs.json`.
- `infra/terraform.tfvars.example`; `.gitignore` gains `infra/terraform.tfvars`,
  `infra/*.tfstate*`, `infra/outputs.json`, `infra/lambda.zip`, `.terraform/`.

`test/broker-validate.test.js` covers the validator: bad token, bad session id, filename
mismatch, oversize, wrong content type, and the happy key.

**Do not run `terraform apply` without asking.** It creates a publicly reachable Function URL.

## 10. Retrieval CLI — `scripts/sessions.mjs`

Zero-dep port. `node scripts/sessions.mjs <list|pull|rm> [--latest] [--dest dir]`.
Profile: `default` (this account has no `tf-analyst` profile until infra ships; read the
profile from `TF_PROFILE`, defaulting to `default`). Bucket/region from `infra/outputs.json`,
overridable by `TF_BUCKET` / `TF_REGION`. Every side effect injectable (`runner`) for tests.
Sessions are grouped by the 4-part key and marked with 🎙 when any `-v\d+\.(m4a|webm)` exists.

`test/sessions-cli.test.js`: grouping, `--latest` selection, `rm --latest` refusal.

## 11. Transcription — `scripts/transcribe.mjs`

New (HYT had no wrapper). `node scripts/transcribe.mjs <audio...> [--out dir] [--model M]`.

For each input:
1. `ffmpeg -v error -y -i <in> -ac 1 -ar 16000 -c:a pcm_s16le <tmp>.wav`
   Use `ffmpeg`, never `afconvert`: despite the `.m4a` name Chrome writes a fragmented MP4
   carrying OPUS, which CoreAudio cannot open.
2. `mlx_whisper <wav> --model mlx-community/whisper-base.en-mlx --output-dir <out>
   --output-format json --output-name <basename>`
   Fall back to `whisper-cli -m ~/.cache/whisper/ggml-base.en.bin -f <wav> -oj -of <out>/<basename>`.
3. Preserve the `-v<k>` suffix in the output name — the merger recovers the entry index from it.

Print a one-line summary per file. Exit non-zero if no backend is installed, naming both
install commands (`pipx install mlx-whisper`, `brew install whisper-cpp`).

Tests: command construction and backend selection with an injected runner. Do not run
whisper in `node --test`.

## 12. Merge — `scripts/playtest-merge.mjs`

`node scripts/playtest-merge.mjs <events.jsonl> [transcript.json ...] [--out file]`

Reads both whisper JSON shapes (`.transcription` with ms `offsets`, `.segments` with second
`start`) exactly as `alignment-issues/scripts/session-merge.mjs:108-130` does. Recovers the
entry index from the **last** `-v<digits>.` in the filename.

Output markdown, per entry:

```
### #3 · voice · 21:14:07 · 18.4 s
window: t=612s … t=630s · act 2 · night 7 · teeth 1.2K → 1.4K

> And the dawn meter jumped again, I still don't know what that means.

<details><summary>trail (180 s before submit)</summary>

| t | act | night | teeth | rate | belief | stir |
|---|---|---|---|---|---|---|
...
</details>
```

The header of every report must carry this warning, because it is the whole point of the
trail:

> A tester describes something **after** it happens. `markerEnd` is when they stopped
> talking, not when the thing happened. Look 15–90 s earlier in the trail before you
> conclude where a complaint lands.

Tests: both whisper shapes, index recovery from a tricky filename, an entry with no
transcript still renders, trail table rows match the samples.

## 13. Skill — `.claude/skills/analyze-playtest/SKILL.md`

Modelled on `alignment-issues/.claude/skills/analyze-session/SKILL.md`.

Sections: locate (S3 via `scripts/sessions.mjs`, or a local zip), transcribe
(`scripts/transcribe.mjs`, with the `--model` warning and the `afconvert` warning), merge
(`scripts/playtest-merge.mjs`), **the delay caveat**, triage checklist, report template,
and the checksum-before-delete rule.

Triage checklist: Friction · Pacing (gaps > 30 s of silence with no progress) · Confusion ·
Bugs · Ideas (quote verbatim) · Progression (one row per act/night reached) · Follow-ups.

Report goes to `docs/playtests/<sessionId>-report.md`. Create `docs/playtests/.gitkeep`.

Standing permission to delete a pulled submission **only after** `md5 -q <file>` matches the
`ETag` from `aws s3api head-object` and `ContentLength` matches the local size. Never delete
on a mismatch — the recording is the only copy.

## 14. Docs

- `README.md`: a Playtest panel section — `?playtest=1`, what the buttons do, where entries
  go, how to submit, how to pull and analyse.
- `docs/superpowers/specs/2026-08-16-playtest-feedback-panel.md`: the spec this plan implements.

## Testing

`npm test` must stay green. New test files:

`test/playtest-marker.test.js`, `test/playtest-entries.test.js`, `test/playtest-store.test.js`,
`test/playtest-bundle.test.js`, `test/playtest-zip.test.js`, `test/playtest-sinks.test.js`,
`test/playtest-recorder.test.js`, `test/broker-validate.test.js`, `test/sessions-cli.test.js`,
`test/transcribe.test.js`, `test/playtest-merge.test.js`.

Browser verification (the panel DOM has no unit coverage) — with the game served on 8123 and
the window **unoccluded**, because a covered window freezes rAF:
1. `http://localhost:8123/?playtest=1&dev=1` — panel renders right of the game, game still ticks.
2. Submit a text entry; confirm it queues with a marker and is editable.
3. Record ~5 s of voice; confirm it queues, replays, and shows a duration.
4. Shift-click delete removes without a prompt; plain click shows the confirm row.
5. `Submit session` with the file sink downloads a zip containing the jsonl and the audio.

## Out of scope

- Mobile or narrow-viewport polish beyond the drawer fallback.
- Deleting local entries after a successful upload.
- Retry/resume for failed uploads.
- Any change to engine, tick, actions, or existing UI behaviour.
- Running `terraform apply`.
