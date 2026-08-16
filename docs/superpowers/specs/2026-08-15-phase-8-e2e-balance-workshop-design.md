# Phase 8 — E2E playthrough harness, stir/loom rebalance, Workshop preview ergonomics

## Summary

| # | Goal | Decision |
|---|---|---|
| 1 | Automated end-to-end playthrough with dev superpowers, observing everything | Two layers: a pure invariant/stat observer wired into the existing headless bot (CI), and a browser autopilot that drives the REAL UI at `?speed=1000` with DOM-consistency checks and a final report |
| 2 | Hush/stir/loom rebalance — stir is trivially removed today | Diminishing loom hush (geometric), steeper loom cost, a production-scale noise term so the operation itself hums as it grows, slower stir recovery; tuned against measured targets from layer 1 |
| 3 | Workshop preview ergonomics | Sticky preview bar, auto-preview on slider change (group → preview map), new `all in sequence` button, per-button hotkeys, `repeat` checkbox with hotkey |

Delegated execution (goal-set pattern, Phases 2–7). This spec records decisions
in place of interactive approval. Version bumps to 0.9.0.

## Context

- A headless engine bot already exists (`js/dev/bot.js`, re-exported at
  `test/helpers/bot.js`) and full-run playthrough tests pass. What is missing
  is *observation*: nothing checks invariants during the run, nothing measures
  the stir system's behavior over time, and nothing exercises the real UI.
- `?speed=` (0.1–1000, `js/main.js:16`) already accelerates the real game
  clock. `?dev=1` keeps ticking in hidden tabs. The autopilot rides both.
- Balance failure mode (measured from constants): noise comes only from
  early/mid units (scout 0.5 … sprite 6; phantom/pact/ministry/starwrights
  are silent). Noise plateaus at low hundreds while hush is
  `10 + 20·loom (+20 sky)` with loom cost `4000·1.5^level` — trivially
  affordable mid-game. A few loom levels permanently end stir as a system.

## 1. Observer + headless e2e (js/dev/observer.js, test/e2e.test.js)

New pure module `js/dev/observer.js`, node-testable, no DOM:

- `createObserver(cfg, script)` → `{ onTick(state), report() }`.
- Per-tick invariants (violations recorded with tick number, first 50 kept):
  - `teeth`, `lifetime`, `stars`, `stir`, `belief`, `notes` finite; none
    negative; `stir ≤ 100`; `belief ≤ 100`.
  - Unit counts and buys are non-negative integers.
  - `state.tick` strictly increases; `lifetime` never decreases within a town.
  - Every id in `beatQueue` and `beatsSeen` exists in the script.
  - `noiseLevel` and `hushCapacity` finite and ≥ 0.
- Timeline stats for balance measurement, per act and whole-run:
  - fraction of ticks with `noise > hush` (pressure fraction)
  - fraction of ticks with `stir > 0`
  - wake count, loom level over time (samples), max stir per act
- `report()` returns `{ violations, stats }` — plain data, no formatting.

`test/e2e.test.js`:

- Runs `runBot` with the observer attached (`onTick`) for a full single-town
  run and a two-town prestige run. Asserts `violations` is empty and the
  run reaches `postEnd`.
- Asserts the balance targets in section 2 (they live here, not in
  engine.test.js, because they are whole-run properties).

## 2. Browser autopilot (js/dev/autopilot.js, main.js, panel.js)

A dev-only module that plays the real page — real DOM clicks, real frame
loop, accelerated clock. Not part of CI; it is the controller's (and
Eugene's) verification instrument.

- Load: `?autopilot=1` implies dev mode and starts on boot; also a
  `start autopilot` button in the dev panel State tab. Recommended URL:
  `?dev=1&autopilot=1&speed=1000&fresh=1`.
- Drive everything through the DOM, never `dispatch` directly:
  - taps: click the tooth button (rapid — every frame; the engine's
    `TAP.MAX_PER_TICK` cap is itself under test)
  - buys: click visible unit/upgrade/mult/loom buy buttons when enabled,
    same priority order as the headless bot
  - story: click the `beat-response` button when a beat card shows
  - tabs: cycle through tabs periodically so every panel renders and its
    per-frame update paths run
  - contracts: pick the first job card at dusk; sleep at dawn via the
    dawn button
- Observe, each frame:
  - engine invariants via `createObserver` on `window.game.state`
  - DOM consistency (checked ~1/s of game time): teeth counter text equals
    `fmt(state.teeth)`; beat card visible iff `beatQueue.length > 0`;
    STIR meter visible iff `stirShown`; active tab panel not hidden
  - console errors (hooked via `window.addEventListener('error')` and a
    `console.error` wrap) — any error is a failure
- Stop when `state.postEnd` or after a configurable real-time budget
  (default 10 min). Report to `window.__autopilot`:
  `{ done, reason, violations, domIssues, consoleErrors, stats, minutes }`
  plus a one-line summary written to the dev panel note area and
  `console.log`.
- The autopilot must not ship weight to players: `main.js` imports it
  dynamically only when the param is present (same gate style as the panel).

## 3. Stir/loom rebalance (constants.js, predicates.js, tick.js)

Mechanisms (all four together; exact numbers below are seeds, tuned by
measurement until the targets pass, then frozen in constants.js):

1. **Diminishing loom hush.** `hushCapacity` changes from `loom · 20` to the
   geometric sum `20 · (1 − 0.85^loom) / 0.15` (level 1 gives 20, each next
   level 85% of the previous; asymptote ≈ 133). The loom stays worth chasing
   but can no longer bury the system.
2. **Steeper loom cost.** `LOOM.growth` 1.5 → 2.0.
3. **Scale noise.** `noiseLevel` gains a term for the operation's sheer size:
   `STIR.SCALE_NOISE_PER_LOG10 · max(0, log10(ratePerSec) − STIR.SCALE_NOISE_FREE_LOG10)`
   with seeds `PER_LOG10: 6`, `FREE_LOG10: 3` (noise starts accruing above
   1e3 teeth/s, +6 per decade). Silent units stay silent as units — the
   *operation* hums. Tiptoe, pact stirFactor, and quietloom multiply the
   total as today (the term joins before the multipliers).
4. **Slower recovery.** `STIR.FALL_RATE` 4 → 1.5.

Measured targets, asserted in `test/e2e.test.js` on the standard bot run:

- pressure fraction (`noise > hush`) over act-2-and-later ticks ≥ 0.25
- `stir > 0` at some tick in the final quarter of the run (act 3 pressure)
- at least 1 wake; at most 12 per town (still survivable)
- the bot buys ≥ 4 loom levels (the chase continues) — and after the bot's
  final loom buy, noise climbs back above hush before the run ends (no
  permanent kill switch)
- existing envelopes hold: pacing test nights 5–9, playthrough minutes
  10–3000, all beats/asides reachable

Constraint: the a2-hush advisory text states mechanics, not constants —
no copy change needed. `WAKE_AT`, `WAKE_BELIEF_COST`, tiptoe, and sandman
are untouched. The stun-noisiest-unit wake consequence is untouched.

Tuning process: run the observer-instrumented bot, read `stats`, adjust the
four seed values only (no new mechanisms), re-run until targets pass and the
full suite stays green. Record final values and the measured stats in the
plan's tuning task report.

## 4. Workshop preview ergonomics (panel.js, css)

All in the Workshop tab:

- **Sticky bar.** The preview bar (with its `preview` heading) sticks to the
  top of the scrolling dev body (`position: sticky; top: 0`, panel
  background, above content) so it never scrolls away.
- **Buttons + hotkeys.** Existing: tap, powerup, flow trickle/busy/storm.
  New: `all in sequence` — fires tap, then powerup, then 2 s of each flow,
  ~600 ms between steps. Hotkeys, shown on each button label:
  `1` tap · `2` powerup · `3` trickle · `4` busy · `5` storm ·
  `A` all in sequence · `R` repeat toggle.
  Hotkeys are active while the Workshop tab is visible and focus is not in
  an input/textarea; they do not leak into the game (the dev overlay
  already captures its own keys — same guard style).
- **Repeat checkbox.** `repeat` re-fires the last pressed preview (or the
  whole sequence, if that was last) each time it finishes, until unchecked,
  another preview is pressed (which becomes the repeated one), or the tab
  hides (existing teardown clears timers).
- **Auto-preview on change.** Each `WORKSHOP_KNOBS` group maps to a preview:
  tap pop / tap glow / tap sparks → tap; powerup sweep → powerup;
  incoming teeth / landing / scale ramp → a short (1.5 s) busy flow burst.
  Moving any slider fires its group's preview, debounced 150 ms, so the
  effect is seen with the new value immediately. Auto-previews do not
  become the "last pressed" repeat target.

## Testing

- `node --test test/*.test.js` green; new `test/e2e.test.js` (observer +
  balance targets) and observer unit tests (violations actually fire on a
  corrupted state; stats count correctly on a crafted short run).
- Workshop behavior is DOM/timing glue — covered by browser verification,
  not node tests (existing `workshop.test.js` covers the server; unchanged).
- Browser verification (controller): run the autopilot at speed 1000 and
  read `window.__autopilot` — zero violations/DOM issues/console errors,
  run completes; Workshop bar stays visible while scrolling, hotkeys fire,
  repeat loops, slider drag fires its preview; stir meter visibly active in
  a late-game forced state.

## Out of scope

- Puppeteer/Playwright or any dependency (vanilla rule stands); CI runs the
  headless layer only.
- New stir mechanics beyond the four listed (no new meters, no UI change
  except what the balance numbers already drive).
- Hoard-tab preview ergonomics (its scrub model is different; not asked).
- Sound-tab hotkeys (the ask names visual-effect previews).
