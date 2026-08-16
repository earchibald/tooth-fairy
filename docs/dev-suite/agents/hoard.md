# Hoard

## Summary
Tier-by-tier stash preview: sack, jars, chests, piles, warehouses, silos,
mountains, moons. Pick a tier to preview it on the banner, scrub the tooth
count within it, and tune its shape knobs alongside whole-hoard knobs.

## Visual
A strip of tier buttons across the top, then a scrub slider (with an "∞"
button on the last tier and a "live" button to return to the real count),
then "this tier" sliders (units, px) and "whole hoard" sliders below.

## Files
js/dev/panel.js (tabHoard), js/dev/knob-ranges.js, js/config/vfx.js (hoard), js/ui/hoard.js, js/ui/stage.js

## Capabilities
Preview any tier at any count and tune its `units`/`px` shape, plus the
shared hoard knobs (alpha, glintPerS, centerGapPx, stageScale, stageAlpha).
Preview never touches game state. Save-to-project and release live on the
Workshop tab and need the local workshop server — not available in the
artifact; route code/commit requests to the prompt package.

## Hotkeys
None specific to this tab; the panel's `[`/`]` and Shift+1..8 tab-switch
hotkeys still apply.
