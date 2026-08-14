# Constellations — Phase 3 Design (post-ending sky meta)

## Summary

| Aspect | Decision |
|---|---|
| Goal | A second, long-arc sink for stars: trace figures in the sky for permanent rule-changing bonuses |
| Home | A fourth tab, "the sky", visible once `starsEarned > 0` |
| Cost model | 1★ per slot, traced sequentially; a figure completes when all slots are lit |
| Bonuses | Completion-only, permanent, all towns — rule changes, not head starts |
| Scale | 5 figures, 42★ total (sky shop is 56★) — an arc into the teen towns |
| Engine | Save v4: `constellations{}` map; `traceStar` reducer; bonuses wired via predicates |
| Story | First-trace beat (memory), first-figure beat (ledger), all-figures aside |
| Art | Fixed point/edge patterns per figure (vfx), drawn as SVG in the tab and onto the ending sky canvas |
| Out of scope | New palettes/sounds, further meta layers, achievements |

**Approval note:** the user delegated Phase 3 with "complete phase 3 please" while away,
following the Phase 2 pattern of full design delegation plus pre-authorized merge and
release. This spec records the decisions and their reasoning in place of interactive
approval.

## 1. Goals and constraints

- Phase 2's star shop front-loads its value: 56★ of head starts, all bought by roughly
  town 8. Constellations give stars a purpose after that, and a reason to keep leaving.
- Constellation bonuses must feel different from sky cards: sky cards start a town
  faster; figures change the rules of every town.
- Everything stays deterministic and closed-form. The engine never reads the clock.
- Legibility (the taste profile): progress is visible as a picture filling in, star by
  star. No hidden math; each figure states its bonus on the card.

## 2. The loop

1. Earn stars by finishing towns (unchanged).
2. Spend them in two places: the sky shop (head starts, Phase 2) or the sky tab
   (figures, this phase). Both draw from the same `stars` balance — a real choice.
3. Tracing: each press of a figure's trace button spends 1★ and lights the next star
   in the pattern. Order within a figure is fixed; which figure to trace is free choice.
4. When the last star of a figure lights, the figure completes: the bonus applies
   immediately and forever, the pattern's connecting lines draw in, and a ledger beat
   (first time) records it.

## 3. The figures

`cfg.CONSTELLATIONS` (dev-panel tunable; slot counts are the star costs):

| id | Name | Slots (★) | Completion bonus | Config keys |
|---|---|---|---|---|
| `littlest` | THE LITTLEST TOOTH | 4 | +1★ extra at every departure | `departBonus: 1` |
| `fieldmouse` | THE FIELD MOUSE | 6 | tap power ×2, every town | `tapMult: 2` |
| `quietloom` | THE QUIET LOOM | 8 | crew noise ×0.9 | `noiseFactor: 0.9` |
| `ferryman` | THE FERRYMAN | 10 | dawn rest halved (dusk returns sooner) | `gapFactor: 0.5` |
| `toothfairy` | THE TOOTH FAIRY | 14 | each star's passive bonus 0.02 → 0.03 | `rateBonus: 0.01` |

Reasoning: `littlest` is the cheap first taste and compounds the meta loop itself;
`fieldmouse` keeps tapping relevant late; `quietloom` touches the stir system;
`ferryman` changes real-time pacing (the one bonus a spreadsheet can't feel);
`toothfairy` is the capstone that retroactively upgrades every star ever earned.
Completion-only bonuses keep the card legible: one picture, one promise.

## 4. Engine

### 4.1 State (save v4)

- `constellations: {}` — figure id → stars placed (integer ≥ 0).
- `createState` initializes it; `deserialize` guards it like `sky`
  (`s.constellations = { ...(wrapped.state.constellations || {}) }`) and sets `s.v = 4`
  unconditionally after the existing migration blocks.
- `departTown` carries `constellations` across towns (like `sky`), and adds
  `departBonus` stars per completed `littlest` figure — the bonus applies to `gained`
  before banking, so `stars`, `starsEarned`, and the town-ledger stamp all agree.

### 4.2 Reducer

`traceStar(state, cfg, { id })` — silent refusal on: unknown id, figure already
complete, `stars < 1`. Otherwise: `stars -= 1`, `constellations[id] += 1`,
`sfx.push({ type: 'trace', id, done })` where `done` is true when this trace
completed the figure. `bump(state)`.

### 4.3 Predicates and wiring

- `figureDone(state, cfg, id)` in predicates.js: `(state.constellations?.[id] || 0) >= cfg.CONSTELLATIONS[id].slots`.
- `tapPower`: multiply by `cfg.CONSTELLATIONS.fieldmouse.tapMult` when `fieldmouse` done.
- `noiseLevel`: multiply by `cfg.CONSTELLATIONS.quietloom.noiseFactor` when `quietloom` done.
- `skyMult`: per-star rate becomes `RATE_PER_STAR + (toothfairy done ? rateBonus : 0)`.
  One function, used by both the readout and the tick, as today.
- `toDawn` (tick.js): `state.duskGapS = cfg.NIGHT.MIN_GAP_S * (ferryman done ? gapFactor : 1)`.
- `departTown` (state.js): `gained = starsAtLifetime(...) + (littlest done ? departBonus : 0)`.

### 4.4 Story triggers

Two new `triggerMet` cases:

- `{ type: 'trace', count: N }` — total stars placed across all figures ≥ N.
- `{ type: 'figure', count: N }` — completed figures ≥ N.

## 5. Story

All copy in names.js/script.js, registers as established (memory = her voice,
ledger = the bureaucracy):

- `sky-trace` (memory, trigger `trace 1`): *"i put two stars next to each other and
  the night held them there. a picture. mine."* response: "keep going".
- `sky-figure` (ledger, trigger `figure 1`): *"figure received and recorded. the sky
  accepts the entry. permanence granted, form C-1."* response: "permanence."
- `as-sky-all` (aside, trigger `figure 5`): *"the sky is full of pictures now. every
  town i ever left is looking up at the same ones."*

Per-figure names and one line of flavor each in `names.constellations`.

## 6. UI

- **Fourth tab** `sky` after `roost` in tabs.js. The tab button is hidden until
  `starsEarned > 0` (render.js signature-guarded, like the star chip). Badge dot on
  when `stars ≥ 1` and at least one figure is incomplete.
- **Panel:** a header line with the star balance, then one card per figure:
  - an SVG drawing of the pattern — placed stars bright, unplaced dim outlines,
    connecting edges drawn only when the figure is complete;
  - name, flavor line, progress (`3/8 ★`), the bonus line (dim until complete);
  - a trace button (`trace ★1`), disabled when `stars < 1`, gone when complete.
  - SVG built via `createElementNS` (the innerHTML hook applies to SVG too).
- **Patterns** live in `vfx.js` (`vfx.constellations[id] = { points: [[x,y]…],
  edges: [[i,j]…] }`, normalized 0–1 coordinates) — art, not balance, so not
  dev-panel knobs. Stars light in `points` order.
- **Ending sky:** completed figures draw over the random starfield on the ending
  canvas (bright points + faint edges), so the end-of-town screen shows what the
  sky remembers. The canvas signature includes the completed-figure count.
- Tooltips for the tab and the trace buttons; copy in `names.js`.

## 7. Dev and bot

- Dev panel: the existing "grant 10★" button covers testing; `devSet` needs nothing new.
- Bot (prestige mode): after buying sky cards, trace greedily in a fixed priority
  (`littlest`, `fieldmouse`, `quietloom`, `ferryman`, `toothfairy`) so multi-town
  runs exercise tracing and completion.

## 8. Testing

- Reducer: trace happy path, refusal on unknown/complete/broke; sfx `done` flag.
- Each bonus: fieldmouse doubles tapPower; quietloom scales noiseLevel; toothfairy
  raises skyMult per-star rate; ferryman halves the dusk gap set at dawn; littlest
  adds the departure star (and the town-ledger stamp shows it).
- Migration: v3 save loads with `constellations: {}`, v4 round-trips.
- Triggers: synthetic script records for `trace` and `figure`.
- Config guard: config.test.js asserts `names.constellations` covers every
  `cfg.CONSTELLATIONS` id, and vfx patterns exist with `points.length === slots`.
- Bot integration: a multi-town prestige run completes at least one figure.
- Existing 71 tests stay green.

## 9. Out of scope

- Further meta layers beyond the five figures.
- New palettes, sounds, contract types, or achievements.
