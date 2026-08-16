# Feedback Pass 2 (Phase 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the eight Phase 7 feedback items: story-press sound, the kit (owned-gear ledger), log autoscroll, per-family inflow animations, plain advisory 7-c, click-only story buttons, clear job cards, and the outline mosaic.

**Architecture:** Vanilla ESM, no build step, no dependencies. All changes are renderer/config/data; the only engine-file touch is one pure read-only helper added to `js/engine/predicates.js`. No tick, action, or save-format changes.

**Tech Stack:** Vanilla JS (ES modules), canvas 2D, `node --test`.

## Global Constraints

- No innerHTML/outerHTML/insertAdjacentHTML anywhere (a repo hook rejects the commit). Build DOM with createElement/append/textContent.
- Straight quotes as string delimiters; the codebase uses single quotes.
- Run tests as `node --test test/*.test.js` (a bare `test/` path fails on this Node).
- No engine tick/action/save changes. `unitRateShares` in predicates.js is read-only derivation.
- No new vfx knobs except `sound.press: 0.04`. Conveyor style constants live in conveyor.js.
- One term, one meaning: all new player-visible strings go in `js/config/names.js` (except script/beat text, which lives in `js/config/script.js`).
- Version bumps to `0.8.0` (Task 6).
- Match surrounding comment density and voice: comments state constraints, not narration.

---

### Task 1: Mosaic layout module

**Files:**
- Create: `js/ui/mosaic.js`
- Test: `test/mosaic.test.js`

**Interfaces:**
- Consumes: nothing (pure module; duplicates the tooth cubics as data — the SVG path string in `js/ui/tooth.js` stays the single source for DOM/canvas, this module owns the flattened polygon).
- Produces: `mosaicPoints(n) -> [{x, y}, ...]` (exactly n points, 0–100 tooth space, sorted bottom-up: y descending, ties x ascending; deterministic and cached per n — repeat calls return the same array identity). `insideTooth(x, y) -> boolean` (even-odd test, exported for tests).

- [ ] **Step 1: Write the failing test**

Create `test/mosaic.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { mosaicPoints, insideTooth } from '../js/ui/mosaic.js';

test('exact counts for the shipped set sizes', () => {
  assert.equal(mosaicPoints(32).length, 32);
  assert.equal(mosaicPoints(64).length, 64);
});

test('every point lies inside the tooth silhouette', () => {
  for (const n of [32, 64]) {
    for (const p of mosaicPoints(n)) {
      assert.ok(insideTooth(p.x, p.y), `outside: ${p.x},${p.y} (n=${n})`);
    }
  }
});

test('points are sorted bottom-up, ties left-to-right', () => {
  for (const n of [32, 64]) {
    const pts = mosaicPoints(n);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      assert.ok(b.y <= a.y, `row ${i} rises (n=${n})`);
      if (b.y === a.y) assert.ok(b.x >= a.x, `tie ${i} not left-to-right (n=${n})`);
    }
  }
});

test('deterministic and identity-cached', () => {
  assert.strictEqual(mosaicPoints(32), mosaicPoints(32));
  assert.deepEqual(mosaicPoints(64), mosaicPoints(64));
});

test('extreme sizes return exactly n without throwing', () => {
  assert.equal(mosaicPoints(1).length, 1);
  assert.equal(mosaicPoints(200).length, 200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mosaic.test.js`
Expected: FAIL — cannot find module `js/ui/mosaic.js`.

- [ ] **Step 3: Write the implementation**

Create `js/ui/mosaic.js`:

```js
// Mosaic layout: n points inside the tooth silhouette, in the 0-100 tooth
// coordinate space, sorted bottom-up so fills read as liquid rising.
// Pure and node-testable; the DOM/canvas tooth keeps using TOOTH_PATH —
// this module owns the flattened polygon for hit-testing only.

const CUBICS = [
  [[50, 12], [28, 12], [16, 26], [16, 44]],
  [[16, 44], [16, 56], [22, 64], [27, 78]],
  [[27, 78], [30, 88], [35, 94], [40, 92]],
  [[40, 92], [45, 90], [44, 76], [50, 76]],
  [[50, 76], [56, 76], [55, 90], [60, 92]],
  [[60, 92], [65, 94], [70, 88], [73, 78]],
  [[73, 78], [78, 64], [84, 56], [84, 44]],
  [[84, 44], [84, 26], [72, 12], [50, 12]],
];
const POLY = [];
for (const [p0, p1, p2, p3] of CUBICS) {
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const u = 1 - t;
    POLY.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

export function insideTooth(x, y) {
  let odd = false;
  for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
    const [xi, yi] = POLY[i];
    const [xj, yj] = POLY[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd;
  }
  return odd;
}

// Nearest-outline-vertex distance: which grid points hug the edge.
function edgeDist(x, y) {
  let best = Infinity;
  for (const [px, py] of POLY) {
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

const cache = new Map();

export function mosaicPoints(n) {
  if (cache.has(n)) return cache.get(n);
  let pts = [];
  // Densify the grid until at least n cells land inside the silhouette.
  for (let cols = Math.ceil(Math.sqrt(n)); cols <= 64; cols++) {
    const step = 100 / (cols + 1);
    pts = [];
    for (let gy = step; gy < 100; gy += step) {
      for (let gx = step; gx < 100; gx += step) {
        if (insideTooth(gx, gy)) pts.push({ x: gx, y: gy });
      }
    }
    if (pts.length >= n) break;
  }
  // Trim the points hugging the outline first; keep the meaty interior.
  pts.sort((a, b) => edgeDist(b.x, b.y) - edgeDist(a.x, a.y));
  pts = pts.slice(0, n);
  pts.sort((a, b) => b.y - a.y || a.x - b.x);
  cache.set(n, pts);
  return pts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/mosaic.test.js`
Expected: 5/5 PASS.

Then run the whole suite: `node --test test/*.test.js` — everything green.

- [ ] **Step 5: Commit**

```bash
git add js/ui/mosaic.js test/mosaic.test.js
git commit -m "Mosaic layout: n points inside the tooth silhouette, bottom-up"
```

---

### Task 2: Stage outline mosaic (replaces the compact single tooth)

**Files:**
- Modify: `js/ui/stage.js` (the `updateOutline` compact branch, ~lines 134–176, plus one state variable)
- Modify: `css/main.css` (replace `.outlineBig`/`.outlineFillClip` rules with mosaic rules)

**Interfaces:**
- Consumes: `mosaicPoints(n)` from `js/ui/mosaic.js` (Task 1); `toothSVG(cls)` from `js/ui/tooth.js`.
- Produces: nothing new outward; `updateOutline` behavior changes only for `size >= 32`.

- [ ] **Step 1: Add the import and state variable in `js/ui/stage.js`**

At the top, extend the imports:

```js
import { mosaicPoints } from './mosaic.js';
```

Near the other stage-local state (`let outlineSig = '';`), add:

```js
  let mosaicFilled = 0;
```

- [ ] **Step 2: Replace the compact branch of `updateOutline`**

Replace the entire `if (size >= 32) { ... return; }` block AND the following
`if (outlineRow.dataset.mode === 'compact') { ... }` reset with:

```js
    // From 32 slots the rows are wallpaper: render the set as a mosaic —
    // the slots arranged inside one big tooth silhouette, filling bottom-up.
    if (size >= 32) {
      outlineRow.className = 'outlineRow compact';
      const modeKey = 'mosaic:' + size;
      if (outlineRow.dataset.mode !== modeKey) {
        outlineRow.dataset.mode = modeKey;
        while (outlineRow.firstChild) outlineRow.removeChild(outlineRow.lastChild);
        const grid = document.createElement('div');
        grid.className = 'outlineMosaic sz' + size;
        for (const p of mosaicPoints(size)) {
          const svg = toothSVG('tooth-outline mosaicCell');
          svg.style.left = p.x + '%';
          svg.style.top = p.y + '%';
          grid.appendChild(svg);
        }
        const label = document.createElement('div');
        label.className = 'outlineCount';
        outlineRow.append(grid, label);
        mosaicFilled = -1;   // fresh grid: light the current fill silently
      }
      const cells = outlineRow.firstChild.children;
      // Rising fills pop their new cells; a rebuild (boot, town change) or a
      // reset (set complete) relights silently.
      const rising = mosaicFilled >= 0 && filled > mosaicFilled;
      for (let i = 0; i < cells.length; i++) {
        const on = i < filled;
        if (on === i < mosaicFilled) continue;
        cells[i].setAttribute('class', on
          ? 'tooth-fill mosaicCell on' + (rising ? ' pop' : '')
          : 'tooth-outline mosaicCell');
      }
      mosaicFilled = filled;
      outlineRow.lastChild.textContent = filled + '/' + size;
      return;
    }
    if (outlineRow.dataset.mode) {
      outlineRow.dataset.mode = '';
      while (outlineRow.firstChild) outlineRow.removeChild(outlineRow.lastChild);
    }
```

Note the operator-precedence trap: write `if (on === i < mosaicFilled) continue;`
exactly as `if (on === (i < mosaicFilled)) continue;` — use the parenthesized
form for clarity:

```js
        if (on === (i < mosaicFilled)) continue;
```

- [ ] **Step 3: Replace the compact CSS**

In `css/main.css`, DELETE these rules:

```css
.outlineBig { position: relative; width: 76px; height: 76px; }
.outlineBig svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.outlineFillClip { transition: clip-path 0.3s; }
```

and ADD in their place:

```css
.outlineMosaic { position: relative; width: 128px; height: 128px; }
.outlineMosaic svg.mosaicCell {
  position: absolute; width: 15px; height: 15px;
  transform: translate(-50%, -50%);
}
.outlineMosaic.sz64 svg.mosaicCell { width: 11px; height: 11px; }
.outlineMosaic .tooth-outline path { opacity: 0.25; }
.mosaicCell.pop { animation: mosaicPop 260ms ease-out; }
@keyframes mosaicPop {
  0% { transform: translate(-50%, -50%) scale(1.7); }
  100% { transform: translate(-50%, -50%) scale(1); }
}
```

(The `.outlineRow.compact` and `.outlineCount` rules already exist — leave them.)

- [ ] **Step 4: Run the suite**

Run: `node --test test/*.test.js`
Expected: all green (this task has no node-visible surface; the suite guards regressions).

- [ ] **Step 5: Commit**

```bash
git add js/ui/stage.js css/main.css
git commit -m "Outline mosaic: sets of 32+ fill a tooth made of teeth"
```

---

### Task 3: Press sound, plain advisory 7-c, click-only story buttons

**Files:**
- Modify: `js/ui/sound.js` (add `play.press`)
- Modify: `js/config/vfx.js` (sound defaults line)
- Modify: `js/main.js` (drainSfx `beatDismiss` case; keydown beat branch)
- Modify: `js/dev/panel.js` (test-sounds sequence)
- Modify: `js/config/script.js` (a2-hush text)

**Interfaces:**
- Consumes: existing `blip()` helper in sound.js; `vfx.sound` config object.
- Produces: `play.press()` (no args). `vfx.sound.press` (number, default 0.04).

- [ ] **Step 1: Add `press` to the sound defaults**

In `js/config/vfx.js`, change the sound line:

```js
    tap: 0.06, fill: 0.03, beat: 0.035, buy: 0.03, wake: 0.05, note: 0.03,
```

to:

```js
    tap: 0.06, fill: 0.03, beat: 0.035, buy: 0.03, wake: 0.05, note: 0.03,
    press: 0.04,
```

- [ ] **Step 2: Add `play.press()` in `js/ui/sound.js`**

In the `export const play = { ... }` object, after `note()`, add:

```js
  // Story-button acknowledgment: a quick two-blip page-turn tick.
  press() {
    blip({ type: 'triangle', from: 520, to: 660, ms: 45, gain: vfx.sound.press });
    blip({ type: 'triangle', from: 740, to: 880, ms: 55, gain: vfx.sound.press, delay: 0.05 });
  },
```

- [ ] **Step 3: Route beat dismissal through it**

In `js/main.js` `drainSfx`, change:

```js
      case 'beatDismiss': play.beat(); save(); break;
```

to:

```js
      case 'beatDismiss': play.press(); save(); break;
```

(`play.beat()` still voices `dawn` — leave that case alone.)

- [ ] **Step 4: Make story buttons click-only**

In `js/main.js` keydown handler, replace:

```js
  const beatBtn = document.querySelector('.beatCard.show [data-testid="beat-response"]');
  if (beatBtn && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    beatBtn.click();
    return;
  }
```

with:

```js
  // A story response requires a real click: while a beat card is up, SPACE
  // and Enter are swallowed so they can neither dismiss it nor tap through.
  if (document.querySelector('.beatCard.show') && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    return;
  }
```

- [ ] **Step 5: Add press to the dev test-sounds sequence**

In `js/dev/panel.js` `tabVfx`, change:

```js
    const seq = ['tap', 'fill', 'buy', 'note', 'beat', 'wake'];
```

to:

```js
    const seq = ['tap', 'fill', 'buy', 'note', 'beat', 'wake', 'press'];
```

- [ ] **Step 6: Rewrite advisory 7-c**

In `js/config/script.js`, in the `a2-hush` beat record, replace the `text` value with:

```js
      text: 'advisory 7-c, plain version. noise is how loud the crew works. hush is how much the night absorbs. when noise is higher than hush, the STIR meter climbs. at 100, a child wakes: belief −10, and your loudest crew hides for a while. TIPTOE halves noise for a bit. the loom raises hush. keep noise under hush and STIR falls on its own.',
```

(Keep `register: 'ledger'` and `response: 'noted, ominously'` unchanged.)

- [ ] **Step 7: Run the suite**

Run: `node --test test/*.test.js`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add js/ui/sound.js js/config/vfx.js js/main.js js/dev/panel.js js/config/script.js
git commit -m "Press sound on story buttons, click-only dismissal, plain advisory 7-c"
```

---

### Task 4: Per-family inflow animations

**Files:**
- Modify: `js/engine/predicates.js` (add `unitRateShares`)
- Modify: `js/ui/conveyor.js` (style pick + per-style trajectories)
- Modify: `js/ui/render.js` (pass shares each frame)
- Test: `test/shares.test.js`

**Interfaces:**
- Consumes: `multFactor(state, unit, cfg)` (already in predicates.js); `cfg.UNITS`, `cfg.TICK_MS`.
- Produces: `unitRateShares(state, cfg) -> { flyers, grounders, mayflies, river, paper }` (fractions summing to 1 when any production exists; all zeros when idle). `conveyor.setShares(sharesObj)` (stores for the next launch).

- [ ] **Step 1: Write the failing test**

Create `test/shares.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { buildConstants } from '../js/config/constants.js';
import { createState } from '../js/engine/state.js';
import { unitRateShares } from '../js/engine/predicates.js';

const cfg = buildConstants(null);

test('all zeros when nothing produces', () => {
  const sh = unitRateShares(createState(1), cfg);
  for (const k of Object.keys(sh)) assert.equal(sh[k], 0);
});

test('mixed roster normalizes to 1 with both families present', () => {
  const s = createState(1);
  s.units.scout = 10;
  s.units.mouse = 2;
  const sh = unitRateShares(s, cfg);
  const sum = Object.values(sh).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(sh.flyers > 0);
  assert.ok(sh.grounders > 0);
  assert.equal(sh.river, 0);
});

test('ferry lump cadence counts as river rate', () => {
  const s = createState(1);
  s.units.ferry = 2;
  const sh = unitRateShares(s, cfg);
  assert.ok(sh.river > 0.999);
});

test('a stunned unit contributes nothing', () => {
  const s = createState(1);
  s.units.scout = 5;
  s.stunUnit = 'scout';
  s.stunTicks = 10;
  const sh = unitRateShares(s, cfg);
  assert.equal(sh.flyers, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/shares.test.js`
Expected: FAIL — `unitRateShares` is not exported.

- [ ] **Step 3: Add `unitRateShares` to `js/engine/predicates.js`**

After `baseRatePerSec`, add:

```js
// Inflow families for the conveyor's motion archetypes. Read-only
// derivation for the renderer — never used by the tick.
const RATE_FAMILIES = Object.freeze({
  flyers: ['scout', 'owl'],
  grounders: ['mouse', 'bunny', 'phantom'],
  mayflies: ['sprite'],
  river: ['ferry', 'barge'],
  paper: ['pact', 'ministry', 'starwrights'],
});

// Each family's share of current production, normalized to sum 1 when any
// production exists; all zeros when idle. Ferry counts its lump cadence as
// a rate so river traffic shows even when lumps are the only income.
export function unitRateShares(state, cfg) {
  const out = { flyers: 0, grounders: 0, mayflies: 0, river: 0, paper: 0 };
  let total = 0;
  for (const fam of Object.keys(RATE_FAMILIES)) {
    for (const u of RATE_FAMILIES[fam]) {
      const def = cfg.UNITS[u];
      if (state.stunUnit === u && state.stunTicks > 0) continue;
      let r = 0;
      if (def.rate) {
        r = def.rate * state.units[u] * multFactor(state, u, cfg);
      } else if (u === 'ferry' && def.lumpEveryTicks > 0) {
        r = (def.lumpAmount * state.units[u] * multFactor(state, u, cfg)) /
            (def.lumpEveryTicks * (cfg.TICK_MS / 1000));
      }
      out[fam] += r;
      total += r;
    }
  }
  if (total > 0) for (const k of Object.keys(out)) out[k] /= total;
  return out;
}
```

(Check `cfg.UNITS.ferry`: if it has a truthy `rate`, the `def.rate` branch
covers it and the ferry special case never fires for it — that is fine; the
special case exists only because ferries deliver lumps, not a rate.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/shares.test.js`
Expected: 4/4 PASS. If 'ferry lump cadence' fails because `cfg.UNITS.ferry.rate`
is truthy, the test premise is wrong — inspect `js/config/constants.js` and, if
ferry has a plain rate, change that test to assert `sh.river > 0.999` via the
rate branch (the assertion itself stays).

- [ ] **Step 5: Conveyor — store shares, pick a style per launch**

In `js/ui/conveyor.js`, after `let hoardPreview = null;` add:

```js
  // Live production mix by family; which archetype the next sprite flies.
  let shares = null;
  const STYLE_KEYS = ['flyers', 'grounders', 'mayflies', 'river', 'paper'];
  const STYLES = {
    flyers:    { speed: 1,    size: 1,    trail: 1 },
    grounders: { speed: 1,    size: 1,    trail: 1 },
    mayflies:  { speed: 1.4,  size: 0.85, trail: 2 },
    river:     { speed: 0.7,  size: 1.5,  trail: 1 },
    paper:     { speed: 0.85, size: 1,    trail: 1 },
  };
  function pickStyle() {
    if (!shares) return 'flyers';
    const r = Math.random();
    let acc = 0;
    for (const k of STYLE_KEYS) {
      acc += shares[k];
      if (r < acc) return k;
    }
    return 'flyers';
  }
```

- [ ] **Step 6: Conveyor — per-style trajectory helper**

After `drawInboundSprite`, add:

```js
  // Per-archetype trajectory. t is raw travel progress 0..1; returns {x, y}.
  function spritePos(s, t) {
    const size = vfx.motif.toothPx;
    const y0 = h / 2;
    const ease = 1 - Math.pow(1 - t, 2.2);
    const startX = s.fromLeft ? -size : w + size;
    const x = startX + (w / 2 - startX) * ease;
    switch (s.style) {
      case 'grounders': {
        // Rides the ground line with four small hops.
        const hop = Math.abs(Math.sin(t * Math.PI * 4)) * 6;
        return { x, y: y0 + size * 0.35 - hop };
      }
      case 'mayflies':
        return { x, y: y0 - Math.sin(t * Math.PI * 6) * 5 };
      case 'river':
        return { x, y: y0 };
      case 'paper': {
        // Drifts down from above, swaying like a slip of paper.
        const drop = (1 - t) * h * 0.4;
        return { x, y: y0 - drop + Math.sin(t * Math.PI * 5) * 10 * (1 - t) };
      }
      default: {
        // Flyers arc in high and settle to the line with a fading bob.
        const high = (1 - ease) * h * 0.35;
        return { x, y: y0 - high - Math.sin(t * Math.PI * 2) * 4 * (1 - t) };
      }
    }
  }
```

- [ ] **Step 7: Conveyor — use style in the frame loop and launches**

In `frame()`, replace the sprite-iteration body from `const t = ...` down to the
trail spawn (keep the landing branch's contents intact, only its condition
timing changes) with:

```js
      const st = STYLES[s.style] || STYLES.flyers;
      const t = ((now - s.born) / vfx.motif.inboundMs) * st.speed;
      if (t >= 1) {
        sprites.splice(i, 1);
        parts.spawnSparks(w / 2, y, now, {
          count: Math.round(vfx.juice.landSparks.count * ramp('trailHi')),
          size: vfx.juice.landSparks.size, spreadPx: 22,
          lifeMs: vfx.juice.landSparks.lifeMs,
        });
        if (onLand) onLand(s.amount);
        continue;
      }
      const pos = spritePos(s, t);
      const gAlpha = Math.min(1, vfx.juice.inbound.glowAlpha * ramp('glowHi'));
      const gSize = size * ramp('sizeHi') * st.size;
      drawInboundSprite(pos.x, pos.y, gSize, vfx.motif.inboundColor,
        gAlpha, vfx.juice.inbound.glowSize * ramp('glowHi'), 0.5 + t * 0.5);
      // River wake: one low ripple at mid-crossing.
      if (s.style === 'river' && !s.rippled && t >= 0.5) {
        s.rippled = true;
        parts.spawnRipple(pos.x, pos.y + 4, now, { ms: 600, size: 18 });
      }
      // Sparkle trail: spawn probabilistically per frame so trailPerS holds.
      const perFrame = (vfx.juice.inbound.trailPerS * ramp('trailHi') * st.trail) / 60;
      if (Math.random() < perFrame) {
        parts.spawnSparks(pos.x, pos.y, now,
          { count: 1, size: 1.4, spreadPx: 8, lifeMs: vfx.juice.inbound.trailLife });
      }
```

In `credit()`, change the launch line to:

```js
        sprites.push({ born: now, fromLeft: (side = !side), amount: batch, style: pickStyle() });
```

In `creditPreview()`, change the launch line to:

```js
        sprites.push({ born: now, fromLeft: (side = !side), amount: batch, preview: true, style: pickStyle() });
```

In the returned object, add after `setRate(rps) { rate = rps; },`:

```js
    // Live production mix; which archetype the next launch flies.
    setShares(s) { shares = s; },
```

- [ ] **Step 8: Feed shares from the renderer**

In `js/ui/render.js`, extend the predicates import:

```js
import { effectiveRatePerSec, noiseLevel, hushCapacity, unitRateShares } from '../engine/predicates.js';
```

In `update(state)`, right after `conveyor.setRate(rps);`, add:

```js
    conveyor.setShares(unitRateShares(state, cfg));
```

- [ ] **Step 9: Run the suite**

Run: `node --test test/*.test.js`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add js/engine/predicates.js js/ui/conveyor.js js/ui/render.js test/shares.test.js
git commit -m "Inflow archetypes: sprites fly like whoever gathered them"
```

---

### Task 5: Nightly job clarity

**Files:**
- Modify: `js/ui/board.js` (structured cards + live progress)
- Modify: `js/config/names.js` (goal/pays/hint strings)
- Modify: `css/main.css` (goal/progress/hint rules)

**Interfaces:**
- Consumes: `fmt` from `js/engine/math.js`; `state.nightStats` (`{teeth, wakes, notes, tiptoes}`), `state.stir`; contract records `{id, type, n, text, reward}`.
- Produces: nothing new outward; `createBoard` signature unchanged.

- [ ] **Step 1: Add the strings to `js/config/names.js`**

In the `ui:` block, after `boardTitle: 'tonight’s jobs',` add:

```js
    boardHint: 'pick one. it resolves by dawn. finished pays; a streak pays more.',
    pays: 'pays: ',
    goalGather: 'goal: {n} teeth gathered tonight',
    goalNotes: 'goal: read {n} notes tonight',
    goalTiptoes: 'goal: tiptoe {n} times tonight',
    goalQuiet: 'goal: no wakes, all night (judged at dawn)',
    goalCalm: 'goal: stir under {n} at dawn',
```

- [ ] **Step 2: Rewrite `js/ui/board.js`**

Replace the whole file with:

```js
// The contract board: 2-3 job cards at dusk, pick one, watch it resolve.
// Cards rebuild on board/pick/done changes; the live progress lines are
// targeted writes so the per-frame cost stays flat.
import { attachTip } from './tooltip.js';
import { fmt } from '../engine/math.js';

export function createBoard(container, { names, contracts, dispatch }) {
  const root = document.createElement('div');
  root.className = 'board';
  root.dataset.testid = 'contract-board';
  root.hidden = true;
  attachTip(root, names.tips.board);
  const title = document.createElement('div');
  title.className = 'boardTitle';
  title.textContent = names.ui.boardTitle;
  root.appendChild(title);
  const hint = document.createElement('div');
  hint.className = 'boardHint';
  hint.textContent = names.ui.boardHint;
  root.appendChild(hint);
  const row = document.createElement('div');
  row.className = 'boardRow';
  root.appendChild(row);
  container.appendChild(root);
  let sig = '';
  const progressEls = new Map();   // contract id -> .jobProgress node
  const progressCache = new Map(); // contract id -> last rendered text

  function goalText(c) {
    switch (c.type) {
      case 'gather': return names.ui.goalGather.replace('{n}', fmt(c.n));
      case 'notes': return names.ui.goalNotes.replace('{n}', String(c.n));
      case 'tiptoes': return names.ui.goalTiptoes.replace('{n}', String(c.n));
      case 'quiet': return names.ui.goalQuiet;
      case 'calm': return names.ui.goalCalm.replace('{n}', String(c.n));
      default: return '';
    }
  }

  function progressText(c, state, done) {
    if (done) return 'done ✓';
    const ns = state.nightStats;
    switch (c.type) {
      case 'gather': return fmt(Math.floor(ns.teeth)) + '/' + fmt(c.n);
      case 'notes': return ns.notes + '/' + c.n;
      case 'tiptoes': return ns.tiptoes + '/' + c.n;
      case 'quiet': return 'wakes tonight: ' + ns.wakes;
      case 'calm': return 'stir now: ' + Math.round(state.stir);
      default: return '';
    }
  }

  function update(state) {
    const show = state.nightShown && state.contractBoard.length > 0 &&
      state.nightPhase === 'night';
    root.hidden = !show;
    if (!show) { sig = ''; return; }
    const next = state.contractBoard.join(',') + ':' + state.contractPicked +
      ':' + state.contractDone;
    if (next !== sig) {
      sig = next;
      progressEls.clear();
      progressCache.clear();
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
        const goal = document.createElement('div');
        goal.className = 'jobGoal';
        goal.textContent = goalText(c);
        card.appendChild(goal);
        const progress = document.createElement('div');
        progress.className = 'jobProgress';
        card.appendChild(progress);
        progressEls.set(id, progress);
        const reward = document.createElement('div');
        reward.className = 'jobReward';
        reward.textContent = names.ui.pays + (c.reward.belief ? `belief +${c.reward.belief}`
          : c.reward.burstS ? `${c.reward.burstS}s of the flow, at once`
          : 'a letter worth keeping');
        card.appendChild(reward);
        const picked = state.contractPicked === id;
        card.classList.toggle('picked', picked);
        card.classList.toggle('done', picked && state.contractDone);
        card.disabled = state.contractPicked !== null && !picked;
        card.addEventListener('click', () => dispatch('pickContract', { id }));
        row.appendChild(card);
      }
    }
    for (const [id, node] of progressEls) {
      const c = contracts.pool.find((x) => x.id === id);
      if (!c) continue;
      const done = state.contractPicked === id && state.contractDone;
      const txt = progressText(c, state, done);
      if (progressCache.get(id) !== txt) {
        progressCache.set(id, txt);
        node.textContent = txt;
        node.classList.toggle('bad', c.type === 'quiet' && state.nightStats.wakes > 0);
      }
    }
  }
  return { update };
}
```

- [ ] **Step 3: Add the CSS**

In `css/main.css`, in the contract-board section after `.boardTitle`, add:

```css
.boardHint { font-size: 10px; color: var(--dim); opacity: 0.8; margin: -2px 0 6px; }
```

and after `.jobReward`, add:

```css
.jobGoal { margin-top: 6px; font-size: 11px; opacity: 0.9; }
.jobProgress { margin-top: 2px; font-size: 11px; color: var(--glow);
  font-variant-numeric: tabular-nums; }
.jobProgress.bad { color: var(--danger); }
```

- [ ] **Step 4: Run the suite**

Run: `node --test test/*.test.js`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add js/ui/board.js js/config/names.js css/main.css
git commit -m "Job cards spell out goal, live progress, and pay"
```

---

### Task 6: The kit, log autoscroll, version bump

**Files:**
- Modify: `js/ui/roost.js` (kit section; hoist upgradeInfo/skyInfo)
- Modify: `js/ui/log.js` (scrollToEnd + pin-to-bottom)
- Modify: `js/ui/render.js` (onShow calls log.scrollToEnd)
- Modify: `js/config/names.js` (kitTitle)
- Modify: `css/main.css` (kit rules)
- Modify: `js/version.js` (0.8.0)

**Interfaces:**
- Consumes: `UNIT_IDS` (already imported in roost.js); `names.multNames`, `names.multName`, `names.loom`, `names.upgrades`, `names.sky`; `state.loom/mults/upgrades/sky`; the log panel is its own scroll container (`.tabPanel { overflow-y: auto }`).
- Produces: `log.scrollToEnd()` (rAF-deferred scroll to bottom).

- [ ] **Step 1: Add the kit title string**

In `js/config/names.js` `ui:` block, after `notesKept: 'notes kept',` add:

```js
    kitTitle: 'the kit — what you own',
```

- [ ] **Step 2: Hoist the effect-string tables in `js/ui/roost.js`**

`skyInfo` (currently declared in the sky-cards section) and `upgradeInfo`
(currently declared just above the flag-upgrades loop) each move to right
after `const cards = [];` — same object literals, unchanged contents, now
one source for both the cards and the kit. Delete the originals.

- [ ] **Step 3: Add the kit section at the end of `createRoost` card building**

After the flag-upgrades `for` loop (before `const everVisible = new Set();`), add:

```js
  // ---- the kit: everything owned, and what it does ----
  const kit = el('div', 'kit');
  kit.hidden = true;
  const kitHead = el('div', 'logNotesHead', names.ui.kitTitle);
  const kitRows = el('div', 'kitRows');
  kit.append(kitHead, kitRows);
  root.appendChild(kit);
  let kitSig = '';

  function updateKit(s) {
    const parts = [s.loom];
    for (const u of UNIT_IDS) parts.push(s.mults[u] || 0);
    for (const id of Object.keys(cfg.UPGRADES)) parts.push(s.upgrades[id] ? 1 : 0);
    for (const id of Object.keys(cfg.SKY)) parts.push(s.sky && s.sky[id] ? 1 : 0);
    const next = parts.join(',');
    if (next === kitSig) return;
    kitSig = next;
    while (kitRows.firstChild) kitRows.removeChild(kitRows.firstChild);
    const addRow = (name, effect) => {
      const row = el('div', 'kitRow');
      row.append(el('span', 'kitName', name), el('span', 'kitFx', effect));
      kitRows.appendChild(row);
    };
    if (s.loom > 0) {
      addRow(`${names.loom.name} lv ${s.loom}`, `hush +${cfg.LOOM.hushPerLevel * s.loom}`);
    }
    for (const u of UNIT_IDS) {
      const m = s.mults[u] || 0;
      if (m > 0) addRow(names.multNames[u], `×${1 << m} ${names.multName}`);
    }
    for (const id of Object.keys(cfg.UPGRADES)) {
      if (s.upgrades[id]) addRow(names.upgrades[id].name, upgradeInfo[id] || '');
    }
    for (const id of Object.keys(cfg.SKY)) {
      if (s.sky && s.sky[id]) addRow('★ ' + names.sky[id].name, skyInfo[id] || '');
    }
    kit.hidden = !kitRows.firstChild;
  }
```

At the end of the returned `update(state)` method (after the card loop), add:

```js
      updateKit(state);
```

- [ ] **Step 4: Kit CSS**

In `css/main.css`, after the roost card rules, add:

```css
/* ---------- the kit (owned gear ledger) ---------- */
.kit { margin-top: 18px; padding: 0 4px 12px; }
.kitRows { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.kitRow { display: flex; gap: 8px; font-size: 11px; align-items: baseline; }
.kitName { color: var(--accent); letter-spacing: 0.06em; white-space: nowrap; }
.kitFx { color: var(--dim); }
```

- [ ] **Step 5: Log autoscroll in `js/ui/log.js`**

Inside `createLog`, before `function update`, add:

```js
  // The panel itself scrolls (.tabPanel). Pin follows the newest entry
  // unless the player has scrolled up to read history.
  function nearBottom() {
    return panel.scrollHeight - panel.scrollTop - panel.clientHeight < 40;
  }
  function scrollToEnd() {
    requestAnimationFrame(() => { panel.scrollTop = panel.scrollHeight; });
  }
```

In `update`, right after the signature guard passes (`sig = next;`), add:

```js
    const pin = !panel.hidden && nearBottom();
```

and at the very end of `update` (after the empty-state branch), add:

```js
    if (pin) scrollToEnd();
```

Change the return to:

```js
  return { update, scrollToEnd };
```

- [ ] **Step 6: Scroll on entering the log**

In `js/ui/render.js`, the tabs creation becomes:

```js
  const tabs = createTabs(app, names, (id) => {
    if (id === 'log') {
      dispatch('openJournal');
      log.scrollToEnd();
    }
  });
```

(`log` is declared later in the function; the callback only runs on user tab
switches, long after init, so the reference is safe.)

- [ ] **Step 7: Version bump**

`js/version.js`: change the version string to `'0.8.0'`.

- [ ] **Step 8: Run the suite**

Run: `node --test test/*.test.js`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add js/ui/roost.js js/ui/log.js js/ui/render.js js/config/names.js css/main.css js/version.js
git commit -m "The kit lists owned gear; the log pins to its newest entry; v0.8.0"
```
