# Night-Cycle Expansion — Phase 1 Design (stretch the arc)

## Summary

| Aspect | Decision |
|---|---|
| Goal | Stretch one playthrough from ~1 h to 2–3 real days; make the offline ladder load-bearing |
| Phase plan | Phase 1: stretch the arc (this spec) · Phase 2: prestige loop · Phase 3: endgame sky |
| Core new mechanic | Night cycle: ~35 min active nights, dawn stops production, real-time dusk gap (min 2 h) skippable by absence |
| New act | ACT 2.5 — THE RIVER, between THE OPERATION and THE FOLD |
| New units | DUST BUNNY, ATTIC OWL (act 2) · MOLAR BARGE (act 2.5) · STARWRIGHTS (act 3) |
| New verb | Contract board: 2–3 jobs at dusk, pick one, resolves by dawn, streak bonuses at 3/7/14 |
| UX | Three tabs: tonight (stage) · the log (journal + night ledger) · the roost (purchases); persistent meters + tray |
| Tooltips | Every metric, button, and card gets a tooltip; touch gets a long-press equivalent |
| Architecture | Night state lives in the deterministic engine tick; wall-clock enters only via the existing offline path |
| Ending | Lifetime target raised ~50 M → ~2 B teeth; trigger still ministry + lifetime |
| Out of scope | Prestige, post-ending sky meta, new palettes beyond act 2.5, sound expansion |

## 1. Goals and constraints

- One playthrough spans 2–3 real days with a few check-ins per day.
- Acts 0–1 play unchanged. The stretch begins in act 2.
- Each offline-ladder rung arrives just before the wall it solves.
- All new systems live in the deterministic engine. Tests play full runs headless.
- The authored voice holds: memory register (lowercase, spare), ledger register (mono, counted).

## 2. Pacing targets

| Act | Content | Target span | Offline role |
|---|---|---|---|
| 0 WHAT | unchanged | ~2 min | none |
| 1 THE ROUNDS | unchanged | ~10 min | none |
| 2 THE OPERATION | +DUST BUNNY, +ATTIC OWL, contract board reveals, night cycle reveals | night 1 → night 2 | DREAM LEDGER (2 h) |
| 2.5 THE RIVER (new) | ferry chapter, MOLAR BARGE, sailings | nights 2–4 | NIGHT LEDGER (8 h) |
| 3 THE FOLD | pacts, ministry, +STARWRIGHTS | nights 4–6 | LUCID CONTRACT (24 h) |
| Ending | lifetime ≥ ~2 B and ministry owned | day 2–3 | — |

Cost growth factors and base costs stretch from act 2.5 onward only. Exact numbers are
dev-panel-tunable constants; the pacing test (§10) enforces the envelope, not the numbers.

## 3. Night cycle

### 3.1 Model

- A **night** is ~35 min of active play. A dawn meter counts it down. The meter only
  advances on productive ticks (production > 0 or taps this tick); idling on a beat or
  overlay does not burn night.
- At **dawn**: production stops. The stage shows the morning. The night ledger stamps
  an entry (teeth gathered, contracts done, wakes, sailings). The contract board locks.
- After dawn comes the **dusk gap**: a real-time rest (minimum 2 h, act-tunable).
  Time away counts. The offline ledgers pay earnings for the same absence, so the
  natural loop is: play a night, leave, return to a new night.
- A player who stays at dawn can watch the morning but cannot produce. The UI says
  when dusk arrives, in plain terms.

### 3.2 State and gating

New engine state (all in the flat state object, JSON-serializable):

| Field | Meaning |
|---|---|
| `night` | 1-based night counter |
| `nightPhase` | `'night'` or `'dawn'` |
| `nightTicksLeft` | productive ticks remaining tonight |
| `duskAt` | wall-clock ms when dusk arrives (set at dawn; the only wall-clock field) |
| `nightLedger[]` | capped list of per-night stamp records |

Nights gate: one ferry sailing per night (act 2.5+), one pact signing per night (act 3),
contract board reroll at dusk, and story beats with `night` triggers ("on the third night").

### 3.3 Wall-clock boundary

The engine never reads `Date.now()`. At boot and on visibility return, the existing
offline path computes elapsed time; it advances the dusk gap and, if dusk passed,
starts the next night before replaying offline earnings. One code path, tested headless.

### 3.4 Dev support

Dev panel gains: night length and dusk-gap knobs, "skip to dawn", "skip to dusk".
`?speed=` scales night ticks like everything else.

## 4. Economy

### 4.1 New units

| Unit | Act | Cost / rate | Mechanic | Flavor hook |
|---|---|---|---|---|
| DUST BUNNY | 2 | 5 k · 60/s · noise 3 | noisy mid-tier; makes the loom matter before sprites | "lives under the bed. always has. finally on payroll." |
| ATTIC OWL | 2 late | 45 k · 300/s · noise 0.2 | near-silent watcher | beats foreshadow the doorway parent |
| MOLAR BARGE | 2.5 | 400 k · night lump | sails once per night; delivers a % of that night's gathering | makes finishing nights valuable |
| STARWRIGHTS | 3 | 400 M · 1 M/s | final tier | "they take the teeth upstairs. don't ask about the ladder." |

Each new unit gets springboard tiers, an aside ladder, and 1–2 beats.

### 4.2 New upgrades

- One unique upgrade per existing unit (e.g. scouts: SOCK RADAR; mice: MADRID
  CONNECTIONS) so old cards stay alive across the longer arc.
- Ferry-line upgrades in act 2.5 (lighthouse-style lump multipliers).
- Tap ladder gains one late rung so tapping stays relevant into act 3.

### 4.3 Offline ladder rework

| Upgrade | New cost | New reveal | Effect (unchanged) |
|---|---|---|---|
| DREAM LEDGER | 800 | early act 2 | 50% rate, 2 h cap |
| NIGHT LEDGER | ~150 k | act 2.5 wall | 8 h cap |
| LUCID CONTRACT | ~5 M | act 3 mid | 100% rate, 24 h cap |

Each rung's beat tells the player to leave: the mechanic becomes story.

## 5. ACT 2.5 — THE RIVER

- Position: between THE OPERATION and THE FOLD. The doorway-parent cliffhanger moves
  here as this act's exit; THE FOLD's reveal is untouched.
- Subject: where teeth go. The fairy rides the ferry to the far shore for the first
  time and cannot remember what is on it — fog. Beats land at sailings. The fog gains
  a shape across nights; the shape resolves in act 3 / the ending (STARWRIGHTS).
- Register: memory voice with more water in it. Palette: one step bluer-green
  (new `palettes[25]` entry keyed by the integer act value). Whisper pool is all river.
- Economy: MOLAR BARGE and ferry-line upgrades. Sailings are the act's heartbeat:
  the barge departs at dawn with the night's manifest and pays its lump at the next
  dusk, when the new night begins.
- Exit trigger: lifetime threshold + completed-sailing streak → doorway beat → act 3.
- Act value: acts become `0,1,2,25,3` internally (integer-safe) with display names;
  save migration maps old `act:3` forward unchanged.

## 6. Contract board

- A board on the **tonight** tab, hidden until its reveal beat (act 2). At dusk it
  offers 2–3 jobs; picking one locks the others for that night; the board rerolls at dusk.
- Jobs are data in `config/contracts.js`: `{ id, condition, reward, text }`.
- Condition types (reuse engine state): `no-wakes-tonight`, `gather-N-before-dawn`,
  `read-N-notes-tonight`, `finish-stir-under-X`, `tiptoe-N-times-tonight`.
- Rewards: belief, a teeth burst scaled to current rate, or a story fragment
  (special notes from named kids; the flashlight kid recurs).
- No failure penalty. An unmet contract expires at dawn.
- Streak: consecutive nights with a completed contract pay a small permanent
  multiplier at 3 / 7 / 14 nights.
- Deterministic: the board draws from the seeded RNG + night number, so tests and
  replays see identical offers.

## 7. UX — three tabs

Tab bar: **tonight** · **the log** · **the roost**. On mobile the bar sits directly
above the tray.

Persistent on every tab: top meters (BELIEF, STIR + noise/hush sublabel, notes chip)
and the bottom tray (teeth counter, rate, dawn meter, TIPTOE, tap button).

| Tab | Contents |
|---|---|
| tonight | stage: outline teeth, night-sky/dawn visuals, whispers, asides, contract board, story beat cards, "new at the roost" transient cards |
| the log | every beat in order (both registers), notes read, night ledger stamps |
| the roost | all purchases grouped under headers (crew · gear · the loom), arrival ceremonies |

Rules:

- Story beats pause the game and always show on **tonight**; if another tab is active
  when a beat fires, the game switches to tonight.
- Reveal predicates firing produce a non-pausing "new at the roost" card on tonight
  and a badge dot on the roost tab until visited.
- Settings stays a gear-icon overlay. The journal overlay is retired into the log tab.
- Number keys 1–9 buy globally. `[` / `]` cycle tabs; `j` jumps to the log tab
  (continuity with the old journal key).

## 8. Tooltips everywhere

- Every meter, verb, card, tab, and stat gets a tooltip: one or two sentences,
  mechanic-first, voice-flavored second.
- Desktop: `title` plus a styled hover tooltip. Touch: long-press shows the same text
  as a transient card; a small ⓘ affordance appears on meters.
- Tooltip copy lives in `config/names.js` beside the labels it explains — one term,
  one meaning, one place.

## 9. Architecture

- Night state, contracts, sailings, and streaks live in the engine (`state`, `tick`,
  `actions`, `predicates`) exactly like stir and belief. Reducers guard everything;
  refusal stays silent.
- The renderer grows a `tabs.js` (bar + switching + badges) and a `board.js`
  (contract board). `roost.js` and `overlays.js` shrink accordingly. No renderer
  computes economy numbers.
- Config gains `contracts.js`; `constants.js` gains `NIGHT`, `CONTRACTS`, and new
  unit/upgrade blocks — every knob a dev-panel control, as today.
- Save version bumps to `v2` with a normalizing migration (old saves land at night 1
  of their current act with a one-time "the nights have gotten longer" beat).

## 10. Testing

- The bot learns nights: play a night, skip the dusk gap through the engine path,
  pick the highest-value contract greedily.
- Playthrough tests assert: run completes; every act, beat, aside, and contract
  condition type is reachable; night count lands in the target band.
- Pacing test computes the real-time envelope from engine math
  (nights × night length + dusk gaps ≈ 2–3 days) and fails CI if a balance edit
  breaks it.
- Contract determinism test: same seed + night → same board.
- Migration test: v1 save fixtures load, normalize, and complete a night.

## 11. Out of scope (later phases)

- Phase 2: prestige loop ("another town") — stars as meta-currency, cycle story.
- Phase 3: post-ending sky meta (constellations).
- New sound work beyond existing hooks; additional palettes beyond act 2.5.
