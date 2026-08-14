# Another Town — Phase 2 Design (prestige loop)

## Summary

| Aspect | Decision |
|---|---|
| Goal | A prestige loop after the ending: leave for another town, keep stars, replay faster |
| Meta-currency | Stars. Earned at departure from lifetime teeth, closed-form, deterministic |
| Star formula | `stars = floor(10 × √(lifetime / ENDING.LIFETIME))` → 10★ at the ending |
| Passive bonus | Every star ever earned adds +2% production, all towns, forever |
| Star shop | "the sky" — a card group at the top of the roost, priced in stars |
| Replay speed | Town 2+ starts at act 1 with tap and counter shown; sky upgrades compound |
| Story | The fairy remembers between towns. New arrival beats replace the amnesia opening |
| State | Save v3: `town`, `stars`, `starsEarned`, `sky{}`, `lifetimeAllTowns`, `townLedger[]` |
| UX fix | Roost list fills its tab panel (remove the 42dvh cap left over from the one-screen era) |
| Out of scope | Phase 3 sky meta (constellations), new palettes, new sounds |

**Approval note:** the user delegated Phase 2 design decisions ("make your own best
decisions") and pre-authorized merge + release. This spec records the decisions and
their reasoning in place of the usual interactive approval.

## 1. Goals and constraints

- The ending stops being a wall. A finished town converts into permanent progress.
- Town 2 must feel meaningfully faster: skip the amnesia crawl, keep the night rhythm.
- Stars are folklore-grounded: every tooth becomes a star; the sky is the ledger.
  Prestige reads as *the sky remembering*, not as a menu reset.
- All math is closed-form and deterministic. The engine still never reads the clock.
- Acts, beats, contracts, and nights are unchanged inside a town.

## 2. The loop

1. Play a town to the ending (ministry + lifetime ≥ `ENDING.LIFETIME`), as today.
2. The `end-sky` beat (unchanged) is followed by a new `end-town` beat: *there is
   another town. the stars come with me.*
3. The ending sky screen gains a **"another town (+N★)"** button. N is the live
   closed-form preview. First press arms it ("leave for good?"); a second press
   within 5 s departs; otherwise it disarms. (A confirm *beat* cannot be declined —
   beats pause the game until answered — so the confirm lives on the button.)
4. `departTown(state, cfg)` (engine, pure: returns the next town's state or null
   unless `postEnd`) banks stars, stamps the town ledger, and builds the next
   town's starting state. The main loop swaps the state via the existing
   `loadState` path; the headless bot calls it directly.

Post-ending play still earns: lifetime keeps growing, so the preview N grows
sublinearly (√). Leaving is always the better rate; lingering is never punished.

## 3. Stars

### 3.1 Earning

`starsAtLifetime(lifetime, cfg) = floor(cfg.STARS.AT_PIVOT × (lifetime / cfg.STARS.PIVOT) ** cfg.STARS.EXP)`

| Constant | Value | Meaning |
|---|---|---|
| `STARS.PIVOT` | `6e11` (= ENDING.LIFETIME) | lifetime that pays `AT_PIVOT` stars |
| `STARS.AT_PIVOT` | `10` | stars at the pivot |
| `STARS.EXP` | `0.5` | sublinear growth past the pivot |
| `STARS.RATE_PER_STAR` | `0.02` | passive production bonus per star earned |

Stars gained at departure = `starsAtLifetime(this town's lifetime)` — whole towns
only, no partial banking mid-town.

### 3.2 Passive bonus

`skyMult(state, cfg) = 1 + state.starsEarned × cfg.STARS.RATE_PER_STAR`

Applied exactly like `contractMult`: in `effectiveRatePerSec` and in the tick's
`produced` chain. Additive per star (town 1's 10★ → ×1.2), so early prestiges are
felt without compounding runaway.

### 3.3 Spending — "the sky" shop

A new card group pinned at the top of the roost, visible once `postEnd` is true or
`town ≥ 2`. Cards cost stars, are one-shot flags in `state.sky`, and persist across
towns. Effects apply at town start (`anotherTown`) or continuously:

| id | Name | Cost | Effect |
|---|---|---|---|
| `oldroads` | OLD ROADS | 3★ | new towns begin with BABY FAE and PINCERS owned |
| `mouseletter` | A LETTER FROM MADRID | 5★ | new towns begin with 10 tooth scouts |
| `packedlight` | PACKED LIGHT | 8★ | new towns begin with the DREAM LEDGER signed |
| `lullabythread` | LULLABY THREAD | 10★ | hush base +20, every town |
| `starcharts` | STAR CHARTS | 12★ | the contract streak survives the move |
| `ferrytoken` | FERRY TOKEN | 18★ | barge manifest cap +5%, every town |

Town 1's 10★ buys `oldroads` + `mouseletter` (or one bigger card) — a real choice.
All costs and effect numbers live in `constants.js` under `SKY` (dev-panel tunable).

Buying: `buySky` reducer — guard on stars, one-shot, silent refusal, `sfx` on effect.
Start-of-town effects also apply units/upgrades through the same state fields the
normal reducers use (owned counts, `upgrades{}`, `revealed{}`), so downstream
predicates need no special cases.

## 4. State and migration (save v3)

New fields, all flat and JSON-serializable:

| Field | Meaning |
|---|---|
| `town` | 1-based town counter |
| `stars` | spendable balance |
| `starsEarned` | lifetime stars (drives `skyMult`), never decreases |
| `sky` | flag id → true (bought sky cards) |
| `lifetimeAllTowns` | teeth gathered in finished towns (this town's `lifetime` excluded) |
| `townLedger[]` | per-town stamps: `{ town, nights, lifetime, stars }`, capped at 10 |

`departTown(state, cfg)` — a pure function in `state.js` (it needs `createState`;
`starsAtLifetime` lives in `math.js` to avoid an import cycle with `predicates.js`):

- Guard: returns `null` unless `state.postEnd`.
- Bank: `stars += gained`, `starsEarned += gained`, `lifetimeAllTowns += lifetime`,
  push town-ledger stamp.
- Rebuild: fresh `createState(seed + town)` (a new seed per town keeps contract
  boards fresh), then copy the meta fields over, `town++`.
- Town ≥ 2 start: `act = 1`, `tapShown = true`, `counterShown = true`,
  `revealed['unit:scout'] = true`; a0 beats never fire (see §5); then apply the
  owned sky cards' start effects. `starcharts` copies `contractStreak` across.
- Everything else — units, upgrades, loom, notes, belief, stir, nights, contracts,
  beatsSeen — resets to fresh-state defaults.

Migration: `v: 3`. Old v1/v2 saves land at `town: 1, stars: 0` via the normalizing
deserialize spread; the existing `< 2` block is joined by nothing new (no beat
needed — a mid-run save sees no visible change).

## 5. Story

Beats gain optional `minTown` / `maxTown` fields, checked wherever triggers are
evaluated. The act-0 opening (`a0-*`) gets `maxTown: 1`. New beats:

- `end-town` (memory, afterBeat `end-sky`): *"there is another town. there is always
  another town. the stars come with me — they always did."* response: "pack up".
- `t2-arrive` (memory, `start`, minTown 2): *"another town. smaller. the moon
  followed me here. i remembered my name the whole way."* response: "back to work".
  effects: none (the reducer already staged act 1).
- `t2-ledger` (ledger, afterBeat `t2-arrive`): *"transfer approved. balance carried:
  see sky. the rounds resume at dusk. welcome, again."* response: "again.".
- One aside on the third town (`t3` via `minTown: 3`, trigger start):
  *"the bargemaster waves from a different river. same hat."*

Whispers and notes are shared across towns unchanged.

## 6. UI

- **Ending sky:** `skyStats` adds `town N` and `★ earned`; below it the
  "another town (+N★)" button (`beatBtn` styling), visible when `postEnd`.
- **Topbar:** a small `★ N` chip appears when `starsEarned > 0`; tooltip explains
  stars and the passive bonus. It is a display, not a button.
- **Roost:** "the sky" card group renders above the unit cards, star-priced
  (`★ 3` in the cost slot), with a subtle glow accent (`starCard` class). Bought
  cards disappear like upgrades.
- **The log:** town-ledger stamps render above night stamps: `town 1 — 7 nights ·
  612B gathered · 10★`.
- **Roost layout fix:** `.roost` becomes `flex: 1 1 auto; max-height: none;` so the
  list fills the tab panel. The 42dvh cap predates the tabs and now only makes the
  list scroll inside dead space.
- Tooltips for every new surface, copy in `names.js`.

## 7. Dev support

- Dev panel: "grant 10★" button (`devGrantStars`), "queue end-town" via the
  existing beat queue tools. `devSet` accepts `town`.

## 8. Testing

- Star math: closed-form unit tests (0 below threshold, 10 at pivot, √ growth).
- `anotherTown`: meta carried, run reset, sky start effects applied, guard refuses
  before `postEnd`, seed changes per town.
- `skyMult` applied in both rate paths (readout equals tick production).
- Migration: v2 fixture loads at town 1 / 0 stars and plays a night.
- Bot: finishes town 1, prestiges, buys sky cards greedily, finishes town 2;
  playthrough test asserts town 2 completes in fewer nights than town 1.
- Existing 61 tests stay green.

## 9. Out of scope

- Phase 3: post-ending sky meta (constellations) — the star shop is designed to
  grow into it, nothing more.
- New palettes, sounds, or contract types.
