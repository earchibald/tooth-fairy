# Phase 9 — Chaos-monkey playthroughs for the play bot

## Summary

| # | Piece | Decision |
|---|---|---|
| 1 | Policy extraction | The bot's decision points move into a policy object. `steadyPolicy` reproduces today's behavior tick-for-tick. `runBot` gains an optional `policy` parameter that defaults to steady. |
| 2 | Chaos policy | `chaosPolicy(rngSeed)` — every choice randomized through a seeded deterministic RNG. Reproducible, observed, must complete clean. |
| 3 | Wrong policy | `wrongPolicy()` — deliberately bad strategy: never tiptoe, never buy loom, spam taps, buy expensive-first ignoring payback, pick the worst contract, never read notes. The engine must survive it without invariant violations. |
| 4 | Tests | `test/chaos.test.js` runs the chaos and wrong playthroughs under the observer. The existing fixed run in `test/e2e.test.js` is playthrough (1) and stays byte-identical in behavior. Separate file so the node test runner executes the files in parallel. |
| 5 | Browser layer | The autopilot gains `?policy=steady\|chaos\|wrong` (+ `rngSeed=`). Verification runs the three playthroughs IN PARALLEL: one static server per policy on its own port (8123/8124/8125), one tab each. Distinct ports give distinct origins, so the `tf-save` localStorage keys cannot collide. `?dev=1` keeps hidden tabs ticking. |

Delegated execution (goal-set pattern, Phases 2–8). This spec records decisions
in place of interactive approval. Version bumps to 0.9.1.

User directive (verbatim): "these runs should run in parallel on multiple
local server ports!" — implemented as decision 5.

## Context

- `js/dev/bot.js` (re-exported at `test/helpers/bot.js`) is a fixed-strategy
  player. Its decision points: taps per tick, tiptoe threshold, note reading,
  upgrade buys, loom buys, unit buys (priority + 450 s payback rule), mult
  buys, contract pick, dawn sleep, beat dismissal, prestige sky/trace/depart.
- `js/dev/observer.js` checks invariants and gathers balance stats; it is
  policy-agnostic and needs no change.
- `js/dev/autopilot.js` plays the real DOM with the same strategy hardcoded.
- Constraint from Phase 8 tuning: the seed-11 steady run measures wakes at
  exactly the assertion ceiling (12 of [1,12]). The policy refactor must not
  change the steady run's tick sequence at all — `test/e2e.test.js` passing
  unchanged is the proof.

## 1. Policy interface (js/dev/policies.js)

New pure module, node-testable, no DOM. Exports `mulberry32(seed)` (the
standard 32-bit deterministic generator) and three policy factories. A policy
is a plain object of decision hooks; `runBot` and the autopilot consult it at
each decision point instead of hardcoded rules:

- `tapsPerTick(state, rng)` → integer ≥ 0
- `shouldTiptoe(state)` → bool (steady: `stir > 75`)
- `shouldReadNote(state)` → bool (steady: always)
- `shouldBuyUpgrade(state, id)` → bool (steady: always)
- `shouldBuyLoom(state)` → bool (steady: `revealed.loom && stir > 40`)
- `unitOrder(state)` → array of unit ids to consider this tick
- `shouldBuyUnit(state, unit, quote)` → bool; `quote` carries the steady
  policy's computed `{ cost, rate, lifeCap, top }` so policies can accept,
  ignore, or invert the payback rule without recomputing it
- `pickContract(board)` → contract id (steady: highest `reward.burstS`)
- `beatDelayTicks()` → integer ticks to idle before dismissing a beat
  (steady: 0)
- `name` → string, for reports

`runBot(cfg, script, { policy = steadyPolicy(), ... })`. The `tapsPerTick`
option remains and wins when the caller passes it (existing tests unchanged).

Policies:

- `steadyPolicy()` — extracted current behavior, decision-for-decision.
- `chaosPolicy(seed)` — `rng = mulberry32(seed)`. Taps 0–3 per tick; tiptoe
  when `stir > 30 + rng() * 60`; read a note with p 0.7; buy each upgrade
  with p 0.5; buy loom with p 0.3 when revealed and `stir > 20`; unit order
  is a seeded shuffle each tick; accept a unit buy with p 0.5 regardless of
  the payback quote; pick a uniformly random contract; dismiss beats after
  0–20 random ticks. All probabilities are constants in the module, not cfg.
- `wrongPolicy()` — deterministic, no rng: taps 5 per tick every tick; never
  tiptoe; never read notes; never buy loom; unit order is reverse priority
  (most expensive first) and every affordable unit is bought ignoring the
  quote; upgrades still bought (they gate reveals, and skipping them is
  starvation, not strategy); pick the contract with the LOWEST `burstS`;
  dismiss beats immediately. It still sleeps at dawn and still prestiges if
  asked — a playthrough, played badly.

## 2. Headless tests (test/chaos.test.js)

Both runs use `createObserver` exactly as `test/e2e.test.js` does.

- Chaos run: `runBot(cfg, script, { maxTicks: 600000, seed: 21,
  policy: chaosPolicy(1), contracts })`. Asserts: zero violations,
  `state.postEnd` (the run completes), wakes ≥ 1.
- Wrong run: `runBot(cfg, script, { maxTicks: 600000, seed: 22,
  policy: wrongPolicy(), contracts })`. Asserts: zero violations; the run
  either completes or, if it does not, `state.lifetime` exceeds the act-1
  threshold (the game must keep moving, never soft-lock); wakes strictly
  greater than the steady run's ceiling of 12 (bad play is punished).
- Steady-policy equivalence: a short run (50k ticks, seed 11) with an
  explicit `steadyPolicy()` produces a state deep-equal to a run with the
  option omitted. This pins the refactor.

The implementing task measures both runs first, then pins the loose numeric
assertions (maxTicks, lifetime floor) to measured values with ≥ 2× headroom,
and records the measurements in its report. Existing suite stays green —
`test/e2e.test.js` must pass without any edit.

## 3. Browser autopilot policies (js/dev/autopilot.js, js/main.js)

- New params: `?policy=steady|chaos|wrong` (default steady) and
  `?rngSeed=N` (default 1). The autopilot imports the same
  `js/dev/policies.js` and routes its existing decision points through the
  policy object: tap burst size, tiptoe threshold, loom clicks, buy sweep
  order/acceptance, job pick, beat-response delay. DOM-consistency checks,
  observer wiring, and the report shape are unchanged; the report gains
  `policy: <name>`.
- The wrong policy's beat handling in the DOM: still clicks the beat
  response (the run must progress) after its `beatDelayTicks` idle.
- No change to the ship gate: autopilot code loads only behind the dev
  param, dynamically.

## 4. Parallel verification protocol (controller, not code)

- Start three static servers from the repo root on ports 8123, 8124, 8125
  (same server command the workshop already uses).
- Open three tabs, one per port:
  - `:8123/?dev=1&fresh=1&autopilot=1&speed=150&mute=1&policy=steady`
  - `:8124/?dev=1&fresh=1&autopilot=1&speed=150&mute=1&policy=chaos&rngSeed=7`
  - `:8125/?dev=1&fresh=1&autopilot=1&speed=150&mute=1&policy=wrong`
- Run `caffeinate -d -u` for the duration; poll each tab's
  `window.__autopilot` until all three finish.
- Pass criteria: steady and chaos reach postEnd with 0 violations /
  0 domIssues / 0 consoleErrors; wrong reports 0 violations / 0
  consoleErrors and visibly higher wakes (domIssues on the wrong run are
  triaged, not auto-failed — heavy wake churn may stress real-time UI
  delays; any repeatable mismatch is a finding).

## Testing

- `node --test test/*.test.js` green, including the new file and the
  untouched `test/e2e.test.js`.
- Policy unit tests: mulberry32 determinism (same seed → same sequence);
  chaosPolicy reproducibility (two instances, same seed → identical
  decisions on a scripted state sequence); wrongPolicy shape (never
  tiptoe/loom, reverse order, lowest-burst contract).
- Browser verification per section 4.

## Out of scope

- New observer checks (existing invariants already cover engine health).
- Balance retuning — chaos/wrong runs get no balance-target assertions
  beyond the wake punishments listed; the steady targets stay where they
  are in `test/e2e.test.js`.
- A policy-selection UI in the dev panel (URL param only; the panel's
  existing `start autopilot` button starts the steady policy).
- Puppeteer/Playwright or any dependency (vanilla rule stands); CI runs
  headless only.
