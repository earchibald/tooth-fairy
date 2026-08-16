# Phase 9 — Chaos-Monkey Bot Policies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the headless play bot (and the browser autopilot) swappable strategies — steady (today's behavior), chaos (seeded-random choices), wrong (deliberately bad play) — and observe all three playthroughs.

**Architecture:** A new pure module `js/dev/policies.js` holds a policy interface (decision hooks) plus three factories and a seeded RNG. `runBot` consults the policy at each decision point; the default `steadyPolicy()` must reproduce today's run tick-for-tick. The autopilot routes its DOM decisions through the same policies via `?policy=` / `?rngSeed=` params.

**Tech Stack:** Vanilla ESM JavaScript, zero dependencies, `node --test`.

## Global Constraints

- Vanilla ESM, zero dependencies. No innerHTML/outerHTML/insertAdjacentHTML (repo hook rejects). Single-quote strings.
- Run tests as `node --test test/*.test.js` (bare `test/` fails on this Node).
- Comments state constraints only — never narration or change-justification.
- `test/e2e.test.js` must pass WITHOUT ANY EDIT. The seed-11 steady run sits at the wakes assertion ceiling (12 of [1,12]); any change to the steady tick sequence breaks it. The refactor must be decision-for-decision identical for the steady policy.
- Version bumps to '0.9.1' in `js/version.js` (Task 4).
- No `Math.random()` anywhere — all randomness through `mulberry32(seed)`.
- Autopilot code loads only behind the dev/autopilot URL params (dynamic import, already gated).

---

### Task 1: Policies module

**Files:**
- Create: `js/dev/policies.js`
- Test: `test/policies.test.js`

**Interfaces:**
- Consumes: nothing from this phase (pure module; reads plain state objects).
- Produces: `mulberry32(seed) → () => number in [0,1)`; `BUY_PRIORITY` (array, moved here from bot.js in Task 2); `steadyPolicy()`, `chaosPolicy(seed = 1)`, `wrongPolicy()` → policy objects with hooks: `name`, `tapsPerTick(state)`, `shouldTiptoe(state)`, `shouldReadNote(state)`, `shouldBuyUpgrade(state, id)`, `shouldBuyLoom(state)`, `unitOrder(state)`, `shouldBuyUnit(state, unit, quote)`, `pickContract(board)`, `beatDelayTicks()`. `quote` is `{ cost, rate, lifeCap, top }`. `board` is an array of contract defs (each has `id` and `reward.burstS`).

- [ ] **Step 1: Write the failing tests**

Create `test/policies.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32, steadyPolicy, chaosPolicy, wrongPolicy, BUY_PRIORITY }
  from '../js/dev/policies.js';

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = Array.from({ length: 100 }, () => a());
  const seqB = Array.from({ length: 100 }, () => b());
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
  const c = mulberry32(43);
  assert.notDeepEqual(seqA, Array.from({ length: 100 }, () => c()));
});

test('steadyPolicy reproduces the fixed strategy decisions', () => {
  const p = steadyPolicy();
  assert.equal(p.name, 'steady');
  assert.equal(p.tapsPerTick({}), 1);
  assert.equal(p.shouldTiptoe({ stir: 75 }), false);
  assert.equal(p.shouldTiptoe({ stir: 76 }), true);
  assert.equal(p.shouldReadNote({}), true);
  assert.equal(p.shouldBuyUpgrade({}, 'sandman'), true);
  assert.equal(p.shouldBuyLoom({ revealed: {}, stir: 90 }), false);
  assert.equal(p.shouldBuyLoom({ revealed: { loom: true }, stir: 40 }), false);
  assert.equal(p.shouldBuyLoom({ revealed: { loom: true }, stir: 41 }), true);
  assert.deepEqual(p.unitOrder({}), BUY_PRIORITY);
  assert.equal(p.beatDelayTicks(), 0);
  // Payback rule: the top revealed tier is always bought; others need
  // cost/rate <= 450 and cost under the mortal life cap.
  assert.equal(p.shouldBuyUnit({}, 'owl', { cost: 10, rate: 1, lifeCap: Infinity, top: 'owl' }), true);
  assert.equal(p.shouldBuyUnit({}, 'mouse', { cost: 450, rate: 1, lifeCap: Infinity, top: 'owl' }), true);
  assert.equal(p.shouldBuyUnit({}, 'mouse', { cost: 451, rate: 1, lifeCap: Infinity, top: 'owl' }), false);
  assert.equal(p.shouldBuyUnit({}, 'mouse', { cost: 100, rate: 1, lifeCap: 100, top: 'owl' }), false);
  const board = [
    { id: 'a', reward: { burstS: 10 } },
    { id: 'b', reward: { burstS: 30 } },
    { id: 'c', reward: {} },
  ];
  assert.equal(p.pickContract(board), 'b');
});

test('chaosPolicy is reproducible per seed', () => {
  const record = (p) => {
    const out = [];
    for (let i = 0; i < 200; i++) {
      out.push(p.tapsPerTick({}), p.shouldTiptoe({ stir: 50 }),
        p.shouldReadNote({}), p.shouldBuyUpgrade({}, 'sandman'),
        p.shouldBuyLoom({ revealed: { loom: true }, stir: 50 }),
        p.unitOrder({}).join(','),
        p.shouldBuyUnit({}, 'mouse', { cost: 1, rate: 1, lifeCap: 2, top: 'owl' }),
        p.pickContract([{ id: 'a', reward: {} }, { id: 'b', reward: {} }]),
        p.beatDelayTicks());
    }
    return out;
  };
  assert.deepEqual(record(chaosPolicy(5)), record(chaosPolicy(5)));
  assert.notDeepEqual(record(chaosPolicy(5)), record(chaosPolicy(6)));
});

test('chaosPolicy decisions stay inside their designed ranges', () => {
  const p = chaosPolicy(9);
  for (let i = 0; i < 500; i++) {
    const taps = p.tapsPerTick({});
    assert.ok(Number.isInteger(taps) && taps >= 0 && taps <= 3);
    const delay = p.beatDelayTicks();
    assert.ok(Number.isInteger(delay) && delay >= 0 && delay <= 20);
    const order = p.unitOrder({});
    assert.deepEqual([...order].sort(), [...BUY_PRIORITY].sort());
  }
  // Tiptoe threshold never fires below 30 or refuses above 90.
  assert.equal(p.shouldTiptoe({ stir: 30 }), false);
  for (let i = 0; i < 50; i++) assert.equal(chaosPolicy(i).shouldTiptoe({ stir: 91 }), true);
});

test('wrongPolicy plays badly on purpose, deterministically', () => {
  const p = wrongPolicy();
  assert.equal(p.name, 'wrong');
  assert.equal(p.tapsPerTick({}), 5);
  assert.equal(p.shouldTiptoe({ stir: 99 }), false);
  assert.equal(p.shouldReadNote({}), false);
  assert.equal(p.shouldBuyUpgrade({}, 'sandman'), true);
  assert.equal(p.shouldBuyLoom({ revealed: { loom: true }, stir: 99 }), false);
  assert.deepEqual(p.unitOrder({}), BUY_PRIORITY);
  assert.equal(p.shouldBuyUnit({}, 'mouse', { cost: 1e9, rate: 0.1, lifeCap: 1, top: 'owl' }), true);
  const board = [
    { id: 'a', reward: { burstS: 10 } },
    { id: 'b', reward: { burstS: 30 } },
    { id: 'c', reward: {} },
  ];
  assert.equal(p.pickContract(board), 'c');
  assert.equal(p.beatDelayTicks(), 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/policies.test.js`
Expected: FAIL — cannot find module `js/dev/policies.js`.

- [ ] **Step 3: Write the module**

Create `js/dev/policies.js`:

```js
// Bot strategies as swappable decision hooks. steadyPolicy must reproduce
// the historical fixed bot decision-for-decision — test/e2e.test.js pins a
// measured run against it. All randomness flows through mulberry32 so every
// run is reproducible from its seed; Math.random is banned here.

export const BUY_PRIORITY = ['starwrights', 'ministry', 'pact', 'barge', 'ferry', 'owl',
  'phantom', 'sprite', 'bunny', 'mouse', 'scout'];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function steadyPolicy() {
  return {
    name: 'steady',
    tapsPerTick: () => 1,
    shouldTiptoe: (s) => s.stir > 75,
    shouldReadNote: () => true,
    shouldBuyUpgrade: () => true,
    shouldBuyLoom: (s) => !!s.revealed.loom && s.stir > 40,
    unitOrder: () => BUY_PRIORITY,
    shouldBuyUnit: (s, unit, q) =>
      unit === q.top || (q.cost / q.rate <= 450 && q.cost < q.lifeCap),
    pickContract: (board) => board.slice()
      .sort((a, b) => (b.reward.burstS || 0) - (a.reward.burstS || 0))[0].id,
    beatDelayTicks: () => 0,
  };
}

export function chaosPolicy(seed = 1) {
  const rng = mulberry32(seed);
  return {
    name: 'chaos',
    tapsPerTick: () => Math.floor(rng() * 4),
    shouldTiptoe: (s) => s.stir > 30 + rng() * 60,
    shouldReadNote: () => rng() < 0.7,
    shouldBuyUpgrade: () => rng() < 0.5,
    shouldBuyLoom: (s) => !!s.revealed.loom && s.stir > 20 && rng() < 0.3,
    unitOrder: () => shuffle(BUY_PRIORITY.slice(), rng),
    shouldBuyUnit: () => rng() < 0.5,
    pickContract: (board) => board[Math.floor(rng() * board.length)].id,
    beatDelayTicks: () => Math.floor(rng() * 21),
  };
}

// The worst diligent player: max noise, no mitigation, money burned on the
// most expensive thing in sight, the weakest job every night. Upgrades stay
// bought — skipping them starves reveals, which is stalling, not strategy.
export function wrongPolicy() {
  return {
    name: 'wrong',
    tapsPerTick: () => 5,
    shouldTiptoe: () => false,
    shouldReadNote: () => false,
    shouldBuyUpgrade: () => true,
    shouldBuyLoom: () => false,
    unitOrder: () => BUY_PRIORITY,
    shouldBuyUnit: () => true,
    pickContract: (board) => board.slice()
      .sort((a, b) => (a.reward.burstS || 0) - (b.reward.burstS || 0))[0].id,
    beatDelayTicks: () => 0,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/policies.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add js/dev/policies.js test/policies.test.js
git commit -m 'Bot policies: steady, chaos (seeded), wrong'
```

---

### Task 2: runBot consults the policy

**Files:**
- Modify: `js/dev/bot.js`
- Test: `test/bot-policy.test.js` (new)

**Interfaces:**
- Consumes: everything Task 1 produces; bot.js imports `steadyPolicy` and `BUY_PRIORITY` from `./policies.js` (both files live in `js/dev/`).
- Produces: `runBot(cfg, script, { maxTicks, seed, tapsPerTick, onTick, contracts, prestige, policy })` — new optional `policy` (default `steadyPolicy()`); the explicit `tapsPerTick` option, when passed, overrides the policy's hook (existing tests rely on it). `BUY_PRIORITY` no longer defined in bot.js.

- [ ] **Step 1: Write the failing equivalence test**

Create `test/bot-policy.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { buildScript } from '../js/config/script.js';
import { buildContracts } from '../js/config/contracts.js';
import { runBot } from './helpers/bot.js';
import { steadyPolicy, chaosPolicy } from '../js/dev/policies.js';

const cfg = buildConstants();
const script = buildScript();
const contracts = buildContracts();

// Pins the policy refactor: an explicit steadyPolicy must equal the default
// (historical) behavior state-for-state. Seed 11 is the tuned e2e seed.
test('explicit steadyPolicy matches the default run exactly', () => {
  const a = runBot(cfg, script, { maxTicks: 50000, seed: 11, contracts });
  const b = runBot(cfg, script,
    { maxTicks: 50000, seed: 11, contracts, policy: steadyPolicy() });
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.events, b.events);
});

test('same chaos seed gives the same run; different seed diverges', () => {
  const a = runBot(cfg, script,
    { maxTicks: 30000, seed: 11, contracts, policy: chaosPolicy(3) });
  const b = runBot(cfg, script,
    { maxTicks: 30000, seed: 11, contracts, policy: chaosPolicy(3) });
  const c = runBot(cfg, script,
    { maxTicks: 30000, seed: 11, contracts, policy: chaosPolicy(4) });
  assert.deepEqual(a.state, b.state);
  assert.notDeepEqual(a.state, c.state);
});

test('explicit tapsPerTick option overrides the policy hook', () => {
  const a = runBot(cfg, script,
    { maxTicks: 5000, seed: 2, contracts, tapsPerTick: 3, policy: steadyPolicy() });
  const b = runBot(cfg, script, { maxTicks: 5000, seed: 2, contracts, tapsPerTick: 3 });
  assert.deepEqual(a.state, b.state);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/bot-policy.test.js`
Expected: FAIL — `policy` option is ignored today, so the chaos test's `a.state` vs `c.state` are deep-equal (`notDeepEqual` throws), or the import of `steadyPolicy` fails if Task 1 is absent.

- [ ] **Step 3: Refactor runBot**

Replace `js/dev/bot.js` with:

```js
// A competent, deliberately not-optimal player. Shared by playthrough,
// pacing, and reachability tests so they all measure the same kind of player.
// Strategy lives in a policy object (js/dev/policies.js); the default
// steadyPolicy reproduces the historical fixed bot decision-for-decision —
// the tuned e2e runs depend on that byte-level equivalence.

import { createState, departTown } from '../engine/state.js';
import { dispatch } from '../engine/actions.js';
import { tick, runOffline } from '../engine/tick.js';
import { nextCost, starsAtLifetime, figureDone } from '../engine/math.js';
import { steadyPolicy, BUY_PRIORITY } from './policies.js';

const UPGRADE_IDS = ['babyfae', 'pincers', 'tweezers', 'gloves', 'starlight',
  'afterglow', 'sandman', 'dreamledger', 'nightledger', 'lucidcontract',
  'sockradar', 'madrid', 'encore', 'feltslippers', 'lighthouse', 'manifestii',
  'notary', 'annexforms', 'moonclippers'];
const SKY_PRIORITY = ['mouseletter', 'oldroads', 'packedlight', 'lullabythread', 'starcharts', 'ferrytoken'];

const TRACE_PRIORITY = ['littlest', 'fieldmouse', 'quietloom', 'ferryman', 'toothfairy'];

// Leftover stars go into figures, cheapest story first. Exported so tests
// can prove the policy without a full multi-town run.
export function botTrace(state, cfg) {
  for (const id of TRACE_PRIORITY) {
    while (state.stars >= 1 &&
           (state.constellations[id] || 0) < cfg.CONSTELLATIONS[id].slots) {
      dispatch(state, cfg, 'traceStar', { id });
    }
  }
}

// When run with { prestige: true }, on postEnd the bot buys affordable sky
// cards in priority order, then departs. departTown returns a brand-new
// state object (it cannot be swapped in place), so runBot's loop adopts it:
// `const next = departTown(...); if (next) state = next;`.
export function runBot(cfg, script, { maxTicks = 200000, seed = 1, tapsPerTick, onTick, contracts, prestige = false, policy = steadyPolicy() } = {}) {
  let state = createState(seed);
  const events = [];
  let steps = 0;
  let beatWait = -1; // -1 while no beat is pending a policy delay draw
  while (steps < maxTicks) {
    steps++;
    if (state.beatQueue.length) {
      if (beatWait < 0) beatWait = policy.beatDelayTicks();
      if (beatWait > 0) { beatWait--; continue; }
      beatWait = -1;
      const id = state.beatQueue[0];
      const beat = script.beats.find((b) => b.id === id);
      dispatch(state, cfg, 'applyBeatEffects', { effects: beat && beat.effects });
      dispatch(state, cfg, 'dismissBeat', { id });
      events.push({ tick: state.tick, beat: id });
      if (state.postEnd) {
        // Give the engine one more tick so an afterBeat-chained beat
        // (e.g. end-town after end-sky) gets queued before we stop.
        tick(state, cfg, script, { contracts });
        if (prestige && state.postEnd && !state.beatQueue.length) {
          for (const id2 of SKY_PRIORITY) {
            if (!state.sky[id2] && state.stars >= cfg.SKY[id2].cost) dispatch(state, cfg, 'buySky', { id: id2 });
          }
          botTrace(state, cfg);
          const gained = starsAtLifetime(state.lifetime, cfg) +
            (figureDone(state, cfg, 'littlest') ? cfg.CONSTELLATIONS.littlest.departBonus : 0);
          events.push(`(town ${state.town} done: +${gained} stars)`);
          const next = departTown(state, cfg);
          if (next) state = next;
          continue;
        }
        if (!state.beatQueue.length) break;
      }
      continue; // the game pauses while a beat is open
    }
    if (state.nightShown && state.nightPhase === 'dawn') {
      runOffline(state, cfg, script, cfg.NIGHT.MIN_GAP_S + 60, contracts);
      events.push({ tick: state.tick, beat: '(slept)' });
      continue;
    }
    if (state.nightShown && state.contractPicked === null && state.contractBoard.length && contracts) {
      const board = state.contractBoard.map((id) => contracts.pool.find((c) => c.id === id));
      dispatch(state, cfg, 'pickContract', { id: policy.pickContract(board) });
    }
    const taps = tapsPerTick !== undefined ? tapsPerTick : policy.tapsPerTick(state);
    for (let i = 0; i < taps; i++) dispatch(state, cfg, 'tap');
    if (policy.shouldTiptoe(state)) dispatch(state, cfg, 'tiptoe');
    if (state.notes > 0 && policy.shouldReadNote(state)) dispatch(state, cfg, 'readNote');
    for (const id of UPGRADE_IDS) {
      if (!state.upgrades[id] && policy.shouldBuyUpgrade(state, id)) dispatch(state, cfg, 'buyUpgrade', { id });
    }
    if (policy.shouldBuyLoom(state)) dispatch(state, cfg, 'buyLoom');

    // The policy decides which units to take; the quote hands it the steady
    // payback math (cost, rate, mortal life cap, best revealed tier) so
    // policies can honor, ignore, or invert the rule without recomputing it.
    const top = BUY_PRIORITY.find((u) => state.revealed['unit:' + u]);
    for (const unit of policy.unitOrder(state)) {
      if (!state.revealed['unit:' + unit]) continue;
      const def = cfg.UNITS[unit];
      const cost = nextCost(def.base, def.growth, state.buys[unit]);
      const mult = Math.pow(2, state.mults[unit] || 0);
      const rate = (def.rate || (def.lumpAmount / (def.lumpEveryTicks * cfg.TICK_MS / 1000))) * mult;
      // Mortal units can only ever repay their own lifetime of production.
      const lifeCap = def.lifeTicks
        ? rate * (def.lifeTicks * cfg.TICK_MS / 1000) *
          (1 + (state.upgrades.afterglow ? def.afterglowFrac : 0))
        : Infinity;
      if (policy.shouldBuyUnit(state, unit, { cost, rate, lifeCap, top })) {
        dispatch(state, cfg, 'buyUnit', { unit });
      }
    }
    for (const unit of BUY_PRIORITY) dispatch(state, cfg, 'buyMult', { unit });
    tick(state, cfg, script, { contracts });
    state.sfx.length = 0; // transient feedback, unread headless
    if (onTick) onTick(state);
  }
  return { state, events, steps };
}
```

Behavioral equivalence notes for the implementer (verify each against the old file):
- The old `tapsPerTick = 1` default becomes `undefined`; steady's hook returns 1, so omitting the option is unchanged, and passing it still wins.
- The old contract sort mutated a freshly mapped array; `pickContract` sorts a slice of the same mapped array — same winner.
- Old order per step: taps → tiptoe(>75) → readNote → upgrades → loom(revealed && >40) → units (BUY_PRIORITY, `unit === top ||` payback) → mults → tick. The refactor keeps that exact order; steady hooks encode the exact same predicates.
- `beatWait` starts each beat at `policy.beatDelayTicks()`; steady returns 0 so the beat is dismissed the same step it is seen, exactly as before.

- [ ] **Step 4: Run the new tests, then the whole suite**

Run: `node --test test/bot-policy.test.js`
Expected: PASS (3 tests).

Run: `node --test test/*.test.js`
Expected: ALL PASS — especially `test/e2e.test.js` untouched and green. If the observed e2e run fails, the refactor changed a steady decision; diff against the equivalence notes above. Do not touch constants or e2e assertions.

- [ ] **Step 5: Commit**

```bash
git add js/dev/bot.js test/bot-policy.test.js
git commit -m 'runBot consults a policy object; steady default is tick-identical'
```

---

### Task 3: Observed chaos and wrong playthroughs

**Files:**
- Create: `test/chaos.test.js`

**Interfaces:**
- Consumes: `runBot(..., { policy })` from Task 2; `chaosPolicy`, `wrongPolicy` from Task 1; `createObserver` from `js/dev/observer.js` (unchanged).
- Produces: nothing downstream; this is the CI deliverable for playthroughs (2) and (3).

This task MEASURES first, then pins. The numeric placeholders below
(`maxTicks`, the lifetime floor) are seeds; run each playthrough once, read
the observer stats and final state, then set assertions with ≥ 2× headroom
and record the measured numbers in your report and in a comment above each
assertion. If the chaos run does not complete within 600000 ticks, raise
maxTicks (it is cheap — these are pure engine ticks); if the wrong run never
completes, that is acceptable and the lifetime-floor branch carries the test.

- [ ] **Step 1: Write the tests with seed values**

Create `test/chaos.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { buildScript } from '../js/config/script.js';
import { buildContracts } from '../js/config/contracts.js';
import { runBot } from './helpers/bot.js';
import { chaosPolicy, wrongPolicy } from '../js/dev/policies.js';
import { createObserver } from '../js/dev/observer.js';

const cfg = buildConstants();
const script = buildScript();
const contracts = buildContracts();

test('chaos playthrough: random choices stay clean and complete', () => {
  const obs = createObserver(cfg, script);
  const { state } = runBot(cfg, script,
    { maxTicks: 600000, seed: 21, policy: chaosPolicy(1), contracts, onTick: obs.onTick });
  assert.deepEqual(obs.report().violations, []);
  assert.ok(state.postEnd, 'chaos run completes');
  assert.ok(state.wakes >= 1, `wakes ${state.wakes} >= 1`);
});

test('wrong playthrough: the engine survives deliberately bad play', () => {
  const obs = createObserver(cfg, script);
  const { state } = runBot(cfg, script,
    { maxTicks: 600000, seed: 22, policy: wrongPolicy(), contracts, onTick: obs.onTick });
  assert.deepEqual(obs.report().violations, []);
  // Bad play is punished harder than the steady ceiling (12) allows.
  assert.ok(state.wakes > 12, `wakes ${state.wakes} > 12`);
  // Never a soft-lock: the run finishes, or the game demonstrably kept
  // moving deep past act 1. Floor = measured lifetime / 2, recorded below.
  assert.ok(state.postEnd || state.lifetime > 1e6,
    `postEnd ${state.postEnd} lifetime ${state.lifetime}`);
});
```

- [ ] **Step 2: Run and measure**

Run: `node --test test/chaos.test.js`
Read the failures (if any) and, regardless of pass/fail, add temporary
`console.log(state.postEnd, state.tick, state.lifetime, state.wakes, state.act)`
after each run to capture the measurements. Then:

- Pin `maxTicks` per run to ≥ 2× the measured completion tick (round up to a clean number).
- If the wrong run completes: keep the `postEnd ||` branch and set the lifetime floor to half the measured final lifetime.
- If it does not: set the floor to half the measured lifetime at maxTicks.
- Remove the temporary logs; put each measured value in a one-line comment above its assertion (constraint the number encodes, not narration).

- [ ] **Step 3: Run the whole suite**

Run: `node --test test/*.test.js`
Expected: ALL PASS. Note the added wall-clock; if the chaos file pushes total
suite time past ~2 minutes, report it (do not weaken the runs on your own).

- [ ] **Step 4: Commit**

```bash
git add test/chaos.test.js
git commit -m 'Observed chaos and wrong playthroughs'
```

---

### Task 4: Autopilot policy routing

**Files:**
- Modify: `js/dev/autopilot.js`
- Modify: `js/main.js:309-315` (autopilot gate)
- Modify: `js/version.js`

**Interfaces:**
- Consumes: `steadyPolicy`, `chaosPolicy`, `wrongPolicy`, `mulberry32` from `./policies.js` (Task 1).
- Produces: `startAutopilot({ maxMinutes, policyName, rngSeed })`; report at `window.__autopilot` gains `policy: <name>`. URL contract: `?policy=steady|chaos|wrong` (default steady), `?rngSeed=N` (default 1).

Hard constraint: with `policyName: 'steady'` the autopilot's observable
behavior must be identical to today's — same 4-taps-per-poll burst, same
stir>45 tiptoe threshold (poll-lag margin, deliberately below the policy's
75), same click-everything roost sweep, same immediate beat click. The
steady branch keeps its own autopilot constants; the policy hooks drive the
chaos and wrong branches.

- [ ] **Step 1: Modify `js/dev/autopilot.js`**

Add imports at the top:

```js
import { steadyPolicy, chaosPolicy, wrongPolicy, mulberry32 } from './policies.js';
```

Change the signature and add policy setup (replacing the current first lines of `startAutopilot`):

```js
export function startAutopilot({ maxMinutes = 10, policyName = 'steady', rngSeed = 1 } = {}) {
  const game = window.game;
  const { cfg, script } = game;
  const policy = policyName === 'chaos' ? chaosPolicy(rngSeed)
    : policyName === 'wrong' ? wrongPolicy() : steadyPolicy();
  // DOM-side randomness (roost-button coin flips) gets its own stream so it
  // cannot desync the policy's decision sequence from a headless run.
  const domRng = mulberry32(rngSeed + 1);
  const obs = createObserver(cfg, script);
```

In `finish()`, add the policy name to the report:

```js
    window.__autopilot = { done: true, reason, minutes, polls, policy: policy.name,
      violations, domIssues, consoleErrors, stats };
```

In the poll loop, replace the beat click:

```js
    // Story first — the engine pauses while a beat is open. Chaos idles a
    // few polls first, like a reader; steady and wrong answer immediately.
    const beatBtn = $('.beatCard.show [data-testid="beat-response"]');
    if (beatBtn) {
      if (beatWait < 0) beatWait = policy.beatDelayTicks();
      if (beatWait > 0) { beatWait--; return; }
      beatWait = -1;
      click(beatBtn); return;
    }
```

with `let beatWait = -1;` declared next to `let polls = 0;`.

Replace the job pick (currently `if (state.nightShown && state.contractPicked === null) click($('[data-testid^="job-"]'));`):

```js
    if (state.nightShown && state.contractPicked === null && state.contractBoard.length) {
      const board = state.contractBoard.map((id) => game.contracts.pool.find((c) => c.id === id));
      click($('[data-testid="job-' + policy.pickContract(board) + '"]') || $('[data-testid^="job-"]'));
    }
```

(Job cards are `data-testid="job-<id>"`, `js/ui/board.js:70`. The steady
policy picks the highest burst — an upgrade over the old first-card click,
acceptable because job choice happens between nights, outside the
tick-sequence equivalence that matters; the fallback covers a card that
failed to render, which would then surface as a domCheck finding.)

Replace the tap burst, tiptoe, and note lines:

```js
    const tapBtn = $('[data-testid="tap"]');
    if (tapBtn) {
      // Steady keeps the historical 4/poll burst (the engine cap is under
      // test); other policies bring their own appetite.
      const taps = policy.name === 'steady' ? TAPS_PER_POLL : policy.tapsPerTick(state);
      for (let i = 0; i < taps; i++) {
        tapBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      }
    }
    // Steady's threshold sits far below the policy's 75 because the
    // autopilot senses stir with up to a poll of lag.
    if (policy.name === 'steady' ? state.stir > 45 : policy.shouldTiptoe(state)) {
      click($('[data-testid="tiptoe"]'));
    }
    if (state.notes > 0 && policy.shouldReadNote(state)) click($('[data-testid="log-read-note"]'));
```

Replace the roost sweep:

```js
    for (const b of document.querySelectorAll('[data-testid="roost"] button')) {
      if (policy.name === 'wrong' && b.dataset.testid === 'buy-loom') continue;
      if (policy.name === 'chaos' && domRng() < 0.5) continue;
      click(b);
    }
```

- [ ] **Step 2: Modify the autopilot gate in `js/main.js`**

```js
// ---- autopilot gate ----
if (AUTOPILOT) {
  import('./dev/autopilot.js')
    .then((m) => m.startAutopilot({
      policyName: params.get('policy') || 'steady',
      rngSeed: Number(params.get('rngSeed')) || 1,
    }))
    .catch((err) => console.warn('[dev] autopilot failed to load', err));
}
```

- [ ] **Step 3: Bump the version**

In `js/version.js` set the version string to `'0.9.1'`.

- [ ] **Step 4: Run the suite (no browser in this task)**

Run: `node --test test/*.test.js`
Expected: ALL PASS (autopilot is browser-only; the suite proves nothing
regressed elsewhere). Browser verification of all three policies runs in
parallel after the branch review — controller protocol, spec section 4.

- [ ] **Step 5: Commit**

```bash
git add js/dev/autopilot.js js/main.js js/version.js
git commit -m 'Autopilot policy routing: ?policy= and ?rngSeed=; v0.9.1'
```

---

## Verification after all tasks (controller, not a subagent task)

Three static servers (repo root) on ports 8123/8124/8125, one tab each:

- `http://127.0.0.1:8123/?dev=1&fresh=1&autopilot=1&speed=150&mute=1&policy=steady`
- `http://127.0.0.1:8124/?dev=1&fresh=1&autopilot=1&speed=150&mute=1&policy=chaos&rngSeed=7`
- `http://127.0.0.1:8125/?dev=1&fresh=1&autopilot=1&speed=150&mute=1&policy=wrong`

`caffeinate -d -u` for the duration; poll each tab's `window.__autopilot`.
Pass: steady and chaos reach postEnd, 0 violations / 0 domIssues /
0 consoleErrors; wrong reports 0 violations / 0 consoleErrors, wakes well
above 12; wrong-run domIssues are triaged (wake churn stresses real-time UI
delays), any repeatable mismatch is a finding.
