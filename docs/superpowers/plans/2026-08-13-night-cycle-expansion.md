# Night-Cycle Expansion (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stretch a playthrough to 2–3 real days via a night cycle, a new act (THE RIVER), four new units, a contract board, a three-tab UX, and universal tooltips.

**Architecture:** All new mechanics live in the deterministic engine (`js/engine/*`); the wall clock enters only through the existing offline-replay path. The renderer gains a tab layer and a contract board but never computes economy numbers. Config stays data-only; every constant is a dev-panel knob.

**Tech Stack:** Vanilla ESM JavaScript, no build step, `node --test`, DOM via `document.createElement` only.

## Global Constraints

- Vanilla ESM only. No dependencies, no build step, no TypeScript syntax.
- Never use `innerHTML` (repo hook rejects it). Build DOM with `createElement`/`append`.
- The engine never reads `Date.now()`/`performance.now()`. Ticks and the offline path are the only clocks.
- Reducers guard everything; a refused action mutates nothing and pushes no sfx.
- The renderer reads state + engine predicates; it never derives economy numbers itself.
- Voice: memory register = lowercase, spare. Ledger register = mono bureaucratic, counted. Player responses = lowercase snark.
- One term, one meaning: all player-visible strings live in `js/config/names.js` or `js/config/script.js`.
- Tests: `node --test` from repo root must pass at every commit.
- Engine tests use `noStory` (empty script) so beats cannot pause mid-test.
- Commit after every task with the trailer lines used in this repo (Co-Authored-By + Claude-Session).

---

### Task 1: Night engine core

**Files:**
- Modify: `js/config/constants.js` (add `NIGHT` block)
- Modify: `js/engine/state.js` (night fields)
- Modify: `js/engine/tick.js` (phase machine, production gate, stats, stamps)
- Modify: `js/engine/actions.js` (tap guard, `applyBeatEffects` reveal, night stats in reducers)
- Test: `test/night.test.js` (new)

**Interfaces:**
- Produces: `state.night` (int, 1-based), `state.nightPhase` (`'night'|'dawn'`), `state.nightTicksLeft` (int), `state.duskGapS` (float), `state.nightShown` (bool), `state.nightStats` (`{teeth, wakes, notes, tiptoes}`), `state.nightLedger` (array of `{night, teeth, wakes, contractsDone, sailed}`), `state.sailings` (int), `state.bargeManifest` (float).
- Produces: `cfg.NIGHT = { LENGTH_TICKS, MIN_GAP_S, LEDGER_CAP }`.
- Produces: beat effect `revealNight: true` handled by `applyBeatEffects`.
- Produces: sfx events `{type:'dawn'}`, `{type:'dusk'}`.
- Rule for later tasks: while `nightShown && nightPhase === 'dawn'`, production is zero and taps refuse.

- [ ] **Step 1: Write failing tests**

```js
// test/night.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { createState } from '../js/engine/state.js';
import { dispatch } from '../js/engine/actions.js';
import { tick } from '../js/engine/tick.js';

const cfg = buildConstants();
const noStory = Object.freeze({ beats: [], asides: [], whispers: {}, notes: [] });

function nightPlaying() {
  const s = createState(1);
  s.tapShown = true;
  s.act = 2;
  s.upgrades.babyfae = true;
  dispatch(s, cfg, 'applyBeatEffects', { effects: { revealNight: true } });
  return s;
}

test('night is inert until revealed', () => {
  const s = createState(1);
  s.tapShown = true;
  for (let i = 0; i < 500; i++) tick(s, cfg, noStory);
  assert.equal(s.nightPhase, 'night');
  assert.equal(s.night, 1);
});

test('productive ticks burn the night; dawn stops production and taps', () => {
  const s = nightPlaying();
  s.units.scout = 10; s.buys.scout = 10;
  const ticks = cfg.NIGHT.LENGTH_TICKS;
  for (let i = 0; i < ticks + 5; i++) tick(s, cfg, noStory);
  assert.equal(s.nightPhase, 'dawn');
  const before = s.teeth;
  for (let i = 0; i < 25; i++) tick(s, cfg, noStory);
  assert.equal(s.teeth, before, 'no production at dawn');
  assert.equal(dispatch(s, cfg, 'tap'), false, 'tap refused at dawn');
});

test('idle ticks do not burn the night', () => {
  const s = nightPlaying();                 // no units, no taps
  const left = s.nightTicksLeft;
  for (let i = 0; i < 100; i++) tick(s, cfg, noStory);
  assert.equal(s.nightTicksLeft, left);
});

test('the dusk gap ends dawn and starts the next night with a ledger stamp', () => {
  const s = nightPlaying();
  s.units.scout = 10; s.buys.scout = 10;
  for (let i = 0; i < cfg.NIGHT.LENGTH_TICKS + 2; i++) tick(s, cfg, noStory);
  assert.equal(s.nightPhase, 'dawn');
  assert.equal(s.nightLedger.length, 1);
  assert.equal(s.nightLedger[0].night, 1);
  assert.ok(s.nightLedger[0].teeth > 0);
  const gapTicks = Math.ceil(cfg.NIGHT.MIN_GAP_S / (cfg.TICK_MS / 1000));
  for (let i = 0; i < gapTicks + 2; i++) tick(s, cfg, noStory);
  assert.equal(s.nightPhase, 'night');
  assert.equal(s.night, 2);
  assert.equal(s.nightStats.teeth, 0, 'stats reset at dusk');
});

test('night stats track the night', () => {
  const s = nightPlaying();
  s.units.scout = 5; s.buys.scout = 5;
  for (let i = 0; i < 50; i++) tick(s, cfg, noStory);
  assert.ok(s.nightStats.teeth > 0);
  dispatch(s, cfg, 'tap');
  const t = s.nightStats.teeth;
  tick(s, cfg, noStory);
  assert.ok(s.nightStats.teeth >= t);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/night.test.js`
Expected: FAIL (`nightPhase` undefined / `revealNight` unhandled).

- [ ] **Step 3: Implement**

`js/config/constants.js` — add after `OUTLINE`:

```js
  NIGHT: Object.freeze({
    LENGTH_TICKS: 10500,  // ~35 min of productive play at 200ms ticks
    MIN_GAP_S: 7200,      // dawn rest before the next dusk (2 h)
    LEDGER_CAP: 30,       // night-ledger entries kept
  }),
```

`js/engine/state.js` — add to `createState` after `outlineAccum`:

```js
    night: 1,
    nightPhase: 'night',
    nightShown: false,
    nightTicksLeft: 0,          // set from cfg at reveal and at each dusk
    duskGapS: 0,
    nightStats: { teeth: 0, wakes: 0, notes: 0, tiptoes: 0 },
    nightLedger: [],
    sailings: 0,                // lifetime completed sailings (river act)
    bargeManifest: 0,           // teeth logged for the barge this night
```

and in `deserialize`, after the `outline` line:

```js
    s.nightStats = { ...fresh.nightStats, ...(wrapped.state.nightStats || {}) };
    s.nightLedger = Array.isArray(wrapped.state.nightLedger) ? wrapped.state.nightLedger : [];
```

`js/engine/actions.js`:

- In `tap`, first line of guards:

```js
    if (state.nightShown && state.nightPhase === 'dawn') return;
```

- In `applyBeatEffects`, with the other flags:

```js
    if (fx.revealNight) {
      state.nightShown = true;
      state.nightTicksLeft = cfg.NIGHT.LENGTH_TICKS;
    }
```

- In `tap` after `state.lifetime += gain;`: `state.nightStats.teeth += gain;`
- In `readNote` after `state.notesRead++;`: `state.nightStats.notes++;`
- In `tiptoe` after `state.tiptoes++;`: `state.nightStats.tiptoes++;`

`js/engine/tick.js`:

- Add a helper above `tick`:

```js
// Dawn: stamp the night, rest until dusk. Dusk: begin the next night.
function toDawn(state, cfg, offline) {
  state.nightPhase = 'dawn';
  state.duskGapS = cfg.NIGHT.MIN_GAP_S;
  state.bargeManifest = state.nightStats.teeth;
  state.nightLedger.push({
    night: state.night,
    teeth: Math.floor(state.nightStats.teeth),
    wakes: state.nightStats.wakes,
    contractsDone: 0,          // task 6 fills this in
    sailed: state.units.barge > 0,
  });
  if (state.nightLedger.length > cfg.NIGHT.LEDGER_CAP) state.nightLedger.shift();
  if (!offline) state.sfx.push({ type: 'dawn' });
}

function toDusk(state, cfg, offline) {
  state.night++;
  state.nightPhase = 'night';
  state.nightTicksLeft = cfg.NIGHT.LENGTH_TICKS;
  state.nightStats = { teeth: 0, wakes: 0, notes: 0, tiptoes: 0 };
  if (!offline) state.sfx.push({ type: 'dusk' });
}
```

(`state.units.barge` is 0/undefined until task 4 — use `(state.units.barge || 0) > 0`.)

- In `tick`, immediately after `state.tick += dtTicks;` insert the dawn gate:

```js
  const atDawn = state.nightShown && state.nightPhase === 'dawn';
  if (atDawn) {
    state.duskGapS -= dt;
    if (state.duskGapS <= 0) toDusk(state, cfg, offline);
  }
```

- Gate production: change `const continuous = ...` to

```js
  const continuous = atDawn ? 0 : baseRatePerSec(state, cfg) * dt;
```

and wrap the sprite-burst and ferry-lump blocks so `burst` and `lump` stay 0 at dawn
(simplest: compute them as today, then `if (atDawn) { lump = 0; burst = 0; ferrySpike = 0; }`).

- After the production block (`if (produced > 0) { ... }`) add:

```js
  if (produced > 0) state.nightStats.teeth += produced;

  // Productive ticks burn the night; idle ones do not.
  if (state.nightShown && state.nightPhase === 'night' &&
      (produced > 0 || state.tapsThisTick > 0)) {
    state.nightTicksLeft -= dtTicks;
    if (state.nightTicksLeft <= 0) toDawn(state, cfg, offline);
  }
```

- In the wake block, after `state.wakes++;`: `state.nightStats.wakes++;`
- In `effectiveRatePerSec` (`js/engine/predicates.js`) return 0 when
  `state.nightShown && state.nightPhase === 'dawn'` (first line).

- [ ] **Step 4: Run tests**

Run: `node --test`
Expected: all pass, including the untouched suites.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Night engine core: phase machine, production gate, stats, ledger stamps"` (with repo trailers).

---

### Task 2: Time passage offline + night-aware bot + reveal beat

**Files:**
- Modify: `js/engine/tick.js` (`runOffline` restructure)
- Modify: `js/config/script.js` (add `a2-night` beat)
- Modify: `js/dev/bot.js` (sleep at dawn)
- Test: `test/night.test.js` (extend)

**Interfaces:**
- Consumes: task 1 fields.
- Produces: `runOffline(state, cfg, script, elapsedS)` now ALWAYS advances night time for the full `elapsedS`; earnings still require `dreamledger` and respect caps. Signature and return `{teeth, seconds}` unchanged.
- Produces: beat `a2-night` with `effects: { revealNight: true }`, trigger `afterBeat a2-hush`.

- [ ] **Step 1: Write failing tests** (append to `test/night.test.js`)

```js
import { runOffline } from '../js/engine/tick.js';

test('absence advances the dusk gap even without any ledger', () => {
  const s = nightPlaying();
  s.units.scout = 10; s.buys.scout = 10;
  for (let i = 0; i < cfg.NIGHT.LENGTH_TICKS + 2; i++) tick(s, cfg, noStory);
  assert.equal(s.nightPhase, 'dawn');
  const before = s.teeth;
  runOffline(s, cfg, noStory, cfg.NIGHT.MIN_GAP_S + 120);
  assert.equal(s.nightPhase, 'night');
  assert.equal(s.night, 2);
  assert.equal(Math.floor(s.teeth), Math.floor(before), 'no ledger, no earnings');
});

test('with a ledger, a long absence plays nights and earns within caps', () => {
  const s = nightPlaying();
  s.units.scout = 10; s.buys.scout = 10;
  s.upgrades.dreamledger = true;
  const gain = runOffline(s, cfg, noStory, 3600);
  assert.ok(gain.teeth > 0);
  assert.ok(s.nightTicksLeft < cfg.NIGHT.LENGTH_TICKS, 'offline burned night time');
});
```

- [ ] **Step 2: Run to verify failure** — `node --test test/night.test.js`. Expected: FAIL (old `runOffline` returns early without `dreamledger`).

- [ ] **Step 3: Implement**

Replace `runOffline` in `js/engine/tick.js`:

```js
// Offline catch-up: the same tick loop. Time (nights, dusk gaps) always
// passes for the full absence; EARNINGS require the ledger and its caps.
export function runOffline(state, cfg, script, elapsedS) {
  if (elapsedS < 10) return { teeth: 0, seconds: 0 };
  const capHours = state.upgrades.lucidcontract ? cfg.UPGRADES.lucidcontract.offlineCapHours
    : state.upgrades.nightledger ? cfg.UPGRADES.nightledger.offlineCapHours
    : state.upgrades.dreamledger ? cfg.UPGRADES.dreamledger.offlineCapHours : 0;
  const rate = !state.upgrades.dreamledger ? 0
    : state.upgrades.lucidcontract ? cfg.UPGRADES.lucidcontract.offlineRate
    : cfg.UPGRADES.dreamledger.offlineRate;
  const earnS = Math.min(elapsedS, capHours * 3600);
  const totalTicks = Math.floor(elapsedS / (cfg.TICK_MS / 1000));
  if (totalTicks < 1) return { teeth: 0, seconds: 0 };
  const steps = Math.min(cfg.OFFLINE.MAX_STEPS, totalTicks);
  const dtScale = totalTicks / steps;
  const earnTicks = Math.floor(earnS / (cfg.TICK_MS / 1000));
  const before = state.teeth;
  state.offlineReplay = true;
  let done = 0;
  for (let i = 0; i < steps; i++) {
    const stillEarning = done < earnTicks;
    tick(state, cfg, script, {
      dtTicks: dtScale, offline: true, rateFactor: stillEarning ? rate : 0,
    });
    done += dtScale;
  }
  state.offlineReplay = false;
  state.sfx = [];
  return { teeth: state.teeth - before, seconds: earnS };
}
```

Note: `rateFactor: 0` zeroes production (`produced === 0`), so no earnings, no
night-burning from production — but taps are 0 offline too, so the dawn gap is the
only thing that must advance with rate 0. It does: the dawn gate runs before the
production check. During the night phase with rate 0, `nightTicksLeft` stays put —
correct: an un-ledgered crew does not work while you are away.

`js/config/script.js` — after `a2-hush` add:

```js
    { id: 'a2-night', act: 2, register: 'memory',
      text: "the night has edges now. i can feel the dawn coming like a tide. when it comes, we rest — the ledgers work while we sleep, if you've bought the right one.",
      response: 'set the clock', trigger: { type: 'afterBeat', id: 'a2-hush' },
      effects: { revealNight: true } },
```

`js/dev/bot.js` — import `runOffline` at top
(`import { tick, runOffline } from '../engine/tick.js';`), then inside the loop,
after the beat-dismiss block, add:

```js
    if (state.nightShown && state.nightPhase === 'dawn') {
      runOffline(state, cfg, script, cfg.NIGHT.MIN_GAP_S + 60);
      events.push({ tick: state.tick, beat: '(slept)' });
      continue;
    }
```

Filter `'(slept)'` pseudo-events out in `test/playthrough.test.js`'s spine assertion:
change `events.slice(0, spine.length)` to
`events.filter((e) => e.beat !== '(slept)').slice(0, spine.length)`.

- [ ] **Step 4: Run tests** — `node --test`. Expected: all pass (playthrough now sleeps through dawns).

- [ ] **Step 5: Commit** — `"Offline time passage, night-aware bot, a2-night reveal beat"`.

---

### Task 3: New rate units — DUST BUNNY, ATTIC OWL, STARWRIGHTS

**Files:**
- Modify: `js/config/constants.js` (UNITS entries), `js/config/names.js`, `js/engine/state.js` (UNIT_IDS), `js/engine/predicates.js` (reveals), `js/config/script.js` (beats/asides)
- Test: `test/night.test.js` (extend) and existing suites must stay green

**Interfaces:**
- Produces: unit ids `bunny`, `owl`, `starwrights` everywhere `UNIT_IDS` is read (state zero-maps, roost cards, bot priority).
- Reveal keys: `unit:bunny`, `unit:owl`, `unit:starwrights`.

- [ ] **Step 1: Write failing test**

```js
test('new units produce and reveal in act order', () => {
  const s = nightPlaying();
  s.units.bunny = 2; s.buys.bunny = 2;
  s.units.owl = 1; s.buys.owl = 1;
  const before = s.teeth;
  for (let i = 0; i < 10; i++) tick(s, cfg, noStory);
  assert.ok(s.teeth > before);
  s.teeth = 1e9; s.lifetime = 1e9; s.act = 3; s.buys.ministry = 1;
  tick(s, cfg, noStory);
  assert.ok(s.revealed['unit:starwrights']);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test test/night.test.js`. Expected: FAIL (`s.units.bunny` undefined → NaN teeth or reveal missing).

- [ ] **Step 3: Implement**

`js/engine/state.js`:

```js
export const UNIT_IDS = ['scout', 'mouse', 'bunny', 'sprite', 'phantom', 'owl',
  'ferry', 'barge', 'pact', 'ministry', 'starwrights'];
```

(`barge` id reserved here; its mechanic lands in task 4. `zeroUnits` builds from
`UNIT_IDS` now — replace the literal object:)

```js
const zeroUnits = () => Object.fromEntries(UNIT_IDS.map((u) => [u, 0]));
```

`js/config/constants.js` UNITS — insert (keep existing entries; `barge` here too, inert until task 4):

```js
    bunny:      Object.freeze({ base: 5000,   growth: 1.14, rate: 60,    noise: 3 }),
    owl:        Object.freeze({ base: 45000,  growth: 1.13, rate: 300,   noise: 0.2 }),
    barge:      Object.freeze({ base: 400000, growth: 1.18, rate: 0,     noise: 0.5,
                                manifestFrac: 0.05, manifestCap: 0.25 }),
    starwrights:Object.freeze({ base: 4e8,    growth: 1.25, rate: 1e6,   noise: 0 }),
```

`js/config/names.js` units:

```js
    bunny:      Object.freeze({ name: 'DUST BUNNY',   flavor: 'lives under the bed. always has. finally on payroll.' }),
    owl:        Object.freeze({ name: 'ATTIC OWL',    flavor: 'sees everything. says nothing. bills monthly.' }),
    barge:      Object.freeze({ name: 'MOLAR BARGE',  flavor: 'sails at dawn with the night’s manifest. pays on return.' }),
    starwrights:Object.freeze({ name: 'STARWRIGHTS',  flavor: 'they take the teeth upstairs. don’t ask about the ladder.' }),
```

and multNames: `bunny: 'BROOM DODGING', owl: 'WIDER EYES', barge: 'DEEPER HOLD', starwrights: 'TALLER LADDER',`.

`js/engine/predicates.js` `revealChecks` — add:

```js
    'unit:bunny': state.act >= 2 && afford(cfg.UNITS.bunny.base),
    'unit:owl': state.act >= 2 && state.buys.bunny >= 3 && afford(cfg.UNITS.owl.base),
    'unit:barge': state.act >= 25 && afford(cfg.UNITS.barge.base),
    'unit:starwrights': state.buys.ministry >= 1 && afford(cfg.UNITS.starwrights.base),
```

`js/dev/bot.js` BUY_PRIORITY becomes:

```js
const BUY_PRIORITY = ['starwrights', 'ministry', 'pact', 'barge', 'ferry', 'owl',
  'phantom', 'sprite', 'bunny', 'mouse', 'scout'];
```

`js/config/script.js` — add beats:

```js
    { id: 'a2-bunny', act: 2, register: 'memory',
      text: "the dust bunnies were always here. under every bed. listening. they'd like dental now, and a name each.",
      response: 'granted', trigger: { type: 'buy', unit: 'bunny', count: 1 } },
    { id: 'a2-owl', act: 2, register: 'memory',
      text: "the owl took the job without asking what it pays. it says it has seen the tall one in the doorway before. years ago. watching, even then.",
      response: 'noted. unsettling.', trigger: { type: 'buy', unit: 'owl', count: 1 } },
    { id: 'a3-starwrights', act: 3, register: 'memory',
      text: "the starwrights don't gather teeth. they take them up. i asked up where. they pointed. i didn't ask again.",
      response: 'up.', trigger: { type: 'buy', unit: 'starwrights', count: 1 } },
```

and asides:

```js
    { id: 'as-bunny10', trigger: { type: 'buy', unit: 'bunny', count: 10 },
      text: 'the bunnies have names now. all of them are gerald.' },
    { id: 'as-owl5', trigger: { type: 'buy', unit: 'owl', count: 5 },
      text: 'five owls. the attic minutes are exhaustive.' },
    { id: 'as-starwrights3', trigger: { type: 'buy', unit: 'starwrights', count: 3 },
      text: 'three crews on the ladder. the sky takes deliveries now.' },
```

`js/ui/roost.js` `unitInfo` — before the default return add:

```js
    if (unit === 'barge') {
      return `${(def.manifestFrac * 100).toFixed(0)}% of each night’s gathering apiece, paid at dusk`;
    }
```

Note: `act >= 25` for barge means it stays hidden until task 7 introduces act 25 — fine.

- [ ] **Step 4: Run tests** — `node --test`. Expected: pass. Reachability of the new beats holds because the bot buys these units (priority list) — if `a3-starwrights`/asides miss, raise bot `maxTicks` to 600000 in `test/playthrough.test.js`.

- [ ] **Step 5: Commit** — `"Units: dust bunny, attic owl, starwrights (+barge config stub)"`.

---

### Task 4: Molar barge — sailings and the night lump

**Files:**
- Modify: `js/engine/tick.js` (`toDusk` pays the manifest; sailing counter)
- Test: `test/night.test.js` (extend)

**Interfaces:**
- Consumes: `state.bargeManifest` (stamped at dawn, task 1), `cfg.UNITS.barge.manifestFrac/.manifestCap`.
- Produces: at each dusk with barges owned: teeth lump `manifest × min(manifestCap, manifestFrac × barges × 2^mults)`, `state.sailings++`, sfx `{type:'sail', amount}`.

- [ ] **Step 1: Write failing test**

```js
test('the barge pays a fraction of last night at dusk and counts a sailing', () => {
  const s = nightPlaying();
  s.units.scout = 10; s.buys.scout = 10;
  s.units.barge = 2; s.buys.barge = 2;
  for (let i = 0; i < cfg.NIGHT.LENGTH_TICKS + 2; i++) tick(s, cfg, noStory);
  const manifest = s.bargeManifest;
  assert.ok(manifest > 0);
  const before = s.teeth;
  const gapTicks = Math.ceil(cfg.NIGHT.MIN_GAP_S / (cfg.TICK_MS / 1000));
  for (let i = 0; i < gapTicks + 2; i++) tick(s, cfg, noStory);
  const frac = Math.min(cfg.UNITS.barge.manifestCap, cfg.UNITS.barge.manifestFrac * 2);
  assert.ok(Math.abs((s.teeth - before) - manifest * frac) < 1);
  assert.equal(s.sailings, 1);
});
```

- [ ] **Step 2: Run to verify failure** — expected FAIL: no lump, `sailings` 0.

- [ ] **Step 3: Implement** — in `toDusk` (js/engine/tick.js), before resetting `nightStats`:

```js
  const barges = state.units.barge || 0;
  if (barges > 0 && state.bargeManifest > 0) {
    const def = cfg.UNITS.barge;
    const frac = Math.min(def.manifestCap,
      def.manifestFrac * barges * Math.pow(2, state.mults.barge || 0));
    const lump = state.bargeManifest * frac;
    state.teeth += lump;
    state.lifetime += lump;
    state.sailings++;
    if (!offline) state.sfx.push({ type: 'sail', amount: lump });
  }
  state.bargeManifest = 0;
```

- [ ] **Step 4: Run tests** — `node --test`. Expected: pass.

- [ ] **Step 5: Commit** — `"Molar barge: night manifest pays at dusk, sailings counted"`.

---

### Task 5: Unique upgrades + offline ladder rework

**Files:**
- Modify: `js/engine/predicates.js` (`multFactor` gains `cfg`; unique reveals), `js/engine/tick.js` (callers), `js/config/constants.js` (UPGRADES), `js/config/names.js`, `js/ui/roost.js` (upgradeInfo)
- Test: `test/night.test.js` (extend)

**Interfaces:**
- Produces: `multFactor(state, unit, cfg)` — springboards × unique-upgrade doubles. All callers updated: `predicates.js` (baseRatePerSec, effectiveRatePerSec, noiseLevel is NOT affected), `tick.js` (sprite afterglow, ferry lump).
- Produces: upgrade config shape `{ cost, unitMult: '<unit>' }` — owning it doubles that unit.
- New upgrades: `sockradar`(scout, 12k), `madrid`(mouse, 90k), `encore`(sprite lifeTicks ×1.5, 60k), `feltslippers`(phantom, 300k), `lighthouse`(ferry, 900k), `manifestii`(barge manifestFrac ×2, 2.5M), `notary`(pact, 12M), `annexforms`(ministry, 90M), `moonclippers`(tap ×2 rung after starlight, 3M).
- Offline ladder: `dreamledger` cost 800; `nightledger` 150000; `lucidcontract` 5e6. Reveal moves: dreamledger needs `a1-rounds` seen + lifetime ≥ 2000.

- [ ] **Step 1: Write failing test**

```js
test('a unique upgrade doubles its unit', () => {
  const plain = nightPlaying();
  plain.units.scout = 10; plain.buys.scout = 10;
  for (let i = 0; i < 10; i++) tick(plain, cfg, noStory);

  const upgraded = nightPlaying();
  upgraded.units.scout = 10; upgraded.buys.scout = 10;
  upgraded.upgrades.sockradar = true;
  for (let i = 0; i < 10; i++) tick(upgraded, cfg, noStory);

  const ratio = upgraded.teeth / plain.teeth;
  assert.ok(ratio > 1.9 && ratio < 2.1, `scout output ratio ${ratio.toFixed(2)} ≈ 2`);
});
```

- [ ] **Step 2: Run to verify failure** — expected FAIL (upgrade has no effect).

- [ ] **Step 3: Implement**

`js/engine/predicates.js`:

```js
export function multFactor(state, unit, cfg) {
  let f = Math.pow(2, state.mults[unit] || 0);
  for (const id of Object.keys(cfg.UPGRADES)) {
    if (cfg.UPGRADES[id].unitMult === unit && state.upgrades[id]) f *= 2;
  }
  return f;
}
```

Update every `multFactor(state, X)` call to `multFactor(state, X, cfg)`:
`baseRatePerSec`, `effectiveRatePerSec` (both in predicates.js), and in `tick.js`
(afterglow burst, ferry lump). `actions.js` does not call it.

`js/config/constants.js` UPGRADES — change costs and add:

```js
    dreamledger:  Object.freeze({ cost: 800,    offlineRate: 0.5, offlineCapHours: 2 }),
    nightledger:  Object.freeze({ cost: 150000, offlineCapHours: 8 }),
    lucidcontract:Object.freeze({ cost: 5e6,    offlineRate: 1.0, offlineCapHours: 24 }),
    sockradar:    Object.freeze({ cost: 12000,  unitMult: 'scout' }),
    madrid:       Object.freeze({ cost: 90000,  unitMult: 'mouse' }),
    encore:       Object.freeze({ cost: 60000,  spriteLifeMult: 1.5 }),
    feltslippers: Object.freeze({ cost: 300000, unitMult: 'phantom' }),
    lighthouse:   Object.freeze({ cost: 900000, unitMult: 'ferry' }),
    manifestii:   Object.freeze({ cost: 2.5e6,  manifestMult: 2 }),
    notary:       Object.freeze({ cost: 12e6,   unitMult: 'pact' }),
    annexforms:   Object.freeze({ cost: 90e6,   unitMult: 'ministry' }),
    moonclippers: Object.freeze({ cost: 3e6 }),
```

Wire `encore`: in `actions.js buyUnit`, sprite expiry push becomes

```js
      const life = Math.round(def.lifeTicks * (state.upgrades.encore ? cfg.UPGRADES.encore.spriteLifeMult : 1));
      for (let i = 0; i < n; i++) state.spriteExpiries.push(state.tick + life);
```

Wire `manifestii`: in `toDusk`, `def.manifestFrac * barges * ...` gains
`* (state.upgrades.manifestii ? cfg.UPGRADES.manifestii.manifestMult : 1)`.

Wire `moonclippers`: in `tapPower`, the flag list becomes
`['babyfae', 'pincers', 'tweezers', 'gloves', 'moonclippers']`.

`revealChecks` additions/changes:

```js
    'up:dreamledger': state.beatsSeen.includes('a1-rounds') && state.lifetime >= 2000 && afford(cfg.UPGRADES.dreamledger.cost),
    'up:sockradar': state.buys.scout >= 10 && afford(cfg.UPGRADES.sockradar.cost),
    'up:madrid': state.buys.mouse >= 10 && afford(cfg.UPGRADES.madrid.cost),
    'up:encore': state.buys.sprite >= 8 && afford(cfg.UPGRADES.encore.cost),
    'up:feltslippers': state.buys.phantom >= 5 && afford(cfg.UPGRADES.feltslippers.cost),
    'up:lighthouse': state.buys.ferry >= 3 && afford(cfg.UPGRADES.lighthouse.cost),
    'up:manifestii': state.buys.barge >= 2 && afford(cfg.UPGRADES.manifestii.cost),
    'up:notary': state.buys.pact >= 3 && afford(cfg.UPGRADES.notary.cost),
    'up:annexforms': state.buys.ministry >= 2 && afford(cfg.UPGRADES.annexforms.cost),
    'up:moonclippers': prevTap('starlight') && afford(cfg.UPGRADES.moonclippers.cost),
```

`js/config/names.js` upgrades:

```js
    sockradar:    Object.freeze({ name: 'SOCK RADAR',        flavor: 'filters the false positives. scouts weep with gratitude.' }),
    madrid:       Object.freeze({ name: 'MADRID CONNECTIONS', flavor: 'she made some calls. do not ask on which phone.' }),
    encore:       Object.freeze({ name: 'ENCORE',            flavor: 'the mayflies negotiated a longer forever.' }),
    feltslippers: Object.freeze({ name: 'FELT SLIPPERS',     flavor: 'the phantoms were already silent. now they are smug about it.' }),
    lighthouse:   Object.freeze({ name: 'LIGHTHOUSE MOTH',   flavor: 'guides the ferries. paid in porchlight.' }),
    manifestii:   Object.freeze({ name: 'MANIFEST, PART II', flavor: 'the barge found a second hold. do not ask where.' }),
    notary:       Object.freeze({ name: 'NIGHT NOTARY',      flavor: 'stamps twice. legally distinct thumps.' }),
    annexforms:   Object.freeze({ name: 'ANNEX FORMS',       flavor: 'form 32-c: request for additional additional night.' }),
    moonclippers: Object.freeze({ name: 'MOON CLIPPERS',     flavor: 'crescent-shaped. self-sharpening. taps twice as deep.' }),
```

`js/ui/roost.js` `upgradeInfo` additions:

```js
    sockradar: 'tooth scouts ×2', madrid: 'pillow mice ×2',
    encore: 'sprites live 50% longer', feltslippers: 'floss phantoms ×2',
    lighthouse: 'tooth ferries ×2', manifestii: 'barge manifest share ×2',
    notary: 'parent pacts ×2', annexforms: 'ministry ×2',
    moonclippers: 'taps gather ×2 again',
```

- [ ] **Step 4: Run tests** — `node --test`. Expected: pass. The playthrough reachability suite may need `maxTicks` headroom; keep raising to 600000 max only if needed.

- [ ] **Step 5: Commit** — `"Unique per-unit upgrades, tap rung, offline ladder rework"`.

---

### Task 6: Contract board engine

**Files:**
- Create: `js/config/contracts.js`
- Modify: `js/engine/state.js`, `js/engine/tick.js`, `js/engine/actions.js`, `js/engine/predicates.js`
- Test: `test/contracts.test.js` (new)

**Interfaces:**
- Produces: `buildContracts(overrides)` returning `{ pool: [{id, minAct, type, n, text, reward}] }`.
  Condition types: `'gather' | 'notes' | 'tiptoes'` (threshold, done mid-night) and `'quiet' | 'calm'` (endurance, judged at dawn: `quiet` = 0 wakes tonight, `calm` = stir < n at dawn).
  Rewards: `{belief: n}` or `{burstS: n}` (n seconds of `effectiveRatePerSec` as teeth) or `{fragment: 'text'}` (a story-note aside).
- Produces: state `contractBoard` (ids), `contractPicked` (id|null), `contractDone` (bool), `contractStreak` (int), plus `cfg.CONTRACTS = { PER_NIGHT: 3, STREAK_TIERS: [3,7,14], STREAK_MULTS: [1.03, 1.05, 1.08] }`.
- Produces: reducer `pickContract(state, cfg, {id})`; predicate `contractMult(state, cfg)` multiplying production (applied in `tick` alongside `pactNet`); `drawBoard(state, cfg, contracts)` exported from `tick.js` and called in `toDusk` and at `revealNight`.
- Produces: sfx `{type:'contract', id}` on completion; `contractsDone` per-night stamp in the ledger.
- Contracts config threads through like `script`: `main.js` builds it and passes it in `tick` opts (`opts.contracts`) — engine tests pass it explicitly.

- [ ] **Step 1: Write failing tests**

```js
// test/contracts.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { buildContracts } from '../js/config/contracts.js';
import { createState } from '../js/engine/state.js';
import { dispatch } from '../js/engine/actions.js';
import { tick } from '../js/engine/tick.js';

const cfg = buildConstants();
const contracts = buildContracts();
const noStory = Object.freeze({ beats: [], asides: [], whispers: {}, notes: [] });
const opts = { contracts };

function nightPlaying(seed = 1) {
  const s = createState(seed);
  s.tapShown = true; s.act = 2; s.upgrades.babyfae = true;
  dispatch(s, cfg, 'applyBeatEffects', { effects: { revealNight: true } });
  tick(s, cfg, noStory, opts);   // draw the first board
  return s;
}

test('the board draws deterministically from seed + night', () => {
  const a = nightPlaying(7);
  const b = nightPlaying(7);
  assert.deepEqual(a.contractBoard, b.contractBoard);
  assert.equal(a.contractBoard.length, cfg.CONTRACTS.PER_NIGHT);
});

test('picking locks the board; threshold contracts complete mid-night', () => {
  const s = nightPlaying(3);
  const gatherId = s.contractBoard.find((id) =>
    contracts.pool.find((c) => c.id === id && c.type === 'gather'));
  if (!gatherId) return;           // board variance; other seeds cover it
  assert.ok(dispatch(s, cfg, 'pickContract', { id: gatherId }));
  assert.equal(dispatch(s, cfg, 'pickContract', { id: s.contractBoard[0] }), false);
  s.units.scout = 50; s.buys.scout = 50;
  for (let i = 0; i < 2000 && !s.contractDone; i++) tick(s, cfg, noStory, opts);
  assert.ok(s.contractDone);
});

test('streak rises on completion and multiplies production at tier 1', () => {
  const s = nightPlaying(5);
  s.contractStreak = cfg.CONTRACTS.STREAK_TIERS[0];
  s.units.scout = 10; s.buys.scout = 10;
  const t0 = s.teeth;
  for (let i = 0; i < 25; i++) tick(s, cfg, noStory, opts);
  const withStreak = s.teeth - t0;
  const p = nightPlaying(5);
  p.units.scout = 10; p.buys.scout = 10;
  const p0 = p.teeth;
  for (let i = 0; i < 25; i++) tick(p, cfg, noStory, opts);
  assert.ok(withStreak > (p.teeth - p0) * 1.02);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test test/contracts.test.js`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`js/config/contracts.js` (same merge/override pattern as `script.js`):

```js
// Contract pool. Pure data. type: gather|notes|tiptoes (threshold, n scales
// noted below) · quiet|calm (endurance, judged at dawn).
export const CONTRACT_DEFAULTS = Object.freeze({
  pool: [
    { id: 'c-gather-s', minAct: 2, type: 'gather', n: 900,
      text: 'a molar under the blue house’s window. nine hundred teeth on the books by dawn.',
      reward: { burstS: 45 } },
    { id: 'c-gather-m', minAct: 2, type: 'gather', n: 3000,
      text: 'the ministry wants volume. three thousand before the light.',
      reward: { burstS: 90 } },
    { id: 'c-quiet', minAct: 2, type: 'quiet',
      text: 'the flashlight kid is on a sleepover. their host must not wake. no one wakes tonight.',
      reward: { belief: 8 } },
    { id: 'c-calm', minAct: 2, type: 'calm', n: 30,
      text: 'end the night with the houses barely stirring. under thirty on the meter at dawn.',
      reward: { belief: 5 } },
    { id: 'c-notes', minAct: 2, type: 'notes', n: 2,
      text: 'two letters need answering tonight. read them properly.',
      reward: { fragment: "'dear tooth fairy. the sleepover kid snores. i kept watch for you.' — the flashlight kid" } },
    { id: 'c-tiptoe', minAct: 2, type: 'tiptoes', n: 2,
      text: 'the floorboards by the nursery are proud. humble yourself twice.',
      reward: { belief: 4 } },
    { id: 'c-gather-r', minAct: 25, type: 'gather', n: 40000,
      text: 'the barge master wants a full hold. forty thousand by dawn.',
      reward: { burstS: 120 } },
    { id: 'c-quiet-r', minAct: 25, type: 'quiet',
      text: 'fog on the river carries sound. tonight, none to carry.',
      reward: { belief: 10 } },
    { id: 'c-fragment-r', minAct: 25, type: 'notes', n: 3,
      text: 'three letters came upriver, water-stained. read them anyway.',
      reward: { fragment: "'dear tooth fairy. dad says the river was here before the town. what was it FOR?'" } },
    { id: 'c-gather-f', minAct: 3, type: 'gather', n: 2e6,
      text: 'the fold expects a tithe. two million on the books tonight.',
      reward: { burstS: 180 } },
    { id: 'c-calm-f', minAct: 3, type: 'calm', n: 20,
      text: 'signatories sleep lightly. under twenty at dawn.',
      reward: { belief: 12 } },
  ],
});

export function buildContracts(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.pool) || !o.pool.length) {
    return CONTRACT_DEFAULTS;
  }
  return Object.freeze({ pool: o.pool.filter((c) => c && c.id) });
}
```

`js/config/constants.js`:

```js
  CONTRACTS: Object.freeze({
    PER_NIGHT: 3,
    STREAK_TIERS: Object.freeze([3, 7, 14]),
    STREAK_MULTS: Object.freeze([1.03, 1.05, 1.08]),
  }),
```

`js/engine/state.js` createState additions:

```js
    contractBoard: [],
    contractPicked: null,
    contractDone: false,
    contractStreak: 0,
```

and in `deserialize`:
`s.contractBoard = Array.isArray(wrapped.state.contractBoard) ? wrapped.state.contractBoard : [];`

`js/engine/predicates.js`:

```js
export function contractMult(state, cfg) {
  let m = 1;
  const tiers = cfg.CONTRACTS.STREAK_TIERS;
  for (let i = 0; i < tiers.length; i++) {
    if (state.contractStreak >= tiers[i]) m = cfg.CONTRACTS.STREAK_MULTS[i];
  }
  return m;
}
```

Apply it in `tick.js` production (`... * contractMult(state, cfg) * rateFactor`) and
in `effectiveRatePerSec`.

`js/engine/tick.js`:

```js
import { mulberry32 } from './rng.js';

export function drawBoard(state, cfg, contracts) {
  if (!contracts) { state.contractBoard = []; return; }
  const eligible = contracts.pool.filter((c) => c.minAct <= state.act);
  const rand = mulberry32((state.seed ^ (state.night * 2654435761)) >>> 0);
  const deck = eligible.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  state.contractBoard = deck.slice(0, cfg.CONTRACTS.PER_NIGHT).map((c) => c.id);
  state.contractPicked = null;
  state.contractDone = false;
}
```

In `tick(state, cfg, script, opts)`: `const contracts = opts && opts.contracts;`.
Draw on reveal — the cheapest hook: at the top of tick, after the dawn gate:

```js
  if (state.nightShown && state.contractBoard.length === 0 &&
      state.contractPicked === null && state.nightPhase === 'night' && contracts) {
    drawBoard(state, cfg, contracts);
  }
```

Contract evaluation, after the night-stats update:

```js
  if (contracts && state.contractPicked && !state.contractDone) {
    const c = contracts.pool.find((x) => x.id === state.contractPicked);
    const ns = state.nightStats;
    const met = c && (
      (c.type === 'gather' && ns.teeth >= c.n) ||
      (c.type === 'notes' && ns.notes >= c.n) ||
      (c.type === 'tiptoes' && ns.tiptoes >= c.n));
    if (met) completeContract(state, cfg, c, offline);
  }
```

with the helper (add `effectiveRatePerSec` to tick.js's import list from
`./predicates.js` — it is not imported there today):

```js
function completeContract(state, cfg, c, offline) {
  state.contractDone = true;
  state.contractStreak++;
  if (c.reward.belief) state.belief = Math.min(100, state.belief + c.reward.belief);
  if (c.reward.burstS) {
    const burst = effectiveRatePerSec(state, cfg) * c.reward.burstS;
    state.teeth += burst;
    state.lifetime += burst;
    state.nightStats.teeth += burst;
  }
  if (!offline) state.sfx.push({ type: 'contract', id: c.id, fragment: c.reward.fragment || null });
}
```

In `toDawn` — endurance judgment and streak bookkeeping (add `contracts` param;
`toDawn(state, cfg, offline, contracts)` — update both call sites):

```js
  if (contracts && state.contractPicked && !state.contractDone) {
    const c = contracts.pool.find((x) => x.id === state.contractPicked);
    const met = c && (
      (c.type === 'quiet' && state.nightStats.wakes === 0) ||
      (c.type === 'calm' && state.stir < c.n));
    if (met) completeContract(state, cfg, c, offline);
    else state.contractStreak = 0;   // an accepted, failed contract breaks the streak
  }
```

Stamp `contractsDone: state.contractDone ? 1 : 0` in the ledger entry (replace the
task-1 placeholder), and in `toDusk` call `drawBoard(state, cfg, contracts)` (pass
`contracts` down: `toDusk(state, cfg, offline, contracts)`).

`js/engine/actions.js`:

```js
  pickContract(state, cfg, arg) {
    if (!arg || !state.contractBoard.includes(arg.id)) return;
    if (state.contractPicked !== null) return;
    if (!state.nightShown || state.nightPhase !== 'night') return;
    state.contractPicked = arg.id;
    state.sfx.push({ type: 'pick', id: arg.id });
    bump(state);
  },
```

`js/main.js`: build and thread contracts —

```js
import { buildContracts } from './config/contracts.js';
const contracts = buildContracts(loadOverrides('tf-ov-contracts'));
```

and pass `{ contracts }` in the main-loop `tick(...)` call. `runOffline` gains an
optional 5th parameter: `runOffline(state, cfg, script, elapsedS, contracts)`,
threaded into its internal `tick` calls as `opts.contracts` — update the bot's
dawn-sleep call (task 2) to pass its `contracts`, and `main.js`'s boot call to pass
the built `contracts`. Add `contracts` to `window.game` and to `buildUI`'s ctx
(task 12's board consumes it).
Update `js/dev/bot.js` `runBot` to accept `contracts` via its options and thread it
(`tick(state, cfg, script, { contracts })`); bot picks greedily each night:

```js
    if (state.nightShown && state.contractPicked === null && state.contractBoard.length && contracts) {
      const best = state.contractBoard
        .map((id) => contracts.pool.find((c) => c.id === id))
        .sort((a, b) => (b.reward.burstS || 0) - (a.reward.burstS || 0))[0];
      dispatch(state, cfg, 'pickContract', { id: best.id });
    }
```

`test/playthrough.test.js` passes `contracts: buildContracts()` into `runBot`.

- [ ] **Step 4: Run tests** — `node --test`. Expected: pass.

- [ ] **Step 5: Commit** — `"Contract board engine: seeded draw, pick, thresholds, dawn judgment, streaks"`.

---

### Task 7: ACT 2.5 — THE RIVER

**Files:**
- Modify: `js/config/script.js` (river beats/whispers, doorway move, trigger types), `js/engine/tick.js` (`triggerMet` cases), `js/config/vfx.js` (`palettes[25]`)
- Test: `test/night.test.js` + playthrough suite

**Interfaces:**
- Produces: act value `25` between 2 and 3. Trigger types `night {count}` (`state.night >= count`) and `sailings {count}` (`state.sailings >= count`).
- Story flow: `a2-doorway` beat is REPLACED by river entry; the doorway text moves to the river act's exit beat `r-doorway` which carries `effects: { act: 3 }` — `a3-fold`'s trigger becomes `afterBeat r-doorway`.

- [ ] **Step 1: Write failing test**

```js
test('night and sailings triggers gate river beats', () => {
  const s = nightPlaying();
  const beat = { id: 'x', trigger: { type: 'sailings', count: 2 } };
  const script2 = { beats: [beat], asides: [], whispers: {}, notes: [] };
  s.sailings = 1;
  tick(s, cfg, script2);
  assert.ok(!s.beatQueue.includes('x'));
  s.sailings = 2;
  tick(s, cfg, script2);
  assert.ok(s.beatQueue.includes('x'));
});
```

- [ ] **Step 2: Run to verify failure** — expected FAIL (unknown trigger type returns false forever, second assert fails).

- [ ] **Step 3: Implement**

`js/engine/tick.js` `triggerMet` cases:

```js
    case 'night': return state.night >= trig.count;
    case 'sailings': return state.sailings >= trig.count;
```

`js/config/vfx.js` palettes — add key `25` between 2 and 3:

```js
    25: Object.freeze({ bg: '#081420', surface: '#0e1b2b', ink: '#dfeaf2', dim: '#8fa3b4', accent: '#7fb0c9', glow: '#b8e0ef' }),
```

`js/config/script.js` — replace `a2-doorway` with river entry and add the act:

```js
    { id: 'r-enter', act: 2, register: 'memory',
      text: 'i rode the ferry tonight. all the way. past the last house, into the fog. there is a far shore. i have been there. i cannot remember it.',
      response: 'ride again', trigger: { type: 'lifetime', value: 800000, minAct: 2 },
      effects: { act: 25 } },
    { id: 'r-barge', act: 25, register: 'memory',
      text: 'the bargemaster tips her hat like we have met. we have met. the hold smells like rain and enamel.',
      response: 'load it up', trigger: { type: 'buy', unit: 'barge', count: 1 } },
    { id: 'r-firstsail', act: 25, register: 'memory',
      text: 'first sailing on the books. the barge came back low in the water and heavier than it left. the river pays interest. rivers should not do that.',
      response: 'rivers keep secrets', trigger: { type: 'sailings', count: 1 } },
    { id: 'r-fog', act: 25, register: 'memory',
      text: 'third night on the river. the fog has a shape in it now. tall. patient. it waves back.',
      response: '...wave again', trigger: { type: 'sailings', count: 3 } },
    { id: 'r-ledger', act: 25, register: 'ledger',
      text: 'river manifest audited. sailings: 5. shrinkage: zero. the far shore signs its receipts in a hand you would recognize.',
      response: 'i might', trigger: { type: 'sailings', count: 5 } },
    { id: 'r-doorway', act: 25, register: 'memory',
      text: "there's someone in the doorway. tall. tired. holding a tooth between finger and thumb like it's evidence. they're not surprised to see me. they smell like the river.",
      response: 'uh oh', trigger: { type: 'lifetime', value: 8000000, minAct: 25 },
      effects: { act: 3 } },
```

Change `a3-fold`'s trigger to `{ type: 'afterBeat', id: 'r-doorway' }` and REMOVE its
`effects: { act: 3 }` (the doorway now carries it). Update the two `a3-almost` /
`a3-firstpage` lifetime values in task 8's rebalance.

River whispers — add pool `25`:

```js
    25: ['a horn, closer tonight.',
         'the water holds its breath.',
         'rope, wet wood, and mint.',
         'the far shore keeps a light on.',
         'something upriver is counting too.'],
```

`js/ui/render.js` uses `vfx.palettes[state.act]` — key 25 resolves automatically.
`stage.whisper` reads `whispers[state.act]` — likewise.

Update `test/playthrough.test.js` ordering test: add `'r-doorway'` to the ids that
must come after `a2-stir`, and assert `order.indexOf('a3-fold') > order.indexOf('r-doorway')`.

- [ ] **Step 4: Run tests** — `node --test`. Expected: pass; reachability includes the river beats (the bot buys barges via priority list and sleeps through nights, accruing sailings).

- [ ] **Step 5: Commit** — `"ACT 2.5 THE RIVER: beats, whispers, palette, night/sailings triggers, doorway moved"`.

---

### Task 8: Rebalance + pacing envelope

**Files:**
- Modify: `js/config/constants.js` (costs, ENDING), `js/config/script.js` (lifetime thresholds)
- Test: `test/playthrough.test.js` (envelope), `test/pacing.test.js` (new)

**Interfaces:**
- Produces: `ENDING.LIFETIME: 2e9`. Costs: `pact.base 3e6` (growth 1.22), `ministry.base 40e6` (growth 1.22). Act-3 beat thresholds: `a3-almost` 200e6, `a3-firstpage` 800e6.
- Pacing envelope: bot completes in 5–9 nights; minimum real time ≥ 12 h.

- [ ] **Step 1: Write failing test**

```js
// test/pacing.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { buildScript } from '../js/config/script.js';
import { buildContracts } from '../js/config/contracts.js';
import { runBot } from './helpers/bot.js';

const cfg = buildConstants();

test('a full run lands in the 2-3 day envelope', () => {
  const { state } = runBot(cfg, buildScript(), { maxTicks: 900000, seed: 11, contracts: buildContracts() });
  assert.ok(state.postEnd, 'run completes');
  assert.ok(state.night >= 5 && state.night <= 9, `nights ${state.night} in [5,9]`);
  const activeH = (state.night * cfg.NIGHT.LENGTH_TICKS * cfg.TICK_MS) / 3600000;
  const gapsH = ((state.night - 1) * cfg.NIGHT.MIN_GAP_S) / 3600;
  assert.ok(activeH + gapsH >= 12, `min wall time ${(activeH + gapsH).toFixed(1)}h >= 12h`);
});
```

- [ ] **Step 2: Run to verify failure** — expected FAIL (run ends in too few nights at old costs).

- [ ] **Step 3: Implement** — apply the constants above; then TUNE: run `node --test test/pacing.test.js` repeatedly, adjusting `pact.base/growth`, `ministry.base/growth`, `starwrights.base`, and `ENDING.LIFETIME` until nights land in [5,9] across seeds 11, 12, 13 (add the two extra seeds to the test as a loop). Relax the old run-length test in `test/playthrough.test.js` (`minutes < 240` no longer holds: change to `minutes < 3000` — game-time now includes slept gaps).

- [ ] **Step 3b: One pact signing per night (spec §3.2)** — test first:

```js
test('only one pact signs per night', () => {
  const s = nightPlaying();
  s.act = 3;
  s.revealed['unit:pact'] = true;
  s.teeth = 1e12;
  assert.ok(dispatch(s, cfg, 'buyUnit', { unit: 'pact' }));
  assert.equal(dispatch(s, cfg, 'buyUnit', { unit: 'pact' }), false, 'second refuses');
  const gapAndNight = cfg.NIGHT.LENGTH_TICKS +
    Math.ceil(cfg.NIGHT.MIN_GAP_S / (cfg.TICK_MS / 1000)) + 4;
  s.units.scout = 1; s.buys.scout = 1;      // burn the night productively
  for (let i = 0; i < gapAndNight; i++) tick(s, cfg, noStory);
  assert.ok(dispatch(s, cfg, 'buyUnit', { unit: 'pact' }), 'new night, new signature');
});
```

Implement: `state.pactsTonight: 0` in `createState`; in `buyUnit`, for pacts —

```js
    if (unit === 'pact' && state.nightShown) {
      if (state.pactsTonight >= 1) return;
      n = 1;                       // a signature is a ceremony, not a bulk buy
    }
```

increment `state.pactsTonight += n` after a successful pact buy; reset
`state.pactsTonight = 0` in `toDusk`. The bot needs no change (it already retries
every tick). Re-run the pacing tune afterward — the gate stretches act 3, so pact
count assumptions may shift.

- [ ] **Step 4: Run tests** — `node --test`. Expected: pass on all seeds.

- [ ] **Step 5: Commit** — `"Rebalance for 2-3 day arc; pacing envelope test"`.

---

### Task 9: Save v2 migration

**Files:**
- Modify: `js/engine/state.js` (v bump + migration), `js/config/script.js` (mig beat)
- Test: `test/night.test.js` (extend)

**Interfaces:**
- Produces: `createState` sets `v: 2`. `deserialize` accepts v1 payloads: fresh-default fill (already automatic), plus — if `wrapped.state.v === 1 && s.act >= 1` — queue the one-time beat `mig-nights` (trigger type `never`, so it only ever appears via this queue).

- [ ] **Step 1: Write failing test**

```js
import { serialize, deserialize } from '../js/engine/state.js';

test('v1 saves migrate: night fields defaulted, migration beat queued once', () => {
  const s = nightPlaying();
  s.act = 2;
  const raw = JSON.parse(serialize(s));
  raw.state.v = 1;
  delete raw.state.night; delete raw.state.nightPhase; delete raw.state.contractBoard;
  const back = deserialize(JSON.stringify(raw));
  assert.equal(back.state.v, 2);
  assert.equal(back.state.night, 1);
  assert.ok(back.state.beatQueue.includes('mig-nights'));
});
```

- [ ] **Step 2: Run to verify failure** — expected FAIL (`v` stays 1, no beat).

- [ ] **Step 3: Implement**

`state.js`: `v: 2` in `createState`. In `deserialize`, after the arrays are
normalized:

```js
    if ((wrapped.state.v || 1) < 2) {
      s.v = 2;
      if (s.act >= 1 && !s.beatQueue.includes('mig-nights')) s.beatQueue.push('mig-nights');
    }
```

`script.js` beats (trigger type `never` hits `triggerMet`'s default false):

```js
    { id: 'mig-nights', act: 1, register: 'memory',
      text: 'the nights have gotten longer. i can feel the dawn now, and the rest between. the work is the same. there is just more night to do it in.',
      response: 'more night. got it.', trigger: { type: 'never' },
      effects: { revealNight: true } },
```

Exclude `mig-nights` from the reachability test (it is queue-only by design):
in `test/playthrough.test.js`, filter `script.beats.filter((b) => b.trigger.type !== 'never' && ...)`.

- [ ] **Step 4: Run tests** — `node --test`. Expected: pass.

- [ ] **Step 5: Commit** — `"Save v2: migration fills night fields, queues one-time beat"`.

---

### Task 10: Tabs UX — tonight · the log · the roost

**Files:**
- Create: `js/ui/tabs.js`
- Modify: `js/ui/render.js` (panel restructure, badge, force-switch), `js/main.js` (keys), `css/main.css`
- Test: manual browser pass (below); engine suites stay green.

**Interfaces:**
- Produces: `createTabs(app, names)` returning `{ bar, panels: {tonight, log, roost}, show(id), active(), setBadge(id, on) }`. Panels are plain `<section>`s appended in order; `show` toggles `hidden` and an `active` class on bar buttons.
- Rule: `render.update` forces `show('tonight')` whenever `state.beatQueue.length > 0`.
- `names.tabs = { tonight: 'tonight', log: 'the log', roost: 'the roost' }`.

- [ ] **Step 1: Implement `js/ui/tabs.js`**

```js
// Three-tab layer. Panels persist; switching toggles hidden. Badges are dots.
export function createTabs(app, names) {
  const bar = document.createElement('nav');
  bar.className = 'tabBar';
  const panels = {};
  const buttons = {};
  let current = 'tonight';
  for (const id of ['tonight', 'log', 'roost']) {
    const btn = document.createElement('button');
    btn.className = 'tabBtn';
    btn.dataset.testid = 'tab-' + id;
    btn.appendChild(document.createTextNode(names.tabs[id]));
    const dot = document.createElement('span');
    dot.className = 'tabDot';
    dot.hidden = true;
    btn.appendChild(dot);
    btn.addEventListener('click', () => show(id));
    bar.appendChild(btn);
    buttons[id] = { btn, dot };
    const panel = document.createElement('section');
    panel.className = 'tabPanel';
    panel.dataset.tab = id;
    panels[id] = panel;
  }
  function show(id) {
    current = id;
    for (const key of Object.keys(panels)) {
      panels[key].hidden = key !== id;
      buttons[key].btn.classList.toggle('active', key === id);
    }
    if (id !== 'tonight') buttons[id].dot.hidden = true;
  }
  show('tonight');
  return {
    bar, panels, show,
    active: () => current,
    setBadge(id, on) { buttons[id].dot.hidden = !on; },
  };
}
```

- [ ] **Step 2: Restructure `render.js`**

- `names.tabs` added in `names.js` (see interface).
- In `buildUI`, after the topbar: `const tabs = createTabs(app, names);`
  Append `tabs.bar`, then the three panels, then the tray.
- The stage `<main>` goes INSIDE `panels.tonight`; the roost section INSIDE
  `panels.roost`; `panels.log` gets a placeholder heading until task 11.
- In `update(state)`: first line —
  `if (state.beatQueue.length && tabs.active() !== 'tonight') tabs.show('tonight');`
- Badge: in the `reveal` handling path — reveals arrive as sfx in `main.js`'s
  `drainSfx`; change `case 'reveal':` to call `ui.tabs.setBadge('roost', true)`.
  Return `tabs` from `buildUI`.
- `main.js` keyboard: add cases
  `case '[': cycle(-1); break; case ']': cycle(1); break;` with

```js
  const TAB_ORDER = ['tonight', 'log', 'roost'];
  function cycle(d) {
    const i = TAB_ORDER.indexOf(ui.tabs.active());
    ui.tabs.show(TAB_ORDER[(i + d + 3) % 3]);
  }
```

  and change `case 'j':` to `ui.tabs.show('log')` (journal overlay retires in task 11).

- [ ] **Step 3: CSS** (append to `css/main.css`)

```css
/* ---------- tabs ---------- */
.tabBar { display: flex; gap: 4px; padding: 0 14px; }
.tabBtn {
  flex: 1; background: none; border: none; border-bottom: 2px solid transparent;
  color: var(--dim); font-size: 12px; letter-spacing: 0.1em; padding: 8px 0;
  cursor: pointer; position: relative;
}
.tabBtn.active { color: var(--ink); border-bottom-color: var(--accent); }
.tabDot {
  position: absolute; top: 6px; right: 12px; width: 6px; height: 6px;
  border-radius: 50%; background: var(--glow);
}
.tabPanel { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
```

- [ ] **Step 4: Manual verification** — `npm run serve`, open `localhost:8123/?dev=1`:
tabs render; beats force tonight; a fresh reveal dots the roost tab; `[`/`]` cycle;
`node --test` still green.

- [ ] **Step 5: Commit** — `"Three-tab UX: tonight / the log / the roost, badges, forced beat focus"`.

---

### Task 11: The log tab

**Files:**
- Create: `js/ui/log.js`
- Modify: `js/ui/render.js` (mount into `panels.log`), `js/ui/overlays.js` (remove journal overlay), `js/main.js` (journal key/button now switch tabs), `css/main.css`

**Interfaces:**
- Produces: `createLog(panel, { names })` returning `{ update(state, script) }` —
  renders (a) night-ledger stamps, newest first, mono ledger styling; (b) beats seen,
  in order, reusing the journal entry look. Signature-guarded: re-render only when
  `state.beatsSeen.length + state.nightLedger.length` changes.

- [ ] **Step 1: Implement `js/ui/log.js`**

```js
import { fmt } from '../engine/math.js';

export function createLog(panel, { names }) {
  const stamps = document.createElement('div');
  stamps.className = 'logStamps';
  const entries = document.createElement('div');
  entries.className = 'logEntries';
  panel.append(stamps, entries);
  let sig = '';

  function update(state, script) {
    const next = state.beatsSeen.length + ':' + state.nightLedger.length;
    if (next === sig) return;
    sig = next;
    while (stamps.firstChild) stamps.removeChild(stamps.firstChild);
    for (const st of state.nightLedger.slice().reverse()) {
      const row = document.createElement('div');
      row.className = 'stamp';
      row.textContent =
        `night ${st.night} · ${fmt(st.teeth)} teeth · wakes ${st.wakes}` +
        ` · contracts ${st.contractsDone}${st.sailed ? ' · sailed' : ''}`;
      stamps.appendChild(row);
    }
    while (entries.firstChild) entries.removeChild(entries.firstChild);
    for (const id of state.beatsSeen) {
      const beat = script.beats.find((b) => b.id === id);
      if (!beat || (!beat.text && !beat.response)) continue;
      const e = document.createElement('div');
      e.className = 'journalEntry' + (beat.register === 'ledger' ? ' ledger' : '');
      if (beat.text) {
        const t = document.createElement('div');
        t.className = 'jt';
        t.textContent = beat.text;
        e.appendChild(t);
      }
      const r = document.createElement('div');
      r.className = 'jr';
      r.textContent = beat.response;
      e.appendChild(r);
      entries.appendChild(e);
    }
    if (!entries.firstChild && !stamps.firstChild) {
      const empty = document.createElement('div');
      empty.className = 'jt';
      empty.textContent = '(nothing yet. get some teeth.)';
      entries.appendChild(empty);
    }
  }
  return { update };
}
```

- [ ] **Step 2: Wire and retire** — in `render.js`: `const log = createLog(tabs.panels.log, { names });` and call `log.update(state, ctx.script)` inside `update`. In `overlays.js`: delete the journal overlay block, `openJournal`, and its export; `anyOpen`/`closeAll` drop the journal references. In `main.js`: the `journalBtn` handler and `j` key call `ui.tabs.show('log')`; keep `dispatch('openJournal')` on tab-show for the ending stat. In `render.js`, the topbar `journalBtn` click handler becomes `tabs.show('log')`.
- CSS: `.logStamps .stamp { font-family: ui-monospace, monospace; font-size: 11px; color: var(--dim); padding: 3px 14px; }` and `.logEntries { padding: 8px 14px; }`.

- [ ] **Step 3: Manual verification** — journal content appears under the log tab; night stamps appear after a dawn (`window.game.debug` skip helpers land in task 13 — for now use `?speed=50`); Escape no longer needed for journal; settings overlay unaffected. `node --test` green.

- [ ] **Step 4: Commit** — `"Log tab: night ledger stamps + story journal; journal overlay retired"`.

---

### Task 12: Tonight tab — contract board, transient roost cards, dawn meter, morning card

**Files:**
- Create: `js/ui/board.js`
- Modify: `js/ui/render.js` (mount board, dawn meter, morning card, roost-new cards), `js/main.js` (sfx cases), `css/main.css`

**Interfaces:**
- Consumes: `state.contractBoard/contractPicked/contractDone`, `state.nightPhase`, `state.nightTicksLeft`, `state.duskGapS`, sfx `dawn`, `dusk`, `sail`, `contract`, `pick`, `reveal`.
- Produces: `createBoard(container, { names, contracts, dispatch })` with `{ update(state) }`; a `.dawnMeter` element in the tray; a `.morningCard` on tonight during dawn showing the last stamp and dusk countdown; `"new at the roost — NAME"` transient cards driven by the reveal sfx.

- [ ] **Step 1: Implement `js/ui/board.js`**

```js
// The contract board: 2-3 job cards at dusk, pick one, watch it resolve.
export function createBoard(container, { names, contracts, dispatch }) {
  const root = document.createElement('div');
  root.className = 'board';
  root.dataset.testid = 'contract-board';
  root.hidden = true;
  const title = document.createElement('div');
  title.className = 'boardTitle';
  title.textContent = names.ui.boardTitle;
  root.appendChild(title);
  const row = document.createElement('div');
  row.className = 'boardRow';
  root.appendChild(row);
  container.appendChild(root);
  let sig = '';

  function update(state) {
    const show = state.nightShown && state.contractBoard.length > 0 &&
      state.nightPhase === 'night';
    root.hidden = !show;
    if (!show) { sig = ''; return; }
    const next = state.contractBoard.join(',') + ':' + state.contractPicked +
      ':' + state.contractDone;
    if (next === sig) return;
    sig = next;
    while (row.firstChild) row.removeChild(row.firstChild);
    for (const id of state.contractBoard) {
      const c = contracts.pool.find((x) => x.id === id);
      if (!c) continue;
      const card = document.createElement('button');
      card.className = 'jobCard';
      card.dataset.testid = 'job-' + id;
      const text = document.createElement('div');
      text.className = 'jobText';
      text.textContent = c.text;
      card.appendChild(text);
      const reward = document.createElement('div');
      reward.className = 'jobReward';
      reward.textContent = c.reward.belief ? `belief +${c.reward.belief}`
        : c.reward.burstS ? `${c.reward.burstS}s of the flow, at once`
        : 'a letter worth keeping';
      card.appendChild(reward);
      const picked = state.contractPicked === id;
      card.classList.toggle('picked', picked);
      card.classList.toggle('done', picked && state.contractDone);
      card.disabled = state.contractPicked !== null && !picked;
      card.addEventListener('click', () => dispatch('pickContract', { id }));
      row.appendChild(card);
    }
  }
  return { update };
}
```

- [ ] **Step 2: Wire into render.js and main.js**

- `names.ui` additions (`names.js`): `boardTitle: 'tonight’s jobs'`,
  `roostNew: 'new at the roost — '`, `morningTitle: 'the morning after night {n}'`,
  `duskIn: 'dusk in about {m} min'`, `dawnSoon: 'dawn soon'`.
- Board mounts into `panels.tonight` under the stage:
  `const board = createBoard(tabs.panels.tonight, { names, contracts: ctx.contracts, dispatch });`
  (`main.js` passes `contracts` in the `buildUI` ctx.) Call `board.update(state)` in `update`.
- Dawn meter in the tray, next to `rate`:

```js
  const dawn = el('div', 'dawnMeter');
  dawn.hidden = true;
  counterWrap.appendChild(dawn);
```

  and in `update`:

```js
    set('dawn', !state.nightShown ? '' :
      state.nightPhase === 'dawn'
        ? names.ui.duskIn.replace('{m}', String(Math.max(1, Math.ceil(state.duskGapS / 60))))
        : state.nightTicksLeft < cfg.NIGHT.LENGTH_TICKS * 0.1
          ? names.ui.dawnSoon
          : `night ${state.night}`, (v) => {
      dawn.hidden = !v;
      if (v) dawn.textContent = v;
    });
```

- Morning card — in `render.js`:

```js
  const morning = el('div', 'morningCard');
  morning.hidden = true;
  const morningTitle = el('div', 'cardName');
  const morningBody = el('div', 'cardInfo');
  morning.append(morningTitle, morningBody);
  tabs.panels.tonight.appendChild(morning);
```

  and in `update`:

```js
    set('morning', state.nightShown && state.nightPhase === 'dawn'
      ? String(state.night) : '', (v) => {
      morning.hidden = !v;
      if (v) {
        const st = state.nightLedger[state.nightLedger.length - 1];
        morningTitle.textContent = names.ui.morningTitle.replace('{n}', v);
        morningBody.textContent = st
          ? `${fmt(st.teeth)} teeth · wakes ${st.wakes} · contracts ${st.contractsDone}${st.sailed ? ' · sailed' : ''}`
          : '';
      }
    });
```
- Transient roost cards: in `main.js` `drainSfx`, `case 'reveal':` becomes

```js
      case 'reveal': {
        ui.tabs.setBadge('roost', true);
        const [kind, id] = ev.key.split(':');
        const label = kind === 'unit' ? names.units[id].name
          : kind === 'up' ? names.upgrades[id].name : names.loom.name;
        ui.stage.aside(names.ui.roostNew + label.toLowerCase(), 'roostNew');
        break;
      }
```

- New sfx cases in `drainSfx`: `case 'dawn': play.beat(); break;`
  `case 'dusk': play.fill(); break;` `case 'sail': ui.conveyor.credit(ev.amount, now); break;`
  `case 'pick': play.buy(); break;`
  `case 'contract': { play.fill(); if (ev.fragment) ui.stage.aside(ev.fragment, 'note'); break; }`
- CSS:

```css
/* ---------- contract board ---------- */
.board { padding: 8px 14px; }
.boardTitle { font-size: 10px; letter-spacing: 0.12em; color: var(--dim); margin-bottom: 6px; }
.boardRow { display: flex; gap: 8px; }
.jobCard {
  flex: 1; text-align: left; background: var(--surface); color: var(--ink);
  border: 1px solid #ffffff14; border-radius: 10px; padding: 10px; cursor: pointer;
  font-size: 12px;
}
.jobCard[disabled] { opacity: 0.35; cursor: default; }
.jobCard.picked { border-color: var(--accent); }
.jobCard.done { border-color: var(--glow); box-shadow: 0 0 12px #ffffff18; }
.jobReward { margin-top: 6px; color: var(--dim); font-size: 11px; }
.dawnMeter { font-size: 10px; letter-spacing: 0.1em; color: var(--dim); margin-top: 2px; }
.morningCard {
  margin: 12px 14px; padding: 14px; border-radius: 12px; background: var(--surface);
  border: 1px solid #ffffff14; font-size: 13px; color: var(--ink);
}
.aside.roostNew { color: var(--glow); }
```

- [ ] **Step 3: Manual verification** — with `?dev=1&speed=30`: board appears after `a2-night`; picking locks; completion glows; dawn shows the morning card and dusk countdown; a reveal shows the "new at the roost" aside + tab dot; `node --test` green.

- [ ] **Step 4: Commit** — `"Tonight tab: contract board UI, dawn meter, morning card, roost-new cards"`.

---

### Task 13: Tooltips everywhere + dev-panel night controls

**Files:**
- Create: `js/ui/tooltip.js`
- Modify: `js/config/names.js` (`tips` block), `js/ui/render.js`, `js/ui/roost.js`, `js/ui/board.js` (attach), `js/engine/actions.js` (dev reducers), `js/dev/panel.js` (buttons), `css/main.css`

**Interfaces:**
- Produces: `attachTip(el, text)` — sets `title`, `aria-label` (if none), and a
  long-press (600 ms pointerdown) transient tip card appended to `document.body`.
- Produces: `names.tips` — copy for: belief, stir, noise, hush, notes, rate, dawn,
  tiptoe, tabs (3), board, each unit stat line pattern, springboards, loom.
- Produces: dev reducers `devSkipToDawn` / `devSkipToDusk`.

- [ ] **Step 1: Implement `js/ui/tooltip.js`**

```js
// One tip mechanism for mouse and touch. Desktop gets title=; touch gets a
// long-press card. Copy lives in names.tips — never inline.
let tipEl = null;

function showCard(text, x, y) {
  hideCard();
  tipEl = document.createElement('div');
  tipEl.className = 'tipCard';
  tipEl.textContent = text;
  document.body.appendChild(tipEl);
  const pad = 8;
  const w = Math.min(280, window.innerWidth - pad * 2);
  tipEl.style.maxWidth = w + 'px';
  tipEl.style.left = Math.min(x, window.innerWidth - w - pad) + 'px';
  tipEl.style.top = Math.max(pad, y - 8) + 'px';
  setTimeout(hideCard, 4000);
}

function hideCard() {
  if (tipEl) { tipEl.remove(); tipEl = null; }
}

export function attachTip(el, text) {
  if (!text) return;
  el.title = text;
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', text);
  let timer = null;
  el.addEventListener('pointerdown', (e) => {
    timer = setTimeout(() => showCard(text, e.clientX, e.clientY), 600);
  });
  for (const evt of ['pointerup', 'pointerleave', 'pointercancel']) {
    el.addEventListener(evt, () => { clearTimeout(timer); });
  }
}
```

CSS:

```css
.tipCard {
  position: fixed; z-index: 99; background: var(--surface); color: var(--ink);
  border: 1px solid #ffffff22; border-radius: 8px; padding: 8px 10px;
  font-size: 12px; line-height: 1.4; box-shadow: 0 4px 18px #0008;
}
```

- [ ] **Step 2: Write the copy** — `names.js` gains:

```js
  tips: Object.freeze({
    belief: 'belief scales every tooth: ×0.5 at 0, ×1.5 at 100. quiet productive nights and notes raise it. wakes cut it.',
    stir: 'noise above hush builds STIR. at 100 someone wakes: belief drops and the loudest crew hides. tiptoe halves noise; the loom raises hush.',
    notes: 'children leave notes while you work. reading one costs nothing and pays belief.',
    rate: 'teeth per second from the whole operation, everything applied.',
    dawn: 'the night ends when this does. at dawn the crew rests until dusk; the ledgers earn while you are away.',
    tiptoe: 'half speed, half noise, fifteen seconds. always allowed. never pretty.',
    tabTonight: 'the stage: the night, the jobs, the story.',
    tabLog: 'every night stamped, every memory kept.',
    tabRoost: 'hiring and gear. new arrivals get a dot.',
    board: 'pick one job per night. finish it before dawn for the reward. unfinished jobs just expire; a streak of finished ones pays a lasting bonus.',
    unitCard: 'gather hires one. max hires as many as the purse allows. owned count and × multipliers show by the name.',
    springboard: 'a one-time ×2 for every one of these you own, forever.',
    loom: 'each level raises hush — how much noise the night absorbs before STIR builds.',
  }),
```

Attach in builders: `attachTip(beliefMeter, names.tips.belief)` (replaces the bare
`title=` from before), `attachTip(stirMeter, names.tips.stir)`, notes chip, rate,
dawn meter, tiptoe button, each tab button (attach in `render.js` right after
`createTabs` returns, using `tabs.bar.children[0..2]` in order tonight/log/roost),
board root,
every roost card (`attachTip(c.node, names.tips.unitCard)` for units,
`names.tips.springboard` for mult cards, `names.tips.loom` for the loom card —
upgrade cards keep their info line and get `attachTip(c.node, n.flavor)`).

- [ ] **Step 3: Dev reducers + panel buttons**

`actions.js`:

```js
  devSkipToDawn(state, cfg) {
    if (!state.nightShown || state.nightPhase !== 'night') return;
    state.nightTicksLeft = 1;
    bump(state);
  },
  devSkipToDusk(state, cfg) {
    if (!state.nightShown || state.nightPhase !== 'dawn') return;
    state.duskGapS = 0.1;
    bump(state);
  },
```

`js/dev/panel.js`: in the State tab section, add two buttons wired to
`dispatch('devSkipToDawn')` / `dispatch('devSkipToDusk')` following the existing
button-creation pattern in that file. The NIGHT and CONTRACTS constants appear as
knobs automatically (the Balance tab iterates `cfg`).

- [ ] **Step 4: Manual verification** — hover shows titles; long-press (or
pointerdown-hold in devtools device mode) shows the tip card; dev buttons skip
phases; `node --test` green.

- [ ] **Step 5: Commit** — `"Tooltips everywhere (hover + long-press), dev night controls"`.

---

### Task 14: Final integration pass

**Files:**
- Modify: `README.md` (night cycle, tabs, contracts sections), `js/version.js` (bump)
- Test: full suite + one real browser playthrough of act 0 → first dawn

**Steps:**

- [ ] **Step 1:** README: add a "Night cycle" section (what a night is, dusk gap, offline interplay) and update the Dev panel section (night knobs, skip buttons). Bump `VERSION`.
- [ ] **Step 2:** Full suite: `node --test` — expected all green.
- [ ] **Step 3:** Browser smoke: fresh save, `?dev=1&speed=20` — play to `a2-night`, see the board, hit dawn, skip to dusk, confirm barge/board/log/tabs/tooltips.
- [ ] **Step 4:** Migration smoke: import a pre-change save export (make one from the deployed site) — confirm `mig-nights` fires once and the game continues.
- [ ] **Step 5:** Commit — `"Night-cycle expansion phase 1: README, version bump"` — and push (deploy is test-gated).
