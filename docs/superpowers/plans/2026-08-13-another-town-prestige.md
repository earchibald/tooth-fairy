# Another Town (Phase 2 Prestige) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A prestige loop — finish a town, bank stars, start the next town faster — plus a roost layout fix.

**Architecture:** All prestige math and state live in the deterministic engine (`math.js`, `state.js`, `actions.js`, `predicates.js`, `tick.js`). `departTown(state, cfg)` is a pure function returning the next town's state. The UI adds a sky shop group to the roost, a star chip to the topbar, a depart button to the ending sky, and town stamps to the log.

**Tech Stack:** Vanilla ESM, no build, no deps. `node --test` for tests. DOM via `createElement` only — the repo hook rejects `innerHTML`.

**Spec:** `docs/superpowers/specs/2026-08-13-another-town-prestige-design.md`

## Global Constraints

- Engine never reads `Date.now()`; all math closed-form and deterministic.
- Reducers guard everything; refusal is silent (no state change, no sfx).
- One flat JSON-serializable state; `sfx` is a transient queue; feedback on effect, never intent.
- No `innerHTML` anywhere (commit hook rejects it).
- Renderers never compute economy numbers beyond formatting.
- Star formula: `floor(10 × (lifetime / 6e11) ** 0.5)`. Passive: `1 + starsEarned × 0.02`.
- Sky cards and costs exactly as specced: oldroads 3★, mouseletter 5★ (10 scouts), packedlight 8★, lullabythread 10★ (+20 hush), starcharts 12★, ferrytoken 18★ (+0.05 cap).
- Save version becomes `v: 3`; v1/v2 saves must load and play.
- Story voice: memory register lowercase/spare; ledger register mono/counted.
- Existing 61 tests stay green.

---

### Task 1: Star math and the sky multiplier (engine economy)

**Files:**
- Modify: `js/config/constants.js`
- Modify: `js/engine/math.js`
- Modify: `js/engine/predicates.js`
- Modify: `js/engine/tick.js`
- Create: `test/stars.test.js`

**Interfaces:**
- Produces: `starsAtLifetime(lifetime, cfg)` (math.js), `skyMult(state, cfg)` (predicates.js), `cfg.STARS`, `cfg.SKY`. State fields `starsEarned` and `sky` do NOT exist yet — Task 1 code must tolerate their absence: `skyMult` uses `(state.starsEarned || 0)`, hush/cap effects use `(state.sky && state.sky.X)`.
- Consumes: existing `contractMult` pattern.

- [ ] **Step 1: Add constants.** In `js/config/constants.js`, after the `CONTRACTS` block inside `DEFAULTS`, add:

```js
  STARS: Object.freeze({
    PIVOT: 6e11,          // lifetime that pays AT_PIVOT stars (= ENDING.LIFETIME)
    AT_PIVOT: 10,
    EXP: 0.5,             // sublinear growth past the pivot
    RATE_PER_STAR: 0.02,  // passive production bonus per star ever earned
    TOWN_LEDGER_CAP: 10,
  }),

  // The sky shop: one-shot star-priced flags, permanent across towns.
  SKY: Object.freeze({
    oldroads:      Object.freeze({ cost: 3 }),
    mouseletter:   Object.freeze({ cost: 5, scouts: 10 }),
    packedlight:   Object.freeze({ cost: 8 }),
    lullabythread: Object.freeze({ cost: 10, hush: 20 }),
    starcharts:    Object.freeze({ cost: 12 }),
    ferrytoken:    Object.freeze({ cost: 18, cap: 0.05 }),
  }),
```

- [ ] **Step 2: Write failing tests.** Create `test/stars.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { starsAtLifetime } from '../js/engine/math.js';
import { skyMult, hushCapacity, effectiveRatePerSec } from '../js/engine/predicates.js';
import { createState } from '../js/engine/state.js';

const cfg = buildConstants();

test('starsAtLifetime: 0 early, 10 at the pivot, sublinear past it', () => {
  assert.equal(starsAtLifetime(0, cfg), 0);
  assert.equal(starsAtLifetime(cfg.STARS.PIVOT / 200, cfg), 0);
  assert.equal(starsAtLifetime(cfg.STARS.PIVOT, cfg), 10);
  assert.equal(starsAtLifetime(cfg.STARS.PIVOT * 4, cfg), 20);
  assert.equal(starsAtLifetime(cfg.STARS.PIVOT * 2, cfg), 14); // floor(10*sqrt(2))
});

test('skyMult: +2% per star earned, tolerant of missing field', () => {
  const s = createState(1);
  assert.equal(skyMult(s, cfg), 1);
  s.starsEarned = 10;
  assert.equal(skyMult(s, cfg), 1.2);
  delete s.starsEarned;
  assert.equal(skyMult(s, cfg), 1);
});

test('lullabythread raises hush; skyMult raises the rate readout', () => {
  const s = createState(1);
  const base = hushCapacity(s, cfg);
  s.sky = { lullabythread: true };
  assert.equal(hushCapacity(s, cfg), base + cfg.SKY.lullabythread.hush);
  s.units.scout = 10;
  s.revealed['unit:scout'] = true;
  const before = effectiveRatePerSec(s, cfg);
  s.starsEarned = 10;
  assert.ok(Math.abs(effectiveRatePerSec(s, cfg) - before * 1.2) < 1e-9);
});
```

- [ ] **Step 3: Run to verify failure.** `node --test test/stars.test.js` — expected: FAIL (`starsAtLifetime` not exported).

- [ ] **Step 4: Implement.**

In `js/engine/math.js` add:

```js
// Stars banked when a town is left: closed-form from that town's lifetime.
export function starsAtLifetime(lifetime, cfg) {
  if (!(lifetime > 0)) return 0;
  return Math.floor(cfg.STARS.AT_PIVOT * Math.pow(lifetime / cfg.STARS.PIVOT, cfg.STARS.EXP));
}
```

In `js/engine/predicates.js` add (near `contractMult`):

```js
// Passive prestige bonus: every star ever earned, spent or not, every town.
export function skyMult(state, cfg) {
  return 1 + (state.starsEarned || 0) * cfg.STARS.RATE_PER_STAR;
}
```

Apply it in `effectiveRatePerSec`: multiply the returned product by `skyMult(state, cfg)` alongside `contractMult(state, cfg)`.

In `hushCapacity`, add the sky thread:

```js
export function hushCapacity(state, cfg) {
  return cfg.STIR.HUSH_BASE + state.loom * cfg.LOOM.hushPerLevel +
    (state.sky && state.sky.lullabythread ? cfg.SKY.lullabythread.hush : 0);
}
```

In `js/engine/tick.js`: import `skyMult` from predicates and multiply it into the `produced` chain (next to `contractMult(state, cfg)`). In `toDusk`, the barge cap line becomes:

```js
    const capBase = def.manifestCap +
      (state.sky && state.sky.ferrytoken ? cfg.SKY.ferrytoken.cap : 0);
    const frac = Math.min(capBase,
      def.manifestFrac * barges * Math.pow(2, state.mults.barge || 0) *
      (state.upgrades.manifestii ? cfg.UPGRADES.manifestii.manifestMult : 1));
```

- [ ] **Step 5: Run tests.** `node --test test/stars.test.js` → PASS, then the full suite `node --test` → all green (61 existing + new).

- [ ] **Step 6: Commit.** `git add -A && git commit -m "Engine: star math, sky multiplier, sky-flag economy effects"`

---

### Task 2: Save v3, departTown, buySky, town-gated beats

**Files:**
- Modify: `js/engine/state.js`
- Modify: `js/engine/actions.js`
- Modify: `js/engine/tick.js`
- Create: `test/town.test.js`

**Interfaces:**
- Consumes: `starsAtLifetime` from `math.js` (Task 1), `cfg.SKY` / `cfg.STARS`.
- Produces: state fields `town, stars, starsEarned, sky, lifetimeAllTowns, townLedger`; `departTown(state, cfg)` exported from `state.js`; reducers `buySky`, `devGrantStars`; `devSet` accepts `town`; beats/asides honor optional `minTown` / `maxTown`.

- [ ] **Step 1: Write failing tests.** Create `test/town.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { createState, departTown, serialize, deserialize } from '../js/engine/state.js';
import { dispatch } from '../js/engine/actions.js';
import { tick } from '../js/engine/tick.js';
import { buildScript } from '../js/config/script.js';

const cfg = buildConstants();

function endedState() {
  const s = createState(7);
  s.act = 3; s.postEnd = true; s.ended = true;
  s.lifetime = cfg.STARS.PIVOT;           // exactly 10 stars
  s.night = 7;
  s.units.scout = 50; s.loom = 5; s.notes = 3; s.contractStreak = 8;
  s.upgrades.lucidcontract = true;
  return s;
}

test('departTown: banks meta, resets the run, null before postEnd', () => {
  const before = createState(7);
  assert.equal(departTown(before, cfg), null);
  const s = endedState();
  const next = departTown(s, cfg);
  assert.equal(next.town, 2);
  assert.equal(next.stars, 10);
  assert.equal(next.starsEarned, 10);
  assert.equal(next.lifetimeAllTowns, cfg.STARS.PIVOT);
  assert.equal(next.townLedger.length, 1);
  assert.deepEqual(next.townLedger[0],
    { town: 1, nights: 7, lifetime: cfg.STARS.PIVOT, stars: 10 });
  // run state resets
  assert.equal(next.lifetime, 0);
  assert.equal(next.units.scout, 0);
  assert.equal(next.loom, 0);
  assert.equal(next.upgrades.lucidcontract, undefined);
  assert.equal(next.contractStreak, 0);   // no starcharts
  assert.notEqual(next.seed, s.seed);
  // town 2 skips the amnesia opening
  assert.equal(next.act, 1);
  assert.ok(next.tapShown && next.counterShown && next.revealed['unit:scout']);
});

test('departTown: sky start effects apply', () => {
  const s = endedState();
  s.sky = { oldroads: true, mouseletter: true, packedlight: true, starcharts: true };
  const next = departTown(s, cfg);
  assert.ok(next.upgrades.babyfae && next.upgrades.pincers);
  assert.equal(next.units.scout, cfg.SKY.mouseletter.scouts);
  assert.equal(next.buys.scout, cfg.SKY.mouseletter.scouts);
  assert.ok(next.upgrades.dreamledger);
  assert.equal(next.contractStreak, 8);   // starcharts carries the streak
  assert.deepEqual(next.sky, s.sky);      // the shop purchases persist
});

test('buySky: guards stars and one-shot; devGrantStars grants', () => {
  const s = createState(1);
  dispatch(s, cfg, 'buySky', { id: 'oldroads' });
  assert.equal(s.sky.oldroads, undefined);      // cannot afford
  dispatch(s, cfg, 'devGrantStars', { n: 10 });
  assert.equal(s.stars, 10);
  assert.equal(s.starsEarned, 10);
  dispatch(s, cfg, 'buySky', { id: 'oldroads' });
  assert.equal(s.sky.oldroads, true);
  assert.equal(s.stars, 10 - cfg.SKY.oldroads.cost);
  const left = s.stars;
  dispatch(s, cfg, 'buySky', { id: 'oldroads' });  // one-shot
  assert.equal(s.stars, left);
  dispatch(s, cfg, 'buySky', { id: 'nonsense' });  // unknown id refused
  assert.equal(s.stars, left);
});

test('beats honor minTown/maxTown (synthetic script)', () => {
  const script = { beats: [
    { id: 'only-t1', trigger: { type: 'start' }, maxTown: 1 },
    { id: 'only-t2', trigger: { type: 'start' }, minTown: 2 },
  ], asides: [], whispers: {}, notes: [] };
  const s1 = createState(1);
  tick(s1, cfg, script, {});
  assert.deepEqual(s1.beatQueue, ['only-t1']);
  const s2 = createState(1);
  s2.town = 2;
  tick(s2, cfg, script, {});
  assert.deepEqual(s2.beatQueue, ['only-t2']);
});

test('save v3: v2 fixture normalizes to town 1 / 0 stars and round-trips', () => {
  const v2 = { v: 2, savedAt: 1, state: { v: 2, seed: 5, act: 2, teeth: 100,
    lifetime: 5000, units: { scout: 3 }, beatsSeen: ['a0-icon'], beatQueue: [] } };
  const parsed = deserialize(JSON.stringify(v2));
  assert.ok(parsed);
  assert.equal(parsed.state.v, 3);
  assert.equal(parsed.state.town, 1);
  assert.equal(parsed.state.stars, 0);
  assert.deepEqual(parsed.state.sky, {});
  assert.deepEqual(parsed.state.townLedger, []);
  const again = deserialize(serialize(parsed.state));
  assert.equal(again.state.town, 1);
});
```

Note: the gating test uses a synthetic script because Task 3's real beats land later; Task 6's playthrough covers the real beats. Drop the unused `buildScript` import if nothing else in the file needs it.

- [ ] **Step 2: Run to verify failure.** `node --test test/town.test.js` → FAIL (`departTown` not exported).

- [ ] **Step 3: Implement state.** In `js/engine/state.js`:

In `createState`, change `v: 2` to `v: 3` and add after the `contractStreak` field:

```js
    town: 1,
    stars: 0,
    starsEarned: 0,             // lifetime stars; drives skyMult, never falls
    sky: {},                    // star-shop flag id -> true, permanent across towns
    lifetimeAllTowns: 0,        // finished towns only; this town's lifetime excluded
    townLedger: [],             // { town, nights, lifetime, stars } per finished town
```

In `deserialize`, after the `contractBoard` array guard add:

```js
    s.sky = { ...(wrapped.state.sky || {}) };
    s.townLedger = Array.isArray(wrapped.state.townLedger) ? wrapped.state.townLedger : [];
```

and after the existing `< 2` migration block add `s.v = 3;` (unconditional — the spread may have kept an old v).

Add at the bottom (import `starsAtLifetime` from `./math.js` at the top):

```js
// Leaving for another town: pure — returns the next town's starting state,
// or null unless the ending has been seen. Meta (stars, sky, ledger) carries;
// everything else returns to fresh-state defaults. Town 2+ remembers: it
// starts at act 1 with the tap, counter, and scout card already live.
export function departTown(state, cfg) {
  if (!state.postEnd) return null;
  const gained = starsAtLifetime(state.lifetime, cfg);
  const next = createState(((state.seed + state.town) >>> 0) || 1);
  next.town = state.town + 1;
  next.stars = state.stars + gained;
  next.starsEarned = state.starsEarned + gained;
  next.sky = { ...state.sky };
  next.lifetimeAllTowns = state.lifetimeAllTowns + state.lifetime;
  next.townLedger = state.townLedger.concat([{
    town: state.town,
    nights: state.night,
    lifetime: Math.floor(state.lifetime),
    stars: gained,
  }]);
  while (next.townLedger.length > cfg.STARS.TOWN_LEDGER_CAP) next.townLedger.shift();
  next.act = 1;
  next.tapShown = true;
  next.counterShown = true;
  next.revealed['unit:scout'] = true;
  if (next.sky.oldroads) { next.upgrades.babyfae = true; next.upgrades.pincers = true; }
  if (next.sky.mouseletter) {
    next.units.scout = cfg.SKY.mouseletter.scouts;
    next.buys.scout = cfg.SKY.mouseletter.scouts;
  }
  if (next.sky.packedlight) next.upgrades.dreamledger = true;
  if (next.sky.starcharts) next.contractStreak = state.contractStreak;
  return next;
}
```

- [ ] **Step 4: Implement reducers.** In `js/engine/actions.js` add to `ACTIONS` (near `buyUpgrade`):

```js
  buySky(state, cfg, arg) {
    const def = arg && cfg.SKY[arg.id];
    if (!def || state.sky[arg.id]) return;
    if (state.stars < def.cost) return;
    state.stars -= def.cost;
    state.sky[arg.id] = true;
    state.sfx.push({ type: 'buy', sky: arg.id });
    bump(state);
  },
```

and with the dev reducers:

```js
  devGrantStars(state, cfg, arg) {
    const n = Math.max(0, Number(arg && arg.n) || 0);
    state.stars += n;
    state.starsEarned += n;
    bump(state);
  },
```

In `devSet`, add: `if (typeof arg.town === 'number') state.town = Math.max(1, Math.floor(arg.town));`

- [ ] **Step 5: Implement town gating.** In `js/engine/tick.js`, in the story-trigger block, gate both loops:

```js
    const townOk = (rec) =>
      (!rec.minTown || state.town >= rec.minTown) &&
      (!rec.maxTown || state.town <= rec.maxTown);
```

and add `if (!townOk(beat)) continue;` / `if (!townOk(aside)) continue;` as the first line inside each loop.

- [ ] **Step 6: Run tests.** `node --test test/town.test.js` → PASS; full `node --test` → green.

- [ ] **Step 7: Commit.** `git add -A && git commit -m "Engine: save v3, departTown, sky shop reducers, town-gated beats"`

---

### Task 3: Story beats and copy

**Files:**
- Modify: `js/config/script.js`
- Modify: `js/config/names.js`

**Interfaces:**
- Consumes: `minTown` / `maxTown` gating (Task 2).
- Produces: beats `end-town`, `t2-arrive`, `t2-ledger`; aside `as-town3`; `names.sky` (card copy), `names.tips.stars/skyCard/depart`, `names.ui.depart/departConfirm/starsEarned/townStamp` strings used by Tasks 4–5 verbatim.

- [ ] **Step 1: Add `maxTown: 1` to the seven `a0-*` beats** in `js/config/script.js` (fields sit alongside `act`, e.g. `{ id: 'a0-icon', act: 0, maxTown: 1, ... }`).

- [ ] **Step 2: Add the new beats.** After `end-sky`, before the MIGRATION section:

```js
    { id: 'end-town', act: 3, register: 'memory',
      text: 'there is another town. there is always another town. the stars come with me — they always did.',
      response: 'pack up', trigger: { type: 'afterBeat', id: 'end-sky' } },

    // ---- TOWN 2+ (the arrival replaces the amnesia opening) ----
    { id: 't2-arrive', act: 1, register: 'memory', minTown: 2,
      text: 'another town. smaller. the moon followed me here. i remembered my name the whole way.',
      response: 'back to work', trigger: { type: 'start' } },
    { id: 't2-ledger', act: 1, register: 'ledger', minTown: 2,
      text: 'transfer approved. balance carried: see the sky. the rounds resume at dusk. welcome, again.',
      response: 'again.', trigger: { type: 'afterBeat', id: 't2-arrive' } },
```

- [ ] **Step 3: Add the third-town aside** to the asides list:

```js
    { id: 'as-town3', minTown: 3, trigger: { type: 'start' },
      text: 'the bargemaster waves from a different river. same hat.' },
```

- [ ] **Step 4: Add copy to `js/config/names.js`.** Add a `sky` group (mirror the `upgrades` shape):

```js
  sky: Object.freeze({
    oldroads:      Object.freeze({ name: 'OLD ROADS',           flavor: 'the first two rungs of the ladder, remembered.' }),
    mouseletter:   Object.freeze({ name: 'A LETTER FROM MADRID', flavor: 'ten scouts, waiting at the new place. she wrote ahead.' }),
    packedlight:   Object.freeze({ name: 'PACKED LIGHT',         flavor: 'the dream ledger rides in the front seat.' }),
    lullabythread: Object.freeze({ name: 'LULLABY THREAD',       flavor: 'a spool of the old hush. it never runs out.' }),
    starcharts:    Object.freeze({ name: 'STAR CHARTS',          flavor: 'the streak is written in the sky. the sky moves with you.' }),
    ferrytoken:    Object.freeze({ name: 'FERRY TOKEN',          flavor: 'the bargemaster honors it on any river.' }),
  }),
```

Add to `ui`: `depart: 'another town'`, `departConfirm: 'leave for good?'`, `townLabel: 'town'`, `starsLabel: 'stars'`.

Add to `tips`: `stars: 'stars are teeth taken up. each star ever earned adds +2% gathering, in every town, forever. spend them in the sky at the top of the roost.'`, `skyCard: 'bought with stars, kept forever: this follows you to every town.'`, `depart: 'finish here, bank the stars shown, and start a new town. the sky and its purchases carry over; everything else begins again.'`.

Sky card effect lines (used by Task 4's `skyInfo` map, keep here for one source of copy — put them IN Task 4's code, listed here for review): oldroads `'new towns begin with baby fae and pincers'`, mouseletter `'new towns begin with 10 tooth scouts'`, packedlight `'new towns begin with the dream ledger signed'`, lullabythread `'hush +20, every town'`, starcharts `'the contract streak survives the move'`, ferrytoken `'barge manifest cap +5%, every town'`.

- [ ] **Step 5: Run the suite.** `node --test` → green (data-only change; playthrough tests still pass because town 1 never satisfies `minTown: 2`).

- [ ] **Step 6: Commit.** `git add -A && git commit -m "Story: departure and arrival beats, sky-shop copy"`

---

### Task 4: Roost sky shop, star chip, roost layout fix

**Files:**
- Modify: `js/ui/roost.js`
- Modify: `js/ui/render.js`
- Modify: `css/main.css`

**Interfaces:**
- Consumes: `cfg.SKY`, `names.sky`, `names.tips.stars/skyCard`, `dispatch('buySky', {id})`, state `stars/starsEarned/sky/postEnd/town`.
- Produces: sky cards render at the TOP of the roost; a `★ N` chip in the topbar.

- [ ] **Step 1: Sky cards in `js/ui/roost.js`.** Immediately BEFORE the unit-card loop (so they sit first in `cards` and first in the DOM), add:

```js
  // ---- the sky (star shop): permanent, star-priced, cross-town ----
  for (const id of Object.keys(cfg.SKY)) {
    const n = names.sky[id];
    const c = makeCard({ key: 'sky:' + id, title: n.name, testid: 'card-sky-' + id });
    c.node.classList.add('starCard');
    c.flavor.textContent = n.flavor;
    attachTip(c.node, names.tips.skyCard);
    const b = buyButton(names.ui.buy, 'buy-sky-' + id);
    b.btn.addEventListener('click', () => dispatch('buySky', { id }));
    c.buys.append(b.btn);
    const skyInfo = {
      oldroads: 'new towns begin with baby fae and pincers',
      mouseletter: `new towns begin with ${cfg.SKY.mouseletter.scouts} tooth scouts`,
      packedlight: 'new towns begin with the dream ledger signed',
      lullabythread: `hush +${cfg.SKY.lullabythread.hush}, every town`,
      starcharts: 'the contract streak survives the move',
      ferrytoken: `barge manifest cap +${cfg.SKY.ferrytoken.cap * 100}%, every town`,
    };
    c.info.textContent = skyInfo[id] || '';
    cards.push({
      key: 'sky:' + id,
      isVisible: (s) => (s.postEnd || s.town >= 2) && !s.sky[id],
      node: c.node,
      primary: { btn: b.btn, keyChip: b.keyChip, run: () => dispatch('buySky', { id }) },
      cache: {},
      update(s, cache) {
        const cost = cfg.SKY[id].cost;
        const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };
        set('cost', '★ ' + cost, (v) => { b.cost.textContent = v; });
        set('dis', s.stars < cost, (v) => { b.btn.disabled = v; });
      },
    });
  }
```

(Move the `skyInfo` const above the loop — one object, not one per iteration.)

- [ ] **Step 2: Star chip in `js/ui/render.js`.** In the topbar section after `stirMeter`, create:

```js
  const starChip = el('div', 'chip starChip');
  starChip.hidden = true;
  starChip.dataset.testid = 'star-chip';
  attachTip(starChip, names.tips.stars);
```

Append it to the topbar between `stirMeter` and `spacer`. In `update(state)` add:

```js
    set('stars', state.starsEarned > 0 ? `★ ${state.stars}` : '', (v) => {
      starChip.hidden = !v;
      if (v) starChip.textContent = v;
    });
```

(The chip shows the SPENDABLE balance; visibility keys off `starsEarned` so it never disappears mid-run after a spend-to-zero.)

- [ ] **Step 3: CSS.** In `css/main.css`:

Replace the `.roost` block's first line so the list fills its tab panel (the 42dvh cap predates the tabs and now only manufactures dead space):

```css
.roost {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  padding: 4px 12px 10px; display: flex; flex-direction: column; gap: 8px;
  scrollbar-width: thin;
}
```

Add:

```css
.card.starCard { border-color: color-mix(in srgb, var(--glow) 35%, transparent); }
.starChip { color: var(--gold); cursor: default; }
```

(Check `--gold` exists in the palette custom properties; if the variable is defined per-palette use it, otherwise use the hex the `.aside.note` rule uses.)

- [ ] **Step 4: Verify.** `node --test` → green. Manual check is the controller's job (browser).

- [ ] **Step 5: Commit.** `git add -A && git commit -m "UI: sky shop in the roost, star chip, roost fills its panel"`

---

### Task 5: Ending departure button, log town stamps, main-loop wiring

**Files:**
- Modify: `js/ui/stage.js`
- Modify: `js/ui/log.js`
- Modify: `js/ui/render.js`
- Modify: `js/main.js`

**Interfaces:**
- Consumes: `departTown` (state.js), `starsAtLifetime` (math.js), `names.ui.depart/departConfirm`, `names.tips.depart`, ctx plumbing in `render.js`.
- Produces: `ctx.onDepart()` callback contract: stage calls it on confirmed press; `main.js` implements it (swap state via the same path the save-import uses, then force the tonight tab).

- [ ] **Step 1: Stage — button + stats.** In `js/ui/stage.js`, in the sky/ending section (where `skyStats` is built), add after `skyStats`:

```js
  const departBtn = document.createElement('button');
  departBtn.className = 'beatBtn departBtn';
  departBtn.dataset.testid = 'depart';
  departBtn.hidden = true;
  attachTip(departBtn, ctx.names.tips.depart);
  let armedUntil = 0;
  departBtn.addEventListener('click', () => {
    const now = performance.now();
    if (now < armedUntil) { armedUntil = 0; ctx.onDepart(); }
    else armedUntil = now + 5000;
  });
  sky.appendChild(departBtn);
```

(`attachTip` is already imported by other UI modules; import it here. `ctx.names` and `ctx.onDepart` arrive via createStage's options — extend the destructuring; `render.js` passes them in Step 3. The armed label: in the stage's per-frame update, when the sky is visible set `departBtn.hidden = !state.postEnd` and its label:

```js
    const armed = performance.now() < armedUntil;
    const preview = starsAtLifetime(state.lifetime, cfg);
    const label = armed ? names.ui.departConfirm : `${names.ui.depart} (+${preview}★)`;
    if (departBtn.textContent !== label) departBtn.textContent = label;
```

`starsAtLifetime` and `cfg` must be available in stage.js — import the function from `../engine/math.js` and pass `cfg` through createStage's options. This is the ONLY renderer economy computation and it is display-only preview math, same as `fmt`.)

Also append `town N · ★ M earned` to the skyStats spans: in the existing skyStats build loop add two more entries: `['town', state.town]` and `['★ earned', state.starsEarned]` (match the existing label/value pattern in that function).

- [ ] **Step 2: Log — town stamps.** In `js/ui/log.js`, render `state.townLedger` stamps ABOVE the night stamps, one line per finished town, mono/ledger style like night stamps:

```js
    for (const t of state.townLedger) {
      const line = el('div', 'logStamp townStamp',
        `town ${t.town} — ${t.nights} nights · ${fmt(t.lifetime)} gathered · ${t.stars}★`);
      list.appendChild(line);
    }
```

Adapt to the file's actual builder helpers (read it first — it rebuilds from a signature guard; include `state.townLedger.length` and `state.town` in the signature string so a new town triggers a rebuild). Import `fmt` if not present.

- [ ] **Step 3: Plumb ctx.** In `js/ui/render.js`, pass `names`, `cfg`, and `onDepart: ctx.onDepart` into `createStage(stageEl, {...})`.

- [ ] **Step 4: main.js — implement onDepart.** In `js/main.js`, where the ctx for `buildUI` is assembled, add:

```js
    onDepart: () => {
      const next = departTown(state, cfg);
      if (!next) return;
      loadState(next);       // same swap path the save-import uses
      ui.tabs.show('tonight');
    },
```

Import `departTown` from `./engine/state.js`. Read how `loadState` works in main.js first: it must rebind the `state` variable, persist, and reset the render cache exactly like the import path; reuse that function, do not duplicate its body. If `loadState` lives in a closure with a different name, call that.

- [ ] **Step 5: Run suite + hook.** `node --test` → green.

- [ ] **Step 6: Commit.** `git add -A && git commit -m "UI: departure button on the ending sky, town stamps in the log"`

---

### Task 6: Bot learns to move towns; two-town playthrough tests

**Files:**
- Modify: `js/dev/bot.js`
- Modify: `test/playthrough.test.js`
- Create: `test/prestige.test.js`

**Interfaces:**
- Consumes: `departTown`, `dispatch('buySky')`, `cfg.SKY`.
- Produces: the bot, on `postEnd`, buys affordable sky cards (priority order `['mouseletter', 'oldroads', 'packedlight', 'lullabythread', 'starcharts', 'ferrytoken']`), then departs; a two-town test proving town 2 is faster.

- [ ] **Step 1: Read `js/dev/bot.js` and `test/playthrough.test.js`** to match their driver structure exactly (the bot mutates a state it is handed each step; the harness owns the loop).

- [ ] **Step 2: Bot.** Because `departTown` returns a NEW state, the bot cannot swap it in place. Give the bot's step function a return contract: it returns `undefined` normally, or the next town's state when it departs. In the bot, when `state.postEnd` is true:

```js
    for (const id of ['mouseletter', 'oldroads', 'packedlight', 'lullabythread', 'starcharts', 'ferrytoken']) {
      if (!state.sky[id] && state.stars >= cfg.SKY[id].cost) dispatch(state, cfg, 'buySky', { id });
    }
    events.push(`(town ${state.town} done: +${starsAtLifetime(state.lifetime, cfg)} stars)`);
    return departTown(state, cfg);
```

Update the harness loops (bot's own runner if it has one, and the playthrough test driver) to adopt the returned state: `const next = step(...); if (next) state = next;`.

- [ ] **Step 3: Prestige playthrough test.** Create `test/prestige.test.js` that drives the bot through TWO towns (reuse the playthrough test's driver pattern; cap iterations like it does) and asserts:

```js
// after town 1 ends and the bot departs:
assert.ok(state.town === 2 && state.stars >= 0 && state.starsEarned >= 10);
// after town 2 ends:
const t1 = state.townLedger[0], t2 = state.townLedger[1] ??
  { nights: state.night };   // if asserting before the second depart, use state.night
assert.ok(t2.nights < t1.nights, `town 2 (${t2.nights}) should beat town 1 (${t1.nights})`);
```

Keep the runtime sane: reuse the same seed(s) and speed knobs the existing playthrough test uses. If two full towns exceed the test-time budget, run town 2 only to the `ended` flag (not postEnd) and compare `state.night` at that moment against `townLedger[0].nights`.

- [ ] **Step 4: Keep existing playthrough green.** The single-town playthrough test must not start departing: guard the bot's depart behavior behind an option (`bot({ prestige: true })` or an extra param defaulting to off) so existing tests are untouched.

- [ ] **Step 5: Run.** `node --test` → all green, including the new two-town test.

- [ ] **Step 6: Commit.** `git add -A && git commit -m "Bot: sky purchases and town departure; two-town playthrough test"`

---

### Task 7: Version, README, dev-panel stars

**Files:**
- Modify: `js/version.js` (`VERSION = '0.3.0'`)
- Modify: `README.md`
- Modify: `js/dev/panel.js` (or wherever the dev panel's action buttons live — read `js/dev/` first)

**Steps:**

- [ ] **Step 1: Dev panel.** Add a "grant 10★" button dispatching `devGrantStars {n: 10}`, next to the existing dev grant/skip buttons, matching their construction pattern.

- [ ] **Step 2: Version.** `js/version.js` → `'0.3.0'`.

- [ ] **Step 3: README.** Add a short "another town (prestige)" paragraph to the feature list: finish a town, bank stars (√ of lifetime, 10★ at the ending), +2%/star forever, sky shop at the top of the roost, town 2 starts at act 1.

- [ ] **Step 4: Run everything.** `node --test` → green.

- [ ] **Step 5: Commit.** `git add -A && git commit -m "v0.3.0: dev stars button, README prestige notes"`

---

### Final: whole-branch review, browser verification (controller), merge, release

- Controller (not a subagent) verifies in the browser: sky shop renders and buys, star chip, departure double-press flow, town-2 arrival beats, log town stamps, roost fills the panel with no dead space.
- Dispatch the final whole-branch reviewer (most capable model) with a review package from the branch's merge base.
- Fix wave if needed, re-run `node --test`.
- finishing-a-development-branch: merge to main, push, watch the Pages deploy (user pre-authorized).
