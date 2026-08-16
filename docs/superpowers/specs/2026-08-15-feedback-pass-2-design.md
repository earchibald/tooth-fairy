# Phase 7 — Feedback Pass 2 (press sound, the kit, log scroll, inflow styles, 7-c, click-only beats, job clarity, outline mosaic)

## Summary

| # | Feedback | Decision |
|---|---|---|
| 1 | "We need a sound for pressing story buttons" | Replace the near-inaudible beat-dismiss hum with a crisp soft press blip (`vfx.sound.press`), still on effect |
| 2 | "No way to see what we HAVE bought and what it gets us" | "the kit" section at the bottom of the roost: every owned upgrade, sky relic, loom level, springboard tier — name + effect line |
| 3 | "The log should scroll to bottom automatically" | Entering the log scrolls its panel to the bottom; new entries while the log is active keep it pinned |
| 4 | "Different collectors should have distinct inflow animations" | Five motion archetypes for inbound sprites (flyers, grounders, mayflies, river, paper), picked by each group's share of the live rate |
| 5 | "Advisory 7-c is very confusing. Spell it out with less drama" | Rewrite the a2-hush beat text: plain mechanics, ledger deadpan kept |
| 6 | "Story buttons should require actual click, not SPACE" | SPACE/Enter no longer dismiss a beat; while a beat card shows they are swallowed entirely |
| 7 | "Nightly jobs are extremely unclear" | Job cards get structured goal + live progress + pay lines; the board gets a one-line how-it-works subtitle |
| 8 | "SUPER BORING single-filling-tooth animation" | Replace the compact outline with a mosaic: 32/64 small teeth arranged inside one big tooth silhouette, filling bottom-up, one pop per fill |

Delegated execution (goal-set pattern, Phases 2–6). This spec records decisions
in place of interactive approval. No engine tick/save changes; one pure
additive helper in predicates.js (item 4). Version bumps to 0.8.0.

## 1. Story-button press sound (sound.js, vfx.js, main.js)

The existing `beatDismiss` sound (220→330 Hz sine, 320 ms, gain 0.035) reads
as a low hum and is easily missed. Replace `play.beat()`'s voice:

- New `play.press()`: two quick triangle blips — 520→660 Hz 45 ms, then
  740→880 Hz 55 ms delayed 0.05 s — gain `vfx.sound.press` (default 0.04).
  Reads as a soft page-turn tick: clearly audible, still "barely there."
- `drainSfx` case `beatDismiss` calls `play.press()` instead of `play.beat()`.
- `play.beat()` stays for dawn (its low register suits the phase turn).
- `vfx.sound` gains `press: 0.04`; the dev panel's sound knobs pick it up via
  the existing vfx.sound iteration (verify the Sound tab lists it).
- Sound stays on effect: it fires from the sfx queue on dismissal, not on
  hover or on refused input.

## 2. The kit (roost.js, names.js, css)

Owned upgrades and sky relics vanish from the roost when bought; nothing
shows what you own or what it does. Add a reference section at the bottom of
the roost panel:

- Header `names.ui.kitTitle: 'the kit — what you own'` styled like
  `.logNotesHead`.
- One compact row per owned thing, in this order:
  - loom, if `state.loom > 0`: `LULLABY LOOM lv N — hush +{hushPerLevel*N}`
  - each unit with `state.mults[unit] > 0`: springboard name +
    `×{1 << mults} apiece`
  - each owned upgrade (`state.upgrades[id]`): upgrade name + its
    `upgradeInfo[id]` effect line
  - each owned sky relic (`state.sky[id]`): relic name + its `skyInfo[id]`
    line, prefixed `★`
- Rows are text only (`.kitRow`: name in small caps accent, effect in dim
  ink). No buttons, no costs. Hidden entirely while nothing is owned.
- Update is signature-guarded on a composed ownership signature (loom level,
  mults values, upgrade flags, sky flags). Rebuild rows only when the
  signature changes.
- `upgradeInfo` and `skyInfo` move to module scope (they are currently
  closure-local per section) so the kit reuses the same strings — one
  source for every effect description.

## 3. Log autoscroll (log.js, render.js, tabs wiring)

- `createLog` returns `scrollToEnd()`: sets the log panel's `scrollTop` to
  `scrollHeight` (the panel is the scroll container).
- render.js's tabs `onShow` callback calls `log.scrollToEnd()` after the
  `openJournal` dispatch when entering the log (rAF-deferred once so layout
  of a freshly-unhidden panel settles first).
- While the log is active and its signature changes with new journal
  entries, `update` re-pins to the bottom only if it was already within
  40 px of the bottom (do not fight the player reading history).

## 4. Distinct inflow animations (conveyor.js, predicates.js, vfx.js)

Inbound sprites all fly the same straight glide today. Give each collector
family a motion archetype; which archetype launches follows the live rate
mix, so what you bought is what you see arriving.

- predicates.js gains a pure export `unitRateShares(state, cfg)`:
  returns `{ flyers, grounders, mayflies, river, paper }` — each family's
  fraction of the current continuous rate (unit rate × count × mult ×
  stun/loom factors already embodied in `baseRatePerSec` internals),
  normalized to sum 1 when any rate exists; all zeros when idle. Families:
  - flyers: scout, owl
  - grounders: mouse, bunny, phantom
  - mayflies: sprite
  - river: ferry, barge
  - paper: pact, ministry, starwrights
  Read-only helper: no tick, action, or save change.
- render.js passes shares each frame: `conveyor.setShares(unitRateShares(state, cfg))`.
- conveyor.js: on launching a sprite, pick an archetype by weighted random
  over the current shares (fallback `'flyers'` when all zero — e.g. a lump
  landing while stunned). The sprite stores `style`. Per-style motion,
  applied to the existing eased x-travel:
  - flyers: enters high (y offset −h·0.35 at start easing to the line) with
    a gentle 2-cycle bob
  - grounders: rides the ground line (y = line + toothPx·0.35) with small
    parabolic hops (4 hops per crossing)
  - mayflies: 1.4× speed (shorter effective inboundMs), sine wiggle ±5 px at
    6 cycles, denser trail (trailPerS ×2)
  - river: 1.5× size, 0.7× speed, no bob, a low ripple spawned at the
    midpoint of travel
  - paper: enters from the top drifting down with a ±10 px sway (2.5 cycles),
    0.85× speed
  - tap pulses, buy sweeps, and preview sprites are unchanged; preview
    sprites use the same live shares.
- The existing single-trajectory math moves into a `spritePos(s, t)` helper
  so each style is a small case, not a fork of the frame loop.
- Reduced motion: unchanged (no sprites at all).
- No new vfx knobs: the style constants above are shape, not tuning, and
  live in conveyor.js. The Workshop previews them through the existing
  rate/preview tools.

## 5. Advisory 7-c rewrite (script.js)

Replace the `a2-hush` beat text with (register stays `ledger`, response
stays `noted, ominously`):

> advisory 7-c, plain version. noise is how loud the crew works. hush is how
> much the night absorbs. when noise is higher than hush, the STIR meter
> climbs. at 100, a child wakes: belief −10, and your loudest crew hides for
> a while. TIPTOE halves noise for a bit. the loom raises hush. keep noise
> under hush and STIR falls on its own.

The topbar STIR sublabel (`noise N · hush M`) already shows the live values
the advisory now names. beatsSeen stores ids, so old saves render the new
text in the log — acceptable and desired.

## 6. Click-only story buttons (main.js)

- Delete the keydown branch that clicks `beat-response` on SPACE/Enter.
- While a beat card is showing (`.beatCard.show` present), SPACE and Enter
  are swallowed (`preventDefault`, return) so SPACE cannot fall through to
  `doTap` and Enter cannot re-trigger a focused button. All other keys keep
  working (tabs, dev panel).
- A beat response now requires a real click/tap on its button (or the
  browser's own focus+Enter on the button itself — native activation of a
  focused button is fine and unavoidable; the global shortcut is what goes).

## 7. Nightly jobs clarity (board.js, names.js, css)

Job cards currently show flavor prose with the requirement buried and no
progress. Restructure each card:

- Line 1 `.jobText` — the flavor prose, unchanged.
- Line 2 `.jobGoal` — the mechanical goal, derived from `c.type`:
  - gather: `goal: {n} teeth gathered tonight`
  - notes: `goal: read {n} notes tonight`
  - tiptoes: `goal: tiptoe {n} times tonight`
  - quiet: `goal: no wakes, all night (judged at dawn)`
  - calm: `goal: stir under {n} at dawn`
- Line 3 `.jobProgress` — live progress, updated every frame by targeted
  write (not a rebuild):
  - gather: `{nightStats.teeth}/{n}` (fmt'd)
  - notes: `{nightStats.notes}/{n}` · tiptoes: `{nightStats.tiptoes}/{n}`
  - quiet: `wakes tonight: {nightStats.wakes}` (0 shown in glow, >0 in wake red)
  - calm: `stir now: {round(state.stir)}`
  - done: the line reads `done ✓`
- Line 4 `.jobReward` — prefix `pays: ` (names.ui.pays: 'pays: '); burst
  reads `pays: {burstS}s of the flow, at once` (existing strings, prefixed).
- Below the title, a dim one-line subtitle (names.ui.boardHint):
  `pick one. it resolves by dawn. finished pays; a streak pays more.`
- Card rebuild still keyed on board/picked/done signature; the progress
  lines are cached targeted writes so per-frame cost stays flat.

## 8. Outline mosaic (mosaic.js new, stage.js, css, tests)

Replace the compact single-filling-tooth (sizes ≥ 32) with a mosaic: the
set's slots arranged inside one large tooth silhouette — teeth made of
teeth. Each automated or tapped fill lights one cell with a pop; the
completed picture is the completed set.

- New `js/ui/mosaic.js`, pure and node-testable:
  - Flattens `TOOTH_PATH`'s cubics to a polygon (same 8-cubic data as the
    icon rasterizer; 40 samples/curve) with an even-odd `inside(x, y)` test.
  - `mosaicPoints(n)`: returns exactly `n` `{x, y}` points in the 0–100
    tooth coordinate space, from a jittered-free rectangular grid whose
    density is chosen so at least `n` cells land inside the silhouette
    (shrink cell size until enough), then trimmed to `n` by dropping the
    points nearest the outline edge, and sorted bottom-up (y descending,
    ties left-to-right) so fills read as liquid rising.
  - Deterministic: same n → same points. Cached per n.
- stage.js `updateOutline`, sizes ≥ 32: render `.outlineRow.compact` as an
  `.outlineMosaic` container (fixed 120×120 px, relative) holding `size`
  small toothSVGs (each ~11 px wide, absolutely positioned at its mosaic
  point scaled to the container). Cell i: `tooth-fill mosaicCell on` when
  `i < filled`, else `tooth-outline mosaicCell` (faint). A newly-filled
  cell gets a `pop` animation (scale 1.6→1, ~260 ms) — track the previous
  filled count; on decrease or size change, rebuild without pops.
  The `filled/size` caption stays below.
- Mode transitions (rows ↔ mosaic) keep the existing `dataset.mode` guard;
  rebuilding the mosaic happens only on size change, not per fill.
- CSS: `.outlineMosaic` container, `.mosaicCell` (absolute, faint outline),
  `.mosaicCell.on` (glow fill), `@keyframes mosaicPop`. The old
  `.outlineBig`/`.outlineFillClip` rules and DOM go away.
- Tests (`test/mosaic.test.js`): mosaicPoints(32) and (64) return exact
  counts; every point inside the polygon; sorted bottom-up; deterministic
  across calls; n=1 and n=200 do not throw and return n points.

## Testing

- `node --test test/*.test.js` green; new mosaic suite as above.
- No engine test changes (`unitRateShares` gets a small predicates test:
  shares sum to ~1 with mixed units; all-zero when nothing owned).
- Browser verification (controller): press sound audible on beat dismissal;
  kit lists owned gear with effects; log lands scrolled to newest; forced
  rate mixes launch visibly distinct inbound styles; 7-c text reads plain;
  SPACE with a beat open does nothing, click dismisses; job cards show
  goal/progress/pays and progress moves; outline at 32/64 renders the
  mosaic and pops cells as it fills.

## Out of scope

- New sounds for anything but the story press.
- Engine/save-format changes; contract pool data changes.
- Per-unit (rather than per-family) inflow art; carrier glyph art.
- Startup images (still parked from Phase 6).
