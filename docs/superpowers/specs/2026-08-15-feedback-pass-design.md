# Phase 6 — Feedback Pass (jars, tab discipline, notes, stage hoard, layout, iOS icon)

## Summary

| # | Feedback | Decision |
|---|---|---|
| 1 | "Jars are clearly batteries" | Redraw `paintJar`: curved glass body, overhanging flat lid, teeth drawn as stacked pebbles — no charge-bar slab, no nub |
| 2 | Arrow keys should switch tabs | `ArrowLeft`/`ArrowRight` join the existing `[`/`]` handlers in main.js |
| 3 | "We keep switching tabs out from under me" | The beat yank in render.js fires every frame while a beat is queued; make it fire once per new beat. A story beat still pulls to tonight — once |
| 4 | "Notes should remain available — a button in the log tab?" | The log tab gets a READ A NOTE button and an archive of every note already read |
| 5 | "Lines of teeth are repetitive; the WHOLE POINT was to update the main display" | The hoard scene draws large on the tonight stage (backdrop canvas), and the outline row collapses to one big filling tooth at sizes ≥ 32 |
| 6 | Tab buttons should sit just above the tooth count | Move the tab bar between the panels and the tray; active indicator flips to the top edge |
| 7 | "The moon button just goes to the log — useless" | Remove the ☾ button; entering the log tab dispatches `openJournal` instead |
| 8 | iOS Home Screen icon | `assets/icon-180.png` + `apple-touch-icon` link and web-app meta in index.html |

Delegated execution (goal-set pattern, Phases 2–5). This spec records decisions
in place of interactive approval. Engine untouched except nothing — no engine
changes at all; renderer, main.js key handling, names, vfx defaults, CSS,
index.html.

## 1. Jars (hoard.js `paintJar`)

The old painter was a stroked rectangle with a solid cap — a battery. The new
jar:

- Glass body: stroke-only path. Mouth half-width `px*0.30`, belly half-width
  `px*0.46`, height `px*1.05`. Shoulders bow out from the mouth via bezier
  curves; the base tucks in slightly. No straight vertical rectangle sides.
- Lid: a flat cap that OVERHANGS the mouth (`neck*1.25` half-width, `px*0.10`
  tall) with a narrower raised band above it. Wider-than-body cap reads as a
  screw lid, not a battery terminal.
- Contents: teeth as stacked pebble dots (like the sack's peek teeth) filling
  from the base up to `level`, in `colors.glow`. Never a solid fill rect.
- Glass shine: one short stroke arc on the upper-left shoulder at reduced
  alpha.

Existing drawHoard tests (every tier paints ≥1 fill and ≥1 stroke; zero and
Infinity safe) must stay green — the jar keeps both fill and stroke calls.

## 2. Arrow-key tab navigation (main.js)

- In the global keydown switch, add `ArrowLeft` → `cycle(-1)` and
  `ArrowRight` → `cycle(1)`, both with `preventDefault()` (stops horizontal
  scroll nudging). The existing guards already cover form fields, overlays,
  and modifier keys; `cycle()` already skips hidden tabs.

## 3. Tab yank discipline (render.js)

- Replace the per-frame `if (state.beatQueue.length && tabs.active() !== 'tonight') tabs.show('tonight')`
  with a signature-guarded yank keyed on the head beat id:
  `set('beatYank', state.beatQueue[0] || '', (id) => { if (id) tabs.show('tonight'); })`.
- Effect: a NEW story beat pulls you to tonight once. While it waits for a
  response you may browse other tabs freely and come back. No other code path
  switches tabs without user input (audited: journal key, cycle, depart —
  depart's pull to tonight on town change is a story-scale event and stays).

## 4. Notes in the log tab (log.js, render.js, names.js)

- `createLog(panel, { names, dispatch })` gains a header row:
  - READ A NOTE button (`data-testid="log-read-note"`, label
    `names.verbs.readNote + ' (' + state.notes + ')'`), visible when
    `state.notesShown && state.act >= 2`, disabled when `state.notes < 1`.
    Click dispatches `readNote`. Same gating as the engine action.
- Below it, the notes archive (`names.ui.notesKept: 'notes kept'` header):
  every note already read, most recent first. Note k (0-based read order) has
  text `script.notes[k % script.notes.length]`; show the last
  `min(state.notesRead, script.notes.length)` reads (the pool recycles —
  older duplicates add nothing). Styled like the gold `.aside.note` register.
- The log update signature adds `state.notes`, `state.notesRead`,
  `state.notesShown`, `state.act`.
- The topbar notes chip stays (glanceable count from any tab).

## 5. The stage hoard + outline compaction (stage.js, hoard.js, vfx.js, panel.js)

The main display finally shows the wealth:

- `drawHoard(ctx2d, opts)` gains optional overrides: `opts.scale` (multiplies
  every tier's `px`; default 1), `opts.centerGapPx` (default
  `vfx.hoard.centerGapPx`), `opts.alpha` (default `vfx.hoard.alpha`). Existing
  callers unchanged.
- stage.js adds a `canvas.stageHoard` as the stage's first child: absolute,
  full width, bottom-anchored, height 42% of the stage, `pointer-events:
  none`, behind asides/beats/whispers (z below them, above background). It
  draws the current tier scene at `vfx.hoard.stageScale` (default 2.4) and
  `vfx.hoard.stageAlpha` (default 0.33), center gap 0 — the scene owns the
  whole ground line; there is no button to clear on the stage.
- Static drawing only; redraw when a signature changes:
  `hoardSig(count) : act : w : h : ended`. Hidden (cleared) when `state.ended`
  — the ending sky replaces it. DPR-aware like the sky canvas. No rAF loop,
  no glints — reduced-motion safe by construction.
- Outline compaction: `updateOutline` keeps today's rows for sizes < 32
  (1–16 read as a charming row). At `size >= 32` it renders a compact form
  instead: one large tooth (68px) — outline tooth underneath, filled tooth
  overlaid with `clip-path: inset((1 - filled/size)*100% 0 0 0)` so it fills
  bottom-up — plus a `filled/size` caption (`.outlineCount`). The signature
  guard keeps DOM writes cheap; the compact form replaces the row children
  entirely when crossing the threshold.
- Hoard dev tab: `stageScale` (0.5–5, step 0.1) and `stageAlpha` (0–1, step
  0.01) join the shared knobs. The stage canvas re-reads vfx per redraw; a
  slider change triggers redraw via the existing preview path (scrub) or the
  next sig change — plus stage exposes `redrawHoard()` and the panel's
  onChange calls it through ctx (`ctx.ui.stage.redrawHoard()`).
- The banner hoard, motif strip, and glints are untouched.

## 6. Tab bar placement (render.js, css)

- DOM order becomes: topbar · panels (tonight/log/roost/sky) · tab bar ·
  tray. The tab bar sits directly above the tooth count.
- CSS: `.tabBtn` indicator moves to `border-top`; active state
  `border-top-color: var(--accent)`. The bar gets a faint top hairline
  (`border-top: 1px solid #ffffff0a` on `.tabBar`) to seat it against the
  panels. The dot stays top-right of the button.

## 7. Moon button removal (render.js, tabs.js, main.js)

- Delete the ☾ `journalBtn` from the topbar entirely.
- `createTabs(app, names, onShow)`: `show(id)` invokes `onShow(id, prev)`
  when the active tab actually changes. render.js passes a callback that
  dispatches `openJournal` when `id === 'log'` (any entry into the log —
  click, arrow key, `j` — counts as a journal visit; `state.journalOpens`
  keeps meaning).
- main.js `j` handler becomes `ui.tabs.show('log')` only (no double
  dispatch).
- The `set('journal', …)` visibility line in render.js is deleted.

## 8. iOS Home Screen icon (index.html, assets/)

- `assets/icon-180.png`: 180×180, the tooth glyph (`#a8c0ea`) centered on the
  night background (`#10131c`), generated once by the controller from the
  existing tooth path (browser-rasterized), committed as a binary asset.
- index.html head additions (relative paths — the site deploys under a
  project subpath):
  - `<link rel="apple-touch-icon" href="assets/icon-180.png">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
  - `<meta name="apple-mobile-web-app-title" content="tooth fairy">`
- Startup images (`apple-touch-startup-image`): deliberately skipped. iOS
  honors them only with an exact-size image per device class (a dozen+ PNGs,
  frequently ignored since iOS 13). The dark `theme-color` + instant load
  covers the launch moment. Recorded here as the decision.

## Testing

- `test/hoard.test.js`: drawHoard scale/gap/alpha override tests (scale
  multiplies slot spread; alpha override lands in globalAlpha; existing
  suite green). Jar still emits fill + stroke.
- No engine tests change (no engine changes).
- Browser verification (controller): jars read as jars at 1e2–1e4 preview;
  arrow keys cycle; beat yank fires once then allows browsing; log note
  button reads a note and archives it; stage scene present per tier and
  absent when ended; tab bar above the count; no ☾ button; `j` still lands
  in the log; icon link resolves 200.

## Out of scope

- Light mode (the ☾ misread). The game is a night piece.
- Conveyor motif changes, sounds, engine/save changes, startup images.
