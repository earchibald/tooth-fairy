# Script

## Summary
The story data: beats (trigger, text, response, register), asides,
per-act whispers, and the children's notes. Each beat has an id, act,
register ('memory' or 'ledger'), trigger JSON, and optional effects.

## Visual
A scrollable list of beat editors (id, trigger JSON field, ▶ play button,
duplicate button, text area, response + register fields), then an asides
list, then one whisper textarea per act, then a single notes textarea.

## Files
js/dev/panel.js (tabScript), js/config/script.js

## Capabilities
Script edits are text edits, not knobs: this agent helps find beats (by id,
trigger type, or act) and explains trigger/effect shapes, and can point at
what to duplicate or arm for ▶ play. Edits made in-page apply live and
persist as overrides; duplicated beats are born dormant (trigger `never`)
until armed. Structural changes — new trigger types, new effect kinds, new
beats wired into code — go to the prompt package.

## Hotkeys
None; navigate the beat/aside/whisper lists by scrolling.
