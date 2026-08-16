// The developer settings page. Six tabs: Script · Balance · Names · VFX ·
// State · Pacing. Every control drives the LIVE config objects the running
// game reads — never a preview copy — and persists only changed keys as an
// override layer in localStorage, merged over frozen defaults at boot.

import { DEFAULTS } from '../config/constants.js';
import { NAME_DEFAULTS } from '../config/names.js';
import { VFX_DEFAULTS } from '../config/vfx.js';
import { SCRIPT_DEFAULTS } from '../config/script.js';
import { runBot } from './bot.js';
import { fmt } from '../engine/math.js';
import { play } from '../ui/sound.js';
import { OV, loadOv, saveOv, setPath, deletePath, getPath, applyKnob } from './ovstore.js';

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

const CSS = `
.devChip { color: #cfa8ea; border-color: #cfa8ea44; }
.devPanel { position: fixed; inset: 0; z-index: 40; background: #0b0e17f5;
  display: flex; flex-direction: column; color: #d7dceb;
  font: 13px/1.45 ui-monospace, Menlo, monospace; }
.devHead { display: flex; align-items: center; gap: 4px; padding: 10px 12px 0;
  flex-wrap: wrap; }
.devTab { font: inherit; background: none; border: 1px solid #ffffff22;
  border-bottom: none; border-radius: 8px 8px 0 0; color: #8b93ad;
  padding: 6px 12px; cursor: pointer; }
.devTab.on { color: #d7dceb; background: #171b27; }
.devHead .x { margin-left: auto; font: inherit; background: none; border: none;
  color: #8b93ad; font-size: 16px; cursor: pointer; padding: 4px 8px; }
.devBody { flex: 1; overflow-y: auto; background: #171b27; padding: 14px;
  border-top: 1px solid #ffffff22; }
.devBody h3 { font-size: 11px; letter-spacing: 0.14em; color: #8b93ad;
  margin: 18px 0 6px; text-transform: uppercase; }
.devBody h3:first-child { margin-top: 0; }
.devRow { display: flex; align-items: center; gap: 8px; padding: 3px 0;
  border-bottom: 1px solid #ffffff08; flex-wrap: wrap; }
.devRow .path { flex: 0 0 240px; color: #a8b0c8; font-size: 12px;
  overflow-wrap: anywhere; }
.devRow input[type="number"], .devRow input[type="text"] {
  font: inherit; font-size: 12px; background: #0007; color: #d7dceb;
  border: 1px solid #ffffff22; border-radius: 6px; padding: 4px 7px; width: 110px; }
.devRow input[type="text"] { width: 220px; }
.devRow input.wide { flex: 1; min-width: 200px; width: auto; }
.devRow input.bad { border-color: #c9707b; }
.devRow.changed .path { color: #cfa8ea; }
.devRow .def { color: #6a7188; font-size: 11px; }
.devRow .mini { font: inherit; font-size: 11px; background: #0007;
  border: 1px solid #ffffff22; border-radius: 6px; color: #8b93ad;
  cursor: pointer; padding: 3px 8px; }
.devRow .mini:hover { color: #d7dceb; }
.devBeat { border: 1px solid #ffffff14; border-radius: 10px; padding: 8px 10px;
  margin-bottom: 10px; background: #12172a; }
.devBeat .bhead { display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  margin-bottom: 6px; color: #8b93ad; font-size: 11px; }
.devBeat .bhead b { color: #cfa8ea; }
.devBeat textarea { width: 100%; font: inherit; font-size: 12px;
  background: #0007; color: #d7dceb; border: 1px solid #ffffff22;
  border-radius: 6px; padding: 6px; resize: vertical; min-height: 40px; }
.devBeat .brow { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
.devBeat input { font: inherit; font-size: 12px; background: #0007;
  color: #d7dceb; border: 1px solid #ffffff22; border-radius: 6px;
  padding: 4px 7px; }
.devNote { color: #6a7188; font-size: 12px; margin: 6px 0 12px; }
.devBar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.devBar button { font: inherit; font-size: 12px; background: #202a41;
  color: #d7dceb; border: 1px solid #7b96c9; border-radius: 8px;
  padding: 6px 12px; cursor: pointer; }
.devBar button.warn { border-color: #c9707b; color: #c98b8b; }
.devPre { background: #0007; border-radius: 8px; padding: 10px; font-size: 11px;
  overflow-x: auto; white-space: pre; }
.devTable { border-collapse: collapse; font-size: 11px; width: 100%; }
.devTable td, .devTable th { border-bottom: 1px solid #ffffff10;
  padding: 3px 8px; text-align: left; }
.devTable td.warn { color: #c98b7b; }
.devPanel--drawer { inset: 0 0 45% 0; border-bottom: 1px solid #ffffff22; }
.devRow input[type="range"] { flex: 1; min-width: 160px; max-width: 320px; }
.devRow .val { color: #cfa8ea; min-width: 56px; font-size: 12px; text-align: right; }
.devBar.devSticky { position: sticky; top: -14px; z-index: 5; background: #171b27;
  padding: 10px 0 8px; margin: -14px 0 8px; box-shadow: 0 6px 8px -6px #000a; }
.devRepeat { display: inline-flex; align-items: center; gap: 5px; color: #d7dceb;
  font-size: 12px; user-select: none; }
`;

export function mountDevPanel(ctx) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const chip = el('button', 'chip devChip', 'dev');
  chip.dataset.testid = 'dev-open';
  const topbar = ctx.app.querySelector('.topbar');
  topbar.insertBefore(chip, topbar.querySelector('[data-testid="settings-open"]'));

  let panel = null;
  chip.addEventListener('click', () => {
    if (!panel) panel = buildPanel(ctx);
    panel.toggle();
  });
}

function buildPanel(ctx) {
  const panel = el('div', 'devPanel');
  panel.hidden = true;
  panel.dataset.testid = 'dev-panel';
  const head = el('div', 'devHead');
  const body = el('div', 'devBody');
  panel.append(head, body);
  document.body.appendChild(panel);

  const tabs = {
    Workshop: tabWorkshop, Hoard: tabHoard, Script: tabScript, Balance: tabBalance,
    Names: tabNames, VFX: tabVfx, State: tabState, Pacing: tabPacing,
  };
  const built = {};
  let active = null;
  let onHide = null;

  for (const name of Object.keys(tabs)) {
    const btn = el('button', 'devTab', name);
    btn.dataset.testid = 'dev-tab-' + name.toLowerCase();
    btn.addEventListener('click', () => show(name));
    head.appendChild(btn);
  }
  const close = el('button', 'x', '✕');
  close.addEventListener('click', () => { panel.hidden = true; stopHide(); });
  head.appendChild(close);

  function stopHide() { if (onHide) { onHide(); onHide = null; } }

  function show(name) {
    stopHide();
    active = name;
    for (const btn of head.querySelectorAll('.devTab')) {
      btn.classList.toggle('on', btn.textContent === name);
    }
    while (body.firstChild) body.removeChild(body.firstChild);
    panel.classList.toggle('devPanel--drawer', name === 'Workshop' || name === 'Hoard');
    onHide = tabs[name](body, ctx) || null;
  }

  show('Workshop');
  return {
    toggle() {
      panel.hidden = !panel.hidden;
      if (!panel.hidden && active) show(active);
      else stopHide();
    },
  };
}

// ---------- shared: leaf-walking knob rows ----------

function knobRows(body, { defaults, live, ovKey, kind }) {
  function makeRow(section, path, defVal, inArray) {
    const row = el('div', 'devRow');
    const label = el('span', 'path', path.join('.'));
    row.appendChild(label);
    const isColor = typeof defVal === 'string' && /^#[0-9a-f]{3,8}$/i.test(defVal);
    const isNum = typeof defVal === 'number';
    const input = document.createElement('input');
    input.type = isColor ? 'color' : isNum ? 'number' : 'text';
    if (!isNum && !isColor) input.className = 'wide';
    if (isNum) input.step = 'any';
    const current = getPath(live, path);
    input.value = String(current);
    const def = el('span', 'def', 'default ' + defVal);
    const reset = el('button', 'mini', 'reset');
    row.append(input, def, reset);
    row.classList.toggle('changed', current !== defVal);

    function apply(raw) {
      let value = raw;
      if (isNum) value = Number(raw);
      if (isNum && String(raw).trim() === '') { input.classList.add('bad'); return; }
      const r = applyKnob({ defaults, live, ovKey, path, value });
      if (!r.ok) { input.classList.add('bad'); return; }
      input.classList.remove('bad');
      row.classList.toggle('changed', value !== defVal);
    }
    input.addEventListener('input', () => apply(input.value));
    reset.addEventListener('click', () => {
      input.value = String(defVal);
      apply(isNum ? String(defVal) : defVal);
    });
    section.appendChild(row);
  }

  function walk(section, defs, path) {
    for (const key of Object.keys(defs)) {
      const d = defs[key];
      const p = [...path, key];
      if (Array.isArray(d)) {
        d.forEach((v, i) => { if (typeof v === 'number') makeRow(section, [...p, i], v, true); });
      } else if (d && typeof d === 'object') {
        walk(section, d, p);
      } else {
        makeRow(section, p, d);
      }
    }
  }

  for (const top of Object.keys(defaults)) {
    body.appendChild(el('h3', null, top));
    const section = el('div');
    body.appendChild(section);
    const d = defaults[top];
    if (d && typeof d === 'object') walk(section, d, [top]);
    else makeRow(section, [top], d);
  }
  return kind;
}

function ovBar(body, ctx, note) {
  const bar = el('div', 'devBar');
  const copyAll = el('button', null, 'copy all overrides');
  copyAll.addEventListener('click', () => {
    const all = {};
    for (const k of Object.keys(OV)) {
      const parsed = loadOv(k);
      if (Object.keys(parsed).length) all[k] = parsed;
    }
    navigator.clipboard.writeText(JSON.stringify(all, null, 2)).catch(() => {});
    copyAll.textContent = 'copied';
    setTimeout(() => { copyAll.textContent = 'copy all overrides'; }, 1200);
  });
  const clearAll = el('button', 'warn', 'clear all overrides + reload');
  clearAll.addEventListener('click', () => {
    for (const storageKey of Object.values(OV)) localStorage.removeItem(storageKey);
    location.reload();
  });
  const reload = el('button', null, 'reload');
  reload.addEventListener('click', () => location.reload());
  bar.append(copyAll, reload, clearAll);
  body.appendChild(bar);
  if (note) body.appendChild(el('div', 'devNote', note));
}

// ---------- Workshop ----------
// The juice studio: tune the tap button and the banner live, preview
// without playing, then save the liked values into the repo and release.

const WORKSHOP_KNOBS = [
  { title: 'tap pop', preview: 'tap', rows: [
    { path: ['juice', 'tapPop', 'scale'], min: 0.9, max: 1.8, step: 0.01 },
    { path: ['juice', 'tapPop', 'ms'], min: 40, max: 500, step: 5 },
  ] },
  { title: 'tap glow', preview: 'tap', rows: [
    { path: ['juice', 'tapGlow', 'size'], min: 0, max: 60, step: 1 },
    { path: ['juice', 'tapGlow', 'alpha'], min: 0, max: 1, step: 0.01 },
    { path: ['juice', 'tapGlow', 'ms'], min: 60, max: 1200, step: 10 },
  ] },
  { title: 'tap sparks', preview: 'tap', rows: [
    { path: ['juice', 'tapSparks', 'count'], min: 0, max: 40, step: 1 },
    { path: ['juice', 'tapSparks', 'size'], min: 0.5, max: 8, step: 0.1 },
    { path: ['juice', 'tapSparks', 'spreadPx'], min: 6, max: 120, step: 2 },
    { path: ['juice', 'tapSparks', 'lifeMs'], min: 100, max: 2000, step: 20 },
  ] },
  { title: 'incoming teeth', preview: 'flowShort', rows: [
    { path: ['juice', 'inbound', 'glowSize'], min: 0, max: 40, step: 1 },
    { path: ['juice', 'inbound', 'glowAlpha'], min: 0, max: 1, step: 0.01 },
    { path: ['juice', 'inbound', 'trailPerS'], min: 0, max: 60, step: 1 },
    { path: ['juice', 'inbound', 'trailLife'], min: 100, max: 2000, step: 20 },
  ] },
  { title: 'landing', preview: 'flowShort', rows: [
    { path: ['juice', 'landSparks', 'count'], min: 0, max: 40, step: 1 },
    { path: ['juice', 'landSparks', 'size'], min: 0.5, max: 8, step: 0.1 },
    { path: ['juice', 'landSparks', 'lifeMs'], min: 100, max: 2000, step: 20 },
  ] },
  { title: 'powerup sweep', preview: 'buy', rows: [
    { path: ['juice', 'buySweep', 'alpha'], min: 0, max: 1, step: 0.01 },
    { path: ['juice', 'buySweep', 'ms'], min: 200, max: 2500, step: 50 },
  ] },
  { title: 'scale ramp', preview: 'flowShort', rows: [
    { path: ['juice', 'ramp', 'rateLo'], min: 1, max: 10000, step: 1 },
    { path: ['juice', 'ramp', 'rateHi'], min: 1e6, max: 1e12, step: 1e6 },
    { path: ['juice', 'ramp', 'sizeHi'], min: 1, max: 4, step: 0.05 },
    { path: ['juice', 'ramp', 'glowHi'], min: 1, max: 6, step: 0.05 },
    { path: ['juice', 'ramp', 'trailHi'], min: 1, max: 8, step: 0.05 },
    { path: ['juice', 'ramp', 'scrollHi'], min: 1, max: 10, step: 0.1 },
  ] },
];

// One live range-slider row: writes through to the live vfx object AND the
// tf-ov-vfx override layer, exactly like the Workshop's original rows.
function sliderRow(body, ctx, knob, onChange) {
  const defVal = getPath(VFX_DEFAULTS, knob.path);
  const row = el('div', 'devRow');
  row.appendChild(el('span', 'path', knob.path[knob.path.length - 1]));
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(knob.min);
  input.max = String(knob.max);
  input.step = String(knob.step);
  const current = getPath(ctx.vfx, knob.path);
  input.value = String(current);
  const val = el('span', 'val', String(current));
  const def = el('span', 'def', 'default ' + defVal);
  const reset = el('button', 'mini', 'reset');
  row.append(input, val, def, reset);
  row.classList.toggle('changed', current !== defVal);
  function apply(value) {
    applyKnob({ defaults: VFX_DEFAULTS, live: ctx.vfx, ovKey: 'vfx', path: knob.path, value });
    val.textContent = String(value);
    row.classList.toggle('changed', value !== defVal);
    if (onChange) onChange();
  }
  input.addEventListener('input', () => apply(Number(input.value)));
  reset.addEventListener('click', () => { input.value = String(defVal); apply(defVal); });
  body.appendChild(row);
}

function tabWorkshop(body, ctx) {
  body.appendChild(el('div', 'devNote',
    'the juice studio. sliders apply live and persist like every dev override. ' +
    'preview fires the real feedback paths; the game stays visible below.'));

  // ---- preview bar (sticky; hotkeys; repeat) ----
  const preview = el('div', 'devBar devSticky');
  const now = () => performance.now();
  let flowTimer = null;
  let seqTimers = [];
  let autoTimer = null;
  let repeatTimer = null;
  let lastAction = null;

  function flow(rate, ms) {
    clearInterval(flowTimer);
    ctx.ui.conveyor.setRate(rate);
    const until = now() + ms;
    flowTimer = setInterval(() => {
      if (now() > until) { clearInterval(flowTimer); return; }
      ctx.ui.conveyor.creditPreview(rate * 0.2, now());
    }, 200);
  }

  // ms is the effect's full duration — the repeat loop refires after it.
  const ACTIONS = {
    tap: { label: 'tap', key: '1', ms: 700,
      run: () => { ctx.ui.pressTap(); ctx.ui.flashTapGlow(); ctx.ui.conveyor.tapPulse(now()); } },
    buy: { label: 'powerup', key: '2', ms: 1200,
      run: () => ctx.ui.conveyor.buySweep(now()) },
    trickle: { label: 'flow: trickle', key: '3', ms: 5000, run: () => flow(1e2, 5000) },
    busy: { label: 'flow: busy', key: '4', ms: 5000, run: () => flow(1e6, 5000) },
    storm: { label: 'flow: storm', key: '5', ms: 5000, run: () => flow(1e12, 5000) },
    seq: { label: 'all in sequence', key: 'a', ms: 8200, run: () => {
      seqTimers.forEach(clearTimeout);
      seqTimers = [];
      ACTIONS.tap.run();
      seqTimers.push(setTimeout(() => ACTIONS.buy.run(), 700));
      seqTimers.push(setTimeout(() => flow(1e2, 1800), 2000));
      seqTimers.push(setTimeout(() => flow(1e6, 1800), 4000));
      seqTimers.push(setTimeout(() => flow(1e12, 1800), 6000));
    } },
  };

  function armRepeat() {
    clearTimeout(repeatTimer);
    repeatTimer = null;
    if (!rep.checked || !lastAction) return;
    repeatTimer = setTimeout(() => {
      if (rep.checked && lastAction) { ACTIONS[lastAction].run(); armRepeat(); }
    }, ACTIONS[lastAction].ms + 300);
  }

  function press(key) {
    lastAction = key;
    ACTIONS[key].run();
    armRepeat();
  }

  for (const key of Object.keys(ACTIONS)) {
    const a = ACTIONS[key];
    const b = el('button', null, a.label + ' [' + a.key.toUpperCase() + ']');
    b.addEventListener('click', () => press(key));
    preview.appendChild(b);
  }
  const repLabel = el('label', 'devRepeat');
  const rep = document.createElement('input');
  rep.type = 'checkbox';
  repLabel.append(rep, document.createTextNode(' repeat [R]'));
  rep.addEventListener('change', armRepeat);
  preview.appendChild(repLabel);
  body.append(el('h3', null, 'preview'), preview);

  // Hotkeys live while this tab is visible; typing fields keep their keys.
  function onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'r') {
      rep.checked = !rep.checked;
      armRepeat();
      e.preventDefault();
      return;
    }
    const key = Object.keys(ACTIONS).find((x) => ACTIONS[x].key === k);
    if (key) { press(key); e.preventDefault(); }
  }
  document.addEventListener('keydown', onKey);

  // ---- sliders (each fires its group's preview on change, debounced) ----
  function autoPreview(key) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (key === 'flowShort') flow(1e6, 1500);
      else ACTIONS[key].run(); // auto-previews never become the repeat target
    }, 150);
  }
  for (const group of WORKSHOP_KNOBS) {
    body.appendChild(el('h3', null, group.title));
    for (const knob of group.rows) {
      sliderRow(body, ctx, knob, () => {
        ctx.ui.applyTapVars();
        autoPreview(group.preview);
      });
    }
  }

  // ---- save / release ----
  body.appendChild(el('h3', null, 'ship it'));
  const shipBar = el('div', 'devBar');
  const note = el('div', 'devNote', '');
  const save = el('button', null, 'save to project');
  const release = el('button', null, 'release');
  release.disabled = true;
  async function post(url, bodyObj) {
    const res = await fetch(url, { method: 'POST', body: bodyObj ? JSON.stringify(bodyObj) : '{}' });
    if (res.status === 501 || res.status === 405 && !res.headers.get('content-type')?.includes('json')) {
      throw new Error('no api');
    }
    if (!res.headers.get('content-type')?.includes('json')) throw new Error('no api');
    return res.json();
  }
  save.addEventListener('click', async () => {
    save.textContent = 'saving…';
    try {
      const vfxOv = loadOv('vfx');
      if (!Object.keys(vfxOv).length) { note.textContent = 'nothing changed — move a slider first.'; return; }
      const out = await post('/api/save-vfx', { vfx: vfxOv });
      if (out.ok) {
        note.textContent = 'saved to ' + out.file + '. release pushes it live.';
        release.disabled = false;
      } else note.textContent = 'save failed: ' + (out.error || 'unknown');
    } catch {
      note.textContent = 'no workshop server. run: node scripts/workshop-server.js';
    } finally { save.textContent = 'save to project'; }
  });
  release.addEventListener('click', async () => {
    release.textContent = 'releasing…';
    release.disabled = true;
    try {
      const out = await post('/api/release');
      const lastOutput = out.steps.at(-1).output || '';
      const suffix = out.ok
        ? (out.nothingToRelease ? ' — nothing to release.' : ' — released.')
        : ' — stopped: ' + lastOutput.slice(0, 300);
      note.textContent = out.steps.map((s) => `${s.ok ? '✓' : '✗'} ${s.name}`).join('  ') + suffix;
    } catch {
      note.textContent = 'no workshop server. run: node scripts/workshop-server.js';
    } finally { release.textContent = 'release'; release.disabled = false; }
  });
  shipBar.append(save, release);
  body.append(shipBar, note);

  return () => {
    clearInterval(flowTimer);
    seqTimers.forEach(clearTimeout);
    clearTimeout(autoTimer);
    clearTimeout(repeatTimer);
    document.removeEventListener('keydown', onKey);
    ctx.ui.conveyor.setRate(0);
    ctx.ui.conveyor.flush();
  };
}

// ---------- Hoard ----------
// One mini-tab per stash tier: scrub the count within the tier, tune the
// tier's shapes, watch the banner underneath. Preview never touches state.

const HOARD_SHARED_KNOBS = [
  { path: ['hoard', 'alpha'], min: 0, max: 1, step: 0.01 },
  { path: ['hoard', 'glintPerS'], min: 0, max: 10, step: 0.1 },
  { path: ['hoard', 'centerGapPx'], min: 40, max: 160, step: 2 },
  { path: ['hoard', 'stageScale'], min: 0.5, max: 5, step: 0.1 },
  { path: ['hoard', 'stageAlpha'], min: 0, max: 1, step: 0.01 },
];

// fmt()'s largest unit is q (1e15), so counts at or beyond 1e18 would render
// as a run-on digit string (e.g. '1000000q'). Scrub-only: switch to a
// log10 readout at that point; the '∞'/'live' button texts are unaffected.
function scrubFmt(count) {
  return count >= 1e18 ? '10^' + Math.log10(count).toFixed(1) : fmt(count);
}

function tabHoard(body, ctx) {
  body.appendChild(el('div', 'devNote',
    'the stash, tier by tier. pick a tier to preview it on the banner; ' +
    'scrub within it; tune its shapes. save and release live in the Workshop tab.'));

  const tiers = ctx.vfx.hoard.tiers;
  const names = (ctx.names && ctx.names.hoard) || NAME_DEFAULTS.hoard;
  const strip = el('div', 'devBar');
  const detail = el('div');
  body.append(strip, detail);

  const redraw = () => { ctx.ui.conveyor.redraw(); ctx.ui.stage.redrawHoard(); };
  const preview = (count) => {
    ctx.ui.conveyor.setHoardPreview(count);
    ctx.ui.stage.setHoardPreview(count);
  };

  function tierBounds(i) {
    const lgMin = Math.log10(tiers[i].min);
    const lgNext = i + 1 < tiers.length ? Math.log10(tiers[i + 1].min) : lgMin + 6;
    return { lgMin, lgNext };
  }

  function showTier(i) {
    for (const [j, b] of [...strip.children].entries()) {
      b.classList.toggle('on', j === i);
    }
    while (detail.firstChild) detail.removeChild(detail.firstChild);
    const { lgMin, lgNext } = tierBounds(i);
    preview(Math.pow(10, (lgMin + lgNext) / 2));

    // scrub
    detail.appendChild(el('h3', null, names[tiers[i].id] + ' — scrub'));
    const row = el('div', 'devRow');
    row.appendChild(el('span', 'path', 'teeth'));
    const scrub = document.createElement('input');
    scrub.type = 'range';
    scrub.min = '0';
    scrub.max = '1';
    scrub.step = '0.001';
    scrub.value = '0.5';
    const readout = el('span', 'val', scrubFmt(Math.pow(10, (lgMin + lgNext) / 2)));
    scrub.addEventListener('input', () => {
      const count = Math.pow(10, lgMin + Number(scrub.value) * (lgNext - lgMin));
      readout.textContent = scrubFmt(count);
      preview(count);
    });
    row.append(scrub, readout);
    if (i === tiers.length - 1) {
      const inf = el('button', 'mini', '∞');
      inf.addEventListener('click', () => { readout.textContent = '∞'; preview(Infinity); });
      row.appendChild(inf);
    }
    const live = el('button', 'mini', 'live');
    live.addEventListener('click', () => { readout.textContent = 'live'; preview(null); });
    row.appendChild(live);
    detail.appendChild(row);

    // tier knobs + shared knobs
    detail.appendChild(el('h3', null, 'this tier'));
    sliderRow(detail, ctx,
      { path: ['hoard', 'tiers', i, 'units'], min: 1, max: 14, step: 1 }, redraw);
    sliderRow(detail, ctx,
      { path: ['hoard', 'tiers', i, 'px'], min: 8, max: 120, step: 1 }, redraw);
    detail.appendChild(el('h3', null, 'whole hoard'));
    for (const knob of HOARD_SHARED_KNOBS) sliderRow(detail, ctx, knob, redraw);
  }

  tiers.forEach((t, i) => {
    const label = i === tiers.length - 1 ? names[t.id] + ' ∞' : names[t.id];
    const b = el('button', 'devTab', label);
    b.addEventListener('click', () => showTier(i));
    strip.appendChild(b);
  });
  showTier(0);

  return () => preview(null);
}

// ---------- Script ----------

function tabScript(body, ctx) {
  ovBar(body, ctx,
    'text, response, and trigger edits apply live. duplicated beats are born dormant — arm the trigger, or ▶ plays any beat now.');
  const ov = loadOv('script');

  function beatEditor(list, beat, isAdded) {
    const box = el('div', 'devBeat');
    const head = el('div', 'bhead');
    const idEl = el('b', null, beat.id);
    const trig = document.createElement('input');
    trig.value = JSON.stringify(beat.trigger);
    trig.size = 34;
    trig.title = 'trigger (JSON)';
    const playBtn = el('button', 'mini', '▶ play');
    playBtn.addEventListener('click', () => {
      ctx.dispatch('devQueueBeat', { id: beat.id });
      document.querySelector('.devPanel').hidden = true;
    });
    const dupBtn = el('button', 'mini', 'duplicate');
    head.append(idEl, trig, playBtn, dupBtn);
    const text = document.createElement('textarea');
    text.value = beat.text || '';
    const brow = el('div', 'brow');
    const resp = document.createElement('input');
    resp.value = beat.response || '';
    resp.title = 'response button';
    const reg = document.createElement('input');
    reg.value = beat.register || 'memory';
    reg.size = 8;
    reg.title = 'register';
    brow.append(el('span', 'def', 'response'), resp, el('span', 'def', 'register'), reg);
    box.append(head, text, brow);
    list.appendChild(box);

    function store(patch) {
      if (isAdded) {
        Object.assign(beat, patch);
        const rec = (ov.addedBeats || []).find((b) => b.id === beat.id);
        if (rec && rec !== beat) Object.assign(rec, patch);
        saveOv('script', ov);
      } else {
        Object.assign(beat, patch);           // live
        ov.beats = ov.beats || {};
        ov.beats[beat.id] = { ...(ov.beats[beat.id] || {}), ...patch };
        saveOv('script', ov);
      }
    }
    text.addEventListener('input', () => store({ text: text.value }));
    resp.addEventListener('input', () => store({ response: resp.value }));
    reg.addEventListener('input', () => store({ register: reg.value }));
    trig.addEventListener('change', () => {
      try {
        const parsed = JSON.parse(trig.value);
        trig.classList.remove('bad');
        store({ trigger: parsed });
      } catch { trig.classList.add('bad'); }
    });
    dupBtn.addEventListener('click', () => {
      let n = 2;
      const all = ctx.script.beats.map((b) => b.id);
      while (all.includes(beat.id + '-' + n)) n++;
      const clone = { ...beat, trigger: { type: 'never' }, id: beat.id + '-' + n };
      ov.addedBeats = ov.addedBeats || [];
      ov.addedBeats.push(clone);
      ctx.script.beats.push(clone);
      saveOv('script', ov);
      beatEditor(list, clone, true);
    });
  }

  body.appendChild(el('h3', null, 'beats'));
  const beatList = el('div');
  body.appendChild(beatList);
  const added = new Set((ov.addedBeats || []).map((b) => b.id));
  for (const beat of ctx.script.beats) beatEditor(beatList, beat, added.has(beat.id));

  body.appendChild(el('h3', null, 'asides'));
  const asideList = el('div');
  body.appendChild(asideList);
  for (const aside of ctx.script.asides) {
    const box = el('div', 'devBeat');
    const head = el('div', 'bhead');
    head.append(el('b', null, aside.id), el('span', null, JSON.stringify(aside.trigger)));
    const text = document.createElement('textarea');
    text.value = aside.text;
    text.addEventListener('input', () => {
      aside.text = text.value;
      ov.asides = ov.asides || {};
      ov.asides[aside.id] = { ...(ov.asides[aside.id] || {}), text: text.value };
      saveOv('script', ov);
    });
    box.append(head, text);
    asideList.appendChild(box);
  }

  body.appendChild(el('h3', null, 'whispers (one per line, per act)'));
  for (const act of Object.keys(ctx.script.whispers)) {
    const box = el('div', 'devBeat');
    box.appendChild(el('div', 'bhead', 'act ' + act));
    const text = document.createElement('textarea');
    text.value = ctx.script.whispers[act].join('\n');
    text.addEventListener('input', () => {
      const lines = text.value.split('\n').filter((l) => l.trim());
      ctx.script.whispers[act] = lines;
      ov.whispers = ov.whispers || {};
      ov.whispers[act] = lines;
      saveOv('script', ov);
    });
    box.appendChild(text);
    body.appendChild(box);
  }

  body.appendChild(el('h3', null, 'notes the children leave (one per line)'));
  {
    const box = el('div', 'devBeat');
    const text = document.createElement('textarea');
    text.style.minHeight = '120px';
    text.value = ctx.script.notes.join('\n');
    text.addEventListener('input', () => {
      const lines = text.value.split('\n').filter((l) => l.trim());
      ctx.script.notes.length = 0;
      ctx.script.notes.push(...lines);
      ov.notes = lines;
      saveOv('script', ov);
    });
    box.appendChild(text);
    body.appendChild(box);
  }
}

// ---------- Balance / Names / VFX ----------

function tabBalance(body, ctx) {
  ovBar(body, ctx,
    'the difficulty scaling matrix. every knob edits the live engine config; numbers are rejected (red) rather than clamped.');
  knobRows(body, { defaults: DEFAULTS, live: ctx.cfg, ovKey: 'constants' });
}

function tabNames(body, ctx) {
  ovBar(body, ctx,
    'every player-visible label. shop cards are built at boot — reload to see renames everywhere.');
  knobRows(body, { defaults: NAME_DEFAULTS, live: ctx.names, ovKey: 'names' });
}

function tabVfx(body, ctx) {
  ovBar(body, ctx, 'visual + audio tuning. applies live.');
  const bar = el('div', 'devBar');
  const test = el('button', null, 'test sounds');
  test.addEventListener('click', () => {
    const seq = ['tap', 'fill', 'buy', 'note', 'beat', 'wake', 'press'];
    seq.forEach((k, i) => setTimeout(() => play[k](), i * 350));
  });
  bar.appendChild(test);
  body.appendChild(bar);
  knobRows(body, { defaults: VFX_DEFAULTS, live: ctx.vfx, ovKey: 'vfx' });
}

// ---------- State ----------

function tabState(body, ctx) {
  const bar1 = el('div', 'devBar');
  for (const n of [1000, 100000, 10e6, 1e9]) {
    const b = el('button', null, '+' + fmt(n) + ' teeth');
    b.addEventListener('click', () => ctx.dispatch('devGrant', { n }));
    bar1.appendChild(b);
  }
  const b10 = el('button', null, 'grant 10★');
  b10.addEventListener('click', () => ctx.dispatch('devGrantStars', { n: 10 }));
  bar1.appendChild(b10);
  const auto = el('button', null, 'start autopilot');
  auto.addEventListener('click', () => {
    import('./autopilot.js').then((m) => m.startAutopilot());
    auto.disabled = true;
  });
  bar1.appendChild(auto);
  body.append(el('h3', null, 'grant'), bar1);

  body.appendChild(el('h3', null, 'meters'));
  for (const key of ['belief', 'stir']) {
    const row = el('div', 'devRow');
    row.appendChild(el('span', 'path', key));
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(ctx.box.state[key]));
    input.addEventListener('input', () => ctx.dispatch('devSet', { [key]: Number(input.value) }));
    row.appendChild(input);
    body.appendChild(row);
  }

  const bar2 = el('div', 'devBar');
  for (const act of [0, 1, 2, 25, 3]) {
    const b = el('button', null, 'act ' + (act === 25 ? '2.5' : act));
    b.addEventListener('click', () => ctx.dispatch('devSet', { act }));
    bar2.appendChild(b);
  }
  body.append(el('h3', null, 'act'), bar2);

  const bar2b = el('div', 'devBar');
  const skipDawn = el('button', null, 'skip to dawn');
  skipDawn.addEventListener('click', () => ctx.dispatch('devSkipToDawn'));
  const skipDusk = el('button', null, 'skip to dusk');
  skipDusk.addEventListener('click', () => ctx.dispatch('devSkipToDusk'));
  bar2b.append(skipDawn, skipDusk);
  body.append(el('h3', null, 'night'), bar2b);

  const bar3 = el('div', 'devBar');
  for (const [label, mins] of [['+1m', 1], ['+10m', 10], ['+1h', 60]]) {
    const b = el('button', null, label);
    b.addEventListener('click', () => window.game.debug.advanceTicks(mins * 300));
    bar3.appendChild(b);
  }
  const off = el('button', null, 'simulate 8h offline');
  off.addEventListener('click', () => {
    const r = window.game.debug.offline(8 * 3600);
    off.textContent = `offline: +${fmt(r.teeth)} teeth`;
    setTimeout(() => { off.textContent = 'simulate 8h offline'; }, 2500);
  });
  bar3.appendChild(off);
  body.append(el('h3', null, 'time'), bar3);

  const bar4 = el('div', 'devBar');
  for (const s of [1, 5, 20, 100]) {
    const a = el('button', null, '×' + s + ' speed');
    a.addEventListener('click', () => {
      const q = new URLSearchParams(location.search);
      q.set('dev', '1');
      if (s === 1) q.delete('speed'); else q.set('speed', String(s));
      location.search = q.toString();
    });
    bar4.appendChild(a);
  }
  body.append(el('h3', null, 'speed (reloads)'), bar4);

  body.appendChild(el('h3', null, 'live state'));
  const pre = el('pre', 'devPre');
  body.appendChild(pre);
  const refresh = () => {
    const s = ctx.box.state;
    pre.textContent = JSON.stringify({
      tick: s.tick, act: s.act,
      teeth: Math.round(s.teeth), lifetime: Math.round(s.lifetime),
      taps: s.taps, notes: s.notes, notesRead: s.notesRead,
      belief: +s.belief.toFixed(1), stir: +s.stir.toFixed(1), wakes: s.wakes,
      tiptoes: s.tiptoes, loom: s.loom,
      units: s.units, buys: s.buys, mults: s.mults,
      upgrades: Object.keys(s.upgrades),
      revealed: Object.keys(s.revealed),
      beatsSeen: s.beatsSeen.length, beatQueue: s.beatQueue,
      ended: s.ended, postEnd: s.postEnd,
    }, null, 1);
  };
  refresh();
  const timer = setInterval(refresh, 1000);
  return () => clearInterval(timer);
}

// ---------- Pacing ----------

function tabPacing(body, ctx) {
  body.appendChild(el('div', 'devNote',
    'runs the REAL engine headless with the current (live-tuned) balance and script, driven by a competent-not-optimal bot. not a model — the same tick the game runs.'));
  const bar = el('div', 'devBar');
  const seedIn = document.createElement('input');
  seedIn.type = 'number';
  seedIn.value = '1';
  seedIn.title = 'seed';
  seedIn.style.width = '70px';
  const tapsIn = document.createElement('select');
  for (const [v, label] of [[1, 'casual (5 taps/s)'], [2, 'fast (10 taps/s)'], [0, 'idle (no taps)']]) {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = label;
    tapsIn.appendChild(o);
  }
  const run = el('button', null, 'run');
  bar.append(seedIn, tapsIn, run);
  body.appendChild(bar);
  const out = el('div');
  body.appendChild(out);

  run.addEventListener('click', () => {
    run.textContent = 'running…';
    setTimeout(() => {
      const seed = Number(seedIn.value) || 1;
      const tapsPerTick = Number(tapsIn.value);
      const reveals = [];
      const seen = new Set();
      let deadTicks = 0;
      let totalTicks = 0;
      const acts = {};
      const { state, events } = runBot(ctx.cfg, ctx.script, {
        maxTicks: 600000, seed, tapsPerTick,
        onTick: (s) => {
          totalTicks++;
          for (const key of Object.keys(s.revealed)) {
            if (!seen.has(key)) { seen.add(key); reveals.push({ key, tick: s.tick }); }
          }
          if (acts[s.act] === undefined) acts[s.act] = s.tick;
          // dead tick: no production and nothing affordable among revealed buys
          if (s.units.scout + s.units.mouse + s.units.sprite + s.units.phantom +
              s.units.ferry + s.units.pact + s.units.ministry === 0) {
            let affordable = false;
            for (const key of Object.keys(s.revealed)) {
              if (key === 'up:babyfae' && s.teeth >= ctx.cfg.UPGRADES.babyfae.cost) affordable = true;
              if (key === 'unit:scout' && s.teeth >= ctx.cfg.UNITS.scout.base) affordable = true;
            }
            if (!affordable) deadTicks++;
          }
        },
      });
      renderReport(out, ctx, { state, events, reveals, acts, deadTicks, totalTicks });
      run.textContent = 'run';
    }, 30);
  });

  function mmss(tick) {
    const s = tick * ctx.cfg.TICK_MS / 1000;
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  function renderReport(host, _c, r) {
    while (host.firstChild) host.removeChild(host.firstChild);
    const mins = (r.state.tick * ctx.cfg.TICK_MS / 60000).toFixed(1);
    host.appendChild(el('h3', null, 'summary'));
    host.appendChild(el('div', 'devNote',
      `run: ${mins} game-minutes · dead time: ${(100 * r.deadTicks / Math.max(1, r.totalTicks)).toFixed(1)}% · postEnd: ${r.state.postEnd} · wakes: ${r.state.wakes}` +
      ` · lifetime: ${fmt(r.state.lifetime)} · beats seen: ${r.state.beatsSeen.length}/${ctx.script.beats.length}` +
      ` · acts at: ${Object.entries(r.acts).map(([a, t]) => a + '→' + mmss(t)).join(' · ')}`));

    host.appendChild(el('h3', null, 'reveal cadence (red = <3s after the previous)'));
    const t1 = el('table', 'devTable');
    const h1 = el('tr');
    for (const th of ['reveal', 'at', 'gap']) h1.appendChild(el('th', null, th));
    t1.appendChild(h1);
    let prev = null;
    for (const rv of r.reveals) {
      const tr = el('tr');
      tr.appendChild(el('td', null, rv.key));
      tr.appendChild(el('td', null, mmss(rv.tick)));
      const gap = prev === null ? '' : ((rv.tick - prev) * ctx.cfg.TICK_MS / 1000).toFixed(1) + 's';
      const td = el('td', null, gap);
      if (prev !== null && (rv.tick - prev) * ctx.cfg.TICK_MS < 3000) td.className = 'warn';
      tr.appendChild(td);
      t1.appendChild(tr);
      prev = rv.tick;
    }
    host.appendChild(t1);

    host.appendChild(el('h3', null, 'story beats'));
    const t2 = el('table', 'devTable');
    const h2 = el('tr');
    for (const th of ['beat', 'at']) h2.appendChild(el('th', null, th));
    t2.appendChild(h2);
    for (const ev of r.events) {
      const tr = el('tr');
      tr.appendChild(el('td', null, ev.beat));
      tr.appendChild(el('td', null, mmss(ev.tick)));
      t2.appendChild(tr);
    }
    host.appendChild(t2);

    const missing = ctx.script.beats
      .filter((b) => !r.state.beatsSeen.includes(b.id)).map((b) => b.id);
    if (missing.length) {
      host.appendChild(el('div', 'devNote', '⚠ unreached beats: ' + missing.join(', ')));
    }
  }
}
