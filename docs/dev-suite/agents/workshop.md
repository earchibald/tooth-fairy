# Workshop

## Summary
The juice studio. Live sliders for tap pop, glow, sparks, incoming-teeth
trails, landing sparks, powerup sweep, and the scale ramp. Preview buttons
fire the real feedback paths without playing.

## Visual
Sticky preview bar on top (tap / powerup / three flow rates / sequence /
repeat toggle), then slider groups. The game stays visible on the right;
every slider change auto-fires its group's preview.

## Files
js/dev/panel.js (tabWorkshop), js/dev/knob-ranges.js, js/config/vfx.js, js/ui/juice.js, js/ui/conveyor.js

## Capabilities
Tune any vfx knob live; preview effects; overrides persist and export via
"copy all overrides". Save-to-project and release need the local workshop
server and do not work inside the artifact — route code/commit requests to
the prompt package instead.

## Hotkeys
1-5 preview actions, A sequence, R repeat — active while this tab is shown.
