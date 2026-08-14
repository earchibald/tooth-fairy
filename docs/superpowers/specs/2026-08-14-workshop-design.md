# The Workshop — Phase 4 Design (juice studio + save/release pipeline)

## Summary

| Aspect | Decision |
|---|---|
| Goal | A Workshop tab (first in the dev panel) to tune the tap button and the banner's juice live, then save the liked values into the repo and release |
| The banner | The conveyor strip becomes a full-width feedback banner: taps, powerup buys, passive income, and scale all read there |
| New juice | Tap pop/glow/sparks; inbound-sprite glow + sparkle trails; landing bursts; buy shimmer; a rate-driven intensity ramp |
| Tuning | All juice values live in a new `vfx.juice` block; the Workshop renders grouped sliders that edit the live vfx via the existing override layer |
| Preview | Workshop mode shrinks the panel to a top drawer so the tray stays visible; preview buttons fire synthetic taps/income/buys |
| Save to project | `scripts/workshop-server.js` (node, no deps, 127.0.0.1:8123) serves the game and accepts `POST /api/save-vfx`, writing `js/config/tuned.js` |
| Release | `POST /api/release` runs the test suite; green → stages `js/config/tuned.js`, commits, pushes (Pages deploys) |
| Bug fix | conveyor.js frame loop references `pool` that moved into `makeBatcher` — the banner freezes after the last sprite lands. Fixed here |
| Out of scope | Tuning non-vfx configs from the Workshop; sound design; multiplayer of any kind |

**Approval note:** delegated via goal-set ("create that developer tuning dashboard…"),
consistent with Phases 2–3. This spec records decisions in place of interactive approval.

## 1. Goals and constraints

- The tap button and the banner are the game's pulse. Today their feedback is minimal
  and hard-coded; tuning means editing vfx.js and reloading.
- Eugene wants to *feel* candidate settings live, keep what he likes, and ship it —
  without leaving the browser.
- Defaults stay measured (the taste profile); the Workshop exists to explore louder.
- Vanilla ESM, no deps, no innerHTML, straight quotes. The engine is untouched except
  for zero engine changes at all: juice is renderer-side, driven by existing sfx.
- `prefers-reduced-motion` continues to bypass all banner animation.

## 2. Bug fix (pre-work, same branch)

`js/ui/conveyor.js:96`: `if (sprites.length || pool > 0)` — `pool` moved into
`makeBatcher`'s closure in an earlier refactor. When the last sprite lands, the frame
throws `ReferenceError`, `running` stays `true`, and `wake()` never restarts the loop:
the banner freezes for the session. Fix: `makeBatcher` gains `pending()` (returns
`pool > 0`); the frame uses `batcher.pending()`. Regression test in
`test/workshop.test.js` (batcher exposes pending correctly through credit/flush).

## 3. The banner (full-width feedback strip)

Layout: unchanged — the tray already stacks counter, verbs, and the conveyor strip,
and `conveyorWrap` already spans the full tray width with the tap button centered.
"Full-width banner" is a responsibility change, not a layout change.

Four feedback channels, all drawn on the existing conveyor canvas (one rAF loop):

| Channel | Source | Visual |
|---|---|---|
| Taps | `sfx: tap` (existing drain) | ripple ring + spark burst at the button center |
| Powerups | `sfx: buy` (all buy kinds) | a gold shimmer sweep across the strip |
| Passive income | existing `credit()` batches | inbound sprites, now with glow + sparkle trail |
| Scale | live rate (passed per credit) | intensity ramp scales sprite size, glow, trail density, and motif scroll |

The renderer keeps its contract: it reads state/sfx and draws; it computes no economy
numbers. The rate that drives the ramp is `effectiveRatePerSec` already computed by
render.js for the readout — passed into the conveyor as a plain number.

## 4. `vfx.juice` (all Workshop-tunable, defaults ≈ today's feel)

```js
juice: {
  tapPop:    { scale: 1.12, ms: 110 },            // button scale pop per tap
  tapGlow:   { size: 18, alpha: 0.5, ms: 260 },   // button glow pulse per tap (glow color = palette --glow)
  tapSparks: { count: 6, size: 2.2, spreadPx: 34, lifeMs: 420 },
  inbound:   { glowSize: 10, glowAlpha: 0.35, trailPerS: 14, trailLife: 500 },
  landSparks:{ count: 5, size: 2, lifeMs: 380 },
  buySweep:  { alpha: 0.22, ms: 700 },            // gold shimmer sweep on any purchase
  ramp:      { rateLo: 10, rateHi: 1e9, sizeHi: 1.6, glowHi: 1.8, trailHi: 2.5, scrollHi: 3 },
}
```

The ramp maps `log10(rate)` linearly between `rateLo` → factor 1 and `rateHi` → the
`*Hi` multipliers (clamped; rate ≤ 0 → 1). Pure function `rampFactor(rate, lo, hi, max)`
in a new `js/ui/juice.js` module — exported, unit-tested. juice.js also owns the
sparkle/ripple/sweep particle pools (spawn/step/draw helpers taking the 2d context),
so conveyor.js composes rather than balloons.

Zero values disable a channel cleanly (count 0, alpha 0, ms > 0 guards). The panel's
existing number rule (reject ≤ 0 when default > 0) must not block zeros here: juice
knobs use range sliders with explicit min/max, not the knobRows path.

Tap pop/glow apply to `.toothBtn` via CSS custom properties (`--tapPopScale`,
`--tapPopMs`, `--tapGlowSize`, `--tapGlowAlpha`, `--tapGlowMs`) set from vfx at boot
and on Workshop edits; the press class already exists, a `glowing` class pulses a
box-shadow keyed to those properties.

## 5. The Workshop tab

First tab in the dev panel (order: Workshop · Script · Balance · Names · VFX · State
· Pacing). While the Workshop tab is active the panel adds `devPanel--drawer`
(`inset: 0 0 45% 0` top drawer + `border-bottom`), so the tray and banner stay
visible and live underneath. Leaving the tab or closing the panel removes the class.

Contents, in order:

1. **Preview bar** — buttons that fire real feedback without playing:
   - `tap` — calls the game's tap feedback path (button pop + sparks + ripple) via a
     `ctx.ui` hook (`ui.tapBtn` press class + conveyor's tap channel directly);
   - `buy` — plays the buy sweep;
   - `flow: trickle / busy / storm` — three buttons that feed the conveyor synthetic
     `credit()` streams for 5 s at rates `1e2 / 1e6 / 1e12` teeth/s so the ramp's whole
     range is visible without a late-game save.
2. **Slider groups** — one `h3` group per `vfx.juice` block (tap pop, tap glow, tap
   sparks, inbound, landing, buy sweep, scale ramp). Each row: label, range slider
   (sensible min/max/step per knob, hardcoded in a `KNOBS` table in the tab), live
   numeric readout, default note, reset. Edits write through to `ctx.vfx.juice.*`
   AND the `tf-ov-vfx` override layer (same setPath/deletePath helpers), so the
   values survive reload exactly like VFX-tab edits.
3. **Save bar**:
   - **`save to project`** — POSTs the current vfx override layer to
     `/api/save-vfx`. Success → "saved to js/config/tuned.js"; the button then
     offers `clear local overrides` (they're now redundant — tuned.js carries them).
   - **`release`** — POSTs to `/api/release`. Shows the server's step-by-step result
     (tests → commit → push). Disabled until a save has succeeded this session.
   - Both buttons detect a non-API server (python http.server returns 501/404) and
     show "start the workshop server: `node scripts/workshop-server.js`".

## 6. `js/config/tuned.js` and the merge order

A checked-in, machine-written override layer:

```js
// Written by the Workshop (scripts/workshop-server.js). Do not hand-edit;
// tune in the Workshop tab and press "save to project".
export const TUNED = {};
```

`buildVfx(overrides)` becomes `merge(merge(VFX_DEFAULTS, TUNED), overrides)` —
project-tuned values sit between code defaults and the local session layer. vfx.js
imports TUNED from './tuned.js'. `test/config.test.js` gains: tuned.js imports, TUNED
is a plain object, and `buildVfx()` still yields every VFX_DEFAULTS key (merge never
drops or invents keys, so a stale tuned key is ignored — assert that too with a
synthetic unknown key).

The Workshop saves the **vfx** layer only. The dev panel's VFX tab keeps working
unchanged: its "default" labels read VFX_DEFAULTS, so a tuned value shows as
"changed" there — accurate, since it differs from the code default.

## 7. `scripts/workshop-server.js`

Node built-ins only (`http`, `fs`, `path`, `child_process`). Binds `127.0.0.1:8123`.

- **Static**: serves the repo root (index.html, js/, css/, assets/) with correct
  MIME for .html/.js/.css/.svg/.wav/.json; no directory listings; path-traversal
  guarded (resolved path must stay inside the repo root).
- **`POST /api/save-vfx`** — body `{ vfx: {...} }` (the override layer). Validates:
  JSON, plain object, ≤ 64 KB. Writes `js/config/tuned.js` as the exact template
  above with `TUNED = <JSON.stringify(vfx, null, 2)>`. Responds `{ ok: true }`.
- **`POST /api/release`** — steps, each reported in the JSON response
  `{ steps: [{name, ok, output}], ok }`, stopping at the first failure:
  1. `node --test test/*.test.js`
  2. `git add js/config/tuned.js`
  3. `git diff --cached --quiet` → if nothing staged, stop with "nothing to release"
  4. `git commit -m "Workshop: tune banner and tap juice"`
  5. `git push`
  Commands run with `execFile` (no shell), cwd = repo root. Only tuned.js is ever
  staged; other dirty files are untouched and do not block.
- Any other method on /api/* → 405; unknown /api path → 404 JSON.
- Factored for tests: `createWorkshopServer({ root, runner })` exported; the release
  step-runner is injectable so tests assert the exact command list without touching
  git (`test/workshop.test.js` uses a recording runner; the save endpoint is tested
  against a temp dir).

README: "Run" section gains `node scripts/workshop-server.js` as the dev-server
option that enables the Workshop's save/release buttons.

## 8. Testing

- `test/workshop.test.js`: batcher `pending()` regression; `rampFactor` math (below
  lo → 1, at hi → max, log-linear midpoint, rate 0/negative → 1, lo ≥ hi degenerate →
  1 below hi / max at-and-above); save endpoint writes valid ESM (import the written
  file from a temp dir and check TUNED round-trips); release runner sequence green
  path, failing-tests path (stops at step 1), nothing-staged path; path traversal
  rejected (GET /../ → 403/404).
- `test/config.test.js`: tuned.js merge-order assertions (§6).
- Existing 82 tests stay green. Juice drawing itself is browser-verified by the
  controller: particles, drawer mode, preview buttons, and the save endpoint
  end-to-end against the running workshop server. The release endpoint is verified
  by the recording-runner tests only — the first real push happens when Eugene
  presses the button.

## 9. Out of scope

- Workshop editing of balance/names/script (existing tabs already cover them).
- New sounds or sound tuners beyond the existing VFX sliders.
- Saving non-vfx layers to the project.
- Auth on the server (it binds loopback only).
