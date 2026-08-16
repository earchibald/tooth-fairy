# Playtest feedback panel — spec

**Date:** 2026-08-16 · **Status:** shipped (phase 10) · **Plan:** `docs/superpowers/plans/2026-08-16-playtest-feedback-panel.md`

| Aspect | Decision |
|---|---|
| Purpose | Let a tester queue text and voice notes during a live session, each stamped with a gameplay marker, then upload the session for later analysis. |
| Activation | `?playtest=1` query param, lazy `import()`. Never in the shipped player bundle. |
| Position | Fixed column on the right of the viewport, desktop only (≥1100px). Not an overlay — the tick loop keeps running. |
| Storage | IndexedDB `tf-playtest`, `MemoryStore` fallback. Survives a reload. |
| The delay problem | One end-marker cannot locate an issue a tester noticed 40s earlier, so every entry also carries a 180s rolling trail. |
| Upload | Browser → broker Lambda (one-shot presigned S3 POST) → S3, or a local zip download when no broker is configured. |
| Analysis | `.claude/skills/analyze-playtest` locates, transcribes, merges, and triages a session into `docs/playtests/<sessionId>-report.md`. |
| Infra status | `submission-broker/` is built and tested. `terraform apply` has deliberately not been run. |

## 1. What a tester does

1. Load the game with `?playtest=1`. The panel appears to the right of `#app`; `#app` shrinks to make room.
2. Type a note and press submit, or press record, talk, and press stop.
3. Each queued entry shows a header line (sequence, kind, clock time, `t=<gameS>s act <act> night <night>`), is editable (text) or replayable (voice), and can be deleted with an in-panel confirm.
4. Press **submit session** to upload everything queued so far.

## 2. Gameplay markers and the trail

`js/playtest/marker.js` is the core idea of this feature.

| Concept | What it captures |
|---|---|
| `captureMarker(state, clock)` | A flat, JSON-safe snapshot: `atMs, sessionMs, tick, gameS, act, town, night, nightPhase, teeth, lifetime, taps, wakes, tiptoes, belief, stir, stars, beats, ended`. Read-only — never touches `state.rngState` or engine RNG. |
| `markerStart` | Voice: captured on record-start. Text: captured on the first keystroke into an empty box. |
| `markerEnd` | Voice: captured on stop. Text: captured on submit. |
| `trail` | A 180s rolling window (`createTrail`, sampled every 2s on its own interval, independent of rAF) attached to every entry at submit time. |

A tester describes something **after** it happens, so `markerEnd` records when they stopped
talking, not when the thing happened. The trail exists so an analyst can look 15–90s earlier
and find where a complaint actually lands. See the skill's own "delay caveat" section — this
is the single most important idea in the whole feature.

## 3. Entry and bundle shape

Entry (`js/playtest/entries.js`), `kind: 'text' | 'voice'`:

```
{ id, kind, seq, createdAt, editedAt, edited,
  text?,  blob?, mime?, ext?, durationMs?,
  markerStart, markerEnd, trail }
```

A submitted session is one JSONL file plus one audio file per voice entry
(`js/playtest/bundle.js`):

| File | Name |
|---|---|
| Events | `tf-session-<sessionId>.jsonl` |
| Audio | `tf-session-<sessionId>-v<k>.<ext>` (`k` = 1-based index among voice entries, frozen at bundle time) |

The JSONL has one `header` line (session id, timestamps, game info, base64 `serialize(state)`,
user agent, viewport), one `entry` line per queued item in `seq` order, and one `trail` line
per entry, kept separate so the entry lines stay readable.

## 4. Submission path

`js/submit/` is a standalone, extractable package — no import from `js/engine`, `js/ui`,
`js/config`, or `js/playtest`. Its only input is a generic `{ sessionId, files }` submission.

| Sink | Used when | Behaviour |
|---|---|---|
| `createBrokerSink(env, deps)` | `env.enabled && env.brokerUrl` | Per file: POST a grant request to the broker, receive a presigned S3 POST, upload directly to S3. No retry — a failure leaves the session queued locally. |
| `createFileSink(deps)` | Otherwise (default, before infra ships) | Zips the files (STORE-only, dependency-free) and hands them to a download callback. |

`pickSink(env, deps)` chooses automatically. `js/submit/env.js` ships as a committed inactive
stub (`{ enabled: false, brokerUrl: '', token: '' }`); it is overwritten at deploy time and a
real token must never be committed.

## 5. Infra — `submission-broker/`

A small, reusable, extractable product ("give a browser a one-shot, token-gated write into a
private S3 prefix"), not tooth-fairy code — nothing under `modules/` names tooth-fairy, teeth,
playtests, or `tf-`. `consumers/tooth-fairy/` is the 30-line consumer that names this project.
Filename/size/content-type validation is schema-driven (`SUBMISSION_SCHEMA`), so a second
consumer never edits Lambda code. Provisioning is the owner's call and has not been run.

## 6. Retrieval and analysis

| Step | Command |
|---|---|
| List submissions | `node scripts/submissions.mjs list` |
| Pull one | `node scripts/submissions.mjs pull <sessionId> --dest <dir>` (or `--latest`) |
| Transcribe voice notes | `node scripts/transcribe.mjs <audio...> --out <dir> --model <model>` |
| Merge into a report | `node scripts/playtest-merge.mjs <events.jsonl> [transcript.json ...] --out <file>` |
| Remove after verifying | `node scripts/submissions.mjs rm <sessionId>` |

The `.claude/skills/analyze-playtest` skill runs this whole sequence and writes
`docs/playtests/<sessionId>-report.md`.

## Out of scope

Mobile/narrow-viewport polish beyond the drawer fallback; deleting local entries after a
successful upload; retry/resume for failed uploads; any change to engine, tick, actions, or
existing UI behaviour; running `terraform apply`.
