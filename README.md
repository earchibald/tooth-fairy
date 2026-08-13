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

## Run

```
python3 -m http.server 8123
# open http://localhost:8123/
```

Serve on a NEW port after editing JS — Chrome caches ES modules through
cache-busting params.

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
Edits drive the live game and persist as a partial override layer in
localStorage, merged over frozen defaults at boot. "Copy all overrides"
exports the diff; committing a tuning means pasting values into
`js/config/*.js` defaults.

The Pacing tab runs the real engine headless with a competent-not-optimal
bot and reports act timing, reveal cadence, wakes, and beat reachability —
the same numbers the test suite asserts.

## Design notes

The design spec lives at `docs/superpowers/specs/2026-08-13-tooth-fairy-design.md`.
The research vein it mines is the alignment-issues project's distilled
incremental-game research (guardrails, Ten Laws, sawtooth pacing,
override-layer devtools).
