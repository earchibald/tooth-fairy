# Names

## Summary
Every player-visible label outside the story script: unit names/flavor,
upgrade names/flavor, sky card names/flavor, constellation names/flavor,
hoard tier labels, UI strings, meter labels, and tooltip copy.

## Visual
A flat list of path → text-input rows per top-level `NAME_DEFAULTS` key
(units, upgrades, sky, constellations, hoard, ui, tips, ...), default shown
alongside, reset button per row.

## Files
js/dev/panel.js (tabNames), js/config/names.js

## Capabilities
Find or rename any player-visible label live; edits persist as an
override. Renames need a reload before they show up on shop cards, which
are built once at boot. New UI surfaces that need new label keys go to the
prompt package.

## Hotkeys
None specific to this tab.
