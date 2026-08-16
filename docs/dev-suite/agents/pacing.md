# Pacing

## Summary
Runs the real engine headless, driven by a competent-not-optimal bot, using
the current live-tuned balance and script — not a model, the same tick the
game runs. Reports act timing, reveal cadence, story beats hit, dead time,
and unreached beats.

## Visual
A seed number field, a taps-per-tick preset (casual / fast / idle), and a
run button. The report below shows a summary line, a reveal-cadence table
(gaps under 3s flagged), a story-beats table, and any unreached beats.

## Files
js/dev/panel.js (tabPacing), js/dev/bot.js

## Capabilities
Run a full headless playthrough against live balance/script tuning and
read back its pacing report to spot dead time, crowded reveals, or beats
the bot never reaches. It does not change any knob itself — it is a
readout. Bot policy or engine changes go to the prompt package.

## Hotkeys
None specific to this tab.
