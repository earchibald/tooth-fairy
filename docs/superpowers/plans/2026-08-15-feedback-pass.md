# Feedback Pass (Phase 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the seven feedback items: jar redesign, arrow-key tabs, yank-once tab discipline, notes in the log, the hoard on the main stage + outline compaction, tab bar above the counter, ☾ removal, iOS icon.

**Architecture:** Renderer-only changes (hoard painters, stage, log, tabs, main.js keys, CSS, index.html). No engine or save-format changes. The stage gains a static hoard backdrop canvas reusing `drawHoard` with new scale/gap/alpha overrides.

**Tech Stack:** Vanilla ESM, no deps, `node --test`.

## Global Constraints

- No `innerHTML` / `outerHTML` / `insertAdjacentHTML` — a repo hook rejects them. DOM via `createElement` / the local `el()` helpers.
- Straight-quote string delimiters only (`'` / `"` / backtick). Curly quotes may appear INSIDE strings as content.
- Run tests as `node --test test/*.test.js` (a bare `test/` dir fails on Node 26).
- No engine changes; no save-format changes.
- Spec: `docs/superpowers/specs/2026-08-15-feedback-pass-design.md`.
- Comments state constraints the code can't show; match the codebase's comment voice.

---

### Task 1: Jar painter + drawHoard overrides

**Files:**
- Modify: `js/ui/hoard.js` (paintJar, drawHoard signature)
- Test: `test/hoard.test.js`

**Interfaces:**
- Produces: `drawHoard(ctx2d, { w, h, count, vfx, colors, scale = 1, centerGapPx, alpha })` — `scale` multiplies the tier's `px` (and the moons ridge), `centerGapPx`/`alpha` default to `vfx.hoard.centerGapPx`/`vfx.hoard.alpha`. Existing callers (no new opts) behave identically. Task 4 relies on these exact option names.

- [ ] **Step 1: Add `bezierCurveTo` to the test stub and write failing override tests**

In `test/hoard.test.js`, add to the object returned by `stubCtx()` (beside `quadraticCurveTo`):

```js
    bezierCurveTo: rec('bezierCurveTo'),
```

Append at the end of the file:

```js
test('drawHoard: alpha, scale, and centerGapPx overrides apply', () => {
  const c = stubCtx();
  const alphas = [];
  Object.defineProperty(c, 'globalAlpha', {
    get: () => alphas[alphas.length - 1] ?? 1,
    set: (v) => alphas.push(v),
  });
  drawHoard(c, {
    w: 800, h: 200, count: 500, vfx: VFX, colors: COLORS,
    alpha: 0.9, scale: 2.4, centerGapPx: 0,
  });
  assert.ok(alphas.includes(0.9), 'override alpha never set');
  assert.ok(c.calls.length > 0, 'nothing painted');
});

test('drawHoard: overrides also cover the moons tier', () => {
  const c = stubCtx();
  drawHoard(c, {
    w: 800, h: 300, count: 1e19, vfx: VFX, colors: COLORS,
    alpha: 0.3, scale: 2, centerGapPx: 0,
  });
  assert.ok(c.calls.length > 0);
  assert.equal(c.calls.filter((n) => n === 'save').length,
    c.calls.filter((n) => n === 'restore').length);
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node --test test/hoard.test.js`
Expected: the two new tests FAIL (options ignored / alpha 0.9 never set); all others PASS.

- [ ] **Step 3: Replace `paintJar` and extend `drawHoard`**

Replace the whole `paintJar` function in `js/ui/hoard.js` with:

```js
function paintJar(c, x, g, px, level, colors) {
  const neck = px * 0.30;
  const belly = px * 0.46;
  const h2 = px * 1.05;
  const mouthY = g - h2;
  // Glass body: shoulders bow out from the mouth, the base tucks in — no
  // straight-sided rectangle (it read as a battery).
  c.strokeStyle = colors.accent;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x - neck, mouthY);
  c.bezierCurveTo(x - belly, mouthY + px * 0.16, x - belly, g - px * 0.18,
    x - belly * 0.8, g);
  c.lineTo(x + belly * 0.8, g);
  c.bezierCurveTo(x + belly, g - px * 0.18, x + belly, mouthY + px * 0.16,
    x + neck, mouthY);
  c.stroke();
  // Screw lid: a flat cap OVERHANGING the mouth, a narrower band above it —
  // wider than the neck so it can't read as a battery terminal.
  c.fillStyle = colors.accent;
  c.fillRect(x - neck * 1.25, mouthY - px * 0.10, neck * 2.5, px * 0.10);
  c.fillRect(x - neck * 0.9, mouthY - px * 0.16, neck * 1.8, px * 0.06);
  // Contents: teeth as stacked pebbles up to the fill line, never a solid
  // charge-bar slab.
  if (level > 0) {
    c.fillStyle = colors.glow;
    const top = g - (h2 - px * 0.18) * level;
    const rowW = belly * 0.62;
    for (let yy = g - px * 0.10; yy >= top; yy -= px * 0.13) {
      for (let i = 0; i < 3; i++) {
        const jx = x - rowW + rowW * i +
          ((((i * 7 + Math.round(yy)) % 3) - 1) * px * 0.04);
        c.beginPath();
        c.arc(jx, yy, px * 0.055, 0, 7);
        c.fill();
      }
    }
  }
  // Glass shine on the upper-left shoulder.
  c.strokeStyle = colors.glow;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x - belly * 0.62, mouthY + px * 0.30);
  c.quadraticCurveTo(x - belly * 0.72, mouthY + px * 0.52,
    x - belly * 0.66, g - px * 0.30);
  c.stroke();
}
```

Replace `drawHoard` with (same painters table and structure; only the option
plumbing and `px`/gap/alpha sources change — every `def.px` becomes the scaled
`px`, `hv.centerGapPx` becomes `gap`, `hv.alpha` becomes `a`):

```js
export function drawHoard(ctx2d, { w, h, count, vfx, colors, scale = 1, centerGapPx, alpha }) {
  const hv = vfx.hoard;
  const t = tierFor(count, hv.tiers);
  if (!t) return;
  const def = hv.tiers[t.index];
  const px = def.px * scale;
  const gap = centerGapPx ?? hv.centerGapPx;
  const a = alpha ?? hv.alpha;
  const { shown, fill } = shapesFor(t.progress, def.units);
  const xs = slotXs(w, gap, def.units, px);
  const g = h - 2;
  ctx2d.save();
  ctx2d.globalAlpha = a;
  if (t.id === 'moons') {
    ctx2d.globalAlpha = a * 0.5;
    const ridge = slotXs(w, gap, 5, 40 * scale);
    for (const x of ridge) paintMountain(ctx2d, x, g, 40 * scale, 1, colors);
    ctx2d.globalAlpha = a;
    for (let i = 0; i < shown; i++) {
      const newest = i === shown - 1;
      const skyY = moonSkyY(h, i, px);
      const y = newest ? skyY + (g - skyY) * (1 - fill) : skyY;
      paintMoon(ctx2d, xs[i], y, px, a, colors);
    }
    ctx2d.restore();
    return;
  }
  const painters = {
    sack: paintSack, jars: paintJar, chests: paintChest, piles: paintPile,
    warehouses: paintWarehouse, silos: paintSilo, mountains: paintMountain,
  };
  const paint = painters[t.id];
  for (let i = 0; i < shown; i++) {
    const level = i === shown - 1 ? fill : 1;
    paint(ctx2d, xs[i], g, px, level, colors);
  }
  ctx2d.restore();
}
```

Update the module doc comment above `drawHoard` if it mentions the old
signature. Do NOT change `tierFor`, `shapesFor`, `slotXs`, `hoardSig`,
`glintPoint`, or the other painters.

- [ ] **Step 4: Run the full suite**

Run: `node --test test/*.test.js`
Expected: all PASS (existing drawHoard tests still pass — jar keeps fill + stroke calls; default-option behavior identical).

- [ ] **Step 5: Commit**

```bash
git add js/ui/hoard.js test/hoard.test.js
git commit -m "Jars that read as jars; drawHoard scale/gap/alpha overrides"
```

---

### Task 2: Tab discipline — yank once, arrow keys, ☾ removal, bar above the counter

**Files:**
- Modify: `js/ui/tabs.js`, `js/ui/render.js`, `js/main.js`, `css/main.css`

**Interfaces:**
- Produces: `createTabs(app, names, onShow)` where `onShow(id, prev)` fires only when the active tab actually changes. render.js uses it to dispatch `openJournal` on entry into the log.
- Consumes: nothing from other tasks.

- [ ] **Step 1: tabs.js — onShow callback**

Change the signature to `export function createTabs(app, names, onShow)` and `show` to:

```js
  function show(id) {
    const prev = current;
    current = id;
    for (const key of Object.keys(panels)) {
      panels[key].hidden = key !== id;
      buttons[key].btn.classList.toggle('active', key === id);
    }
    if (id !== 'tonight') buttons[id].dot.hidden = true;
    if (onShow && prev !== id) onShow(id, prev);
  }
```

(The construction-time `show('tonight')` has `prev === id`, so no callback fires at boot.)

- [ ] **Step 2: render.js — journal via tab entry, ☾ gone, bar relocated, yank once**

1. Delete the `journalBtn` block (`const journalBtn = el('button', 'iconbtn', '☾');` through `journalBtn.hidden = true;`) and remove `journalBtn` from `topbar.append(...)`:

```js
  topbar.append(beliefMeter, stirMeter, starChip, spacer, notesChip, settingsBtn);
```

2. Create tabs with the callback, and move the bar below the panels — the tab
buttons sit just above the tooth count:

```js
  // ---- tabs (the bar sits below the panels, just above the counter) ----
  const tabs = createTabs(app, names, (id) => {
    if (id === 'log') dispatch('openJournal');
  });
  attachTip(tabs.bar.children[0], names.tips.tabTonight);
  attachTip(tabs.bar.children[1], names.tips.tabLog);
  attachTip(tabs.bar.children[2], names.tips.tabRoost);
  attachTip(tabs.bar.children[3], names.tips.tabSky);
  app.appendChild(tabs.panels.tonight);
  app.appendChild(tabs.panels.log);
  app.appendChild(tabs.panels.roost);
  app.appendChild(tabs.panels.sky);
  app.appendChild(tabs.bar);
```

3. Delete the journalBtn click wiring next to `createOverlays`:

```js
  const overlays = createOverlays(app, ctx);
  settingsBtn.addEventListener('click', () => overlays.openSettings());
```

4. In `update(state)`, replace the first line
`if (state.beatQueue.length && tabs.active() !== 'tonight') tabs.show('tonight');`
with a signature-guarded yank — a NEW story beat pulls to tonight once, then
the player may browse freely:

```js
    set('beatYank', state.beatQueue[0] || '', (id) => {
      if (id) tabs.show('tonight');
    });
```

5. Delete the line `set('journal', state.beatsSeen.length > 3, (v) => { journalBtn.hidden = !v; });`.

- [ ] **Step 3: main.js — arrow keys; `j` without double dispatch**

In the keydown switch, change the `j` case and add arrows beside `[` / `]`:

```js
    case 'j': ui.tabs.show('log'); break;
    case 'Escape': ui.overlays.closeAll(); break;
    case '[': cycle(-1); break;
    case ']': cycle(1); break;
    case 'ArrowLeft': e.preventDefault(); cycle(-1); break;
    case 'ArrowRight': e.preventDefault(); cycle(1); break;
```

(`openJournal` now dispatches via the tabs onShow callback, so `j` must not
dispatch it again.)

- [ ] **Step 4: css/main.css — indicator flips to the top edge**

Replace the `.tabBar` / `.tabBtn` / `.tabBtn.active` rules with:

```css
.tabBar { display: flex; gap: 4px; padding: 0 14px; border-top: 1px solid #ffffff0a; }
.tabBtn {
  flex: 1; background: none; border: none; border-top: 2px solid transparent;
  color: var(--dim); font-size: 12px; letter-spacing: 0.1em; padding: 8px 0;
  cursor: pointer; position: relative;
}
.tabBtn.active { color: var(--ink); border-top-color: var(--accent); }
```

(`.tabDot` stays as is.)

- [ ] **Step 5: Run the suite**

Run: `node --test test/*.test.js`
Expected: all PASS (no unit coverage of these DOM paths; this is a regression gate).

- [ ] **Step 6: Commit**

```bash
git add js/ui/tabs.js js/ui/render.js js/main.js css/main.css
git commit -m "Tab discipline: yank once per beat, arrow-key nav, bar above the counter, moon button removed"
```

---

### Task 3: Notes live in the log

**Files:**
- Modify: `js/ui/log.js`, `js/ui/render.js` (one line), `js/config/names.js` (one line), `css/main.css`

**Interfaces:**
- Consumes: `dispatch('readNote')` (existing engine action; self-guards on notesShown/act/notes).
- Produces: log panel shows a READ A NOTE button (`data-testid="log-read-note"`) and an archive of read notes.

- [ ] **Step 1: names.js**

In `NAME_DEFAULTS.ui`, add after `trace: 'trace a star',`:

```js
    notesKept: 'notes kept',
```

- [ ] **Step 2: log.js**

Replace the whole file with:

```js
import { fmt } from '../engine/math.js';

export function createLog(panel, { names, dispatch }) {
  // Notes live here too: read the next one, and keep every one already read —
  // the stage aside is transient, the log remembers.
  const noteBar = document.createElement('div');
  noteBar.className = 'logNotes';
  const readBtn = document.createElement('button');
  readBtn.className = 'chip';
  readBtn.dataset.testid = 'log-read-note';
  readBtn.hidden = true;
  readBtn.addEventListener('click', () => dispatch('readNote'));
  noteBar.appendChild(readBtn);
  const noteList = document.createElement('div');
  noteList.className = 'logNoteList';
  const stamps = document.createElement('div');
  stamps.className = 'logStamps';
  const entries = document.createElement('div');
  entries.className = 'logEntries';
  panel.append(noteBar, noteList, stamps, entries);
  let sig = '';

  function update(state, script) {
    const next = state.beatsSeen.length + ':' + state.night + ':' +
      state.nightPhase + ':' + state.nightLedger.length + ':' +
      state.townLedger.length + ':' + state.town + ':' +
      state.notes + ':' + state.notesRead + ':' +
      (state.notesShown && state.act >= 2);
    if (next === sig) return;
    sig = next;
    const canRead = state.notesShown && state.act >= 2;
    readBtn.hidden = !canRead;
    if (canRead) {
      readBtn.textContent = names.verbs.readNote + ' (' + state.notes + ')';
      readBtn.disabled = state.notes < 1;
    }
    while (noteList.firstChild) noteList.removeChild(noteList.firstChild);
    const pool = script.notes;
    // Note k (read order) recycles through the pool; older repeats add nothing.
    const kept = Math.min(state.notesRead, pool.length);
    if (kept > 0) {
      const head = document.createElement('div');
      head.className = 'logNotesHead';
      head.textContent = names.ui.notesKept;
      noteList.appendChild(head);
      for (let k = state.notesRead - 1; k >= state.notesRead - kept; k--) {
        const row = document.createElement('div');
        row.className = 'logNote';
        row.textContent = pool[k % pool.length];
        noteList.appendChild(row);
      }
    }
    while (stamps.firstChild) stamps.removeChild(stamps.firstChild);
    for (const t of state.townLedger.slice().reverse()) {
      const row = document.createElement('div');
      row.className = 'stamp townStamp';
      row.textContent =
        `town ${t.town} — ${t.nights} nights · ${fmt(t.lifetime)} gathered · ${t.stars}★`;
      stamps.appendChild(row);
    }
    for (const st of state.nightLedger.slice().reverse()) {
      const row = document.createElement('div');
      row.className = 'stamp';
      row.textContent =
        `night ${st.night} · ${fmt(st.teeth)} teeth · wakes ${st.wakes}` +
        ` · contracts ${st.contractsDone}${st.sailed ? ' · sailed' : ''}`;
      stamps.appendChild(row);
    }
    while (entries.firstChild) entries.removeChild(entries.firstChild);
    for (const id of state.beatsSeen) {
      const beat = script.beats.find((b) => b.id === id);
      if (!beat || (!beat.text && !beat.response)) continue;
      const e = document.createElement('div');
      e.className = 'journalEntry' + (beat.register === 'ledger' ? ' ledger' : '');
      if (beat.text) {
        const t = document.createElement('div');
        t.className = 'jt';
        t.textContent = beat.text;
        e.appendChild(t);
      }
      const r = document.createElement('div');
      r.className = 'jr';
      r.textContent = beat.response;
      e.appendChild(r);
      entries.appendChild(e);
    }
    if (!entries.firstChild && !stamps.firstChild) {
      const empty = document.createElement('div');
      empty.className = 'jt';
      empty.textContent = '(nothing yet. get some teeth.)';
      entries.appendChild(empty);
    }
  }
  return { update };
}
```

- [ ] **Step 3: render.js**

Change the createLog call to pass dispatch:

```js
  const log = createLog(tabs.panels.log, { names, dispatch });
```

- [ ] **Step 4: css/main.css**

Add after the `.logEntries` rule:

```css
.logNotes { padding: 10px 14px 0; }
.logNoteList { padding: 4px 14px; }
.logNotesHead { font-size: 10px; letter-spacing: 0.12em; color: var(--dim);
  margin: 6px 0 2px; }
.logNote { color: var(--gold); font-style: italic; font-size: 13px;
  padding: 4px 0; border-bottom: 1px solid #ffffff0a; }
```

- [ ] **Step 5: Run the suite**

Run: `node --test test/*.test.js`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add js/ui/log.js js/ui/render.js js/config/names.js css/main.css
git commit -m "Notes live in the log: read button + kept-notes archive"
```

---

### Task 4: The hoard on the main stage + outline compaction

**Files:**
- Modify: `js/ui/stage.js`, `js/config/vfx.js`, `js/dev/panel.js`, `css/main.css`

**Interfaces:**
- Consumes: `drawHoard(ctx2d, { …, scale, centerGapPx, alpha })` and `hoardSig(count, tiers)` from Task 1.
- Produces: stage return object gains `redrawHoard()` and `setHoardPreview(countOrNull)`; the dev Hoard tab calls both through `ctx.ui.stage`.

- [ ] **Step 1: vfx.js — stage knobs**

In the `hoard` block, after `centerGapPx: 72,` add:

```js
    stageScale: 2.4,        // px multiplier for the stage backdrop scene
    stageAlpha: 0.33,       // backdrop opacity on the tonight stage
```

- [ ] **Step 2: stage.js — backdrop canvas**

Add to the imports: `import { drawHoard, hoardSig } from './hoard.js';`

At the top of `createStage`, immediately after `el.classList.add('stage');`
and BEFORE the asideLayer append (the canvas must be the first child):

```js
  // The hoard, big, on the main display: a static backdrop scene of the
  // current tier. Redraws only on a signature change — no animation loop.
  const hoardCanvas = document.createElement('canvas');
  hoardCanvas.className = 'stageHoard';
  el.appendChild(hoardCanvas);
  let hoardTeeth = 0;
  let hoardPreviewCount = null;
  let hoardEnded = false;
  let hoardAct = 0;
  let hoardSigLast = null;
  const hoardRo = new ResizeObserver(() => { hoardSigLast = null; drawStageHoard(); });
  hoardRo.observe(hoardCanvas);
  function drawStageHoard() {
    const w = hoardCanvas.clientWidth;
    const h = hoardCanvas.clientHeight;
    if (!w || !h) return;
    const count = hoardPreviewCount ?? hoardTeeth;
    const sig = hoardEnded ? 'ended' :
      hoardSig(count, vfx.hoard.tiers) + ':' + count + ':' + hoardAct + ':' +
      w + 'x' + h + ':' + vfx.hoard.stageScale + ':' + vfx.hoard.stageAlpha;
    if (sig === hoardSigLast) return;
    hoardSigLast = sig;
    const dpr = window.devicePixelRatio || 1;
    hoardCanvas.width = Math.round(w * dpr);
    hoardCanvas.height = Math.round(h * dpr);
    const c = hoardCanvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    if (hoardEnded) return; // the ending sky owns the stage
    const css = getComputedStyle(el.closest('#app') || document.documentElement);
    const colors = {
      accent: css.getPropertyValue('--accent').trim() || '#7b96c9',
      glow: css.getPropertyValue('--glow').trim() || '#a8c0ea',
    };
    drawHoard(c, {
      w, h, count, vfx, colors,
      scale: vfx.hoard.stageScale, centerGapPx: 0, alpha: vfx.hoard.stageAlpha,
    });
  }
```

Note: the sig includes the raw `count` (keeps the dev scrub perfectly live)
and `hoardAct` (palette flips repaint immediately).

In the returned object's `update(state, script2)`, append at the end (after
`updateDepart(state);`):

```js
      hoardTeeth = Math.floor(state.teeth);
      hoardEnded = !!state.ended;
      hoardAct = state.act;
      drawStageHoard();
```

Add to the returned object (beside `hasBeatOpen`):

```js
    redrawHoard() { hoardSigLast = null; drawStageHoard(); },
    setHoardPreview(countOrNull) { hoardPreviewCount = countOrNull; drawStageHoard(); },
```

- [ ] **Step 3: stage.js — outline compaction**

Replace `updateOutline` with:

```js
  function updateOutline(state) {
    if (!state.tapShown || state.ended) { outlineRow.hidden = true; return; }
    outlineRow.hidden = false;
    const { size, filled } = state.outline;
    const sig = size + ':' + filled;
    if (sig === outlineSig) return;
    outlineSig = sig;
    // From 32 slots the rows are wallpaper: collapse to one big tooth that
    // fills bottom-up, with a filled/size count.
    if (size >= 32) {
      outlineRow.className = 'outlineRow compact';
      if (outlineRow.dataset.mode !== 'compact') {
        outlineRow.dataset.mode = 'compact';
        while (outlineRow.firstChild) outlineRow.removeChild(outlineRow.lastChild);
        const wrap = document.createElement('div');
        wrap.className = 'outlineBig';
        wrap.append(toothSVG('tooth-outline pulse'), toothSVG('tooth-fill outlineFillClip'));
        const label = document.createElement('div');
        label.className = 'outlineCount';
        outlineRow.append(wrap, label);
      }
      const wrap = outlineRow.firstChild;
      wrap.firstChild.style.setProperty('--pulseMs', vfx.pulse.outlineMs + 'ms');
      wrap.lastChild.style.clipPath =
        'inset(' + ((1 - filled / size) * 100).toFixed(1) + '% 0 0 0)';
      outlineRow.lastChild.textContent = filled + '/' + size;
      return;
    }
    if (outlineRow.dataset.mode === 'compact') {
      outlineRow.dataset.mode = '';
      while (outlineRow.firstChild) outlineRow.removeChild(outlineRow.lastChild);
    }
    outlineRow.className = 'outlineRow' +
      (size >= 16 ? ' sz16' : size >= 8 ? ' sz8' : '');
    while (outlineRow.children.length > size) outlineRow.removeChild(outlineRow.lastChild);
    while (outlineRow.children.length < size) outlineRow.appendChild(toothSVG());
    for (let i = 0; i < size; i++) {
      const svg = outlineRow.children[i];
      const isFilled = i < filled;
      svg.setAttribute('class', isFilled ? 'tooth-fill' : 'tooth-outline pulse');
      svg.style.setProperty('--pulseMs', vfx.pulse.outlineMs + 'ms');
    }
  }
```

(The `sz32`/`sz64` row classes become dead in JS; leave the CSS rules — the
Workshop may resurrect them, and dead CSS is not worth a css-file conflict.)

- [ ] **Step 4: css/main.css**

Add after the `.outlineRow.sz64 svg` rule:

```css
.outlineRow.compact { flex-direction: column; gap: 2px; }
.outlineBig { position: relative; width: 76px; height: 76px; }
.outlineBig svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.outlineFillClip path { transition: clip-path 0.3s; }
.outlineFillClip { transition: clip-path 0.3s; }
.outlineCount { font-size: 12px; color: var(--dim); text-align: center;
  font-variant-numeric: tabular-nums; }
```

Add after the `.stage` rule block (near the top of the stage section — find
`.stage {` and add below it; if `.stage` lacks `position: relative`, add it to
the `.stage` rule):

```css
.stageHoard { position: absolute; left: 0; right: 0; bottom: 0; height: 42%;
  width: 100%; pointer-events: none; z-index: 0; }
.beatCard, .outlineRow { position: relative; z-index: 1; }
```

- [ ] **Step 5: panel.js — stage knobs + preview/redraw fan-out**

1. In `HOARD_SHARED_KNOBS`, append:

```js
  { path: ['hoard', 'stageScale'], min: 0.5, max: 5, step: 0.1 },
  { path: ['hoard', 'stageAlpha'], min: 0, max: 1, step: 0.01 },
```

2. In `tabHoard`, the redraw/preview helpers fan out to the stage too:

```js
  const redraw = () => { ctx.ui.conveyor.redraw(); ctx.ui.stage.redrawHoard(); };
  const preview = (count) => {
    ctx.ui.conveyor.setHoardPreview(count);
    ctx.ui.stage.setHoardPreview(count);
  };
```

- [ ] **Step 6: Run the suite**

Run: `node --test test/*.test.js`
Expected: all PASS (config test walks vfx defaults; new numeric leaves merge fine).

- [ ] **Step 7: Commit**

```bash
git add js/ui/stage.js js/config/vfx.js js/dev/panel.js css/main.css
git commit -m "The hoard on the main stage; outline collapses to one filling tooth at 32+"
```

---

### Task 5: iOS Home Screen icon

**Files:**
- Modify: `index.html`
- Add: `assets/icon-180.png` (already on disk, generated by the controller — just stage it; do NOT regenerate)

- [ ] **Step 1: index.html head**

After the existing `<link rel="icon" …>` line, add (relative paths — the site
deploys under a project subpath, so no leading `/`):

```html
  <link rel="apple-touch-icon" href="assets/icon-180.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="tooth fairy">
```

- [ ] **Step 2: Verify the asset exists and the suite passes**

Run: `file assets/icon-180.png && node --test test/*.test.js`
Expected: `PNG image data, 180 x 180`; all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add index.html assets/icon-180.png
git commit -m "iOS Home Screen icon + web-app meta"
```
