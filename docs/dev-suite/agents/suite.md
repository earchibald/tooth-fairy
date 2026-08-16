# Dev Suite

## Summary
The overview agent for the whole Dev Suite. One line per tab: Workshop
tunes juice/vfx sliders with live preview; Hoard previews stash tiers;
Script edits story beats/asides/whispers/notes; Balance tunes the
difficulty matrix; Names edits every player-visible label; VFX tunes the
rest of the visual/audio knobs; State grants resources and jumps engine
state; Pacing runs a headless bot playthrough report.

## Visual
A row of tab buttons across the top (Workshop, Hoard, Script, Balance,
Names, VFX, State, Pacing), a chat panel that toggles with backquote, and
the game itself always visible so changes are seen immediately.

## Files
js/dev/panel.js, js/dev/knob-ranges.js, js/dev/ovstore.js, js/config/constants.js, js/config/names.js, js/config/vfx.js, js/config/script.js

## Capabilities
Route a request to a per-tab agent when it names or clearly targets one
tab's knobs; otherwise answer here — orient the user, explain how
overrides work, or point at "copy all overrides". Overrides are a live
object merged with a localStorage diff over frozen defaults: only changed
keys persist. "Copy all overrides" copies that diff as JSON; paste it into
the matching `js/config/*.js` file's defaults to commit a tuning
permanently. Code changes, new features, and anything structural go to the
prompt package, not any dev-suite agent.

## Hotkeys
| Keys | Action |
| --- | --- |
| `[` / `]` | Cycle dev tabs |
| Shift+1..8 | Direct-select tab (Workshop, Hoard, Script, Balance, Names, VFX, State, Pacing) |
| Backquote | Toggle the chat (raise focuses input) |
| Esc | Dismiss the chat |
| Ctrl+ArrowLeft / Ctrl+ArrowRight | Switch chat tabs |
| Enter / Shift+Enter | Submit chat message / newline in chat |
| 1-5, A, R | Workshop preview keys — active only while the Workshop tab is shown |

Game hotkeys are disabled in the artifact.
