# Dev Suite Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Dev Suite (the in-app dev panel) to a Claude Artifact: dev panel docked left, a bundled copy of the game right, plus a floating two-tab chat agent that helps with settings, applies natural-language setting changes, and hands off code-change requests to local Claude Code as context-complete prompt packages.

**Architecture:** A zero-dependency node build script bundles the whole vanilla-ESM game (~6k lines, no default exports, no live bindings) into one self-contained HTML file. The game boots with a `window.TF_EMBED` flag that disables game hotkeys, forces dev mode, and mounts the dev panel docked into a left pane instead of a fullscreen overlay. The chat agent is deterministic (no LLM is available inside the artifact runtime — only `downloads` and `mcp` capabilities exist, and the CSP blocks all external requests): it answers from generated per-tab knowledge packs, parses natural-language setting changes against the knob contract, and builds Claude Code prompt packages for code changes (clipboard + `downloads` capability).

**Tech Stack:** Vanilla ES modules, zero dependencies, `node --test`, node build script, Claude Artifact (`downloads` capability, contract 0.2.2).

## Global Constraints

- Vanilla ESM, zero dependencies, no build step for the game itself (the artifact build script is dev tooling, not a game dependency).
- No `innerHTML` anywhere (repo hook enforces this). Build DOM with `createElement`/`textContent`.
- The artifact page must be fully self-contained: no external fetches, no CDN, assets as data/base64. The artifact file must NOT contain `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>` tags (the publish step wraps it); a separate `-local.html` wrapper exists for local browser verification.
- The embedded game disables its own hotkeys (`window.TF_EMBED`); dev-tab hotkeys and chat hotkeys take over.
- Single-theme dark design, extending the existing dev-panel system: ground `#171b27`/`#0b0e17`, ink `#d7dceb`, dim `#8b93ad`, accent `#cfa8ea`, font `13px ui-monospace, Menlo, monospace`. This is a deliberate single-theme commit (it embeds a dark game); do not add a light theme.
- All new pure logic gets `node --test` tests in `test/`. All tests must pass via `npm test` with plain `node --test` (no DOM, no flags, no subprocess spawning in tests — import functions directly).
- Repo convention: `js/version.js` holds the version; bump minor for this feature.
- Existing behavior of the normal game page (`index.html` on localhost) must not change: same hotkeys, same dev chip/overlay panel, same tests passing.

## Embedded hotkey map (authoritative)

| Key | Context | Action |
|---|---|---|
| `[` / `]` | embed, not typing | cycle dev tabs |
| `Shift+1`..`Shift+8` (`e.code Digit1..8`) | embed, not typing | dev tab direct select (Workshop, Hoard, Script, Balance, Names, VFX, State, Pacing) |
| `` ` `` (Backquote) | embed, always (even while typing in chat) | toggle chat window; raising focuses the prompt textarea |
| `Escape` | chat open | dismiss chat |
| `Ctrl+ArrowLeft` / `Ctrl+ArrowRight` | chat open (works while typing) | switch chat tabs (Current tab ↔ Dev Suite) |
| `Enter` / `Shift+Enter` | chat textarea | submit / newline |
| `1-5`, `A`, `R` | Workshop dev tab visible, not typing | existing preview keys (unchanged) |

---

### Task 1: Extract the override store (`js/dev/ovstore.js`)

The panel's override-layer helpers (`OV`, `loadOv`, `saveOv`, `setPath`, `deletePath`, `getPath`, and the apply-with-validation logic) become a shared DOM-free module so the chat agent can apply settings through the exact same code path. Node-safe: falls back to an in-memory store when `localStorage` is absent.

**Files:**
- Create: `js/dev/ovstore.js`
- Modify: `js/dev/panel.js` (delete lines 14–58, the `OV` map through `getPath`; import from ovstore instead; route `knobRows`' `apply` through `applyKnob`)
- Test: `test/ovstore.test.js`

**Interfaces:**
- Produces: `OV` (map of ovKey→storage key), `loadOv(ovKey)`, `saveOv(ovKey, obj)`, `setPath(obj, path, value)`, `deletePath(obj, path)`, `getPath(obj, path)`, `applyKnob({ defaults, live, ovKey, path, value })` → `{ ok: true } | { ok: false, reason: string }`. Task 6's agent and Task 3's panel consume `applyKnob` with `ovKey` one of `'constants' | 'names' | 'vfx'`.

- [ ] **Step 1: Write the failing test**

```js
// test/ovstore.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadOv, saveOv, setPath, getPath, deletePath, applyKnob,
} from '../js/dev/ovstore.js';

test('setPath/getPath/deletePath round-trip and prune empty parents', () => {
  const o = {};
  setPath(o, ['a', 'b', 'c'], 5);
  assert.equal(getPath(o, ['a', 'b', 'c']), 5);
  deletePath(o, ['a', 'b', 'c']);
  assert.deepEqual(o, {});
});

test('loadOv/saveOv work without localStorage (memory fallback)', () => {
  saveOv('vfx', { sound: { tap: 0.5 } });
  assert.deepEqual(loadOv('vfx'), { sound: { tap: 0.5 } });
  saveOv('vfx', {});               // empty object clears the key
  assert.deepEqual(loadOv('vfx'), {});
});

test('applyKnob writes live + override, clears override at default', () => {
  const defaults = { sound: { tap: 0.3 } };
  const live = { sound: { tap: 0.3 } };
  saveOv('vfx', {});
  let r = applyKnob({ defaults, live, ovKey: 'vfx', path: ['sound', 'tap'], value: 0.5 });
  assert.equal(r.ok, true);
  assert.equal(live.sound.tap, 0.5);
  assert.deepEqual(loadOv('vfx'), { sound: { tap: 0.5 } });
  r = applyKnob({ defaults, live, ovKey: 'vfx', path: ['sound', 'tap'], value: 0.3 });
  assert.equal(r.ok, true);
  assert.deepEqual(loadOv('vfx'), {});
});

test('applyKnob rejects, never clamps', () => {
  const defaults = { TICK_MS: 200 };
  const live = { TICK_MS: 200 };
  const r = applyKnob({ defaults, live, ovKey: 'constants', path: ['TICK_MS'], value: 0 });
  assert.equal(r.ok, false);
  assert.equal(live.TICK_MS, 200);          // untouched
  const r2 = applyKnob({ defaults, live, ovKey: 'constants', path: ['TICK_MS'], value: NaN });
  assert.equal(r2.ok, false);
});

test('applyKnob stores whole arrays wholesale', () => {
  const defaults = { ramp: { steps: [1, 2, 3] } };
  const live = { ramp: { steps: [1, 2, 3] } };
  saveOv('vfx', {});
  applyKnob({ defaults, live, ovKey: 'vfx', path: ['ramp', 'steps', 1], value: 9 });
  assert.deepEqual(loadOv('vfx'), { ramp: { steps: [1, 9, 3] } });
  applyKnob({ defaults, live, ovKey: 'vfx', path: ['ramp', 'steps', 1], value: 2 });
  assert.deepEqual(loadOv('vfx'), {});
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `node --test test/ovstore.test.js`
Expected: FAIL — cannot find module `js/dev/ovstore.js`.

- [ ] **Step 3: Create `js/dev/ovstore.js`**

```js
// The override layer, shared by the dev panel and the chat agent. Every
// tuned value lives twice: written into the LIVE config object the running
// game reads, and persisted (only the diff from defaults) under one of the
// OV storage keys, merged over frozen defaults at boot. DOM-free; when
// localStorage is absent (node tests) an in-memory map stands in.

export const OV = {
  constants: 'tf-ov-constants',
  names: 'tf-ov-names',
  vfx: 'tf-ov-vfx',
  script: 'tf-ov-script',
};

const memory = new Map();
const store = (typeof localStorage !== 'undefined') ? localStorage : {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

export function loadOv(key) {
  try { return JSON.parse(store.getItem(OV[key]) || 'null') || {}; }
  catch { return {}; }
}

export function saveOv(key, obj) {
  if (obj && Object.keys(obj).length) store.setItem(OV[key], JSON.stringify(obj));
  else store.removeItem(OV[key]);
}

export function setPath(obj, path, value) {
  let node = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (typeof node[path[i]] !== 'object' || node[path[i]] === null) node[path[i]] = {};
    node = node[path[i]];
  }
  node[path[path.length - 1]] = value;
}

export function deletePath(obj, path) {
  const parents = [obj];
  let node = obj;
  for (let i = 0; i < path.length - 1; i++) {
    node = node && node[path[i]];
    parents.push(node);
  }
  if (!node) return;
  delete node[path[path.length - 1]];
  for (let i = parents.length - 1; i > 0; i--) {
    const parent = parents[i - 1];
    const key = path[i - 1];
    if (parent[key] && typeof parent[key] === 'object' && !Object.keys(parent[key]).length) {
      delete parent[key];
    }
  }
}

export function getPath(obj, path) {
  let node = obj;
  for (const k of path) { if (node == null) return undefined; node = node[k]; }
  return node;
}

// Apply one knob edit end to end: validate, write live, persist the diff.
// Numbers are rejected, never clamped: a clamped value is a lie about what
// you applied, and a positive default never accepts zero or less (a 0 tick
// divisor once froze a whole tab). Array members persist wholesale — the
// override layer only merges whole arrays.
export function applyKnob({ defaults, live, ovKey, path, value }) {
  const defVal = getPath(defaults, path);
  if (defVal === undefined) return { ok: false, reason: 'unknown path ' + path.join('.') };
  if (typeof defVal === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, reason: 'not a finite number' };
    }
    if (defVal > 0 && value <= 0) {
      return { ok: false, reason: 'must be > 0 (default ' + defVal + ')' };
    }
  }
  setPath(live, path, value);
  const ov = loadOv(ovKey);
  // Is the leaf inside an array? Walk defaults to find the nearest array parent.
  let arrayParent = null;
  for (let i = path.length - 1; i > 0; i--) {
    if (Array.isArray(getPath(defaults, path.slice(0, i)))) { arrayParent = path.slice(0, i); break; }
  }
  if (arrayParent) {
    const liveArr = getPath(live, arrayParent);
    const defArr = getPath(defaults, arrayParent);
    if (JSON.stringify(liveArr) === JSON.stringify(defArr)) deletePath(ov, arrayParent);
    else setPath(ov, arrayParent, JSON.parse(JSON.stringify(liveArr)));
  } else if (value === defVal) {
    deletePath(ov, path);
  } else {
    setPath(ov, path, value);
  }
  saveOv(ovKey, ov);
  return { ok: true };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `node --test test/ovstore.test.js` — Expected: PASS (5 tests).

- [ ] **Step 5: Refactor `js/dev/panel.js` to use ovstore**

Delete the local `OV`, `loadOv`, `saveOv`, `setPath`, `deletePath`, `getPath` definitions (current lines 14–58). Add at the top:

```js
import { OV, loadOv, saveOv, setPath, deletePath, getPath, applyKnob } from './ovstore.js';
```

In `knobRows`' inner `apply(raw)`, replace the body after number parsing with a call through `applyKnob` (keep the input-red UI concern in the panel):

```js
    function apply(raw) {
      let value = raw;
      if (isNum) value = Number(raw);
      if (isNum && String(raw).trim() === '') { input.classList.add('bad'); return; }
      const r = applyKnob({ defaults, live, ovKey, path, value });
      if (!r.ok) { input.classList.add('bad'); return; }
      input.classList.remove('bad');
      row.classList.toggle('changed', value !== defVal);
    }
```

Note `applyKnob` re-reads the override layer itself, so `knobRows` no longer needs its top-level `const ov = loadOv(ovKey)`; delete it. Same in `sliderRow` — replace its `apply(value)` body's store logic with `applyKnob({ defaults: VFX_DEFAULTS, live: ctx.vfx, ovKey: 'vfx', path: knob.path, value })` and keep the `val.textContent`/`changed`/`onChange` lines; then drop the now-unused `ov` parameter from `sliderRow` and its call sites (`tabWorkshop`, `tabHoard`).

- [ ] **Step 6: Run the whole suite**

Run: `npm test` — Expected: all existing tests pass (panel.js has no test coverage of its own; the suite guards against import breakage).

- [ ] **Step 7: Commit**

```bash
git add js/dev/ovstore.js js/dev/panel.js test/ovstore.test.js
git commit -m "Extract shared override store from the dev panel"
```

---

### Task 2: Embed flag — `main.js` gates, sound clip embed, workshop knob ranges module

Three small preparations for running inside the artifact. (1) `window.TF_EMBED` forces dev mode, disables the game keyboard listener, and mounts the docked suite + chat instead of the chip overlay. (2) `sound.js` can take the tap clip as base64 (`window.TF_TAP_CLIP_B64`) instead of fetching (CSP blocks fetch in the artifact). (3) The Workshop/Hoard slider ranges move to a DOM-free module so the pack generator (Task 5) can import them.

**Files:**
- Create: `js/dev/knob-ranges.js`
- Modify: `js/main.js`, `js/ui/sound.js`, `js/dev/panel.js`
- Test: `test/knob-ranges.test.js`

**Interfaces:**
- Produces: `js/dev/knob-ranges.js` exports `WORKSHOP_KNOBS` (array of `{ title, preview, rows: [{ path, min, max, step }] }`) and `HOARD_SHARED_KNOBS` (array of `{ path, min, max, step }`) — consumed by panel.js and Task 5's generator.
- Produces: `window.TF_EMBED` contract — when truthy at boot: DEV forced on, game keydown listener not installed, `js/embed/boot.js` dynamically imported (that module is created in Task 7; until then the import is `.catch`-guarded and harmless).
- Produces: `window.TF_TAP_CLIP_B64` contract — when set, `sound.js` decodes it instead of fetching the wav.

- [ ] **Step 1: Write the failing test**

```js
// test/knob-ranges.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKSHOP_KNOBS, HOARD_SHARED_KNOBS } from '../js/dev/knob-ranges.js';
import { VFX_DEFAULTS } from '../js/config/vfx.js';

function leaf(obj, path) {
  let n = obj;
  for (const k of path) { n = n?.[k]; }
  return n;
}

test('every workshop knob path resolves to a numeric VFX default', () => {
  for (const group of WORKSHOP_KNOBS) {
    for (const row of group.rows) {
      assert.equal(typeof leaf(VFX_DEFAULTS, row.path), 'number',
        row.path.join('.'));
      assert.ok(row.min < row.max);
    }
  }
});

test('hoard shared knobs resolve too', () => {
  for (const row of HOARD_SHARED_KNOBS) {
    assert.equal(typeof leaf(VFX_DEFAULTS, row.path), 'number', row.path.join('.'));
  }
});
```

- [ ] **Step 2: Run it, verify it fails** — `node --test test/knob-ranges.test.js`: FAIL, module not found.

- [ ] **Step 3: Create `js/dev/knob-ranges.js`**

Cut the `WORKSHOP_KNOBS` const (panel.js lines 316–355) and `HOARD_SHARED_KNOBS` (lines 558–564) verbatim into the new module with `export const` on each, plus a header comment:

```js
// Slider ranges for the Workshop and Hoard tabs. DOM-free on purpose: the
// agent-pack generator imports these to publish min/max alongside each knob.
```

In `panel.js`, add `import { WORKSHOP_KNOBS, HOARD_SHARED_KNOBS } from './knob-ranges.js';` and delete the moved consts.

- [ ] **Step 4: Run tests** — `node --test test/knob-ranges.test.js` PASS, then `npm test` all green.

- [ ] **Step 5: Modify `js/ui/sound.js` for the embedded clip**

Replace line 62 (`const TAP_CLIP_URL = ...`) with:

```js
// In the artifact build the wav rides along as base64 (CSP blocks fetch);
// on the normal page it is fetched relative to this module as before.
const TAP_CLIP_B64 = (typeof window !== 'undefined' && window.TF_TAP_CLIP_B64) || null;
const TAP_CLIP_URL = TAP_CLIP_B64 ? null
  : new URL('../../assets/microtick.wav', import.meta.url);
```

In `playClip`, replace the fetch chain (lines 73–80) with:

```js
  const key = url ? url.href : 'embedded';
  if (!clips.has(key)) {
    clips.set(key, 'pending');
    const bytes = TAP_CLIP_B64
      ? Promise.resolve(Uint8Array.from(atob(TAP_CLIP_B64), (ch) => ch.charCodeAt(0)).buffer)
      : fetch(url).then((r) => r.arrayBuffer());
    bytes
      .then((b) => c.decodeAudioData(b))
      .then((buf) => clips.set(key, buf))
      .catch(() => clips.set(key, 'failed'));
  }
```

(The rest of `playClip` reads `clips.get(key)` — keep the single `key` const; delete any other `url.href` reference.)

- [ ] **Step 6: Modify `js/main.js` for the embed flag**

After line 17 (`const AUTOPILOT = ...`) add and adjust:

```js
const EMBED = typeof window !== 'undefined' && !!window.TF_EMBED;
const DEV = EMBED || params.get('dev') === '1' || AUTOPILOT ||
  ['localhost', '127.0.0.1'].includes(location.hostname);
```

Wrap the game keyboard listener (the `document.addEventListener('keydown', ...)` block, lines 251–282) in `if (!EMBED) { ... }` — the embed's own hotkeys take over.

Replace the dev-panel gate (lines 303–307) with:

```js
if (EMBED) {
  import('./embed/boot.js')
    .then((m) => m.bootEmbed({ app, box, cfg, names, vfx, script, contracts, dispatch, ui, save }))
    .catch((err) => console.warn('[embed] boot failed', err));
} else if (DEV) {
  import('./dev/panel.js')
    .then((m) => m.mountDevPanel({ app, box, cfg, names, vfx, script, dispatch, ui, save }))
    .catch((err) => console.warn('[dev] panel failed to load', err));
}
```

- [ ] **Step 7: Verify the normal page still boots**

Run: `npm test` (all green), then `node --check js/main.js && node --check js/ui/sound.js` (parse check; full browser verification happens in Task 9).

- [ ] **Step 8: Commit**

```bash
git add js/dev/knob-ranges.js js/dev/panel.js js/main.js js/ui/sound.js test/knob-ranges.test.js
git commit -m "Embed flag, base64 tap clip, DOM-free knob ranges"
```

---

### Task 3: Docked dev suite mount + dev tab hotkeys

`panel.js` grows a second mount: `mountDevSuiteDocked(ctx, host)` renders the same tabs permanently into a host element (no chip, no fullscreen overlay, never hidden) and installs the embed hotkeys (`[`/`]` cycle, `Shift+Digit1..8` direct). The hotkey→tab mapping is a pure exported function so it is testable in node.

**Files:**
- Modify: `js/dev/panel.js`
- Test: `test/dev-dock.test.js`

**Interfaces:**
- Consumes: ovstore (Task 1).
- Produces: `mountDevSuiteDocked(ctx, host)` → `{ activeTab(): string, show(name): void, tabNames: string[] }`; `devTabForKey(e, tabNames, active)` → tab name or `null`, where `e` is `{ code, key, shiftKey, ctrlKey, metaKey, altKey, targetTag }`. Task 7's chat consumes `activeTab`/`show`/`tabNames`.

- [ ] **Step 1: Write the failing test**

```js
// test/dev-dock.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devTabForKey } from '../js/dev/panel.js';

const TABS = ['Workshop', 'Hoard', 'Script', 'Balance', 'Names', 'VFX', 'State', 'Pacing'];
const ev = (o) => ({ code: '', key: '', shiftKey: false, ctrlKey: false,
  metaKey: false, altKey: false, targetTag: 'BODY', ...o });

test('Shift+Digit selects a tab directly', () => {
  assert.equal(devTabForKey(ev({ code: 'Digit3', shiftKey: true }), TABS, 'Workshop'), 'Script');
  assert.equal(devTabForKey(ev({ code: 'Digit8', shiftKey: true }), TABS, 'Workshop'), 'Pacing');
  assert.equal(devTabForKey(ev({ code: 'Digit9', shiftKey: true }), TABS, 'Workshop'), null);
});

test('brackets cycle with wrap', () => {
  assert.equal(devTabForKey(ev({ key: ']' }), TABS, 'Pacing'), 'Workshop');
  assert.equal(devTabForKey(ev({ key: '[' }), TABS, 'Workshop'), 'Pacing');
});

test('typing contexts and modifier chords are ignored', () => {
  assert.equal(devTabForKey(ev({ key: ']', targetTag: 'INPUT' }), TABS, 'Workshop'), null);
  assert.equal(devTabForKey(ev({ key: ']', targetTag: 'TEXTAREA' }), TABS, 'Workshop'), null);
  assert.equal(devTabForKey(ev({ key: ']', ctrlKey: true }), TABS, 'Workshop'), null);
  assert.equal(devTabForKey(ev({ code: 'Digit3' }), TABS, 'Workshop'), null); // no shift
});
```

- [ ] **Step 2: Run it, verify it fails** — `node --test test/dev-dock.test.js`: FAIL (`devTabForKey` not exported). Note: importing panel.js in node must work — its top-level only defines consts and imports DOM-free modules (`sound.js` top-level touches no DOM). If an import chain breaks in node, fix by deferring the offending reference into a function, not by skipping the test.

- [ ] **Step 3: Implement in `js/dev/panel.js`**

Add the pure mapper near the top:

```js
// Embed hotkeys: pure mapping so it can be tested headless. Typing fields
// and modifier chords (other than the Shift that makes a digit) never steal.
export function devTabForKey(e, tabNames, active) {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.targetTag)) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const m = /^Digit([1-9])$/.exec(e.code || '');
  if (e.shiftKey && m) return tabNames[Number(m[1]) - 1] || null;
  if (e.shiftKey) return null;
  const i = tabNames.indexOf(active);
  if (e.key === ']') return tabNames[(i + 1) % tabNames.length];
  if (e.key === '[') return tabNames[(i - 1 + tabNames.length) % tabNames.length];
  return null;
}
```

Refactor `buildPanel(ctx)` so its middle — the `tabs` map, tab-button construction, `show(name)`, `stopHide` — is shared. Extract:

```js
function buildSuite(ctx, { panel, head, body, docked }) {
  const tabs = {
    Workshop: tabWorkshop, Hoard: tabHoard, Script: tabScript, Balance: tabBalance,
    Names: tabNames, VFX: tabVfx, State: tabState, Pacing: tabPacing,
  };
  let active = null;
  let onHide = null;
  for (const name of Object.keys(tabs)) {
    const btn = el('button', 'devTab', name);
    btn.dataset.testid = 'dev-tab-' + name.toLowerCase();
    btn.addEventListener('click', () => show(name));
    head.appendChild(btn);
  }
  function stopHide() { if (onHide) { onHide(); onHide = null; } }
  function show(name) {
    stopHide();
    active = name;
    for (const btn of head.querySelectorAll('.devTab')) {
      btn.classList.toggle('on', btn.textContent === name);
    }
    while (body.firstChild) body.removeChild(body.firstChild);
    if (!docked) panel.classList.toggle('devPanel--drawer', name === 'Workshop' || name === 'Hoard');
    onHide = tabs[name](body, ctx) || null;
  }
  return { tabs, show, stopHide, activeTab: () => active };
}
```

`buildPanel` keeps its chip/toggle/close behavior on top of `buildSuite` (overlay path unchanged). Add the docked mount:

```js
export function mountDevSuiteDocked(ctx, host) {
  const style = document.createElement('style');
  style.textContent = CSS + DOCK_CSS;
  document.head.appendChild(style);
  const panel = el('div', 'devPanel devPanel--docked');
  panel.dataset.testid = 'dev-panel';
  const head = el('div', 'devHead');
  const body = el('div', 'devBody');
  panel.append(head, body);
  host.appendChild(panel);
  const suite = buildSuite(ctx, { panel, head, body, docked: true });
  const tabNames = Object.keys(suite.tabs);
  document.addEventListener('keydown', (e) => {
    const next = devTabForKey({
      code: e.code, key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey,
      metaKey: e.metaKey, altKey: e.altKey,
      targetTag: e.target && e.target.tagName || '',
    }, tabNames, suite.activeTab());
    if (next) { e.preventDefault(); suite.show(next); }
  });
  suite.show('Workshop');
  return { activeTab: suite.activeTab, show: suite.show, tabNames };
}

const DOCK_CSS = `
.devPanel--docked { position: static; inset: auto; height: 100%; z-index: auto; }
.devPanel--docked .devHead .x { display: none; }
`;
```

(`mountDevPanel` and `buildPanel` keep working exactly as before for the localhost page — the chip still toggles the fullscreen overlay.)

- [ ] **Step 4: Run tests** — `node --test test/dev-dock.test.js` PASS; `npm test` all green.

- [ ] **Step 5: Commit**

```bash
git add js/dev/panel.js test/dev-dock.test.js
git commit -m "Docked dev suite mount with embed tab hotkeys"
```

---

### Task 4: The bundler — `scripts/build-artifact.js`

A zero-dependency node script that inlines the whole game into one artifact page. It resolves the static import graph from `js/main.js` (plus dynamically-imported dev/embed modules), topo-sorts it, rewrites each module into an IIFE that populates a `__modules` registry, and emits three files: `dist/bundle.js` (plain script, node-importable for tests), `dist/dev-suite.html` (artifact content — NO doctype/html/head/body), and `dist/dev-suite-local.html` (the same content wrapped for local browsers).

The codebase is bundler-friendly by audit: named exports only, no `export default`, no `export let/var` (no live bindings), no `import * as`, three dynamic imports (all literal paths), one `import.meta.url`. The script must ASSERT these invariants and fail loudly if future code breaks them.

**Files:**
- Create: `scripts/build-artifact.js`
- Test: `test/bundle.test.js`

**Interfaces:**
- Consumes: `window.TF_EMBED` / `TF_TAP_CLIP_B64` contracts (Task 2), `mountDevSuiteDocked` (Task 3), `js/embed/boot.js` (Task 7 — until it exists the build script must tolerate its absence: only bundle `js/embed/*` files that exist).
- Produces: `build()` (exported; writes the three dist files and returns their paths) plus a CLI entry. `dist/bundle.js` defines `globalThis.TF_MODULES` (registry: path → exports object) and `globalThis.TF_START()` (runs `js/main.js`). Shell HTML ids: `#tf-shell`, `#tf-dev` (dev pane host), `#tf-game` wrapping `#app`, `#tf-chat-root`. Task 7 mounts chat into these; Task 10 publishes `dist/dev-suite.html`.

- [ ] **Step 1: Write the failing test**

```js
// test/bundle.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from '../scripts/build-artifact.js';

const ROOT = new URL('..', import.meta.url).pathname;

test('build produces a working self-contained bundle', async () => {
  build();

  // The registry loads in plain node and the engine runs headless from it.
  await import(pathToFileURL(ROOT + 'dist/bundle.js').href);
  const mods = globalThis.TF_MODULES;
  assert.ok(mods && typeof globalThis.TF_START === 'function');
  const { createState } = mods['js/engine/state.js'];
  const { tick } = mods['js/engine/tick.js'];
  const { buildConstants } = mods['js/config/constants.js'];
  const { buildScript } = mods['js/config/script.js'];
  const cfg = buildConstants(null);
  const script = buildScript(null);
  const state = createState(7);
  for (let i = 0; i < 500; i++) tick(state, cfg, script, {});
  assert.equal(state.tick, 500);

  // The artifact file is publish-shaped: no document skeleton tags, has a title,
  // and carries the bundle + embed flag + clip inline.
  const html = readFileSync(ROOT + 'dist/dev-suite.html', 'utf8');
  assert.ok(!/<!doctype|<html|<head|<body/i.test(html));
  assert.ok(html.includes('<title>'));
  assert.ok(html.includes('TF_EMBED'));
  assert.ok(html.includes('TF_TAP_CLIP_B64'));
  assert.ok(html.includes('TF_START()'));
  assert.ok(html.includes('id="tf-dev"') && html.includes('id="app"'));

  const local = readFileSync(ROOT + 'dist/dev-suite-local.html', 'utf8');
  assert.ok(/<!doctype html>/i.test(local));
});
```

- [ ] **Step 2: Run it, verify it fails** — `node --test test/bundle.test.js`: FAIL, no build script.

- [ ] **Step 3: Write `scripts/build-artifact.js`**

```js
#!/usr/bin/env node
// Bundle the whole game into one self-contained artifact page. Zero deps.
//
// The transform is deliberately dumb and loudly guarded: this codebase uses
// named exports only, no live bindings, literal dynamic imports. If a future
// edit breaks an invariant, fail the build with the file named — never emit
// a silently-wrong bundle.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (abs) => relative(ROOT, abs).split('\\').join('/');

function die(msg) { throw new Error('[build-artifact] ' + msg); }

export function build() {
  // ---- collect the module graph ----
  const sources = new Map();    // relPath -> source
  const staticDeps = new Map(); // relPath -> [relPath]

  function resolveSpec(fromRel, spec) {
    if (!spec.startsWith('.')) die(fromRel + ' imports bare specifier ' + spec);
    return rel(resolve(join(ROOT, dirname(fromRel)), spec));
  }

  function load(relPath) {
    if (sources.has(relPath)) return;
    const abs = join(ROOT, relPath);
    if (!existsSync(abs)) die('missing module ' + relPath);
    const src = readFileSync(abs, 'utf8');
    for (const bad of [/export\s+default/, /export\s+(let|var)\s/, /import\s*\*\s*as/]) {
      if (bad.test(src)) die(relPath + ' violates bundler invariant ' + bad);
    }
    sources.set(relPath, src);
    const deps = [];
    const importRe = /(?:^|\n)\s*(?:import\s*(?:\{[^}]*\}\s*from\s*)?|export\s*\{[^}]*\}\s*from\s*)['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(importRe)) deps.push(resolveSpec(relPath, m[1]));
    staticDeps.set(relPath, deps);
    for (const d of deps) load(d);
    // Dynamic imports join the graph but are not topo edges.
    for (const m of src.matchAll(/import\(\s*(['"`])([^'"`]+)\1\s*\)/g)) {
      load(resolveSpec(relPath, m[2]));
    }
    if (/import\(\s*[^'"`)]/.test(src)) die(relPath + ': non-literal dynamic import');
  }

  load('js/main.js');
  // Embed modules ship whenever present (chat lands in a later task).
  if (existsSync(join(ROOT, 'js/embed'))) {
    for (const f of readdirSync(join(ROOT, 'js/embed'))) {
      if (f.endsWith('.js')) load('js/embed/' + f);
    }
  }

  // ---- topo order (static edges only; cycles are a build error) ----
  const order = [];
  const mark = new Map(); // 0 visiting, 1 done
  function visit(p, chain) {
    if (mark.get(p) === 1) return;
    if (mark.get(p) === 0) die('import cycle: ' + [...chain, p].join(' -> '));
    mark.set(p, 0);
    for (const d of staticDeps.get(p)) visit(d, [...chain, p]);
    mark.set(p, 1);
    order.push(p);
  }
  for (const p of sources.keys()) visit(p, []);
  const eager = order.filter((p) => p !== 'js/main.js'); // main runs via TF_START

  // ---- transform one module body ----
  function transform(relPath, src) {
    let out = src;
    // export { a, b as c } from './x.js'
    out = out.replace(/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, names, spec) => {
      const dep = resolveSpec(relPath, spec);
      return names.split(',').map((n) => {
        if (!n.trim()) return '';
        const [orig, alias = orig] = n.split(/\s+as\s+/).map((s) => s.trim());
        return `__exp.${alias} = __modules[${JSON.stringify(dep)}].${orig};`;
      }).join(' ');
    });
    // import { a, b as c } from './x.js'
    out = out.replace(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, names, spec) => {
      const dep = resolveSpec(relPath, spec);
      const parts = names.split(',').map((n) => {
        if (!n.trim()) return '';
        const [orig, alias = orig] = n.split(/\s+as\s+/).map((s) => s.trim());
        return orig === alias ? orig : `${orig}: ${alias}`;
      }).filter(Boolean);
      return `const { ${parts.join(', ')} } = __modules[${JSON.stringify(dep)}];`;
    });
    // bare side-effect import
    out = out.replace(/import\s*['"]([^'"]+)['"];?/g, () => '');
    // export declarations -> plain declaration + registration appended at end
    const names = [];
    out = out.replace(/export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g,
      (_, kind, name) => { names.push(name); return `${kind} ${name}`; });
    // export { a, b as c };   (local list)
    out = out.replace(/export\s*\{([^}]*)\};?/g, (_, list) =>
      list.split(',').map((n) => {
        if (!n.trim()) return '';
        const [orig, alias = orig] = n.split(/\s+as\s+/).map((s) => s.trim());
        return `__exp.${alias} = ${orig};`;
      }).join(' '));
    // dynamic import -> registry promise
    out = out.replace(/import\(\s*(['"`])([^'"`]+)\1\s*\)/g, (_, __q, spec) =>
      `Promise.resolve(__modules[${JSON.stringify(resolveSpec(relPath, spec))}])`);
    // import.meta.url -> stable fake file URL (sound.js only uses it as a URL base)
    out = out.replace(/import\.meta\.url/g, JSON.stringify('file:///bundle/' + relPath));
    if (/(^|[^.\w'"`])import[\s(]/.test(out)) die(relPath + ': unhandled import syntax survived transform');
    if (/(^|\n)\s*export\s/.test(out)) die(relPath + ': unhandled export syntax survived transform');
    return out + '\n' + names.map((n) => `__exp.${n} = ${n};`).join('\n');
  }

  // ---- emit bundle.js ----
  let js = `// GENERATED by scripts/build-artifact.js — do not edit.\n(function (global) {\nconst __modules = {};\n`;
  for (const p of eager) {
    js += `\n// ---- ${p} ----\n__modules[${JSON.stringify(p)}] = (function () {\nconst __exp = {};\n`
        + transform(p, sources.get(p))
        + `\nreturn __exp;\n})();\n`;
  }
  js += `\nglobal.TF_MODULES = __modules;\nglobal.TF_START = function () {\n`
      + transform('js/main.js', sources.get('js/main.js'))
      + `\n};\n})(typeof window !== 'undefined' ? window : globalThis);\n`;

  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist/bundle.js'), js);

  // ---- emit the artifact page ----
  const gameCss = readFileSync(join(ROOT, 'css/main.css'), 'utf8');
  const wavB64 = readFileSync(join(ROOT, 'assets/microtick.wav')).toString('base64');
  const version = readFileSync(join(ROOT, 'js/version.js'), 'utf8').match(/['"](v[^'"]+)['"]/)?.[1] || '';

  const shellCss = `
/* ---- dev-suite shell: full-desktop, panel left, game right ---- */
html.tf-embed, html.tf-embed body { position: static; overflow: hidden;
  width: 100%; height: 100%; margin: 0; background: #07090f; }
#tf-shell { display: grid; grid-template-columns: 1fr 500px; height: 100vh; }
#tf-dev { min-width: 0; overflow: hidden; border-right: 1px solid #ffffff22;
  display: flex; flex-direction: column; background: #0b0e17; }
#tf-dev .tf-brand { font: 11px/1 ui-monospace, Menlo, monospace; color: #6a7188;
  letter-spacing: 0.14em; text-transform: uppercase; padding: 8px 12px 0; }
#tf-dev .devPanel--docked { flex: 1; min-height: 0; }
#tf-game { display: flex; align-items: stretch; justify-content: center;
  background: #07090f; overflow: hidden; }
#tf-game #app { width: 480px; max-width: 480px; height: 100vh; margin: 0; }
`;

  const shell = `<title>tooth fairy · dev suite ${version}</title>
<style>
${gameCss}
${shellCss}
</style>
<div id="tf-shell">
  <div id="tf-dev">
    <div class="tf-brand">tooth fairy · dev suite ${version} · [ ] cycle tabs · shift+1..8 jump · \` chat</div>
  </div>
  <div id="tf-game"><div id="app" data-act="0"></div></div>
</div>
<div id="tf-chat-root"></div>
<script>
document.documentElement.classList.add('tf-embed');
// Storage shim: the artifact sandbox may deny localStorage; the game and the
// override layer degrade to session-lifetime memory rather than crashing.
try { localStorage.getItem('tf-probe'); } catch (e) {
  const mem = new Map();
  try {
    Object.defineProperty(window, 'localStorage', { value: {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      clear: () => mem.clear(),
    } });
  } catch (e2) { /* hopeless; the game guards its own storage writes */ }
}
window.TF_EMBED = true;
window.TF_TAP_CLIP_B64 = ${JSON.stringify(wavB64)};
</scr` + `ipt>
<script>
${js}
TF_START();
</scr` + `ipt>
`;
  writeFileSync(join(ROOT, 'dist/dev-suite.html'), shell);
  writeFileSync(join(ROOT, 'dist/dev-suite-local.html'),
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"></head><body>\n${shell}\n</body></html>\n`);
  return ['dist/bundle.js', 'dist/dev-suite.html', 'dist/dev-suite-local.html'];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('[build-artifact] wrote ' + build().join(', '));
}
```

Implementation notes:
- The `</scr` + `ipt>` split exists because the emitted bundle itself is inside a `<script>` tag; any literal `</script>` in strings would truncate it. ALSO scan the emitted `js` for the literal sequence `</script` (case-insensitive) and `die` if found — game strings could contain it in the future.
- `js/main.js` runs inside `TF_START`, which closes over `__modules` in the outer IIFE — that is why `TF_START` is defined there, not attached later.
- `#tf-dev` is the dock host: Task 7's `boot.js` mounts the suite into it.

- [ ] **Step 4: Run the test** — `node --test test/bundle.test.js`: PASS. Then `npm test`: all green. If the transform trips an invariant guard, fix the transform (or the source) — do not weaken the guard.

- [ ] **Step 5: Ignore dist and commit**

```bash
printf 'dist/\n' >> .gitignore
git add .gitignore scripts/build-artifact.js test/bundle.test.js
git commit -m "Artifact bundler: one-file dev suite build"
```

---

### Task 5: Agent knowledge packs — generator, authored notes, freshness test

Per-tab agents need "the contract, not the code": every knob (path, default, range, owning tab), each tab's purpose, visual description, backing files, and capabilities — WITHOUT any game source in context. Packs are generated (`js/embed/packs.gen.js`) from config defaults + knob ranges + hand-authored per-tab notes in `docs/dev-suite/agents/*.md`. A freshness test regenerates and diffs, so packs can never drift from the config contract — this is the enforcement half of the SDLC (Task 8 documents the process half).

**Files:**
- Create: `scripts/gen-agent-packs.js`
- Create: `docs/dev-suite/agents/workshop.md`, `hoard.md`, `script.md`, `balance.md`, `names.md`, `vfx.md`, `state.md`, `pacing.md`, `suite.md`
- Create (generated): `js/embed/packs.gen.js`
- Test: `test/packs.test.js`

**Interfaces:**
- Consumes: `DEFAULTS` (`js/config/constants.js`), `NAME_DEFAULTS`, `VFX_DEFAULTS`, `WORKSHOP_KNOBS`/`HOARD_SHARED_KNOBS` (Task 2).
- Produces: `js/embed/packs.gen.js` exporting `PACKS = { version, tabs, knobs }` where `tabs` maps tab name → `{ name, summary, visual, files, capabilities, hotkeys }` (strings from the authored md) and `knobs` is an array of `{ tab, ovKey, path, def, min?, max? }`. `scripts/gen-agent-packs.js` exports `generate()` → string (the file content) and, run as a CLI, writes the file. Task 6 consumes `PACKS`.

- [ ] **Step 1: Author the per-tab notes**

Each `docs/dev-suite/agents/<tab>.md` uses this exact section format (the generator parses `## `-headed sections; every file must have all five):

```markdown
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
```

Write all nine files in this style with true content:
- **hoard.md** — tier-by-tier stash preview: scrub within a tier, tune tier shapes (`units`, `px`) and whole-hoard knobs; preview never touches state. Files: `js/dev/panel.js (tabHoard)`, `js/dev/knob-ranges.js`, `js/config/vfx.js (hoard)`, `js/ui/hoard.js`, `js/ui/stage.js`.
- **script.md** — story beats (text/response/register/trigger JSON, ▶ play, duplicate), asides, whispers per act, children's notes. Edits apply live; duplicated beats born dormant. Files: `js/dev/panel.js (tabScript)`, `js/config/script.js`. Capabilities note: script edits are text edits, not knobs — the agent helps find beats and hands structural changes to the prompt package.
- **balance.md** — the difficulty scaling matrix (every `DEFAULTS` constant: tick, costs, units, upgrades, night knobs NIGHT/CONTRACTS). Rejected-not-clamped inputs. Files: `js/dev/panel.js (tabBalance)`, `js/config/constants.js`, `js/engine/*`.
- **names.md** — every player-visible label; renames need reload for shop cards. Files: `js/dev/panel.js (tabNames)`, `js/config/names.js`.
- **vfx.md** — visual + audio tuning incl. sound gains, "test sounds". Files: `js/dev/panel.js (tabVfx)`, `js/config/vfx.js`, `js/ui/sound.js`.
- **state.md** — grants (teeth/stars), meters (belief/stir), act jumps incl. 2.5, skip-to-dawn/dusk, time advance, 8h offline sim, speed reloads (note: speed reload does not work inside the artifact — no URL params), live state JSON. Files: `js/dev/panel.js (tabState)`, `js/engine/actions.js (dev actions)`.
- **pacing.md** — headless real-engine run with competent-not-optimal bot; seed + taps profile; reports act timing, reveal cadence, beats, dead time, unreached beats. Files: `js/dev/panel.js (tabPacing)`, `js/dev/bot.js`.
- **suite.md** — the Dev Suite overview agent: what each tab is for in one line each, the hotkey map (copy the authoritative table from this plan), how overrides work (live object + localStorage diff over frozen defaults, "copy all overrides" → paste into `js/config/*.js` to commit a tuning), and when to route to a per-tab agent.
- Each per-tab file's Capabilities section must state what the agent CAN do in-page (find/explain/change knobs on this tab) and what goes to the prompt package (code changes, new features, anything structural).

- [ ] **Step 2: Write the failing test**

```js
// test/packs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate } from '../scripts/gen-agent-packs.js';

const TABS = ['Workshop', 'Hoard', 'Script', 'Balance', 'Names', 'VFX', 'State', 'Pacing'];

test('packs.gen.js is fresh (regenerate and diff)', () => {
  const disk = readFileSync(new URL('../js/embed/packs.gen.js', import.meta.url), 'utf8');
  assert.equal(disk, generate(),
    'packs.gen.js is stale — run: node scripts/gen-agent-packs.js');
});

test('every dev tab has a pack and knobs carry defaults', async () => {
  const { PACKS } = await import('../js/embed/packs.gen.js');
  for (const t of TABS) assert.ok(PACKS.tabs[t], t);
  assert.ok(PACKS.tabs['Dev Suite']);
  for (const [name, p] of Object.entries(PACKS.tabs)) {
    for (const field of ['summary', 'visual', 'files', 'capabilities']) {
      assert.ok(p[field], name + ' missing ' + field);
    }
  }
  assert.ok(PACKS.knobs.length > 100);
  for (const k of PACKS.knobs) {
    assert.ok(TABS.includes(k.tab));
    assert.ok(['constants', 'names', 'vfx'].includes(k.ovKey));
    assert.ok(Array.isArray(k.path) && k.path.length);
    assert.notEqual(k.def, undefined);
  }
  const ranged = PACKS.knobs.find((k) => k.min !== undefined);
  assert.ok(ranged, 'workshop knobs carry min/max');
});
```

- [ ] **Step 3: Run it, verify it fails** — `node --test test/packs.test.js`: FAIL.

- [ ] **Step 4: Write `scripts/gen-agent-packs.js`**

```js
#!/usr/bin/env node
// Generate js/embed/packs.gen.js — the per-tab agent knowledge packs.
// Knob contract comes from config defaults (never drifts: a freshness test
// regenerates and diffs); prose comes from docs/dev-suite/agents/*.md.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS } from '../js/config/constants.js';
import { NAME_DEFAULTS } from '../js/config/names.js';
import { VFX_DEFAULTS } from '../js/config/vfx.js';
import { WORKSHOP_KNOBS, HOARD_SHARED_KNOBS } from '../js/dev/knob-ranges.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walkLeaves(defs, path, out) {
  for (const key of Object.keys(defs)) {
    const d = defs[key];
    const p = [...path, key];
    if (Array.isArray(d)) {
      d.forEach((v, i) => { if (typeof v === 'number') out.push({ path: [...p, i], def: v }); });
    } else if (d && typeof d === 'object') walkLeaves(d, p, out);
    else out.push({ path: p, def: d });
  }
  return out;
}

function parseTabMd(file) {
  const raw = readFileSync(file, 'utf8');
  const name = raw.match(/^# (.+)$/m)?.[1]?.trim();
  const section = (h) => {
    const m = raw.match(new RegExp('## ' + h + '\\n([\\s\\S]*?)(?=\\n## |$)'));
    return m ? m[1].trim() : '';
  };
  return { name, summary: section('Summary'), visual: section('Visual'),
    files: section('Files'), capabilities: section('Capabilities'),
    hotkeys: section('Hotkeys') };
}

export function generate() {
  const knobs = [];
  for (const k of walkLeaves(DEFAULTS, [], [])) knobs.push({ tab: 'Balance', ovKey: 'constants', ...k });
  for (const k of walkLeaves(NAME_DEFAULTS, [], [])) knobs.push({ tab: 'Names', ovKey: 'names', ...k });
  for (const k of walkLeaves(VFX_DEFAULTS, [], [])) knobs.push({ tab: 'VFX', ovKey: 'vfx', ...k });
  // Workshop/Hoard re-expose vfx knobs with ranges; tag them to their tab so
  // "Current tab" scoping works there too.
  const ranged = [
    ...WORKSHOP_KNOBS.flatMap((g) => g.rows.map((r) => ({ tab: 'Workshop', ...r }))),
    ...HOARD_SHARED_KNOBS.map((r) => ({ tab: 'Hoard', ...r })),
  ];
  for (const r of ranged) {
    const leaf = r.path.reduce((n, k) => n?.[k], VFX_DEFAULTS);
    knobs.push({ tab: r.tab, ovKey: 'vfx', path: r.path, def: leaf, min: r.min, max: r.max });
  }

  const tabs = {};
  const dir = join(ROOT, 'docs/dev-suite/agents');
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.md')) continue;
    const t = parseTabMd(join(dir, f));
    tabs[f === 'suite.md' ? 'Dev Suite' : t.name] = t;
  }

  const version = readFileSync(join(ROOT, 'js/version.js'), 'utf8')
    .match(/['"](v[^'"]+)['"]/)?.[1] || '';
  return '// GENERATED by scripts/gen-agent-packs.js — do not edit.\n'
    + '// Regenerate: node scripts/gen-agent-packs.js  (test/packs.test.js enforces freshness)\n'
    + 'export const PACKS = '
    + JSON.stringify({ version, tabs, knobs }, null, 1)
    + ';\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(join(ROOT, 'js/embed/packs.gen.js'), generate());
  console.log('[gen-agent-packs] wrote js/embed/packs.gen.js');
}
```

- [ ] **Step 5: Generate and test**

Run: `mkdir -p js/embed && node scripts/gen-agent-packs.js && node --test test/packs.test.js` — PASS. Then `npm test` (the Task 4 bundle test now also picks up `js/embed/packs.gen.js`; it has no imports, so it bundles trivially).

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-agent-packs.js docs/dev-suite/agents js/embed/packs.gen.js test/packs.test.js
git commit -m "Per-tab agent knowledge packs: generator, authored notes, freshness test"
```

---

### Task 6: The agent core — `js/embed/agent.js`

Pure, deterministic, DOM-free. Given a user message + scope (`'tab'` with the active dev tab, or `'suite'`), returns a reply and optionally an action: apply a knob change, or deliver a prompt package. No game code in context: it reasons only over `PACKS`, the live values, and the override diff — the contract.

**Files:**
- Create: `js/embed/agent.js`
- Test: `test/agent.test.js`

**Interfaces:**
- Consumes: `PACKS` (Task 5), `getPath` (Task 1).
- Produces:
  - `respond({ text, scope, tab, packs, live, overrides })` → `{ reply: string, action?: Action }` where `live = { constants, names, vfx }` (live config objects keyed by ovKey) and `overrides = { constants, names, vfx, script }` (current diffs); `Action` is `{ type: 'set', ovKey, path, value, tab } | { type: 'prompt', filename, body } | { type: 'showTab', tab }`.
  - `buildPrompt({ tab, request, packs, overrides, matchedKnobs })` → `{ filename, body }`.
  - `matchKnobs(text, packs, tab)` → `[{ k, score }]` sorted best-first.
  - Task 7's chat executes actions.

- [ ] **Step 1: Write the failing test**

```js
// test/agent.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { respond, buildPrompt } from '../js/embed/agent.js';
import { PACKS } from '../js/embed/packs.gen.js';
import { VFX_DEFAULTS } from '../js/config/vfx.js';

function ctx(tab = 'VFX') {
  return {
    scope: 'tab', tab, packs: PACKS,
    live: { vfx: JSON.parse(JSON.stringify(VFX_DEFAULTS)), constants: {}, names: {} },
    overrides: { vfx: {}, constants: {}, names: {}, script: {} },
  };
}

test('help: a bare knob mention lists matches with current and default', () => {
  const r = respond({ ...ctx(), text: 'what does sound tap do?' });
  assert.match(r.reply, /sound\.tap/);
  assert.equal(r.action, undefined);
});

test('set: "set sound tap to 0.5" produces a set action', () => {
  const r = respond({ ...ctx(), text: 'set sound tap to 0.5' });
  assert.deepEqual(r.action, {
    type: 'set', ovKey: 'vfx', path: ['sound', 'tap'], value: 0.5, tab: 'VFX' });
  assert.match(r.reply, /0\.5/);
});

test('relative: "double the sound tap"', () => {
  const c = ctx();
  const before = c.live.vfx.sound.tap;
  const r = respond({ ...c, text: 'double the sound tap gain' });
  assert.equal(r.action.type, 'set');
  assert.equal(r.action.value, before * 2);
});

test('reset uses the default', () => {
  const c = ctx();
  c.live.vfx.sound.tap = 0.9;
  const r = respond({ ...c, text: 'reset sound tap' });
  assert.equal(r.action.value, VFX_DEFAULTS.sound.tap);
});

test('ambiguous match lists candidates instead of acting', () => {
  const r = respond({ ...ctx(), text: 'set glow to 3' });
  assert.equal(r.action, undefined);
  assert.match(r.reply, /which/i);
});

test('code-change request yields a prompt package', () => {
  const r = respond({ ...ctx('Workshop'), text: 'add a slider for conveyor speed to this tab' });
  assert.equal(r.action.type, 'prompt');
  assert.match(r.action.body, /Workshop/);
  assert.match(r.action.body, /add a slider for conveyor speed/);
  assert.match(r.action.body, /node scripts\/build-artifact\.js/);
});

test('suite scope answers overview questions and routes', () => {
  const r = respond({ ...ctx(), scope: 'suite', text: 'which tab edits the story beats?' });
  assert.match(r.reply, /Script/);
});

test('buildPrompt carries contract, overrides, request, SDLC steps', () => {
  const p = buildPrompt({
    tab: 'VFX', request: 'make sparks pool their DOM nodes', packs: PACKS,
    overrides: { vfx: { sound: { tap: 0.5 } } }, matchedKnobs: [],
  });
  assert.match(p.filename, /\.md$/);
  assert.match(p.body, /make sparks pool their DOM nodes/);
  assert.match(p.body, /"tap": 0\.5/);
  assert.match(p.body, /npm test/);
  assert.match(p.body, /gen-agent-packs/);
});
```

- [ ] **Step 2: Run it, verify it fails** — `node --test test/agent.test.js`: FAIL.

- [ ] **Step 3: Write `js/embed/agent.js`**

```js
// The dev-suite chat agent. Deterministic on purpose: the artifact runtime
// has no LLM capability, so the agent is the contract made conversational —
// generated knob packs in, knob edits and Claude Code prompt packages out.
// It never sees game source; docs/dev-suite/SDLC.md owns keeping packs true.

import { getPath } from '../dev/ovstore.js';

const SET_VERBS = /\b(set|change|make|put|turn)\b/;
const UP_VERBS = /\b(increase|raise|bump|boost)\b/;
const DOWN_VERBS = /\b(decrease|lower|reduce|drop)\b/;
const CODE_VERBS = /\b(add|implement|create|build|refactor|remove|rename|fix|improve|rewrite)\b/;

function tokens(s) {
  return String(s)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);
}

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'for', 'on', 'in', 'is',
  'it', 'this', 'that', 'what', 'which', 'does', 'do', 'set', 'change', 'make',
  'put', 'turn', 'reset', 'double', 'halve', 'increase', 'decrease', 'raise',
  'lower', 'reduce', 'bump', 'boost', 'drop', 'by', 'and', 'please', 'can',
  'you', 'tab', 'gain']);

function knobTokens(k) {
  const t = new Set();
  for (const seg of k.path) for (const w of tokens(String(seg))) t.add(w);
  return t;
}

// Score = how many meaningful query words hit this knob's path vocabulary.
// Exact word overlap only; ties are surfaced to the user, never guessed at.
export function matchKnobs(text, packs, tab) {
  const words = tokens(text).filter((w) => !STOP.has(w) && !/^[\d.]+%?$/.test(w));
  const scored = [];
  for (const k of packs.knobs) {
    if (tab && k.tab !== tab) continue;
    const kt = knobTokens(k);
    let score = 0;
    for (const w of words) if (kt.has(w)) score++;
    if (score > 0) scored.push({ k, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function parseValue(text) {
  const m = String(text).match(/(-?\d+(?:\.\d+)?)\s*%?/g);
  if (!m) return null;
  const last = m[m.length - 1].trim();
  return { n: parseFloat(last), pct: last.endsWith('%') };
}

function fmtPath(k) { return k.path.join('.'); }

function knobLine(k, live) {
  const cur = getPath(live[k.ovKey], k.path);
  const range = k.min !== undefined ? ` (range ${k.min}\u2013${k.max})` : '';
  return `${k.tab} \u00b7 ${fmtPath(k)} \u2014 current ${JSON.stringify(cur)}, default ${JSON.stringify(k.def)}${range}`;
}

const TAB_ORDER = ['Workshop', 'Hoard', 'Script', 'Balance', 'Names', 'VFX', 'State', 'Pacing'];

export function buildPrompt({ tab, request, packs, overrides, matchedKnobs }) {
  const pack = packs.tabs[tab] || packs.tabs['Dev Suite'];
  const knobList = (matchedKnobs && matchedKnobs.length
    ? matchedKnobs
    : packs.knobs.filter((k) => k.tab === tab).slice(0, 40))
    .map((k) => `- ${fmtPath(k)} (default ${JSON.stringify(k.def)}${k.min !== undefined ? `, range ${k.min}\u2013${k.max}` : ''})`)
    .join('\n');
  const ovs = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v && Object.keys(v).length));
  const body = `# Dev Suite change request \u2014 ${tab} tab

Repo: /Users/earchibald/work/tooth-fairy (tooth-fairy, vanilla ESM, zero deps, no innerHTML)

## Request (verbatim from the dev-suite chat)
${request}

## Tab context
${pack ? pack.summary : ''}

Visual: ${pack ? pack.visual : ''}

Files: ${pack ? pack.files : ''}

## Knob contract (paths this tab owns)
${knobList || '(no knobs \u2014 this tab is not knob-driven)'}

## Current override diff (live tuning state when this was written)
\`\`\`json
${JSON.stringify(ovs, null, 2)}
\`\`\`

## SDLC \u2014 after implementing
1. npm test (all green; add tests for new pure logic)
2. If knobs/tabs changed: update docs/dev-suite/agents/, then node scripts/gen-agent-packs.js
3. node scripts/build-artifact.js
4. Republish dist/dev-suite.html to the existing artifact (same URL)
`;
  return { filename: `dev-suite-request-${tab.toLowerCase().replace(/\s+/g, '-')}.md`, body };
}

export function respond({ text, scope, tab, packs, live, overrides }) {
  const effTab = scope === 'suite' ? null : tab;
  const lower = text.toLowerCase();
  const isReset = /\breset\b/.test(lower);
  const isDouble = /\bdouble\b/.test(lower);
  const isHalve = /\b(halve|half)\b/.test(lower);
  const val = parseValue(text);
  const wantsSet = SET_VERBS.test(lower) || UP_VERBS.test(lower) || DOWN_VERBS.test(lower)
    || isReset || isDouble || isHalve;
  const matches = matchKnobs(text, packs, effTab);

  // Code-change requests outrank knob edits: "add a slider for X" mentions
  // knob words but asks for new code.
  if (CODE_VERBS.test(lower) && !wantsSet) {
    const p = buildPrompt({ tab: tab || 'Dev Suite', request: text, packs, overrides,
      matchedKnobs: matches.slice(0, 8).map((s) => s.k) });
    return {
      reply: 'That needs a code change \u2014 I built a prompt package with this '
        + 'tab\u2019s contract and your live tuning state. Copy it (or save it) '
        + 'and hand it to Claude Code in the repo; the package ends with the '
        + 'rebuild/republish steps.',
      action: { type: 'prompt', ...p },
    };
  }

  if (wantsSet && matches.length) {
    const [best, second] = matches;
    if (second && second.score === best.score) {
      return { reply: 'Which one?\n' + matches.slice(0, 5)
        .map((s) => '\u2022 ' + knobLine(s.k, live)).join('\n') };
    }
    const k = best.k;
    const cur = getPath(live[k.ovKey], k.path);
    let value;
    if (isReset) value = k.def;
    else if (isDouble) value = typeof cur === 'number' ? cur * 2 : cur;
    else if (isHalve) value = typeof cur === 'number' ? cur / 2 : cur;
    else if (val && val.pct && (UP_VERBS.test(lower) || DOWN_VERBS.test(lower))) {
      const sign = DOWN_VERBS.test(lower) ? -1 : 1;
      value = typeof cur === 'number' ? +(cur * (1 + sign * val.n / 100)).toPrecision(6) : cur;
    } else if (val && (UP_VERBS.test(lower) || DOWN_VERBS.test(lower))) {
      const sign = DOWN_VERBS.test(lower) ? -1 : 1;
      value = typeof cur === 'number' ? cur + sign * val.n : cur;
    } else if (val) value = val.n;
    else return { reply: 'Give me a value: e.g. "set ' + fmtPath(k) + ' to 0.5", '
      + '"raise it 20%", or "reset it". Current: ' + knobLine(k, live) };
    return {
      reply: `Setting ${fmtPath(k)} \u2192 ${JSON.stringify(value)} (was ${JSON.stringify(cur)}, default ${JSON.stringify(k.def)}).`,
      action: { type: 'set', ovKey: k.ovKey, path: k.path, value, tab: k.tab },
    };
  }

  if (matches.length) {
    return { reply: 'Matches:\n' + matches.slice(0, 6)
      .map((s) => '\u2022 ' + knobLine(s.k, live)).join('\n')
      + '\n\nSay "set <knob> to <value>" and I will apply it live.' };
  }

  if (scope === 'suite') {
    // Overview routing: score the query against each tab's pack prose.
    const words = tokens(text).filter((w) => !STOP.has(w));
    let best = null;
    for (const [name, p] of Object.entries(packs.tabs)) {
      if (name === 'Dev Suite') continue;
      const hay = new Set(tokens(p.summary + ' ' + p.capabilities + ' ' + p.visual));
      let score = 0;
      for (const w of words) if (hay.has(w)) score++;
      if (!best || score > best.score) best = { name, p, score };
    }
    if (best && best.score > 0) {
      return {
        reply: `${best.name} \u2014 ${best.p.summary}\n\nSwitch there (Shift+`
          + `${TAB_ORDER.indexOf(best.name) + 1}) and ask its agent in the `
          + '"Current tab" chat for specifics.',
        action: { type: 'showTab', tab: best.name },
      };
    }
    const suite = packs.tabs['Dev Suite'];
    return { reply: (suite ? suite.summary + '\n\n' : '')
      + Object.entries(packs.tabs).filter(([n]) => n !== 'Dev Suite')
        .map(([n, p]) => `\u2022 ${n} \u2014 ${p.summary.split('\n')[0]}`).join('\n') };
  }

  const pack = packs.tabs[tab];
  return { reply: (pack ? pack.summary + '\n\n' + pack.capabilities : 'No pack for this tab.')
    + '\n\nAsk about a knob by name, tell me to set one, or describe a code '
    + 'change and I will package a prompt for Claude Code.' };
}
```

- [ ] **Step 4: Run tests** — `node --test test/agent.test.js`: PASS (if a test case exposes a matching gap, fix the STOP/verb lists or scoring — not the test). Then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add js/embed/agent.js test/agent.test.js
git commit -m "Deterministic dev-suite chat agent: knob help, NL edits, prompt packages"
```

---

### Task 7: Chat window + embed boot — `js/embed/chat.js`, `js/embed/boot.js`

The floating chat window and the embed bootstrapper. `boot.js` mounts the docked suite into `#tf-dev` and the chat into `#tf-chat-root`. The chat: collapsed by default (corner chip); `` ` `` raises (focus in textarea) and dismisses; ✕ in the corner dismisses; Esc dismisses; two tabs (Current tab / Dev Suite) switched by Ctrl+←/→; Enter submits, Shift+Enter newline; 3-line textarea; history pane starts at 10 lines and vertical resize adjusts it (min 3 lines, max screen height); history persists; auto-scrolls to bottom.

**Files:**
- Create: `js/embed/boot.js`, `js/embed/chat.js`
- Test: `test/chat-logic.test.js` (pure parts: history store round-trip, hotkey mapping)

**Interfaces:**
- Consumes: `mountDevSuiteDocked` (Task 3), `respond` (Task 6), `PACKS` (Task 5), `applyKnob`/`loadOv` (Task 1).
- Produces: `bootEmbed(ctx)` (consumed by main.js's Task 2 gate); `chatKeyAction(e, open)` → `'toggle' | 'dismiss' | 'prevTab' | 'nextTab' | null` (pure, exported for tests); history store `loadHistory()`/`saveHistory(entries)` (exported for tests).

- [ ] **Step 1: Write the failing test**

```js
// test/chat-logic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatKeyAction, loadHistory, saveHistory } from '../js/embed/chat.js';

const ev = (o) => ({ code: '', key: '', ctrlKey: false, metaKey: false,
  altKey: false, shiftKey: false, targetTag: 'BODY', ...o });

test('backquote toggles even while typing; Esc dismisses only when open', () => {
  assert.equal(chatKeyAction(ev({ code: 'Backquote', targetTag: 'TEXTAREA' }), false), 'toggle');
  assert.equal(chatKeyAction(ev({ code: 'Backquote' }), true), 'toggle');
  assert.equal(chatKeyAction(ev({ key: 'Escape' }), true), 'dismiss');
  assert.equal(chatKeyAction(ev({ key: 'Escape' }), false), null);
});

test('Ctrl+arrows switch chat tabs only while open', () => {
  assert.equal(chatKeyAction(ev({ key: 'ArrowRight', ctrlKey: true }), true), 'nextTab');
  assert.equal(chatKeyAction(ev({ key: 'ArrowLeft', ctrlKey: true }), true), 'prevTab');
  assert.equal(chatKeyAction(ev({ key: 'ArrowRight', ctrlKey: true }), false), null);
  assert.equal(chatKeyAction(ev({ key: 'ArrowRight' }), true), null);
});

test('history persists and truncates to 200 entries', () => {
  const many = Array.from({ length: 250 }, (_, i) => ({ tab: 'suite', who: 'you', text: 'm' + i }));
  saveHistory(many);
  const back = loadHistory();
  assert.equal(back.length, 200);
  assert.equal(back[199].text, 'm249');
});
```

- [ ] **Step 2: Run it, verify it fails** — `node --test test/chat-logic.test.js`: FAIL.

- [ ] **Step 3: Write `js/embed/chat.js`**

```js
// The floating dev-suite chat. Two agents behind two tabs: "Current tab"
// (scoped to the dev tab on screen — its pack only) and "Dev Suite" (the
// generalist that routes). Collapsed to a corner chip by default; raised it
// is a draggable, resizable window with persistent history.

import { respond } from './agent.js';
import { applyKnob, loadOv } from '../dev/ovstore.js';
import { DEFAULTS } from '../config/constants.js';
import { NAME_DEFAULTS } from '../config/names.js';
import { VFX_DEFAULTS } from '../config/vfx.js';

const HIST_KEY = 'tf-chat-history';
const HIST_MAX = 200;
let memoryHist = '[]';
const store = (typeof localStorage !== 'undefined') ? localStorage : {
  getItem: () => memoryHist,
  setItem: (k, v) => { memoryHist = v; },
  removeItem: () => { memoryHist = '[]'; },
};

export function loadHistory() {
  try { return JSON.parse(store.getItem(HIST_KEY) || '[]') || []; } catch { return []; }
}
export function saveHistory(entries) {
  try { store.setItem(HIST_KEY, JSON.stringify(entries.slice(-HIST_MAX))); } catch { /* full */ }
}

// Pure hotkey mapping (tested headless). Backquote toggles from anywhere —
// including mid-typing, so raising and dismissing are symmetric.
export function chatKeyAction(e, open) {
  if (e.code === 'Backquote' && !e.ctrlKey && !e.metaKey && !e.altKey) return 'toggle';
  if (!open) return null;
  if (e.key === 'Escape') return 'dismiss';
  if (e.ctrlKey && e.key === 'ArrowRight') return 'nextTab';
  if (e.ctrlKey && e.key === 'ArrowLeft') return 'prevTab';
  return null;
}

const CHAT_CSS = `
#tfChat { position: fixed; right: 18px; bottom: 18px; z-index: 60;
  font: 13px/1.45 ui-monospace, Menlo, monospace; color: #d7dceb; }
.tfChatChip { background: #171b27; color: #cfa8ea; border: 1px solid #cfa8ea44;
  border-radius: 999px; padding: 8px 14px; cursor: pointer; font: inherit; }
.tfChatWin { position: fixed; right: 18px; bottom: 18px; width: 420px;
  min-width: 320px; min-height: 200px; max-width: 92vw; max-height: 100vh;
  display: flex; flex-direction: column; background: #0b0e17f8;
  border: 1px solid #cfa8ea44; border-radius: 12px; overflow: hidden;
  font: 13px/1.45 ui-monospace, Menlo, monospace; color: #d7dceb;
  box-shadow: 0 12px 40px #000c; }
.tfChatHead { display: flex; align-items: center; gap: 4px;
  padding: 8px 10px 0; cursor: grab; user-select: none; }
.tfChatHead .devTab { font: inherit; background: none; border: 1px solid #ffffff22;
  border-bottom: none; border-radius: 8px 8px 0 0; color: #8b93ad;
  padding: 4px 10px; cursor: pointer; }
.tfChatHead .devTab.on { color: #d7dceb; background: #171b27; }
.tfChatHead .x { margin-left: auto; background: none; border: none;
  color: #8b93ad; font: inherit; font-size: 15px; cursor: pointer; padding: 2px 8px; }
.tfChatLog { flex: 1; overflow-y: auto; padding: 10px 12px; min-height: 57px;
  background: #171b27; border-top: 1px solid #ffffff22; margin-top: 8px;
  display: flex; flex-direction: column; gap: 8px; }
.tfChatMsg { white-space: pre-wrap; overflow-wrap: anywhere; }
.tfChatMsg.you { color: #cfa8ea; }
.tfChatMsg .who { color: #6a7188; font-size: 11px; display: block; }
.tfChatIn { display: flex; gap: 8px; padding: 10px 12px; background: #171b27;
  border-top: 1px solid #ffffff14; }
.tfChatIn textarea { flex: 1; font: inherit; font-size: 12px; background: #0007;
  color: #d7dceb; border: 1px solid #ffffff22; border-radius: 8px;
  padding: 6px 8px; resize: none; }
.tfChatIn button { font: inherit; font-size: 12px; background: #202a41;
  color: #d7dceb; border: 1px solid #7b96c9; border-radius: 8px;
  padding: 6px 12px; cursor: pointer; align-self: flex-end; }
.tfChatNote { color: #6a7188; font-size: 11px; padding: 0 12px 8px; background: #171b27; }
.tfChatGrip { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px;
  cursor: nwse-resize; }
`;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

export function mountChat({ root, ctx, packs, dock }) {
  const style = document.createElement('style');
  style.textContent = CHAT_CSS;
  document.head.appendChild(style);

  const host = el('div');
  host.id = 'tfChat';
  root.appendChild(host);
  const chip = el('button', 'tfChatChip', '\u2726 chat  `');
  chip.dataset.testid = 'chat-chip';
  host.appendChild(chip);

  let win = null;
  let logEl = null;
  let inputEl = null;
  let chatTab = 'tab';               // 'tab' (Current tab) | 'suite' (Dev Suite)
  let history = loadHistory();
  const live = { constants: ctx.cfg, names: ctx.names, vfx: ctx.vfx };
  const defaults = { constants: DEFAULTS, names: NAME_DEFAULTS, vfx: VFX_DEFAULTS };
  const overrides = () => ({
    constants: loadOv('constants'), names: loadOv('names'),
    vfx: loadOv('vfx'), script: loadOv('script'),
  });

  function isOpen() { return !!win && !win.hidden; }

  function render() {
    while (logEl.firstChild) logEl.removeChild(logEl.firstChild);
    for (const m of history.filter((m) => m.tab === chatTab)) {
      const box = el('div', 'tfChatMsg' + (m.who === 'you' ? ' you' : ''));
      box.appendChild(el('span', 'who', m.who === 'you' ? 'you' : 'agent'));
      box.appendChild(document.createTextNode(m.text));
      logEl.appendChild(box);
    }
    logEl.scrollTop = logEl.scrollHeight;   // auto-scroll to bottom, always
  }

  function push(who, text) {
    history.push({ tab: chatTab, who, text, at: Date.now() });
    history = history.slice(-HIST_MAX);
    saveHistory(history);
    if (logEl) render();
  }

  async function deliverPrompt(action) {
    const delivered = [];
    try {
      await navigator.clipboard.writeText(action.body);
      delivered.push('copied to clipboard');
    } catch { /* denied */ }
    try {
      const use = (typeof claude !== 'undefined' && claude && claude.use)
        ? claude.use.bind(claude) : null;
      const downloads = use ? await use('downloads') : null;
      if (downloads) {
        await downloads.save({ filename: action.filename, data: action.body });
        delivered.push('saved as ' + action.filename);
      }
    } catch (err) {
      if (err && err.code === 'declined') delivered.push('save declined');
    }
    push('agent', delivered.length
      ? '(' + delivered.join('; ') + ' \u2014 paste or open it in Claude Code at the repo)'
      : 'Clipboard and save were both unavailable \u2014 here is the package:\n\n' + action.body);
  }

  function runAgent(text) {
    const scope = chatTab === 'suite' ? 'suite' : 'tab';
    const r = respond({ text, scope, tab: dock.activeTab(), packs, live, overrides: overrides() });
    push('agent', r.reply);
    const a = r.action;
    if (!a) return;
    if (a.type === 'set') {
      const res = applyKnob({ defaults: defaults[a.ovKey], live: live[a.ovKey],
        ovKey: a.ovKey, path: a.path, value: a.value });
      if (!res.ok) push('agent', 'Rejected: ' + res.reason);
      else if (dock.activeTab() === a.tab) dock.show(a.tab);   // rebuild rows to reflect it
      if (res.ok && ctx.ui && ctx.ui.applyTapVars) ctx.ui.applyTapVars();
    } else if (a.type === 'showTab') {
      dock.show(a.tab);
    } else if (a.type === 'prompt') {
      deliverPrompt(a);
    }
  }

  function submit() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    push('you', text);
    runAgent(text);
  }

  function setChatTab(next) {
    chatTab = next;
    for (const b of win.querySelectorAll('.tfChatHead .devTab')) {
      b.classList.toggle('on', b.dataset.tab === next);
    }
    render();
  }

  function build() {
    win = el('div', 'tfChatWin');
    win.dataset.testid = 'chat-window';
    const head = el('div', 'tfChatHead');
    for (const [id, label] of [['tab', 'Current tab'], ['suite', 'Dev Suite']]) {
      const b = el('button', 'devTab', label);
      b.dataset.tab = id;
      b.addEventListener('click', () => setChatTab(id));
      head.appendChild(b);
    }
    const x = el('button', 'x', '\u2715');
    x.dataset.testid = 'chat-close';
    x.addEventListener('click', hide);
    head.appendChild(x);
    logEl = el('div', 'tfChatLog');
    logEl.style.height = '190px';        // ~10 history lines to start
    const inBar = el('div', 'tfChatIn');
    inputEl = document.createElement('textarea');
    inputEl.rows = 3;
    inputEl.placeholder = 'ask, tune ("set sound tap to 0.5"), or request code\u2026';
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    const send = el('button', null, 'send \u23ce');
    send.addEventListener('click', submit);
    inBar.append(inputEl, send);
    const note = el('div', 'tfChatNote',
      'Ctrl+\u2190/\u2192 switch agents \u00b7 Esc or ` dismiss \u00b7 Enter sends, Shift+Enter newline');
    win.append(head, logEl, inBar, note);

    // Manual resize grip (bottom-right): height flows into the history pane
    // (flex:1), clamped between 3 lines and the screen. CSS resize:both does
    // not play well with a bottom-right-anchored fixed element, so the grip
    // resizes explicitly.
    const grip = el('div', 'tfChatGrip');
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = win.getBoundingClientRect();
      const move = (ev) => {
        win.style.width = Math.max(320, rect.width + (ev.clientX - startX)) + 'px';
        win.style.height = Math.min(window.innerHeight,
          Math.max(200, rect.height + (ev.clientY - startY))) + 'px';
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    win.appendChild(grip);
    document.body.appendChild(win);

    // Drag by the header; dragging re-anchors by left/top so both axes stay
    // free afterwards.
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const rect = win.getBoundingClientRect();
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      const move = (ev) => {
        win.style.left = Math.max(0, ev.clientX - dx) + 'px';
        win.style.top = Math.max(0, ev.clientY - dy) + 'px';
        win.style.right = 'auto';
        win.style.bottom = 'auto';
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    setChatTab('tab');
  }

  function showWin() {
    if (!win) build();
    win.hidden = false;
    chip.hidden = true;
    render();
    inputEl.focus();
  }
  function hide() {
    if (win) win.hidden = true;
    chip.hidden = false;
  }
  function toggle() { if (isOpen()) hide(); else showWin(); }

  chip.addEventListener('click', showWin);
  document.addEventListener('keydown', (e) => {
    const act = chatKeyAction({ code: e.code, key: e.key, ctrlKey: e.ctrlKey,
      metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey,
      targetTag: e.target && e.target.tagName || '' }, isOpen());
    if (!act) return;
    e.preventDefault();
    if (act === 'toggle') toggle();
    else if (act === 'dismiss') hide();
    else if (act === 'nextTab' || act === 'prevTab') {
      setChatTab(chatTab === 'tab' ? 'suite' : 'tab');
    }
  });

  return { toggle, isOpen };
}
```

- [ ] **Step 4: Write `js/embed/boot.js`**

```js
// Embed bootstrap: docked dev suite on the left, chat floating above.
// main.js calls this instead of mounting the overlay panel when TF_EMBED.

import { mountDevSuiteDocked } from '../dev/panel.js';
import { mountChat } from './chat.js';
import { PACKS } from './packs.gen.js';

export function bootEmbed(ctx) {
  const devHost = document.getElementById('tf-dev');
  const chatRoot = document.getElementById('tf-chat-root');
  if (!devHost || !chatRoot) {
    console.warn('[embed] shell hosts missing; embed boot aborted');
    return;
  }
  const dock = mountDevSuiteDocked(ctx, devHost);
  mountChat({ root: chatRoot, ctx, packs: PACKS, dock });
}
```

- [ ] **Step 5: Run tests** — `node --test test/chat-logic.test.js`: PASS; `npm test`: all green (the bundle test now includes the embed modules automatically).

- [ ] **Step 6: Commit**

```bash
git add js/embed/chat.js js/embed/boot.js test/chat-logic.test.js
git commit -m "Floating two-agent chat window and embed bootstrap"
```

---

### Task 8: SDLC doc, README, version bump

**Files:**
- Create: `docs/dev-suite/SDLC.md`
- Modify: `README.md` (after the Dev panel section), `js/version.js` (bump minor, e.g. v0.9.x → v0.10.0)

**Interfaces:** none (documentation), but the SDLC doc's release-loop steps must stay identical to the agent's prompt-package footer (Task 6).

- [ ] **Step 1: Write `docs/dev-suite/SDLC.md`**

```markdown
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
```

- [ ] **Step 2: Update `README.md`**

After the Dev panel section, add:

```markdown
## Dev Suite artifact

`node scripts/build-artifact.js` bundles the whole game + dev suite into
`dist/dev-suite.html`, a self-contained Claude Artifact page: dev panel on
the left, a live copy of the game on the right (game hotkeys off; `[`/`]`
and Shift+1..8 drive the dev tabs), and a floating chat agent (`` ` ``) that
explains settings, applies natural-language tuning, and packages code
requests for local Claude Code. Process: `docs/dev-suite/SDLC.md`.
```

- [ ] **Step 3: Bump `js/version.js`** minor version (read the file first; e.g. `v0.9.1` → `v0.10.0`). Then regenerate packs (the version rides inside them) and run the suite: `node scripts/gen-agent-packs.js && npm test` — all green.

- [ ] **Step 4: Commit**

```bash
git add docs/dev-suite/SDLC.md README.md js/version.js js/embed/packs.gen.js
git commit -m "Dev Suite SDLC doc, README, version bump"
```

---

### Task 9: Browser verification of the local build

Serve `dist/` and drive it in Chrome (claude-in-chrome tools). This task is executed by the MAIN session (browser tools + judgment), not a subagent. Known pitfalls (memory): occluded windows freeze rAF — keep the tab focused/visible; verify via DOM reads and pixel sampling, not only screenshots.

- [ ] **Step 1:** `node scripts/build-artifact.js && python3 -m http.server 8125 --directory dist` and open `http://localhost:8125/dev-suite-local.html` in Chrome.
- [ ] **Step 2: Verify, fixing anything broken before moving on:**
  - Game boots on the right (tooth visible, pointer tap works), dev suite docked left on Workshop tab.
  - Game hotkeys dead (Space does not tap); `[`/`]` cycle dev tabs; `Shift+3` jumps to Script.
  - Workshop sliders move live values; preview buttons fire; tap sound plays (embedded clip, no fetch).
  - Balance/Names/VFX knob edits mark rows changed and persist across reload (localStorage present locally).
  - State tab grants work; Pacing run completes and renders the report.
  - `` ` `` raises chat focused; Enter submits; Shift+Enter newlines; Esc and ✕ dismiss; Ctrl+←/→ switches agent tabs; history survives reload; log auto-scrolls.
  - Chat: "set sound tap to 0.5" applies (VFX tab row shows changed); "which tab edits the story beats?" in the Dev Suite chat tab routes to Script; "add a button that clears the log" produces a prompt package (clipboard).
  - Chat window drag + corner-grip resize work; history pane respects its minimum.
- [ ] **Step 3:** Fix any failures (systematic-debugging skill), re-run `npm test`, commit fixes with focused messages.

---

### Task 10: Publish the artifact and verify live

Executed by the MAIN session (Artifact tool access).

- [ ] **Step 1:** Rebuild: `node scripts/build-artifact.js`.
- [ ] **Step 2:** Publish `dist/dev-suite.html` via the Artifact tool: favicon `🦷`, description "tooth fairy Dev Suite — docked dev panel, live game, and settings/chat agents", capabilities `{downloads: true}`.
- [ ] **Step 3:** Open the published URL in Chrome and re-run the Task 9 chat + hotkey + knob spot checks; specifically confirm: the storage-shim path (if localStorage is denied, the suite still runs), and prompt-package delivery (clipboard and/or the downloads consent prompt; `.md` is on the allowlist).
- [ ] **Step 4:** Record the artifact URL in `docs/dev-suite/SDLC.md` ("Artifact URL:" line), commit, and report the URL to the user.

---

## Self-review notes

- Spec coverage: desktop layout ✓ (Task 4 shell), embedded-game hotkey flag ✓ (Task 2), chat purposes (help / NL settings / code self-improvement with approval) ✓ (Task 6), contract-not-code context ✓ (Task 5 packs), per-tab specialization ✓ (scope='tab' + pack routing), seamless prompt delivery ✓ (clipboard + downloads, Task 7), collapsed-by-default floating resizable persistent auto-scroll chat with all keyboard behaviors ✓ (Task 7), 3-line input / ~10-line history / 3-line-to-screen-height resize ✓ (Task 7), SDLC ✓ (Tasks 5+8), two chat tabs with hotkey switching ✓ (Tasks 6+7).
- The artifact runtime has NO LLM capability (verified this session: only `downloads`, `mcp` are available, and no LLM-backed connector exists); the goal's "if this is not possible → seamless prompt delivery to local Claude Code" clause is the implemented path, stated honestly in the chat UI.
- Type consistency: `applyKnob` signature identical in Tasks 1/3/6/7; `PACKS.knobs[i] = { tab, ovKey, path, def, min?, max? }` in Tasks 5/6; dock API `{ activeTab(), show(), tabNames }` in Tasks 3/7; shell ids `#tf-dev`/`#tf-chat-root` in Tasks 4/7.
