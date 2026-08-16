# Dev Suite SDLC

The Dev Suite ships two ways: the localhost overlay panel (unchanged) and a
Claude Artifact (dev panel left, bundled game right, chat agents floating).
This document is the process that keeps the artifact and its agents true.

## The invariant

The chat agents know the CONTRACT, never the code: generated knob packs
(`js/embed/packs.gen.js`) plus authored tab notes (`docs/dev-suite/agents/`).
Two mechanisms enforce it:

1. `test/packs.test.js` regenerates the packs and diffs — a config change
   that moves the contract fails `npm test` until packs are regenerated.
2. The bundler (`scripts/build-artifact.js`) asserts its own invariants
   (named exports only, no live bindings, literal dynamic imports) and
   refuses to emit a silently-wrong bundle.

## Release loop

| Step | Command |
|---|---|
| 1. Implement + test | `npm test` |
| 2. Tab/knob semantics changed? | edit `docs/dev-suite/agents/<tab>.md` |
| 3. Regenerate packs | `node scripts/gen-agent-packs.js` |
| 4. Build the artifact | `node scripts/build-artifact.js` |
| 5. Verify locally | open `dist/dev-suite-local.html` |
| 6. Republish | ask Claude Code to republish `dist/dev-suite.html` to the existing artifact (same URL, favicon 🦷, capabilities `{downloads: true}`) |

Artifact URL: (recorded at first publish)

## Adding a dev tab

1. Add the tab function in `js/dev/panel.js` and register it in the tabs map.
2. Author `docs/dev-suite/agents/<tab>.md` (Summary / Visual / Files /
   Capabilities / Hotkeys — all five sections; the generator requires them).
3. If the tab owns ranged sliders, put ranges in `js/dev/knob-ranges.js`.
4. Steps 3–6 of the release loop.

## Self-improvement requests

The chat agent turns code-change requests into prompt packages that embed
this loop (the package footer lists steps 1–4 and the republish note), so a
request executed by local Claude Code lands back in the artifact with the
agents' knowledge already regenerated. Approval stays with the human at two
gates: accepting the package into a Claude Code session, and the republish.
