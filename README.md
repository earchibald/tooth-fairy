# tooth fairy

An incremental clicker about teeth, belief, and who moves the pillow.

**Play:** https://earchibald.github.io/tooth-fairy/ · **Manual:** [docs/MANUAL.md](docs/MANUAL.md)

You are something that wants teeth and does not know why. Tap the tooth.
The memory comes back in fragments while the numbers go up.

| Fact | Value |
|---|---|
| Stack | Vanilla ES modules. Zero dependencies. No build step. |
| Engine | Pure, DOM-free, deterministic 200 ms tick, seeded RNG |
| Content | All story, names, balance, and VFX numbers are data with an override layer |
| Tests | `npm test` (bare `node --test`) — playthrough bot, reachability, determinism, pacing |
| Dev tools | In-app panel on localhost or `?dev=1`: Script · Balance · Names · VFX · State · Pacing |

## Night cycle

A night is approximately 35 minutes of productive play. A dawn meter counts
down the remaining night; idle time does not burn it. At dawn, production
stops and taps pause; the night is stamped into the log. A dusk gap of minimum
2 hours of real time follows. Being away counts during this gap. The offline
ledgers earn during the gap within their caps. At dusk, the contract board
appears with 2–3 jobs to choose from; your pick resolves by the next dawn.
Streaks at 3, 7, and 14 nights pay a lasting bonus. Three tabs hold the
interface: tonight (current state and contracts), the log (history of nights),
and the roost (settings and acknowledgements).

## Another town (prestige)

Finishing a town banks stars: the square root of lifetime teeth, plus 10 stars
for reaching the ending. Each star earned adds +2% production, forever, across
every town that follows. The sky shop for spending stars sits at the top of
the roost tab. Town 2 and beyond start at act 1, carrying that production
bonus forward from the start.

Stars have a second home: **the sky** tab appears once you have earned any.
Trace them into five constellation figures — a finished figure permanently
changes the rules (faster taps, quieter crew, shorter dawns, brighter stars,
and one extra star every departure) and is drawn into the ending sky.

## Run

```
python3 -m http.server 8123
# open http://localhost:8123/
```

Serve on a NEW port after editing JS — Chrome caches ES modules through
cache-busting params.

For the Workshop (dev panel → Workshop tab) with working "save to project" and
"release" buttons, serve with the workshop server instead:

    node scripts/workshop-server.js        # http://127.0.0.1:8123/?dev=1

## Runtime flags

| Flag | Effect |
|---|---|
| `?dev=1` | Dev panel (automatic on localhost) |
| `?speed=N` | Wall-clock dilation |
| `?mute=1` | Silence, without touching the saved preference |

`window.game` exposes the live state, `dispatch`, and `debug.{advanceTicks,
runUntil, grant, offline}` for scripted play.

## Dev panel

Every tunable — story beats and responses, the difficulty scaling matrix,
every player-visible name, animation timings, sound gains — has a control.
The Balance tab includes night knobs (NIGHT/CONTRACTS constants) and
skip-to-dawn / skip-to-dusk buttons. Edits drive the live game and persist as
a partial override layer in localStorage, merged over frozen defaults at boot.
"Copy all overrides" exports the diff; committing a tuning means pasting
values into `js/config/*.js` defaults. The Script tab's act-jump includes act
2.5 (night-cycle content).

The Pacing tab runs the real engine headless with a competent-not-optimal
bot and reports act timing, reveal cadence, wakes, and beat reachability —
the same numbers the test suite asserts.

## Dev Suite artifact

`node scripts/build-artifact.js` bundles the whole game + dev suite into
`dist/dev-suite.html`, a self-contained Claude Artifact page: dev panel on
the left, a live copy of the game on the right (game hotkeys off; `[`/`]`
and Shift+1..8 drive the dev tabs), and a floating chat agent (`` ` ``) that
explains settings, applies natural-language tuning, and packages code
requests for local Claude Code. Process: `docs/dev-suite/SDLC.md`.

## Playtest panel

A tester queues text and voice notes during live play, each stamped with a gameplay marker,
then submits the session for analysis afterward. `?playtest=1` turns it on; it is never in the
shipped player bundle.

| Fact | Value |
|---|---|
| Turn on | `http://localhost:8123/?playtest=1` |
| Position | Fixed column right of the game, desktop only (≥1100px wide) |
| Does it pause the game? | No — the tick loop keeps running while a tester talks or types |
| Entry storage | IndexedDB `tf-playtest`, survives a reload |
| Submit, no infra deployed | Downloads a zip (`<sessionId>.zip`: the events jsonl plus every voice recording), or the bare `<sessionId>.jsonl` when there is no audio |
| Submit, infra deployed | Uploads straight to S3 through a token-gated broker; no AWS keys in the browser |
| Analyze afterward | `.claude/skills/analyze-playtest` — locate, transcribe, merge, triage, write a report |

### Controls

| Control | What it does |
|---|---|
| `● record` / `■ stop & submit` | Records a voice note. Marks the start on record, the end on stop. |
| `cancel` (while recording) | Discards the clip and releases the microphone. Nothing is queued. |
| Text box + `submit` | Queues a typed note. Marks the start on the first keystroke, the end on submit. |
| Queue entry | Editable (text) or replayable (voice); `delete` asks to confirm — shift-click skips the confirm. |
| `submit session` (header or footer) | Uploads or downloads everything queued so far. Entries stay in IndexedDB either way. |

Every queued entry carries a 180-second rolling trail of gameplay markers sampled every 2
seconds, in addition to its start/end marker. A tester describes something **after** it
happens, so the end marker is when they stopped talking, not when the thing happened — the
trail is what lets an analyst find the real moment. See the `analyze-playtest` skill for how
this gets used.

### The upload path

The S3 path needs `submission-broker/` provisioned first — a small, reusable Terraform module
plus Lambda that hands the browser a one-shot, token-gated upload grant. This has **deliberately
not been run**: applying it creates a real S3 bucket and a publicly reachable Function URL,
which is the owner's call, not something scripted for you. Until then, `submit session`
downloads a zip, or the bare `.jsonl` when there is no audio.

To analyze a submitted session, see `.claude/skills/analyze-playtest/SKILL.md`, or run its
three scripts directly: `scripts/submissions.mjs` (list/pull/rm from S3), `scripts/transcribe.mjs`
(Whisper transcription of voice notes), and `scripts/playtest-merge.mjs` (merge into a
markdown report). Full design in
`docs/superpowers/specs/2026-08-16-playtest-feedback-panel.md`.

### Browser verification

The panel's IndexedDB persistence has no unit coverage (no IndexedDB in Node, and a shim
would breach the zero-deps rule) — check it by hand with the game served on 8123 and the
window unoccluded:
1. `http://localhost:8123/?playtest=1` — queue one text note and one voice note.
2. Reload the page; confirm both entries return from IndexedDB.
3. Queue a new entry; confirm its `#<seq>` continues from before the reload, not `#0`/`#1`.

## Design notes

The design spec lives at `docs/superpowers/specs/2026-08-13-tooth-fairy-design.md`.
The research vein it mines is the alignment-issues project's distilled
incremental-game research (guardrails, Ten Laws, sawtooth pacing,
override-layer devtools).

## Sound credits

The tap sound is a recorded clip; everything else is synthesized WebAudio.

| Clip | Source | Author | License |
|------|--------|--------|---------|
| `assets/microtick.wav` | https://freesound.org/s/481984/ | Saltbearer | Creative Commons 0 |

The credit also appears in-game under settings → acknowledgements.
