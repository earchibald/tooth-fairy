# TOOTH FAIRY — Design Specification

**Date:** 2026-08-13 · **Status:** v1 prototype spec · **Deploy target:** GitHub Pages (static, no build)

| Aspect | Decision |
|---|---|
| Genre | Incremental clicker, progressive disclosure, story-driven |
| One word (tetrad) | **BELIEF** — mechanics, story, aesthetic, and tech all express it |
| Core loop | Tap teeth → buy helpers → noise stirs the house → hush it → grow louder anyway |
| Currencies | TEETH (primary), NOTES (curiosity drip → belief faucet), BELIEF (0–100 meter → ×1–×2 global multiplier) |
| Pressure mechanic | STIR meter: production makes noise; noise stirs children; a wake event costs belief |
| Story spine | An amnesiac fairy reconstructs her identity, her craft, and finally her purpose. Parents enter the fold as Act 3's technology AND reveal |
| Recurring character | The flashlight kid: Act 1 charm → Act 2 wake event → Act 3 first parent to sign the pact |
| Ending | Teeth become stars (folklore-grounded). Final screen reads the playthrough back as constellations |
| Acts | 0 WHAT (~2 min) · 1 THE ROUNDS (~8 min) · 2 THE OPERATION (~15 min) · 3 THE FOLD (~20 min) · ending offer ≈ 45–60 min |
| Stack | Vanilla ESM, zero deps, no build, `node --test`, no innerHTML, 200 ms tick, seeded RNG |
| Dev tools | In-app full-screen panel, 6 tabs (Script, Balance, Names, VFX, State, Pacing), localStorage override layer over frozen defaults |
| Cut-lines (in order) | 1: Pacing tab bot charts → table only. 2: parent network n²-bonus → flat mult. 3: wake stun → belief dip only. 4: MAYFLY SPRITE → S1 stub |

## 1. Vision

You are something that wants teeth and does not know why. The game is the answer, delivered in
memory fragments while the numbers go up. Tone is deadpan whimsy: the memory voice is spare and
strange; the player's only dialogue is snarky lowercase response buttons; a fae-bureaucratic
ledger voice arrives late. The game never congratulates the player.

Design constitution inherited from the alignment-issues research (adopted wholesale):
the six guardrails (One-Loop, Verb Budget ≤9, Legibility, 90-Second, Stub-First, Named Cut-Line),
the Ten Laws, sawtooth pacing gated on felt pressure with backstops, one mechanic per beat,
register-separated voices, content as pure data.

## 2. Story arc and script system

### 2.1 Registers

| Channel | Register | Presentation |
|---|---|---|
| MEMORY (the fairy) | lowercase, spare, concrete; drifts per act: confusion → appetite → competence → tenderness | serif italic, stage center, response button beneath |
| PLAYER (response buttons) | lowercase snark, 1–4 words | the button label IS the player's voice |
| LEDGER (fae bureaucracy, Act 3+) | lowercase, mechanical, counted | mono, muted, no emotion: "pact registered. houses: 4. stir: falling." |

Rules: no register blending; no late-act reveals in early pools; concrete beats abstract;
taboo words in mechanics copy: XP, gold, level up, congratulations, achievement.

### 2.2 Act structure

Acts advance on player purchases/thresholds, never timers.

**Act 0 — WHAT.** The user-specified opening, verbatim:
tooth icon [what] → a couple more [what the] → a pile [...] → "...teeth..." [why do i want teeth]
→ tooth button + cornflower motif strip appear → outline tooth pulses, tap fills it → 1 → 2 → 4
(counter fades in above the button during the 2-set) → at 7 teeth the memory:
"fairy." [alright] → "TOOTH. fairy." [yeah ok] → "Let's get some TEETH." [hell yeah].

**Act 1 — THE ROUNDS.** BABY FAE (25, tap ×2) then TOOTH SCOUT (50, 1/s). The craft returns in
fragments: wings, the pillow protocol, the coin she never carries, the window latch trick.
NOTES counter appears silently (curiosity drip, no use yet). The flashlight kid is introduced.
Act ends when PILLOW MOUSE tier is running and the STIR meter reveals itself: the operation
has gotten loud.

**Act 2 — THE OPERATION.** Scale and consequence. New units: MAYFLY SPRITE (expires, AFTERGLOW
upgrade pays a burst on death), FLOSS PHANTOM (silent, pricier), TOOTH FERRY (bulk lump deliveries).
STIR pressure is live: first wake event is scripted to be the flashlight kid. Relief ladder,
one per beat: TIPTOE (free, always legal, ugly: halves production 15 s) → LULLABY LOOM (purchased
quiet capacity) → SANDMAN CONTRACT (automation). NOTES become readable: +belief each.
Act ends on the noise wall — growth is stir-capped — with the teaser: a parent in the doorway,
holding a tooth, not surprised.

**Act 3 — THE FOLD.** PARENT PACT: the open secret becomes infrastructure. Each pact is a safe
house: less global stir, steady mailed-in teeth, and a network bonus (parents talk). The first
signature is the flashlight kid, grown, flashlight kept on the nightstand for their own kid.
LEDGER voice arrives. MINISTRY OF MOLARS closes the roster. Ending offer at lifetime threshold:
"i remember what they're for now. come see." [show me] → the sky. Teeth become stars; the final
screen renders lifetime stats as constellations (taps, scouts, pacts, notes read, wakes, journal
opens). Play continues after — the sky keeps filling.

### 2.3 Script data shape

All beats live in `js/config/script.js` as pure data:

```js
{ id: 'act1-wings', act: 1, register: 'memory',
  trigger: { type: 'buy', target: 'scout', count: 1 },
  text: 'wings. i had— have. wings.', response: 'good for you',
  effects: null }
```

Trigger types: `lifetime` (teeth), `buy` (unit, count), `tap` (count), `wake` (count),
`noteRead` (count), `act`, `manual` (dev). One-shot asides keyed to usage counts (2nd/5th/10th
of a verb). Idle whisper pools per act: 4–6 strong lines each, no filler, immediate-repeat guard.
Beats queue; one shows at a time; game pauses while a beat awaits its response (same path as
hidden-tab; no offline catch-up on dismiss). Beats never fire during offline replay.
A journal keeps every seen beat (opens are counted; the ending reads the count back).

## 3. Economy

### 3.1 Currencies

| Currency | Faucet | Sink | Visible from |
|---|---|---|---|
| TEETH | taps, units, offline | all purchases | Act 0 (counter at 3rd outline set) |
| NOTES | drip ≈1/45 s while producing, bonuses | read → +2 BELIEF each | Act 1 (silent counter) |
| BELIEF | notes, quiet streaks | wake −15, drift toward 50 | Act 2 |

BELIEF multiplies all tooth income: ×(1 + belief/100). Non-convertible; each has its own faucet
and sink.

### 3.2 Units (generators)

Costs: `base × growth^owned`; closed-form bulk-buy and max-affordable; buy 1/10/max.
Level badges on every card; base rates printed, never derived totals.

| Unit | Base | Growth | Yield | Noise | Notes |
|---|---|---|---|---|---|
| TOOTH SCOUT | 50 | 1.15 | 1/s | 1 | "checks under pillows. mostly finds socks." |
| PILLOW MOUSE | 600 | 1.14 | 8/s | 2 | Pérez homage |
| MAYFLY SPRITE | 2,500 | 1.05 | 40/s, expires 90 s | 6 | cheap burst; AFTERGLOW: +50% lifetime yield on expiry |
| FLOSS PHANTOM | 12,000 | 1.13 | 70/s | 0 | the silent option — dearer per tooth/s |
| TOOTH FERRY | 140,000 | 1.12 | 5,000/12 s lump | 10 spike | lumpy income; docks on the motif strip |
| PARENT PACT | 1.2 M | 1.18 | 2,500/s | −(×0.96 global) | network bonus ×(1 + 0.01·n(n−1)/2), cap ×3 |
| MINISTRY OF MOLARS | 15 M | 1.15 | 18,000/s | 0 | LEDGER voice attached |

Threshold multipliers (springboards): at 10/25/50 owned of a unit, a ×2 upgrade for that unit
becomes buyable (named per unit in config, e.g. SCOUT GOGGLES).

### 3.3 Tap ladder (flag purchases)

| Upgrade | Cost | Effect |
|---|---|---|
| BABY FAE | 25 | tap ×2 (→2) |
| POLISHED PINCERS | 400 | tap ×2 (→4) |
| SILVER TWEEZERS | 5,000 | tap ×2 (→8) |
| MOONLIT GLOVES | 60,000 | tap ×2 (→16) |
| STARLIGHT FINGERS | 750,000 | tap also gains +1% of teeth/s |

Tap cap: 2 landed taps per 200 ms tick (10/s) — anti-autoclicker floor, never advertised.
Balance is tuned at 5 taps/s sustained.

### 3.4 STIR (pressure) and the relief ladder

`noise = Σ unit.noise × count × pactFactor`. HUSH is quiet capacity (base + LULLABY LOOM levels).
When noise > hush, STIR rises; below, it falls. STIR at 100 → wake event: −15 belief, noisiest
unit type stunned 10 s, STIR resets to 40. Wake events cannot fire while a beat is open or
offline. First wake is scripted (flashlight kid) at a low threshold so the catastrophe
provably fires.

| Verb | Cost | Effect | Role |
|---|---|---|---|
| TIPTOE | free, always legal | production and noise ×0.5 for 15 s | the ugly escape hatch |
| LULLABY LOOM | leveled purchase | +hush capacity per level | the earned relief |
| SANDMAN CONTRACT | one flag | auto-TIPTOE at STIR ≥ 85 | the automation |

### 3.5 Offline ladder

Offline replay = the same tick loop, capped 10,000 steps; beats and wakes muted; remainder banked
at the measured rate. Return screen: teeth banked, one button. Story is never consumed offline.

| Upgrade | Cost | Effect |
|---|---|---|
| DREAM LEDGER | 2,000 | offline earning enabled: 50% rate, 2 h cap |
| NIGHT LEDGER | 100,000 | cap → 8 h |
| LUCID CONTRACT | 2 M | rate → 100%, cap → 24 h |

### 3.6 Reveal gating

Every unlock: `gate` (pressure/affordability predicate) OR `backstop` (counter) — one predicate
function shared by hint, card, and buy guard. Hints fire at affordability, never before.
Reveal cadence floor 3 s; one mechanic per beat.

## 4. UI/UX

Single column, phone aspect on all devices (desktop centers a ~480 px column). `100dvh` fixed;
inner panes scroll; `[hidden]{display:none!important}` first rule; no horizontal scroll.

Bottom-up layout: tooth button (bottom center, under the thumb) flanked by the **cornflower
tooth motif strip** (button height + few px) — incoming teeth from every automated source
animate along it, one motif tooth per credited batch, timed to land on the credit. Above:
counter + rate. Middle: the STAGE (outline teeth, memory beats, wake flashes, ending sky).
Above: the ROOST — self-activating purchase cards with arrival ceremony (pop + sparkle + drop,
then the explaining line). Top bar: BELIEF and STIR meters (hidden until revealed), notes,
journal book, settings gear, version.

Feedback: float popups near the source on every earn; sound on effect only (synthesized WebAudio
blips, master gain ≈0.03, silence on refused presses, `?mute=1` non-persistent); refused input
is quiet. Theme: `data-act="0..3"` on the app root drives CSS custom properties — the night
deepens and the sky accrues stars as acts pass. `prefers-reduced-motion` honored everywhere.

Keyboard (fine-pointer only, chips shown): SPACE/T tap · 1–9 buy nth visible card · S tiptoe ·
N read note · J journal · ESC dismiss. Guards: no auto-repeat, no modifier passthrough,
purchase gates enforced at the reducer.

## 5. Developer settings page

In-app, full-screen overlay; enabled automatically on localhost, elsewhere via `?dev=1`.
Never advertised in the player UI. Drives the REAL modules — no copies of the physics.

| Tab | Contents |
|---|---|
| Script | Every beat/aside/whisper: edit text, response, trigger params, act; add/duplicate/remove; jump-to-beat; validation (unique ids, length budget) |
| Balance | The difficulty scaling matrix: every economy constant grouped by system; knob key = constant name; default readout + changed highlight; reject out-of-range |
| Names | Every player-visible string not in Script: unit names, verb labels, UI copy — one term, one casing, everywhere |
| VFX | Motif strip speed/density, particle caps, pulse/float/card timings, per-act palette (color pickers with clear), sound gains per verb + master |
| State | Live state view; grant teeth/notes/belief; set STIR; jump to act/beat; advanceTicks (+1 m/+10 m/+8 h offline sim); speed; save export/import/reset |
| Pacing | Runs the real engine headless with a scripted competent-not-optimal bot: time-to-unlock table, taps-per-tooth curve, dead-time %, reveal cadence with <3 s warnings |

Persistence: overrides in localStorage, merged over frozen defaults
(`buildConfig(overrides)`); panel controls are built by iterating the defaults objects
(cannot drift); "Copy JSON" / "Download" exports only changed keys as a paste-ready module.
Bidirectional key-parity is a test. Reset-to-defaults per knob and per tab.

## 6. Architecture

```
index.html            css/main.css
js/engine/   state.js rng.js tick.js actions.js math.js predicates.js
js/config/   constants.js script.js names.js vfx.js  (frozen DEFAULTS + buildX(overrides))
js/ui/       render.js stage.js roost.js conveyor.js beats.js journal.js
             floats.js sound.js keys.js devgate.js
js/dev/      panel.js + one module per tab (lazy-loaded)
js/main.js   boot: load overrides, buildConfig, loop (50 ms accumulator → 200 ms tick),
             rAF render gated on uiSeq, visibilitychange save + offline catch-up
test/        node --test: determinism, playthrough bot <5 s, beat reachability,
             pacing envelope + ratchets, config key parity, save round-trip, ui import smoke
```

Laws: engine pure/DOM-free; one flat JSON-safe state; reducers guard-and-refuse silently;
seeded mulberry32 in state; cosmetics never touch engine RNG; render signatures include every
field read at display precision; save versioned with migrate(); `window.game` debug API;
`?speed=N`; `data-testid` everywhere; no innerHTML anywhere (hook-enforced); createElement only.

## 7. Deploy

GitHub Pages from `earchibald/tooth-fairy`, test-gated Actions workflow, deployment-branch-policy
pinned to main, live verify by fetching version.js. Version shown in settings and dev panel;
patch bump per shipped change.

## 8. What is fun / where is the tension

The numbers always go up, but the *reason* is a mystery the numbers are buying back. Tension
lives in STIR: every purchase is louder; the quiet options are dearer; the free option is ugly.
The Act 3 reveal converts the antagonist (being seen) into the best technology in the game —
the mechanical relief IS the emotional payoff. Just before frustration: the next relief is
gated to land at affordability at the top of each effort climb.
