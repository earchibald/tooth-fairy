# Constellations (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second, long-arc star sink: trace five constellation figures in a new "the sky" tab; each completed figure grants a permanent rule-changing bonus.

**Architecture:** Pure engine additions (save v4 `constellations{}` map, `traceStar` reducer, `figureDone` helper in math.js to avoid import cycles, bonus wiring in existing predicates/tick/departTown), story via two new trigger types, UI as a fourth tab with SVG figure drawings plus completed figures painted onto the ending sky canvas.

**Tech Stack:** Vanilla ESM, no build, no deps. `node --test` for tests. DOM via createElement/createElementNS only.

## Global Constraints

- No `innerHTML` anywhere — a repo hook rejects it. SVG via `createElementNS`.
- The engine never reads `Date.now()`/clock; all math closed-form and deterministic.
- Reducers refuse silently: a refused action mutates nothing and pushes no sfx.
- Save version becomes exactly `4`. Old saves must load (normalizing deserialize).
- Star formula unchanged: `floor(10 × (lifetime/6e11)^0.5)`.
- Constellations, exact values: `littlest` 4 slots `departBonus: 1`; `fieldmouse` 6 slots `tapMult: 2`; `quietloom` 8 slots `noiseFactor: 0.9`; `ferryman` 10 slots `gapFactor: 0.5`; `toothfairy` 14 slots `rateBonus: 0.01`. Tracing costs exactly 1★ per slot.
- Bonuses apply ONLY when a figure is complete (all slots placed), never partially.
- Voice registers: memory = her lowercase voice; ledger = the bureaucracy. Copy lives in names.js/script.js only.
- `skyMult` stays the single function used by both `effectiveRatePerSec` and the tick's produced chain — readout and income must not diverge.
- New story records (`sky-trace`, `sky-figure`, `as-sky-all`) carry `minTown: 2` so single-town reachability tests exempt them via the existing minTown filter.
- All existing tests stay green (71 at branch start).

---

### Task 1: Engine core — config, save v4, traceStar, figureDone, departure bonus

**Files:**
- Modify: `js/config/constants.js` (after the SKY block)
- Modify: `js/engine/math.js` (add `figureDone`)
- Modify: `js/engine/state.js` (v4 field, deserialize, departTown)
- Modify: `js/engine/actions.js` (traceStar reducer)
- Test: `test/constellations.test.js` (create)

**Interfaces:**
- Consumes: existing `createState/serialize/deserialize/departTown`, `dispatch`, `starsAtLifetime`.
- Produces: `cfg.CONSTELLATIONS` (id → `{ slots, … }`), `figureDone(state, cfg, id)` exported from `js/engine/math.js`, `traceStar` action (`dispatch(state, cfg, 'traceStar', { id })`), `state.constellations` (id → count), sfx `{ type: 'trace', id, done }`.

- [ ] **Step 1: Write the failing tests**

Create `test/constellations.test.js`:

```js
// Constellations: tracing stars into figures for permanent bonuses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { createState, deserialize, departTown } from '../js/engine/state.js';
import { dispatch } from '../js/engine/actions.js';
import { figureDone } from '../js/engine/math.js';

const cfg = buildConstants();

test('traceStar spends one star and places it; done flag on completion', () => {
  const s = createState(1);
  s.stars = 5;
  dispatch(s, cfg, 'traceStar', { id: 'littlest' });
  assert.equal(s.stars, 4);
  assert.equal(s.constellations.littlest, 1);
  assert.equal(s.sfx.at(-1).type, 'trace');
  assert.equal(s.sfx.at(-1).done, false);
  dispatch(s, cfg, 'traceStar', { id: 'littlest' });
  dispatch(s, cfg, 'traceStar', { id: 'littlest' });
  dispatch(s, cfg, 'traceStar', { id: 'littlest' });
  assert.equal(s.constellations.littlest, cfg.CONSTELLATIONS.littlest.slots);
  assert.equal(s.sfx.at(-1).done, true);
  assert.ok(figureDone(s, cfg, 'littlest'));
});

test('traceStar refuses silently: unknown id, complete figure, broke', () => {
  const s = createState(1);
  s.stars = 1;
  const seqBefore = s.uiSeq;
  dispatch(s, cfg, 'traceStar', { id: 'nonsense' });
  assert.equal(s.stars, 1);
  s.constellations.littlest = cfg.CONSTELLATIONS.littlest.slots;
  dispatch(s, cfg, 'traceStar', { id: 'littlest' });
  assert.equal(s.stars, 1);
  s.stars = 0;
  dispatch(s, cfg, 'traceStar', { id: 'fieldmouse' });
  assert.equal(s.constellations.fieldmouse, undefined);
  assert.equal(s.uiSeq, seqBefore);
  assert.equal(s.sfx.length, 0);
});

test('figureDone: false below slots, true at slots, false for unknown', () => {
  const s = createState(1);
  s.constellations.quietloom = cfg.CONSTELLATIONS.quietloom.slots - 1;
  assert.equal(figureDone(s, cfg, 'quietloom'), false);
  s.constellations.quietloom = cfg.CONSTELLATIONS.quietloom.slots;
  assert.equal(figureDone(s, cfg, 'quietloom'), true);
  assert.equal(figureDone(s, cfg, 'nonsense'), false);
});

test('departTown carries figures and littlest pays its departure bonus', () => {
  const s = createState(1);
  s.postEnd = true;
  s.lifetime = cfg.STARS.PIVOT;                    // exactly 10 stars
  s.constellations = { littlest: cfg.CONSTELLATIONS.littlest.slots, fieldmouse: 2 };
  const next = departTown(s, cfg);
  const expect = 10 + cfg.CONSTELLATIONS.littlest.departBonus;
  assert.equal(next.stars, expect);
  assert.equal(next.starsEarned, expect);
  assert.equal(next.townLedger[0].stars, expect);
  assert.deepEqual(next.constellations,
    { littlest: cfg.CONSTELLATIONS.littlest.slots, fieldmouse: 2 });
});

test('departTown without littlest pays the plain formula', () => {
  const s = createState(1);
  s.postEnd = true;
  s.lifetime = cfg.STARS.PIVOT;
  const next = departTown(s, cfg);
  assert.equal(next.stars, 10);
});

test('v3 save (no constellations) loads with empty map at v4', () => {
  const s = createState(7);
  delete s.constellations;
  s.v = 3;
  const raw = JSON.stringify({ v: 3, savedAt: 123, state: s });
  const loaded = deserialize(raw);
  assert.ok(loaded);
  assert.deepEqual(loaded.state.constellations, {});
  assert.equal(loaded.state.v, 4);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/constellations.test.js`
Expected: FAIL — `cfg.CONSTELLATIONS` undefined, `figureDone` not exported, reducer missing.

- [ ] **Step 3: Implement**

In `js/config/constants.js`, after the `SKY:` block (keep inside `DEFAULTS`):

```js
  // Constellations: figures traced 1★ per slot. A complete figure's bonus is
  // permanent, every town. Slot counts ARE the star costs.
  CONSTELLATIONS: Object.freeze({
    littlest:   Object.freeze({ slots: 4,  departBonus: 1 }),
    fieldmouse: Object.freeze({ slots: 6,  tapMult: 2 }),
    quietloom:  Object.freeze({ slots: 8,  noiseFactor: 0.9 }),
    ferryman:   Object.freeze({ slots: 10, gapFactor: 0.5 }),
    toothfairy: Object.freeze({ slots: 14, rateBonus: 0.01 }),
  }),
```

In `js/engine/math.js`, append (it lives here, not predicates.js, because
state.js and tick.js need it and predicates.js already imports from state.js —
same cycle-avoidance as `starsAtLifetime`):

```js
// A figure is done when every slot is traced. Bonuses are all-or-nothing.
export function figureDone(state, cfg, id) {
  const def = cfg.CONSTELLATIONS[id];
  if (!def) return false;
  return ((state.constellations && state.constellations[id]) || 0) >= def.slots;
}
```

In `js/engine/state.js`:
1. Import: change the top import to `import { starsAtLifetime, figureDone } from './math.js';`
2. In `createState`, change `v: 3,` to `v: 4,` and after the `townLedger: [],` line add:

```js
    constellations: {},         // figure id -> stars placed; permanent across towns
```

3. In `deserialize`, after the `s.townLedger = …` line add:

```js
    s.constellations = { ...(wrapped.state.constellations || {}) };
```

4. In `deserialize`, change `s.v = 3;` to `s.v = 4;`
5. In `departTown`, change the `gained` line to:

```js
  const gained = starsAtLifetime(state.lifetime, cfg) +
    (figureDone(state, cfg, 'littlest') ? cfg.CONSTELLATIONS.littlest.departBonus : 0);
```

6. In `departTown`, after `next.sky = { ...state.sky };` add:

```js
  next.constellations = { ...state.constellations };
```

In `js/engine/actions.js`, after the `buySky` reducer add:

```js
  traceStar(state, cfg, arg) {
    const def = arg && cfg.CONSTELLATIONS[arg.id];
    if (!def) return;
    const placed = state.constellations[arg.id] || 0;
    if (placed >= def.slots) return;
    if (state.stars < 1) return;
    state.stars -= 1;
    state.constellations[arg.id] = placed + 1;
    state.sfx.push({ type: 'trace', id: arg.id, done: placed + 1 >= def.slots });
    bump(state);
  },
```

- [ ] **Step 4: Run the new tests, then the whole suite**

Run: `node --test test/constellations.test.js` → all PASS.
Run: `node --test test/` → all green. If `night.test.js` or `town.test.js` assert `v === 3` literals, update those literals to `4` (the save version moved; that is this task's doing and the fix belongs here).

- [ ] **Step 5: Commit**

```bash
git add js/config/constants.js js/engine/math.js js/engine/state.js js/engine/actions.js test/constellations.test.js test/
git commit -m "Engine: constellations core — save v4, traceStar, figureDone, departure bonus"
```

---

### Task 2: Bonus wiring and story triggers

**Files:**
- Modify: `js/engine/predicates.js` (`tapPower`, `noiseLevel`, `skyMult`)
- Modify: `js/engine/tick.js` (`toDawn` gap, `triggerMet` cases)
- Test: `test/constellations.test.js` (append)

**Interfaces:**
- Consumes: `figureDone(state, cfg, id)` from `js/engine/math.js`; `cfg.CONSTELLATIONS` values from Task 1.
- Produces: trigger types `{ type: 'trace', count: N }` (total stars placed) and `{ type: 'figure', count: N }` (figures completed), used by Task 3's script records.

- [ ] **Step 1: Write the failing tests**

Append to `test/constellations.test.js` (extend the import list with
`import { tapPower, noiseLevel, skyMult } from '../js/engine/predicates.js';`,
`import { tick } from '../js/engine/tick.js';`,
`import { buildScript } from '../js/config/script.js';`,
`import { buildContracts } from '../js/config/contracts.js';`):

```js
const script = buildScript(null);
const contracts = buildContracts();

function withFigure(id) {
  const s = createState(1);
  s.constellations[id] = cfg.CONSTELLATIONS[id].slots;
  return s;
}

test('fieldmouse doubles tap power', () => {
  const base = tapPower(createState(1), cfg);
  const done = tapPower(withFigure('fieldmouse'), cfg);
  assert.equal(done, base * cfg.CONSTELLATIONS.fieldmouse.tapMult);
});

test('quietloom scales crew noise', () => {
  const plain = createState(1);
  plain.units.scout = 10;
  const hushed = withFigure('quietloom');
  hushed.units.scout = 10;
  assert.ok(Math.abs(noiseLevel(hushed, cfg) -
    noiseLevel(plain, cfg) * cfg.CONSTELLATIONS.quietloom.noiseFactor) < 1e-9);
});

test('toothfairy raises the per-star rate for ALL stars earned', () => {
  const plain = createState(1);
  plain.starsEarned = 10;
  assert.ok(Math.abs(skyMult(plain, cfg) - 1.2) < 1e-9);
  const done = withFigure('toothfairy');
  done.starsEarned = 10;
  assert.ok(Math.abs(skyMult(done, cfg) -
    (1 + 10 * (cfg.STARS.RATE_PER_STAR + cfg.CONSTELLATIONS.toothfairy.rateBonus))) < 1e-9);
});

test('ferryman halves the dawn rest set at dawn', () => {
  const toDawnVia = (s) => {
    s.nightShown = true;
    s.nightPhase = 'night';
    s.nightTicksLeft = 1;
    tick(s, cfg, script, { contracts });
  };
  const plain = createState(1);
  toDawnVia(plain);
  assert.equal(plain.duskGapS, cfg.NIGHT.MIN_GAP_S);
  const done = withFigure('ferryman');
  toDawnVia(done);
  assert.equal(done.duskGapS, cfg.NIGHT.MIN_GAP_S * cfg.CONSTELLATIONS.ferryman.gapFactor);
});

test('trace and figure triggers fire from synthetic records', () => {
  const synth = {
    beats: [
      { id: 'syn-trace', response: 'x', trigger: { type: 'trace', count: 2 } },
      { id: 'syn-figure', response: 'x', trigger: { type: 'figure', count: 1 } },
    ],
    asides: [],
    whispers: {},
    notes: [],
  };
  const s = createState(1);
  s.constellations.littlest = 1;
  tick(s, cfg, synth, {});
  assert.ok(!s.beatQueue.includes('syn-trace'));
  s.constellations.fieldmouse = 1;                 // total placed: 2
  tick(s, cfg, synth, {});
  assert.ok(s.beatQueue.includes('syn-trace'));
  assert.ok(!s.beatQueue.includes('syn-figure'));
  s.constellations.littlest = cfg.CONSTELLATIONS.littlest.slots;
  tick(s, cfg, synth, {});
  assert.ok(s.beatQueue.includes('syn-figure'));
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test test/constellations.test.js`
Expected: the five new tests FAIL (bonuses not wired, triggers unknown).

- [ ] **Step 3: Implement**

In `js/engine/predicates.js`:
1. Change the math.js import to `import { nextCost, figureDone } from './math.js';`
2. In `skyMult`, replace the body:

```js
// Passive prestige bonus: every star ever earned, spent or not, every town.
// A finished TOOTH FAIRY figure raises what each star pays — retroactively.
export function skyMult(state, cfg) {
  const per = cfg.STARS.RATE_PER_STAR +
    (figureDone(state, cfg, 'toothfairy') ? cfg.CONSTELLATIONS.toothfairy.rateBonus : 0);
  return 1 + (state.starsEarned || 0) * per;
}
```

3. In `tapPower`, after the `let power = cfg.TAP.BASE * mult;` line add:

```js
  if (figureDone(state, cfg, 'fieldmouse')) power *= cfg.CONSTELLATIONS.fieldmouse.tapMult;
```

(Note `starlight` adds a fraction of the flow AFTER this line — the figure
doubles the tap itself, not the borrowed flow. Keep the insertion before the
starlight block.)

4. In `noiseLevel`, after the `noise *= tiptoeFactor(state, cfg);` line add:

```js
  if (figureDone(state, cfg, 'quietloom')) noise *= cfg.CONSTELLATIONS.quietloom.noiseFactor;
```

In `js/engine/tick.js`:
1. Add `figureDone` to the math.js import (alongside whatever it already imports from `./math.js`).
2. In `toDawn`, change `state.duskGapS = cfg.NIGHT.MIN_GAP_S;` to:

```js
  state.duskGapS = cfg.NIGHT.MIN_GAP_S *
    (figureDone(state, cfg, 'ferryman') ? cfg.CONSTELLATIONS.ferryman.gapFactor : 1);
```

3. In `triggerMet`, before the `default:` case add:

```js
    case 'trace': {
      let placed = 0;
      for (const k of Object.keys(state.constellations || {})) placed += state.constellations[k];
      return placed >= trig.count;
    }
    case 'figure': {
      let done = 0;
      for (const id of Object.keys(cfg.CONSTELLATIONS)) {
        if (figureDone(state, cfg, id)) done++;
      }
      return done >= trig.count;
    }
```

- [ ] **Step 4: Run the whole suite**

Run: `node --test test/` → all green.

- [ ] **Step 5: Commit**

```bash
git add js/engine/predicates.js js/engine/tick.js test/constellations.test.js
git commit -m "Engine: constellation bonuses wired; trace/figure story triggers"
```

---

### Task 3: Names, story records, figure patterns, config guard

**Files:**
- Modify: `js/config/names.js`
- Modify: `js/config/script.js`
- Modify: `js/config/vfx.js`
- Modify: `js/dev/panel.js` (only if its VFX iterator chokes on arrays — see Step 3)
- Test: `test/config.test.js` (extend)

**Interfaces:**
- Consumes: `cfg.CONSTELLATIONS` ids/slots; trigger types `trace`/`figure` from Task 2.
- Produces: `names.constellations[id] = { name, flavor }`, `names.tabs.sky`, `names.ui.trace`, `names.tips.tabSky`, `names.tips.trace`; script beats `sky-trace` (memory) and `sky-figure` (ledger) and aside `as-sky-all`, all `minTown: 2`; `vfx.constellations[id] = { points: [[x,y]…], edges: [[i,j]…] }` with `points.length === slots`.

**WARNING — straight quotes only.** A Phase 2 subagent corrupted names.js with Unicode curly quote delimiters and broke boot. Use straight `'` delimiters; apostrophes inside strings are escaped `\'`. The one intentional curly apostrophe in `boardTitle: 'tonight’s jobs'` stays as-is.

- [ ] **Step 1: Write the failing test**

In `test/config.test.js`, inside the existing test after the `names.sky` loop, add:

```js
  const vfx = buildVfx();
  assert.equal(names.tabs.sky, 'the sky');
  for (const id of Object.keys(cfg.CONSTELLATIONS)) {
    assert.ok(names.constellations[id] && names.constellations[id].name,
      `names.constellations.${id} missing`);
    const pat = vfx.constellations[id];
    assert.ok(pat, `vfx.constellations.${id} missing`);
    assert.equal(pat.points.length, cfg.CONSTELLATIONS[id].slots,
      `vfx.constellations.${id}: points must equal slots`);
    for (const [a, b] of pat.edges) {
      assert.ok(a >= 0 && a < pat.points.length && b >= 0 && b < pat.points.length,
        `vfx.constellations.${id}: edge [${a},${b}] out of range`);
    }
  }
  const beats = buildScript(null).beats;
  for (const id of ['sky-trace', 'sky-figure']) {
    const beat = beats.find((b) => b.id === id);
    assert.ok(beat, `beat ${id} missing`);
    assert.equal(beat.minTown, 2, `beat ${id} must carry minTown 2`);
  }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config.test.js`
Expected: FAIL — `names.tabs.sky` undefined.

- [ ] **Step 3: Implement**

In `js/config/names.js`:
1. After the `sky:` group add:

```js
  constellations: Object.freeze({
    littlest:   Object.freeze({ name: 'THE LITTLEST TOOTH', flavor: 'the first one she ever took. she kept the receipt.' }),
    fieldmouse: Object.freeze({ name: 'THE FIELD MOUSE',    flavor: 'madrid, remembered in six stars and an ear.' }),
    quietloom:  Object.freeze({ name: 'THE QUIET LOOM',     flavor: 'the hush, woven big enough to see from anywhere.' }),
    ferryman:   Object.freeze({ name: 'THE FERRYMAN',       flavor: 'a different river every town. same hat.' }),
    toothfairy: Object.freeze({ name: 'THE TOOTH FAIRY',    flavor: 'her. up there. finally on the ledger\'s cover.' }),
  }),
```

2. Change `tabs:` to:

```js
  tabs: Object.freeze({ tonight: 'tonight', log: 'the log', roost: 'the roost', sky: 'the sky' }),
```

3. In `ui:`, after the `depart: …` line's entry set, add to the same object:

```js
    trace: 'trace a star',
```

4. In `tips:`, after `depart:` add:

```js
    tabSky: 'the figures. stars traced into pictures; a finished picture changes the rules for good.',
    trace: 'spends one star to light the next point of this figure. the bonus lands when the figure is complete.',
```

In `js/config/script.js`:
1. In the `beats` array, after the `end-town` record add:

```js
    // ---- THE SKY (constellations, town 2+) ----
    { id: 'sky-trace', act: 1, register: 'memory', minTown: 2,
      text: 'i put two stars next to each other and the night held them there. a picture. mine.',
      response: 'keep going', trigger: { type: 'trace', count: 1 } },
    { id: 'sky-figure', act: 1, register: 'ledger', minTown: 2,
      text: 'figure received and recorded. the sky accepts the entry. permanence granted, form C-1.',
      response: 'permanence.', trigger: { type: 'figure', count: 1 } },
```

2. In the `asides` array, after the `as-town3` record add:

```js
    { id: 'as-sky-all', minTown: 2, trigger: { type: 'figure', count: 5 },
      text: 'the sky is full of pictures now. every town i ever left is looking up at the same ones.' },
```

In `js/config/vfx.js`, after the `palettes:` block add (art data, normalized
0–100 coordinates; stars light in `points` order):

```js
  constellations: Object.freeze({   // fixed figure patterns; points light in order
    littlest: Object.freeze({
      points: Object.freeze([[35, 22], [65, 22], [58, 72], [42, 72]]),
      edges: Object.freeze([[0, 1], [1, 2], [2, 3], [3, 0]]),
    }),
    fieldmouse: Object.freeze({
      points: Object.freeze([[15, 65], [35, 55], [55, 50], [75, 45], [85, 28], [65, 24]]),
      edges: Object.freeze([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]),
    }),
    quietloom: Object.freeze({
      points: Object.freeze([[25, 25], [75, 25], [75, 75], [25, 75], [42, 25], [42, 75], [58, 25], [58, 75]]),
      edges: Object.freeze([[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [6, 7]]),
    }),
    ferryman: Object.freeze({
      points: Object.freeze([[10, 60], [30, 70], [50, 72], [70, 70], [90, 60], [50, 40], [50, 15], [35, 32], [65, 32], [50, 55]]),
      edges: Object.freeze([[0, 1], [1, 2], [2, 3], [3, 4], [2, 9], [9, 5], [5, 6], [6, 7], [6, 8]]),
    }),
    toothfairy: Object.freeze({
      points: Object.freeze([[50, 8], [42, 20], [58, 20], [50, 30], [35, 40], [65, 40], [20, 30], [80, 30], [28, 55], [72, 55], [42, 60], [58, 60], [46, 86], [54, 86]]),
      edges: Object.freeze([[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 7], [6, 8], [7, 9], [4, 10], [5, 11], [10, 12], [11, 13]]),
    }),
  }),
```

Then check `js/dev/panel.js`: find the VFX tab's knob iterator. If it walks
`vfx` leaves assuming numbers/strings, arrays of arrays may render garbage
knobs or throw. If so, make the iterator skip `Array.isArray(value)` branches
(one-line guard). If it already handles/skips arrays (palettes are nested
objects with string leaves — different shape), leave it alone. Verify by
running `node --test test/` and noting the panel is dev-only browser code:
the check here is reading the iterator, not a browser test.

- [ ] **Step 4: Run the whole suite**

Run: `node --test test/` → all green, including the extended config test.

- [ ] **Step 5: Commit**

```bash
git add js/config/names.js js/config/script.js js/config/vfx.js test/config.test.js js/dev/panel.js
git commit -m "Config: constellation names, story records, figure patterns, config guard"
```

---

### Task 4: The sky tab — UI

**Files:**
- Create: `js/ui/skytab.js`
- Modify: `js/ui/tabs.js`
- Modify: `js/ui/render.js`
- Modify: `js/main.js` (TAB_ORDER, cycle, sfx drain)
- Modify: `css/main.css`

**Interfaces:**
- Consumes: `figureDone` from `js/engine/math.js`; `cfg.CONSTELLATIONS`, `vfx.constellations`, `names.constellations/tabs.sky/ui.trace/tips.*` from Tasks 1–3; `dispatch('traceStar', { id })`.
- Produces: `createSkyTab(root, { cfg, names, vfx, dispatch })` returning `{ update(state) }`; tabs API gains `setVisible(id, on)` and `isVisible(id)`; sfx `trace` plays the buy blip.

No new node tests — this is DOM code the suite does not cover; the whole suite
must stay green and the controller browser-verifies after merge of the task.

- [ ] **Step 1: Rewrite `js/ui/tabs.js`**

```js
// Tab layer. Panels persist; switching toggles hidden. Badges are dots.
// The sky tab's button starts hidden; render.js reveals it once stars
// have ever been earned.
export function createTabs(app, names) {
  const bar = document.createElement('nav');
  bar.className = 'tabBar';
  const panels = {};
  const buttons = {};
  let current = 'tonight';
  for (const id of ['tonight', 'log', 'roost', 'sky']) {
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
  buttons.sky.btn.hidden = true;
  return {
    bar, panels, show,
    active: () => current,
    setBadge(id, on) { buttons[id].dot.hidden = !on; },
    setVisible(id, on) { buttons[id].btn.hidden = !on; },
    isVisible: (id) => !buttons[id].btn.hidden,
  };
}
```

- [ ] **Step 2: Create `js/ui/skytab.js`**

```js
// The sky tab: five figures traced star by star. Tracing spends stars;
// a completed figure draws its lines in and its bonus applies forever.

import { figureDone } from '../engine/math.js';
import { attachTip } from './tooltip.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createSkyTab(root, { cfg, names, vfx, dispatch }) {
  root.classList.add('skyPanel');
  root.dataset.testid = 'sky-panel';

  const balance = document.createElement('div');
  balance.className = 'skyBalance';
  balance.dataset.testid = 'sky-balance';
  root.appendChild(balance);

  const bonusInfo = {
    littlest: `complete: +${cfg.CONSTELLATIONS.littlest.departBonus}★ at every departure`,
    fieldmouse: `complete: taps gather ×${cfg.CONSTELLATIONS.fieldmouse.tapMult}, every town`,
    quietloom: `complete: the crew is ${Math.round((1 - cfg.CONSTELLATIONS.quietloom.noiseFactor) * 100)}% quieter`,
    ferryman: `complete: dawn rest is ${cfg.CONSTELLATIONS.ferryman.gapFactor === 0.5 ? 'half as long' : '×' + cfg.CONSTELLATIONS.ferryman.gapFactor}`,
    toothfairy: `complete: each star pays +${((cfg.STARS.RATE_PER_STAR + cfg.CONSTELLATIONS.toothfairy.rateBonus) * 100).toFixed(0)}% instead of +${(cfg.STARS.RATE_PER_STAR * 100).toFixed(0)}%`,
  };

  const cards = [];
  for (const id of Object.keys(cfg.CONSTELLATIONS)) {
    const def = cfg.CONSTELLATIONS[id];
    const pat = vfx.constellations[id];
    const n = names.constellations[id];

    const card = document.createElement('div');
    card.className = 'card constCard';
    card.dataset.testid = 'const-' + id;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'constArt');
    const lines = [];
    for (const [a, b] of pat.edges) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', pat.points[a][0]);
      line.setAttribute('y1', pat.points[a][1]);
      line.setAttribute('x2', pat.points[b][0]);
      line.setAttribute('y2', pat.points[b][1]);
      line.setAttribute('class', 'constEdge');
      svg.appendChild(line);
      lines.push(line);
    }
    const dots = [];
    for (const [x, y] of pat.points) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', 3);
      dot.setAttribute('class', 'constDot');
      svg.appendChild(dot);
      dots.push(dot);
    }

    const body = document.createElement('div');
    body.className = 'constBody';
    const name = document.createElement('div');
    name.className = 'cardName';
    name.textContent = n.name;
    const progress = document.createElement('span');
    progress.className = 'lv';
    name.appendChild(progress);
    const info = document.createElement('div');
    info.className = 'cardInfo';
    info.textContent = bonusInfo[id] || '';
    const flavor = document.createElement('div');
    flavor.className = 'cardFlavor';
    flavor.textContent = n.flavor;
    const buys = document.createElement('div');
    buys.className = 'cardBuys';
    const btn = document.createElement('button');
    btn.className = 'buyBtn';
    btn.dataset.testid = 'trace-' + id;
    const label = document.createElement('span');
    label.textContent = names.ui.trace;
    const cost = document.createElement('small');
    cost.textContent = '★ 1';
    btn.append(label, cost);
    btn.addEventListener('click', () => dispatch('traceStar', { id }));
    attachTip(btn, names.tips.trace);
    buys.appendChild(btn);
    body.append(name, info, flavor, buys);
    card.append(svg, body);
    root.appendChild(card);

    cards.push({ id, def, card, dots, lines, progress, btn, cache: {} });
  }

  return {
    update(state) {
      const bal = '★ ' + state.stars;
      if (balance.textContent !== bal) balance.textContent = bal;
      for (const c of cards) {
        const placed = (state.constellations && state.constellations[c.id]) || 0;
        const done = placed >= c.def.slots;
        const sig = placed + ':' + (state.stars >= 1);
        if (c.cache.sig === sig) continue;
        c.cache.sig = sig;
        for (let i = 0; i < c.dots.length; i++) {
          c.dots[i].setAttribute('class', i < placed ? 'constDot lit' : 'constDot');
        }
        for (const line of c.lines) {
          line.setAttribute('class', done ? 'constEdge lit' : 'constEdge');
        }
        c.progress.textContent = `${placed}/${c.def.slots} ★`;
        c.progress.hidden = false;
        c.card.classList.toggle('done', done);
        c.btn.hidden = done;
        c.btn.disabled = state.stars < 1;
      }
    },
  };
}
```

- [ ] **Step 3: Wire into `js/ui/render.js`**

1. Imports: add `import { createSkyTab } from './skytab.js';` and add
   `figureDone` to the math.js import (`import { fmt } from '../engine/math.js';`
   becomes `import { fmt } from '../engine/math.js'; import { figureDone } from '../engine/math.js';`
   or merge into one statement — one statement preferred:
   `import { fmt, figureDone } from '../engine/math.js';`).
2. After `attachTip(tabs.bar.children[2], names.tips.tabRoost);` add:

```js
  attachTip(tabs.bar.children[3], names.tips.tabSky);
```

3. After `app.appendChild(tabs.panels.roost);` add:

```js
  app.appendChild(tabs.panels.sky);
```

4. After the roost creation block add:

```js
  // ---- the sky (constellations) ----
  const skyTabEl = el('section');
  tabs.panels.sky.appendChild(skyTabEl);
  const skyTab = createSkyTab(skyTabEl, { cfg, names, vfx, dispatch });
```

5. In `update(state)`, after the `set('stars', …)` block add:

```js
    set('skyTabVis', state.starsEarned > 0, (v) => tabs.setVisible('sky', v));
    set('skyBadge', state.stars >= 1 &&
      Object.keys(cfg.CONSTELLATIONS).some((id) => !figureDone(state, cfg, id)),
      (v) => tabs.setBadge('sky', v));
```

6. At the end of `update`, after `log.update(state, ctx.script);` add:

```js
    skyTab.update(state);
```

- [ ] **Step 4: Wire into `js/main.js`**

1. Change `const TAB_ORDER = ['tonight', 'log', 'roost'];` and `cycle` to:

```js
const TAB_ORDER = ['tonight', 'log', 'roost', 'sky'];
function cycle(d) {
  const order = TAB_ORDER.filter((id) => ui.tabs.isVisible(id));
  const i = order.indexOf(ui.tabs.active());
  ui.tabs.show(order[(i + d + order.length) % order.length]);
}
```

2. In `drainSfx`, after `case 'pick': play.buy(); break;` add:

```js
      case 'trace': play.buy(); break;
```

- [ ] **Step 5: CSS — append to `css/main.css`**

```css
/* ---- the sky tab: constellation figures ---- */
.skyPanel {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}
.skyBalance { color: #e8d99a; font-size: 13px; }
.constCard { display: flex; gap: 12px; align-items: center; }
.constArt { width: 96px; height: 96px; flex: 0 0 auto; }
.constBody { flex: 1 1 auto; min-width: 0; }
.constDot { fill: var(--dim); opacity: 0.45; }
.constDot.lit { fill: var(--glow); opacity: 1; }
.constEdge { stroke: none; }
.constEdge.lit { stroke: var(--glow); stroke-width: 0.8; opacity: 0.6; }
.constCard.done { border-color: var(--glow); }
```

Before writing, check how `.roost` is laid out inside its `.tabPanel` in
`css/main.css` and mirror the same fill pattern for `.skyPanel` (the values
above assume the post-Phase-2 `.roost { flex: 1 1 auto; min-height: 0;
overflow-y: auto; }` fix; if `.tabPanel` needs `display: flex` for the child
to fill, `.roost` will show the working recipe — copy it).

- [ ] **Step 6: Run the whole suite**

Run: `node --test test/` → all green (this task adds no engine behavior; a
red here means an accidental engine touch — stop and fix).

- [ ] **Step 7: Commit**

```bash
git add js/ui/skytab.js js/ui/tabs.js js/ui/render.js js/main.js css/main.css
git commit -m "UI: the sky tab — constellation cards, tracing, tab gating"
```

---

### Task 5: Completed figures on the ending sky

**Files:**
- Modify: `js/ui/stage.js` (`updateSky`)

**Interfaces:**
- Consumes: `figureDone` from math.js (stage.js already imports `starsAtLifetime` from there), `vfx.constellations`, `cfg.CONSTELLATIONS`.

- [ ] **Step 1: Implement**

In `js/ui/stage.js`:
1. Change the math import to `import { fmt, starsAtLifetime, figureDone } from '../engine/math.js';`
2. In `updateSky`, replace the signature lines:

```js
    const stars = Math.min(vfx.sky.starsMax, Math.floor(Math.sqrt(state.lifetime) / 30));
    const sig = stars + ':' + state.taps;
```

with:

```js
    const stars = Math.min(vfx.sky.starsMax, Math.floor(Math.sqrt(state.lifetime) / 30));
    const doneIds = Object.keys(cfg.CONSTELLATIONS).filter((id) => figureDone(state, cfg, id));
    const sig = stars + ':' + state.taps + ':' + doneIds.length;
```

3. After the random-starfield `for` loop (the one ending with `c.fill();` inside
`for (let i = 0; i < stars; i++)`), add:

```js
    // Completed figures ride over the random field: what the sky remembers.
    for (let i = 0; i < doneIds.length; i++) {
      const pat = vfx.constellations[doneIds[i]];
      const fw = w * 0.16;
      const fh = (h - 40) * 0.35;
      const ox = w * (0.06 + i * 0.18);
      const oy = (h - 40) * (i % 2 ? 0.5 : 0.1);
      c.globalAlpha = 0.5;
      c.strokeStyle = '#dfe8ff';
      c.lineWidth = 0.6;
      for (const [a, b] of pat.edges) {
        c.beginPath();
        c.moveTo(ox + (pat.points[a][0] / 100) * fw, oy + (pat.points[a][1] / 100) * fh);
        c.lineTo(ox + (pat.points[b][0] / 100) * fw, oy + (pat.points[b][1] / 100) * fh);
        c.stroke();
      }
      c.globalAlpha = 0.95;
      c.fillStyle = '#f0f5ff';
      for (const [px, py] of pat.points) {
        c.beginPath();
        c.arc(ox + (px / 100) * fw, oy + (py / 100) * fh, 1.3, 0, 7);
        c.fill();
      }
    }
```

- [ ] **Step 2: Run the whole suite**

Run: `node --test test/` → all green.

- [ ] **Step 3: Commit**

```bash
git add js/ui/stage.js
git commit -m "Stage: completed constellation figures drawn onto the ending sky"
```

---

### Task 6: Bot tracing, integration test, version, README

**Files:**
- Modify: `js/dev/bot.js`
- Modify: `js/version.js` (bump to `0.4.0`)
- Modify: `README.md` (one short paragraph)
- Test: `test/constellations.test.js` (append)

**Interfaces:**
- Consumes: `traceStar` action; `cfg.CONSTELLATIONS`.
- Produces: `botTrace(state, cfg)` exported from `js/dev/bot.js`; the prestige bot calls it after its sky-card buys.

- [ ] **Step 1: Write the failing test**

Append to `test/constellations.test.js` (add `import { botTrace } from '../js/dev/bot.js';`):

```js
test('botTrace spends leftover stars cheapest-figure-first', () => {
  const s = createState(1);
  s.stars = 12;
  botTrace(s, cfg);
  assert.equal(s.constellations.littlest, cfg.CONSTELLATIONS.littlest.slots);   // 4
  assert.equal(s.constellations.fieldmouse, cfg.CONSTELLATIONS.fieldmouse.slots); // 6
  assert.equal(s.constellations.quietloom, 2);                                  // remainder
  assert.equal(s.stars, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/constellations.test.js`
Expected: FAIL — `botTrace` not exported.

- [ ] **Step 3: Implement**

In `js/dev/bot.js`:
1. After the `SKY_PRIORITY` constant add:

```js
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
```

2. In `runBot`'s prestige block, after the `for (const id2 of SKY_PRIORITY) …` loop add:

```js
          botTrace(state, cfg);
```

3. Check `test/playthrough.test.js`: its reachability assertions exempt records
with `minTown > 1`. The new `sky-trace`/`sky-figure` beats and `as-sky-all`
aside all carry `minTown: 2`, so no test change should be needed — verify by
running the suite; if a reachability filter matches on a hardcoded id list
instead, add the three ids there.

In `js/version.js`: change the version string to `'0.4.0'`.

In `README.md`: find the prestige paragraph (added in Phase 2) and append after it:

```markdown
Stars have a second home: **the sky** tab appears once you have earned any.
Trace them into five constellation figures — a finished figure permanently
changes the rules (faster taps, quieter crew, shorter dawns, brighter stars,
and one extra star every departure) and is drawn into the ending sky.
```

- [ ] **Step 4: Run the whole suite**

Run: `node --test test/` → all green, including the prestige multi-town test
(the bot now traces after buying sky cards; town counts may not change, but
the run must still complete within its tick budget).

- [ ] **Step 5: Commit**

```bash
git add js/dev/bot.js js/version.js README.md test/constellations.test.js test/playthrough.test.js
git commit -m "Bot traces figures; v0.4.0; README constellations note"
```
