# The Hoard — Phase 5 Design (tooth-stash scale tiers + Workshop tier tabs)

## Summary

| Aspect | Decision |
|---|---|
| Goal | Draw the collected teeth as a physical stash that grows through scale tiers — a little sack at 1 tooth, out to infinity — with a Workshop tab per tier to preview and tune |
| Home in game | The banner canvas (the conveyor strip). Teeth land there; the stash grows where they arrive |
| Tiers | 8, log10-spaced: sack (1) · jars (1e2) · chests (1e4) · piles (1e6) · warehouses (1e9) · silo fields (1e12) · white mountains (1e15) · moons (1e18 → ∞, unbounded) |
| Module | `js/ui/hoard.js` — `tierFor(count, tiers)` (pure, unit-tested) + per-tier scene painters |
| Tuning | New `vfx.hoard` block; a "Hoard" dev-panel tab (drawer mode) with an inner tab strip, one tab per tier: log scrub slider + per-tier knobs + shared knobs |
| Save/release | Hoard knobs ride the existing `tf-ov-vfx` layer — the Workshop tab's save-to-project and release buttons cover them with zero new plumbing |
| Engine | Untouched. No save-format change, no reducers, no story beats |
| Out of scope | Story copy for tiers, sounds, hoard interactions (clicking the stash), per-town hoard persistence beyond `state.teeth` |

**Approval note:** delegated via goal-set ("create workshop tabs for … the various
'levels' of tooth collection, from beginning to <infinity>"), consistent with
Phases 2–4. This spec records decisions in place of interactive approval.

## 1. Goals and constraints

- The counter says the number; nothing shows the *stuff*. The hoard makes wealth
  physical: one sack, then receptacles, then piles and piles, then warehouses,
  then landscapes, then celestial bodies.
- Legibility (the taste profile): each tier reads at a glance as "more than the
  last tier", and within a tier the scene visibly fills in.
- Measured by default: the hoard is a quiet ground-line silhouette behind the
  banner's traffic, not a second light show. The Workshop exists to explore louder.
- Vanilla ESM, no deps, no innerHTML, straight quotes. Renderer-side only,
  driven by `state.teeth` the renderer already receives.
- `prefers-reduced-motion` still draws the hoard (it is standing stock, not
  motion) but spawns no glints.

## 2. Tier ladder

`vfx.hoard.tiers` — ordered array, `min` is the tooth count where the tier begins:

| id | Name (names.js) | min | Scene |
|---|---|---|---|
| `sack` | a little sack | 1 | one drawstring sack beside the button; teeth peek out as it fills |
| `jars` | the jars | 1e2 | a shelf of jars filling one by one |
| `chests` | the chests | 1e4 | stacked wooden chests, lids sinking as they fill |
| `piles` | piles and piles | 1e6 | mounds of teeth along the ground line |
| `warehouses` | the warehouses | 1e9 | a row of warehouse silhouettes with lit doorways |
| `silos` | the silo fields | 1e12 | a field of grain silos receding in rows |
| `mountains` | the white mountains | 1e15 | a mountain range of teeth against the night |
| `moons` | the borrowed moons | 1e18 | tooth-white moons rising over the ridge; more moons per decade, forever |

- Below 1 tooth: nothing draws. A fresh town starts with bare ground.
- `tierFor(count, tiers)` returns `{ id, index, progress }`, or `null` when
  `count < tiers[0].min` (including 0, negatives, and non-finite garbage
  other than `Infinity`). `progress` is the
  log10 position inside `[min, nextMin)`, clamped to `[0, 1]`. The last tier
  spans 3 decades to `progress = 1` (1e21) and stays at 1 beyond;
  `count = Infinity` must return the last tier at `progress = 1`, not NaN.
- Within a tier, the scene shows `1 + floor(progress * (units - 1))` shapes;
  the newest shape's fill fraction is the remainder. Both come from one
  exported helper `shapesFor(progress, units)` so tests pin the math.

## 3. Rendering

- `js/ui/hoard.js` is node-importable (no DOM access at module scope), like
  juice.js. Exports: `tierFor`, `shapesFor`, `drawHoard(ctx2d, opts)` where
  `opts = { w, h, count, vfx, colors }` — drawing is static, so
  reduced-motion handling stays in the conveyor (which spawns no glints).
- `drawHoard` dispatches to one painter per tier id. Painters draw vector
  shapes anchored to a ground line at the canvas bottom, at `vfx.hoard.alpha`,
  in the palette's `--accent`/`--glow` colors passed via `opts.colors`.
- The tap button occupies the banner's center: painters keep a clear zone of
  `vfx.hoard.centerGapPx` around `w / 2` (the sack tier deliberately sits just
  right of the gap — the first tooth lands next to your hand).
- Draw order on the conveyor canvas: motif teeth (existing, alpha 0.16) →
  hoard → inbound sprites and particles. The hoard draws inside `drawStatic`,
  so a parked banner still shows the stash and every frame carries it.
- Glints: while the loop runs, the conveyor's frame loop spawns a hoard glint
  (a 1-particle spark) at `vfx.hoard.glintPerS` per second through the
  existing particle pool. hoard.js exports `glintPoint({ w, h, count, vfx,
  rand })` returning an `{ x, y }` on the current stash (or `null` when the
  hoard is empty) — `rand` is an injected `() => number` so tests pass a
  deterministic one. No glints under reduced motion; a parked loop spawns
  none (fine — glints are garnish, not information).
- Conveyor API additions: `setTeeth(count)` (render.update calls it beside
  `setRate`) and `setHoardPreview(countOrNull)` (Workshop scrub; `null`
  returns to live count; both trigger `redraw()` when parked).

## 4. `vfx.hoard` (all Workshop-tunable)

```js
hoard: {
  alpha: 0.5,          // whole-hoard opacity on the banner
  glintPerS: 0.8,      // sparkle rate across the stash while animating
  centerGapPx: 72,     // clear zone around the tap button
  tiers: [             // min = tooth count where the tier begins
    { id: 'sack',       min: 1,    units: 1,  px: 34 },
    { id: 'jars',       min: 1e2,  units: 7,  px: 22 },
    { id: 'chests',     min: 1e4,  units: 6,  px: 30 },
    { id: 'piles',      min: 1e6,  units: 5,  px: 40 },
    { id: 'warehouses', min: 1e9,  units: 6,  px: 52 },
    { id: 'silos',      min: 1e12, units: 9,  px: 58 },
    { id: 'mountains',  min: 1e15, units: 5,  px: 72 },
    { id: 'moons',      min: 1e18, units: 6,  px: 18 },
  ],
}
```

- `units` = how many shapes the tier grows through; `px` = base shape size.
  Painters interpret both (a mountain's `px` is peak height; a moon's is
  radius). These are the per-tier knobs; `alpha`/`glintPerS`/`centerGapPx`
  are shared knobs.
- Tier `min` values are art thresholds, fixed in code — not sliders. The VFX
  tab can still nudge them like any vfx value if ever needed.
- The `merge()` in vfx.js currently copies arrays as `defaults.slice()` and
  silently ignores overrides — tier overrides would be dropped. This phase
  fixes it: array defaults merge per index, accepting either an array or a
  numeric-keyed object (`{ 3: { units: 7 } }`, which is what setPath writes
  into the JSON override layer). The Hoard tab writes `units`/`px` through
  paths like `['hoard', 'tiers', 3, 'units']`. A config test pins the
  round-trip through `buildVfx`.

## 5. The Hoard tab (dev panel)

- New tab "Hoard", second in the panel order (Workshop · Hoard · Script ·
  Balance · Names · VFX · State · Pacing). Both Workshop and Hoard toggle
  `devPanel--drawer` so the banner stays visible while tuning.
- Contents:
  1. **Tier tab strip** — 8 mini-tabs: `sack · jars · chests · piles ·
     warehouses · silos · mountains · moons ∞`. Selecting one calls
     `setHoardPreview(midCount)` (the tier's log midpoint) so the banner
     shows that tier immediately.
  2. **Scrub slider** — per tier, log-scaled from the tier's `min` to the
     next tier's `min` (the moons tab runs `1e18 → 1e24` and gains an `∞`
     button that previews `Infinity`). Scrubbing updates the preview count
     live; a readout shows the formatted count.
  3. **Knobs** — the tier's `units` and `px` sliders plus the shared
     `alpha` / `glintPerS` / `centerGapPx` sliders, using the same slider
     row builder as the Workshop tab (extract the row builder from
     tabWorkshop into a shared helper — same live-write to `ctx.vfx` and the
     `tf-ov-vfx` layer).
  4. **`live` button** — clears the preview (`setHoardPreview(null)`).
  5. **Save note** — one devNote line: "save and release live in the
     Workshop tab." No duplicate save/release buttons.
- Leaving the tab or closing the panel runs cleanup: `setHoardPreview(null)`.

## 6. Names

`names.hoard` in names.js: `{ sack: 'a little sack', jars: 'the jars',
chests: 'the chests', piles: 'piles and piles', warehouses: 'the warehouses',
silos: 'the silo fields', mountains: 'the white mountains',
moons: 'the borrowed moons' }`. Used for tier tab labels and (someday) story;
a config test asserts one name per tier id.

## 7. Testing

- `test/hoard.test.js`:
  - `tierFor`: count 0 and negative → null (nothing draws); 1 → sack p=0;
    99 → sack p<1; 1e2 → jars p=0; each threshold lands its tier at p=0;
    1e21 → moons p=1; 1e30 and `Infinity` → moons p=1 (no NaN); progress
    is monotonic in count.
  - `shapesFor`: p=0 → 1 shape fill 0; p=1 → all units full; midpoints exact.
  - `drawHoard` with a recording 2d-context stub (records method calls):
    every tier id paints at least one fill/stroke; count 0 paints nothing;
    `Infinity` paints without throwing; all x coordinates stay within
    `[0, w]` and outside the center gap.
- `test/config.test.js` additions: `vfx.hoard.tiers` mins strictly ascending
  and starting at 1; every tier id has a `names.hoard` entry; tuned/override
  round-trip through a numeric path (`hoard.tiers.3.units`).
- Existing 93 tests stay green. Scene look, the tier tab strip, scrub, ∞
  button, and preview cleanup are browser-verified by the controller with
  pixel sampling per tier at forced preview counts.

## 8. Out of scope

- Story beats, whispers, or ledger copy about the hoard.
- Sounds.
- Interacting with the stash (clicking, spending, admiring individual teeth).
- Any engine or save-format change.
