# tooth fairy

An incremental clicker about teeth, belief, and who moves the pillow.

**Play:** https://earchibald.github.io/tooth-fairy/

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
