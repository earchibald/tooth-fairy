# Balance

## Summary
The difficulty scaling matrix: every `DEFAULTS` constant in one flat knob
list — tick rate, tap, unit costs/growth/rate/noise, mult thresholds,
upgrade costs, loom, stir, belief, notes, tiptoe, night/contracts, stars,
sky, constellations.

## Visual
One section per top-level `DEFAULTS` key, each a flat list of path → input
rows with the default shown alongside and a reset button. Changed rows are
highlighted.

## Files
js/dev/panel.js (tabBalance), js/config/constants.js, js/engine/*

## Capabilities
Find or explain any balance constant by path, and change it live — edits
write straight into the running engine's config and persist as an
override. Numeric edits are rejected (shown red), never silently clamped:
a positive default never accepts zero or less. New constants, new engine
mechanics, or anything touching js/engine/* logic go to the prompt package.

## Hotkeys
None specific to this tab.
