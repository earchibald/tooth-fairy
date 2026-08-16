# Phase 8 Implementation Plan — E2E harness, stir rebalance, Workshop previews

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An observed end-to-end playthrough (headless + real-browser autopilot), a stir/loom rebalance that keeps stir alive all game, and Workshop preview ergonomics (sticky bar, hotkeys, repeat, auto-preview).

**Architecture:** A pure observer module (`js/dev/observer.js`) records invariant violations and balance statistics; the headless bot feeds it in CI (`test/e2e.test.js`), and a dev-only browser autopilot (`js/dev/autopilot.js`) feeds it while driving the real DOM. The rebalance changes only constants and two predicate functions. Workshop changes live entirely in `js/dev/panel.js`.

**Tech Stack:** Vanilla ESM, zero dependencies, `node --test`.

## Global Constraints

- Vanilla ESM, no build step, no dependencies. A repo hook rejects `innerHTML`/`outerHTML`/`insertAdjacentHTML` — build DOM with `createElement`/`textContent`.
- Single-quote strings. Comments state constraints the code cannot show — never narration.
- Test command is `node --test test/*.test.js` (the glob; bare `test/` fails).
- The autopilot must not load for players: dynamic import gated on `?autopilot=1`, same style as the dev panel gate.
- Balance seeds (spec §3): `LOOM.growth` 2.0, `LOOM.hushFalloff` 0.85, `STIR.FALL_RATE` 1.5, `STIR.SCALE_NOISE_PER_LOG10` 6, `STIR.SCALE_NOISE_FREE_LOG10` 3. Tuning (Task 3) may adjust ONLY these five values.
- Balance targets (spec §3): act-2+ pressure fraction ≥ 0.25; stir > 0 in final quarter; wakes in [1, 12]; loom ≥ 4; noise re-exceeds hush after the final loom buy.
- Workshop hotkeys: `1` tap · `2` powerup · `3` trickle · `4` busy · `5` storm · `A` all in sequence · `R` repeat.
- Story copy unchanged. `WAKE_AT`, `WAKE_BELIEF_COST`, tiptoe, sandman untouched.

---

### Task 1: Observer module

**Files:**
- Create: `js/dev/observer.js`
- Test: `test/observer.test.js`

**Interfaces:**
- Consumes: `noiseLevel(state, cfg)`, `hushCapacity(state, cfg)` from `js/engine/predicates.js`; `UNIT_IDS` from `js/engine/state.js`.
- Produces: `createObserver(cfg, script)` → `{ onTick(state), report() }`. `report()` returns `{ violations: [{tick, rule, detail}], stats: { ticks, perAct: {act: {ticks, pressureTicks, stirTicks, maxStir}}, loomBuys: [{tick, level}], samples: [{tick, act, noise, hush, stir, loom}] } }`. Tasks 3 and 4 rely on these exact field names.

- [ ] **Step 1: Write the failing tests**

Create `test/observer.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { buildScript } from '../js/config/script.js';
import { createState } from '../js/engine/state.js';
import { tick } from '../js/engine/tick.js';
import { createObserver } from '../js/dev/observer.js';

const cfg = buildConstants();
const script = buildScript();

test('a clean short run produces no violations and counts ticks', () => {
  const obs = createObserver(cfg, script);
  const s = createState(1);
  for (let i = 0; i < 120; i++) { tick(s, cfg, script, {}); obs.onTick(s); }
  const { violations, stats } = obs.report();
  assert.deepEqual(violations, []);
  assert.equal(stats.ticks, 120);
  // Samples land on ticks 1, 51, 101 of the observation.
  assert.equal(stats.samples.length, 3);
});

test('repeated polls of the same tick are ignored (browser polling)', () => {
  const obs = createObserver(cfg, script);
  const s = createState(1);
  tick(s, cfg, script, {});
  obs.onTick(s);
  obs.onTick(s);
  obs.onTick(s);
  assert.equal(obs.report().stats.ticks, 1);
});

test('corruptions are caught', () => {
  const obs = createObserver(cfg, script);
  const s = createState(1);
  tick(s, cfg, script, {});
  obs.onTick(s);

  s.tick++; s.teeth = NaN;
  obs.onTick(s);
  s.tick++; s.teeth = 0; s.stir = 150;
  obs.onTick(s);
  s.tick++; s.stir = 0; s.units.mouse = -2;
  obs.onTick(s);
  s.tick++; s.units.mouse = 0; s.beatQueue.push('no-such-beat');
  obs.onTick(s);
  s.beatQueue.pop();
  s.tick -= 3; // regression within the same town
  obs.onTick(s);

  const rules = obs.report().violations.map((v) => v.rule);
  assert.ok(rules.includes('finite:teeth'), rules.join(','));
  assert.ok(rules.includes('range:stir'));
  assert.ok(rules.includes('units:mouse'));
  assert.ok(rules.includes('beat:unknown-queued'));
  assert.ok(rules.includes('tick:regressed'));
});

test('a town change resets the monotonic trackers', () => {
  const obs = createObserver(cfg, script);
  const s = createState(1);
  s.tick = 5000; s.lifetime = 9e9; s.town = 1;
  obs.onTick(s);
  const s2 = createState(2);
  s2.tick = 1; s2.lifetime = 0; s2.town = 2;
  obs.onTick(s2);
  assert.deepEqual(obs.report().violations, []);
});

test('pressure and loom stats accumulate', () => {
  const obs = createObserver(cfg, script);
  const s = createState(1);
  s.units.bunny = 40; // noise 120 >> hush 10
  for (let i = 0; i < 10; i++) { s.tick++; s.stir = 5; obs.onTick(s); }
  s.loom = 1; s.stir = 0; s.tick++; obs.onTick(s);
  const { stats } = obs.report();
  const act = stats.perAct[s.act];
  assert.equal(act.pressureTicks, 11);
  assert.equal(act.stirTicks, 10);
  assert.equal(act.maxStir, 5);
  assert.deepEqual(stats.loomBuys, [{ tick: s.tick, level: 1 }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/observer.test.js`
Expected: FAIL — cannot find module `js/dev/observer.js`.

- [ ] **Step 3: Implement the observer**

Create `js/dev/observer.js`:

```js
// Pure run observer: invariant checks + balance statistics. Fed by the
// headless bot (test/e2e.test.js) and the browser autopilot. Read-only —
// it must never mutate state or advance the engine.

import { noiseLevel, hushCapacity } from '../engine/predicates.js';
import { UNIT_IDS } from '../engine/state.js';

const MAX_VIOLATIONS = 50;
const SAMPLE_EVERY = 50;

export function createObserver(cfg, script) {
  const beatIds = new Set(script.beats.map((b) => b.id));
  const violations = [];
  const samples = [];
  const loomBuys = [];
  const perAct = {};
  let ticks = 0;
  let lastTick = null;
  let lastLifetime = null;
  let lastTown = null;
  let lastLoom = null;

  function violate(state, rule, detail) {
    if (violations.length < MAX_VIOLATIONS) {
      violations.push({ tick: state.tick, rule, detail });
    }
  }

  function onTick(state) {
    // The browser autopilot polls; between engine ticks the state is
    // unchanged and must not be double-counted.
    if (state.town === lastTown && state.tick === lastTick) return;
    if (state.town !== lastTown) { lastTick = null; lastLifetime = null; lastLoom = null; }
    ticks++;
    const noise = noiseLevel(state, cfg);
    const hush = hushCapacity(state, cfg);

    for (const [key, v] of [['teeth', state.teeth], ['lifetime', state.lifetime],
      ['stars', state.stars], ['stir', state.stir], ['belief', state.belief],
      ['notes', state.notes], ['noise', noise], ['hush', hush]]) {
      if (!Number.isFinite(v) || v < 0) violate(state, 'finite:' + key, String(v));
    }
    if (state.stir > 100) violate(state, 'range:stir', String(state.stir));
    if (state.belief > 100) violate(state, 'range:belief', String(state.belief));
    for (const u of UNIT_IDS) {
      if (!Number.isInteger(state.units[u]) || state.units[u] < 0) {
        violate(state, 'units:' + u, String(state.units[u]));
      }
      if (!Number.isInteger(state.buys[u]) || state.buys[u] < 0) {
        violate(state, 'buys:' + u, String(state.buys[u]));
      }
    }
    if (lastTick !== null && state.tick < lastTick) {
      violate(state, 'tick:regressed', lastTick + '->' + state.tick);
    }
    if (lastLifetime !== null && state.lifetime < lastLifetime) {
      violate(state, 'lifetime:decreased', lastLifetime + '->' + state.lifetime);
    }
    for (const id of state.beatQueue) {
      if (!beatIds.has(id)) violate(state, 'beat:unknown-queued', id);
    }
    for (const id of state.beatsSeen) {
      if (!beatIds.has(id)) violate(state, 'beat:unknown-seen', id);
    }

    const act = perAct[state.act] ||
      (perAct[state.act] = { ticks: 0, pressureTicks: 0, stirTicks: 0, maxStir: 0 });
    act.ticks++;
    if (noise > hush) act.pressureTicks++;
    if (state.stir > 0) act.stirTicks++;
    if (state.stir > act.maxStir) act.maxStir = state.stir;
    if (lastLoom !== null && state.loom > lastLoom) {
      loomBuys.push({ tick: state.tick, level: state.loom });
    }
    if (ticks % SAMPLE_EVERY === 1) {
      samples.push({ tick: state.tick, act: state.act, noise, hush,
        stir: state.stir, loom: state.loom });
    }

    lastTick = state.tick;
    lastLifetime = state.lifetime;
    lastTown = state.town;
    lastLoom = state.loom;
  }

  function report() {
    return { violations, stats: { ticks, perAct, loomBuys, samples } };
  }

  return { onTick, report };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/observer.test.js`
Expected: PASS (5 tests).

Note for the corruption test: `beatsSeen` scanning also fires `beat:unknown-seen` only if the test pushed to `beatsSeen` — it does not, so only the queued rule appears. The `tick:regressed` check compares against the last accepted tick.

- [ ] **Step 5: Run the whole suite, then commit**

Run: `node --test test/*.test.js` — all green (no production file changed).

```bash
git add js/dev/observer.js test/observer.test.js
git commit -m "Observer: invariant checks + balance stats for e2e runs"
```

---

### Task 2: Stir/loom rebalance mechanisms

**Files:**
- Modify: `js/config/constants.js:61-74` (LOOM and STIR blocks)
- Modify: `js/engine/predicates.js:122-143` (`noiseLevel`, `hushCapacity`, new `loomHush`)
- Test: `test/balance.test.js` (new)

**Interfaces:**
- Consumes: `baseRatePerSec(state, cfg)` (already in predicates.js, defined above `noiseLevel`).
- Produces: `loomHush(state, cfg)` exported from predicates.js; new constants `LOOM.hushFalloff`, `STIR.SCALE_NOISE_PER_LOG10`, `STIR.SCALE_NOISE_FREE_LOG10`. Task 3 tunes these constants; the dev panel Balance tab picks the new keys up automatically (it iterates DEFAULTS).

- [ ] **Step 1: Write the failing tests**

Create `test/balance.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { createState } from '../js/engine/state.js';
import { noiseLevel, hushCapacity, loomHush } from '../js/engine/predicates.js';

const cfg = buildConstants();

test('loom hush diminishes geometrically and asymptotes', () => {
  const s = createState(1);
  s.loom = 0;
  assert.equal(loomHush(s, cfg), 0);
  assert.equal(hushCapacity(s, cfg), cfg.STIR.HUSH_BASE);
  s.loom = 1;
  assert.equal(loomHush(s, cfg), cfg.LOOM.hushPerLevel);
  s.loom = 2;
  assert.ok(Math.abs(loomHush(s, cfg) -
    cfg.LOOM.hushPerLevel * (1 + cfg.LOOM.hushFalloff)) < 1e-9);
  s.loom = 500;
  const cap = cfg.LOOM.hushPerLevel / (1 - cfg.LOOM.hushFalloff);
  assert.ok(loomHush(s, cfg) < cap, 'below the asymptote');
  assert.ok(loomHush(s, cfg) > cap * 0.999, 'near the asymptote');
});

test('scale noise: a silent late-game operation still hums', () => {
  const s = createState(1);
  s.units.ministry = 20; // 1.2e6 teeth/s from noise-0 units
  const rate = 20 * cfg.UNITS.ministry.rate;
  const expected = cfg.STIR.SCALE_NOISE_PER_LOG10 *
    (Math.log10(rate) - cfg.STIR.SCALE_NOISE_FREE_LOG10);
  assert.ok(Math.abs(noiseLevel(s, cfg) - expected) < 1e-9);
});

test('scale noise obeys tiptoe like unit noise', () => {
  const s = createState(1);
  s.units.ministry = 20;
  const loud = noiseLevel(s, cfg);
  s.tiptoeTicks = 10;
  assert.ok(Math.abs(noiseLevel(s, cfg) - loud * cfg.TIPTOE.FACTOR) < 1e-9);
});

test('below the free decade the scale term is zero', () => {
  const s = createState(1);
  s.units.mouse = 5; // 50 teeth/s < 10^SCALE_NOISE_FREE_LOG10
  assert.ok(Math.abs(noiseLevel(s, cfg) - 5 * cfg.UNITS.mouse.noise) < 1e-9);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/balance.test.js`
Expected: FAIL — `loomHush` is not exported; scale-noise expectations differ.

- [ ] **Step 3: Change the constants**

In `js/config/constants.js` replace the LOOM line and the STIR block:

```js
  LOOM: Object.freeze({ base: 4000, growth: 2.0, hushPerLevel: 20, hushFalloff: 0.85 }),

  STIR: Object.freeze({
    HUSH_BASE: 10,        // quiet capacity before the loom
    RATE: 0.3,          // stir points/sec per point of excess noise
    FALL_RATE: 1.5,      // stir points/sec recovery when under hush
    WAKE_AT: 100,
    WAKE_BELIEF_COST: 10,
    WAKE_RESET: 25,
    STUN_TICKS: 50,      // noisiest unit type stunned 10 s
    SETTLE_TICKS: 150,   // post-wake: the house pretends to sleep, stir frozen 30 s
    FIRST_WAKE_AT: 55,   // the scripted flashlight wake fires early, provably
    REVEAL_NOISE: 20,     // STIR meter appears when noise first reaches this
    SCALE_NOISE_PER_LOG10: 6,  // the operation hums: noise per decade of teeth/s
    SCALE_NOISE_FREE_LOG10: 3, // decades below this are free
  }),
```

- [ ] **Step 4: Change the predicates**

In `js/engine/predicates.js`, replace `noiseLevel` and `hushCapacity` (keep their position in the file) and add `loomHush` between them:

```js
export function noiseLevel(state, cfg) {
  let noise = 0;
  for (const u of UNIT_IDS) {
    const def = cfg.UNITS[u];
    if (!def.noise) continue;
    if (state.stunUnit === u && state.stunTicks > 0) continue;
    noise += def.noise * state.units[u];
  }
  // The operation's sheer size hums even when every unit is silent —
  // hush can be outgrown but never outrun.
  const rate = baseRatePerSec(state, cfg);
  if (rate > 0) {
    noise += cfg.STIR.SCALE_NOISE_PER_LOG10 *
      Math.max(0, Math.log10(rate) - cfg.STIR.SCALE_NOISE_FREE_LOG10);
  }
  noise *= Math.pow(cfg.UNITS.pact.stirFactor, state.units.pact);
  noise *= tiptoeFactor(state, cfg);
  if (figureDone(state, cfg, 'quietloom')) noise *= cfg.CONSTELLATIONS.quietloom.noiseFactor;
  return noise;
}

// Level 1 pays hushPerLevel; each further level hushFalloff of the previous.
// Geometric sum, closed form; asymptote hushPerLevel / (1 - hushFalloff).
export function loomHush(state, cfg) {
  const f = cfg.LOOM.hushFalloff;
  if (f === 1) return state.loom * cfg.LOOM.hushPerLevel;
  return cfg.LOOM.hushPerLevel * (1 - Math.pow(f, state.loom)) / (1 - f);
}

export function hushCapacity(state, cfg) {
  return cfg.STIR.HUSH_BASE + loomHush(state, cfg) +
    (state.sky && state.sky.lullabythread ? cfg.SKY.lullabythread.hush : 0);
}
```

- [ ] **Step 5: Run the new tests, then the whole suite**

Run: `node --test test/balance.test.js`
Expected: PASS (4 tests).

Run: `node --test test/*.test.js`
Expected: most files green. Whole-run tests (`playthrough`, `pacing`, `prestige`, `night`, `contracts`) MAY fail — the balance changed under the bot. Do not chase those failures; list every failing test and its message in your report and mark DONE_WITH_CONCERNS. Task 3 owns tuning. Unit-level failures in `stars.test.js` (lullabythread still adds flat hush — unchanged behavior) or `constellations.test.js` (quietloom still multiplies — unchanged) would be YOUR defect; fix those before reporting.

- [ ] **Step 6: Commit**

```bash
git add js/config/constants.js js/engine/predicates.js test/balance.test.js
git commit -m "Rebalance: diminishing loom hush, scale noise, slower stir fall"
```

---

### Task 3: Observed e2e test + balance tuning

**Files:**
- Create: `test/e2e.test.js`
- Modify (tuning only): `js/config/constants.js` — the five seed values

**Interfaces:**
- Consumes: `createObserver` (Task 1 report schema), `runBot` from `test/helpers/bot.js` (signature: `runBot(cfg, script, { maxTicks, seed, tapsPerTick, onTick, contracts, prestige })`).
- Produces: the frozen tuned constants every later phase builds on.

- [ ] **Step 1: Write the e2e test**

Create `test/e2e.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { buildScript } from '../js/config/script.js';
import { buildContracts } from '../js/config/contracts.js';
import { runBot } from './helpers/bot.js';
import { createObserver } from '../js/dev/observer.js';

const cfg = buildConstants();
const script = buildScript();
const contracts = buildContracts();

test('observed full run: zero violations, stir stays a live system', () => {
  const obs = createObserver(cfg, script);
  const { state } = runBot(cfg, script,
    { maxTicks: 400000, seed: 11, contracts, onTick: obs.onTick });
  const { violations, stats } = obs.report();
  assert.deepEqual(violations, []);
  assert.ok(state.postEnd, 'run completes');

  // Pressure: from act 2 on, noise beats hush at least a quarter of the time.
  let t = 0, p = 0;
  for (const a of [2, 3]) {
    if (stats.perAct[a]) { t += stats.perAct[a].ticks; p += stats.perAct[a].pressureTicks; }
  }
  assert.ok(p / t >= 0.25, `pressure fraction ${(p / t).toFixed(3)} >= 0.25`);

  // Stir is alive to the end.
  const lastTick = stats.samples.at(-1).tick;
  const tail = stats.samples.filter((s) => s.tick >= lastTick * 0.75);
  assert.ok(tail.some((s) => s.stir > 0), 'stir > 0 somewhere in the final quarter');

  // The catastrophe fires but stays survivable.
  assert.ok(state.wakes >= 1 && state.wakes <= 12, `wakes ${state.wakes} in [1,12]`);

  // The loom chase continues and never permanently ends the system.
  assert.ok(state.loom >= 4, `loom level ${state.loom} >= 4`);
  const lastBuy = stats.loomBuys.at(-1).tick;
  assert.ok(stats.samples.some((s) => s.tick > lastBuy && s.noise > s.hush),
    'noise climbs back above hush after the final loom buy');
});

test('observed two-town prestige run stays clean', () => {
  const obs = createObserver(cfg, script);
  runBot(cfg, script,
    { maxTicks: 900000, seed: 12, contracts, prestige: true, onTick: obs.onTick });
  assert.deepEqual(obs.report().violations, []);
});
```

- [ ] **Step 2: First measurement**

Run: `node --test test/e2e.test.js`
Expected: possibly FAIL on the balance targets — that is the measurement, not a defect.

- [ ] **Step 3: Tune the five seeds until the targets pass**

Loop:

1. Run `node --test test/e2e.test.js test/playthrough.test.js test/pacing.test.js test/prestige.test.js`.
2. Read the failure messages (they print the measured numbers).
3. Adjust ONLY these values in `js/config/constants.js`, inside these ranges:
   - `STIR.SCALE_NOISE_PER_LOG10` in [2, 15] — raise for more late pressure
   - `STIR.SCALE_NOISE_FREE_LOG10` in [2, 5] — lower for earlier pressure
   - `STIR.FALL_RATE` in [1, 3] — lower to keep stir nonzero longer
   - `LOOM.hushFalloff` in [0.70, 0.95] — lower to weaken the loom harder
   - `LOOM.growth` in [1.7, 2.5] — raise to slow the loom chase
4. Repeat until all four files pass.

Guidance on failure shapes: too many wakes or a run that never completes → lower `SCALE_NOISE_PER_LOG10` or raise `FREE_LOG10`; pressure fraction too low → the opposite; `nights not in [5,9]` (pacing) usually means wake-stun loops are eating production — reduce pressure slightly. If no combination inside the ranges satisfies every target, STOP and report BLOCKED with the best-found values and their measured stats — do not widen ranges or touch other constants.

- [ ] **Step 4: Run the entire suite**

Run: `node --test test/*.test.js`
Expected: ALL green, including the whole-run tests Task 2 may have left failing.

- [ ] **Step 5: Commit with the measurements**

Record in the commit body the final five values and the measured numbers (pressure fraction, wakes, loom level, nights).

```bash
git add js/config/constants.js test/e2e.test.js
git commit -m "e2e: observed full-run test; tune stir seeds to measured targets"
```

---

### Task 4: Browser autopilot

**Files:**
- Create: `js/dev/autopilot.js`
- Modify: `js/main.js` — DEV gate (line ~17), fresh-save gate (line ~35), autopilot import (after the `window.game` assignment, near the dev-panel gate at line ~301)
- Modify: `js/dev/panel.js` — `tabState` gets a `start autopilot` button in its first `devBar`

**Interfaces:**
- Consumes: `createObserver` (Task 1), `window.game` debug API (`state` getter, `cfg`, `script`, `debug.offline(seconds)`), `fmt` from `js/engine/math.js`, DOM testids: `tap`, `tiptoe`, `log-read-note`, `beat-response`, `roost`, `job-*`, `tab-*`, `tooth-count`; `.beatCard.show`, `.meter.stir`.
- Produces: `startAutopilot({ maxMinutes })`; a live progress object at `window.__autopilot` while running and the final report `{ done, reason, minutes, polls, violations, domIssues, consoleErrors, stats }` in the same place.

- [ ] **Step 1: Implement the autopilot module**

Create `js/dev/autopilot.js`:

```js
// Plays the real page: real DOM clicks against the live document, the real
// frame/tick loops, the URL's ?speed clock. Dev instrument only — main.js
// imports this solely when ?autopilot=1. It verifies what the headless bot
// cannot: buttons, cards, tabs, meters, and the render loop under load.

import { createObserver } from './observer.js';
import { fmt } from '../engine/math.js';

const POLL_MS = 100;
const TAPS_PER_POLL = 4; // 40 clicks/s — deliberately over the engine cap

export function startAutopilot({ maxMinutes = 10 } = {}) {
  const game = window.game;
  const { cfg, script } = game;
  const obs = createObserver(cfg, script);
  const domIssues = [];
  const consoleErrors = [];
  const startedAt = performance.now();
  let polls = 0;

  const origError = console.error;
  console.error = (...args) => {
    if (consoleErrors.length < 50) consoleErrors.push(args.map(String).join(' '));
    origError.apply(console, args);
  };
  const onWindowError = (e) => {
    if (consoleErrors.length < 50) consoleErrors.push(String(e.message));
  };
  window.addEventListener('error', onWindowError);

  const $ = (sel) => document.querySelector(sel);
  const click = (node) => { if (node && !node.disabled) node.click(); };

  // A check can catch the one-frame gap between an engine tick and the next
  // render. Only a mismatch seen on two CONSECUTIVE checks is real.
  const strikes = new Map();
  function issue(state, what, detail) {
    if (strikes.get(what)) {
      if (domIssues.length < 50) domIssues.push({ tick: state.tick, what, detail });
    }
    strikes.set(what, true);
  }

  function domCheck(state) {
    const failed = new Set();
    const record = (what, detail) => { failed.add(what); issue(state, what, detail); };
    const beatOpen = !!$('.beatCard.show');
    if (beatOpen !== state.beatQueue.length > 0) {
      record('beat-visibility', 'card ' + beatOpen + ' queue ' + state.beatQueue.length);
    }
    const stirMeter = $('.meter.stir');
    if (stirMeter && stirMeter.hidden === !!state.stirShown) {
      record('stir-visibility', 'hidden ' + stirMeter.hidden + ' shown ' + state.stirShown);
    }
    // The counter races the render loop while ticks flow; compare it only
    // while the engine is paused on an open beat (DOM settled since pause).
    if (state.beatQueue.length > 0) {
      const count = $('[data-testid="tooth-count"]');
      if (count && count.textContent !== fmt(state.teeth)) {
        record('counter-mismatch', count.textContent + ' != ' + fmt(state.teeth));
      }
    }
    for (const what of strikes.keys()) if (!failed.has(what)) strikes.delete(what);
  }

  function finish(reason) {
    clearInterval(timer);
    console.error = origError;
    window.removeEventListener('error', onWindowError);
    const { violations, stats } = obs.report();
    const minutes = (performance.now() - startedAt) / 60000;
    window.__autopilot = { done: true, reason, minutes, polls,
      violations, domIssues, consoleErrors, stats };
    const bad = violations.length + domIssues.length + consoleErrors.length;
    console.log('[autopilot] ' + reason + ' after ' + minutes.toFixed(1) + ' min, tick ' +
      game.state.tick + ' — ' + (bad ? bad + ' PROBLEMS' : 'clean'));
  }

  const timer = setInterval(() => {
    const state = game.state;
    polls++;
    obs.onTick(state);
    window.__autopilot = { done: false, polls, tick: state.tick, act: state.act };
    if ((performance.now() - startedAt) / 60000 > maxMinutes) { finish('time'); return; }
    if (state.postEnd && !state.beatQueue.length) { finish('postEnd'); return; }

    // Checks run before actions so the paused-on-a-beat counter check
    // happens before the beat is dismissed.
    if (polls % 10 === 0) domCheck(state);

    // Story first — the engine pauses while a beat is open.
    const beatBtn = $('.beatCard.show [data-testid="beat-response"]');
    if (beatBtn) { click(beatBtn); return; }

    // Dawn rest: the one thing a real player does by walking away.
    if (state.nightShown && state.nightPhase === 'dawn') {
      game.debug.offline(cfg.NIGHT.MIN_GAP_S + 60);
      return;
    }
    if (state.nightShown && state.contractPicked === null) click($('[data-testid^="job-"]'));

    for (let i = 0; i < TAPS_PER_POLL; i++) click($('[data-testid="tap"]'));
    if (state.stir > 75) click($('[data-testid="tiptoe"]'));
    if (state.notes > 0) click($('[data-testid="log-read-note"]'));
    for (const b of document.querySelectorAll('[data-testid="roost"] button')) click(b);

    if (polls % 50 === 0) {
      const tabs = [...document.querySelectorAll('[data-testid^="tab-"]')];
      if (tabs.length) click(tabs[(polls / 50) % tabs.length]);
    }
  }, POLL_MS);

  return { stop: () => finish('stopped') };
}
```

- [ ] **Step 2: Gate it in main.js**

Three edits to `js/main.js`.

The DEV gate (around line 16):

```js
const AUTOPILOT = params.get('autopilot') === '1';
const DEV = params.get('dev') === '1' || AUTOPILOT ||
  ['localhost', '127.0.0.1'].includes(location.hostname);
```

The save load (around line 35) — `?fresh=1` starts a clean run without touching the stored save until the next autosave overwrites it:

```js
const savedRaw = params.get('fresh') === '1' ? null : localStorage.getItem('tf-save');
```

The import, directly after the existing dev-panel gate block:

```js
if (AUTOPILOT) {
  import('./dev/autopilot.js')
    .then((m) => m.startAutopilot())
    .catch((err) => console.warn('[dev] autopilot failed to load', err));
}
```

- [ ] **Step 3: Add the panel button**

In `js/dev/panel.js` `tabState`, append to the first `devBar` (`bar1`, the one with the grant buttons):

```js
  const auto = el('button', null, 'start autopilot');
  auto.addEventListener('click', () => {
    import('./autopilot.js').then((m) => m.startAutopilot());
    auto.disabled = true;
  });
  bar1.appendChild(auto);
```

(If the variable holding that bar is not literally `bar1`, use the actual name at the top of `tabState`.)

- [ ] **Step 4: Verify by hand, then run the suite**

Run: `node --test test/*.test.js` — green (nothing engine-side changed).

Smoke-check the wiring statically: `node --check js/dev/autopilot.js` and confirm `git grep -n "autopilot" js/main.js` shows the gate. Full behavioral verification happens in the controller's browser pass at speed 1000 — note in your report that you did NOT run a browser.

- [ ] **Step 5: Commit**

```bash
git add js/dev/autopilot.js js/main.js js/dev/panel.js
git commit -m "Autopilot: DOM-driving observed playthrough behind ?autopilot=1"
```

---

### Task 5: Workshop preview ergonomics + version bump

**Files:**
- Modify: `js/dev/panel.js` — the `CSS` string, `WORKSHOP_KNOBS`, `tabWorkshop` (lines ~312-478)
- Modify: `js/version.js` — `'0.9.0'`

**Interfaces:**
- Consumes: existing `sliderRow(body, ctx, ov, knob, onChange)`, `ctx.ui` preview surface (`pressTap`, `flashTapGlow`, `conveyor.tapPulse/buySweep/setRate/creditPreview/flush`, `applyTapVars`).
- Produces: nothing later tasks use — this is the last task.

- [ ] **Step 1: CSS additions**

Append to the `CSS` template string in `js/dev/panel.js` (before the closing backtick):

```css
.devBar.devSticky { position: sticky; top: -14px; z-index: 5; background: #171b27;
  padding: 10px 0 8px; margin: -14px 0 8px; box-shadow: 0 6px 8px -6px #000a; }
.devRepeat { display: inline-flex; align-items: center; gap: 5px; color: #d7dceb;
  font-size: 12px; user-select: none; }
```

(`.devBody` has 14px padding; the negative top/margin lets the bar sit flush against the panel body's top edge while sticking.)

- [ ] **Step 2: Tag the knob groups with their preview**

Each `WORKSHOP_KNOBS` entry gains a `preview` key (only the object headers change; rows stay identical):

```js
  { title: 'tap pop', preview: 'tap', rows: [ ...
  { title: 'tap glow', preview: 'tap', rows: [ ...
  { title: 'tap sparks', preview: 'tap', rows: [ ...
  { title: 'incoming teeth', preview: 'flowShort', rows: [ ...
  { title: 'landing', preview: 'flowShort', rows: [ ...
  { title: 'powerup sweep', preview: 'buy', rows: [ ...
  { title: 'scale ramp', preview: 'flowShort', rows: [ ...
```

- [ ] **Step 3: Rebuild the preview section of tabWorkshop**

Replace everything in `tabWorkshop` from `// ---- preview bar ----` through `body.append(el('h3', null, 'preview'), preview);` AND the `// ---- sliders ----` loop AND the returned teardown with:

```js
  // ---- preview bar (sticky; hotkeys; repeat) ----
  const preview = el('div', 'devBar devSticky');
  const now = () => performance.now();
  let flowTimer = null;
  let seqTimers = [];
  let autoTimer = null;
  let repeatTimer = null;
  let lastAction = null;

  function flow(rate, ms) {
    clearInterval(flowTimer);
    ctx.ui.conveyor.setRate(rate);
    const until = now() + ms;
    flowTimer = setInterval(() => {
      if (now() > until) { clearInterval(flowTimer); return; }
      ctx.ui.conveyor.creditPreview(rate * 0.2, now());
    }, 200);
  }

  // ms is the effect's full duration — the repeat loop refires after it.
  const ACTIONS = {
    tap: { label: 'tap', key: '1', ms: 700,
      run: () => { ctx.ui.pressTap(); ctx.ui.flashTapGlow(); ctx.ui.conveyor.tapPulse(now()); } },
    buy: { label: 'powerup', key: '2', ms: 1200,
      run: () => ctx.ui.conveyor.buySweep(now()) },
    trickle: { label: 'flow: trickle', key: '3', ms: 5000, run: () => flow(1e2, 5000) },
    busy: { label: 'flow: busy', key: '4', ms: 5000, run: () => flow(1e6, 5000) },
    storm: { label: 'flow: storm', key: '5', ms: 5000, run: () => flow(1e12, 5000) },
    seq: { label: 'all in sequence', key: 'a', ms: 8200, run: () => {
      seqTimers.forEach(clearTimeout);
      seqTimers = [];
      ACTIONS.tap.run();
      seqTimers.push(setTimeout(() => ACTIONS.buy.run(), 700));
      seqTimers.push(setTimeout(() => flow(1e2, 1800), 2000));
      seqTimers.push(setTimeout(() => flow(1e6, 1800), 4000));
      seqTimers.push(setTimeout(() => flow(1e12, 1800), 6000));
    } },
  };

  function armRepeat() {
    clearTimeout(repeatTimer);
    repeatTimer = null;
    if (!rep.checked || !lastAction) return;
    repeatTimer = setTimeout(() => {
      if (rep.checked && lastAction) { ACTIONS[lastAction].run(); armRepeat(); }
    }, ACTIONS[lastAction].ms + 300);
  }

  function press(key) {
    lastAction = key;
    ACTIONS[key].run();
    armRepeat();
  }

  for (const key of Object.keys(ACTIONS)) {
    const a = ACTIONS[key];
    const b = el('button', null, a.label + ' [' + a.key.toUpperCase() + ']');
    b.addEventListener('click', () => press(key));
    preview.appendChild(b);
  }
  const repLabel = el('label', 'devRepeat');
  const rep = document.createElement('input');
  rep.type = 'checkbox';
  repLabel.append(rep, document.createTextNode(' repeat [R]'));
  rep.addEventListener('change', armRepeat);
  preview.appendChild(repLabel);
  body.append(el('h3', null, 'preview'), preview);

  // Hotkeys live while this tab is visible; typing fields keep their keys.
  function onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'r') {
      rep.checked = !rep.checked;
      armRepeat();
      e.preventDefault();
      return;
    }
    const key = Object.keys(ACTIONS).find((x) => ACTIONS[x].key === k);
    if (key) { press(key); e.preventDefault(); }
  }
  document.addEventListener('keydown', onKey);

  // ---- sliders (each fires its group's preview on change, debounced) ----
  function autoPreview(key) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (key === 'flowShort') flow(1e6, 1500);
      else ACTIONS[key].run(); // auto-previews never become the repeat target
    }, 150);
  }
  const ov = loadOv('vfx');
  for (const group of WORKSHOP_KNOBS) {
    body.appendChild(el('h3', null, group.title));
    for (const knob of group.rows) {
      sliderRow(body, ctx, ov, knob, () => {
        ctx.ui.applyTapVars();
        autoPreview(group.preview);
      });
    }
  }
```

The `// ---- save / release ----` section stays untouched. The teardown at the bottom of `tabWorkshop` becomes:

```js
  return () => {
    clearInterval(flowTimer);
    seqTimers.forEach(clearTimeout);
    clearTimeout(autoTimer);
    clearTimeout(repeatTimer);
    document.removeEventListener('keydown', onKey);
    ctx.ui.conveyor.setRate(0);
    ctx.ui.conveyor.flush();
  };
```

Note the hoisting constraint: `rep` is referenced by `armRepeat` before its declaration line — that is fine at runtime (armRepeat only runs on events after setup), but keep the code order exactly as shown so the reference exists by first call.

- [ ] **Step 4: Version bump**

In `js/version.js` set the version string to `'0.9.0'`.

- [ ] **Step 5: Syntax check, suite, commit**

Run: `node --check js/dev/panel.js` — clean.
Run: `node --test test/*.test.js` — green (panel is not under node test).

```bash
git add js/dev/panel.js js/version.js
git commit -m "Workshop: sticky preview bar, hotkeys, repeat, auto-preview; v0.9.0"
```

---

## Verification (controller, after all tasks)

- Full suite green.
- Browser: `?dev=1&fresh=1&autopilot=1&speed=1000` — wait for `window.__autopilot.done`, assert zero `violations`, `domIssues`, `consoleErrors`, reason `postEnd`.
- Workshop tab: bar stays pinned while scrolling; keys 1/2/3/4/5/A fire; R loops the last effect and unchecking stops it; dragging a tap-sparks slider fires the tap preview with the new value.
- Late-game forced state: stir meter visibly active (nonzero) with a large silent-unit roster.
