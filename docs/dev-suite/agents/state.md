# State

## Summary
Direct engine control: grant teeth/stars, drag belief/stir meters, jump to
an act (including 2.5), skip to dawn/dusk, advance time, simulate 8h
offline, reload at a speed multiplier, and a live JSON view of state.

## Visual
Grant buttons (+teeth amounts, +10★, start autopilot), belief/stir range
sliders, act-jump buttons, dawn/dusk skip buttons, time-advance and
offline-simulate buttons, speed-reload buttons, and a live-refreshing JSON
`<pre>` of the current state snapshot.

## Files
js/dev/panel.js (tabState), js/engine/actions.js (dev actions)

## Capabilities
Grant resources, force meters, jump acts, skip to dawn/dusk, advance time,
and simulate offline play — all live engine dispatches. Speed reload does
not work inside the artifact (no URL params to reload against); everything
else on this tab works normally. New dev actions go to the prompt package.

## Hotkeys
None specific to this tab.
