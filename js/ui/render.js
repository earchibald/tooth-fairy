// Builds the app DOM once and updates it by signature-guarded writes.
// The renderer reads state and config; it never computes economy numbers
// beyond formatting what the engine already decided.

import { fmt } from '../engine/math.js';
import { effectiveRatePerSec } from '../engine/predicates.js';
import { toothSVG } from './tooth.js';
import { createStage } from './stage.js';
import { createRoost } from './roost.js';
import { createOverlays } from './overlays.js';
import { createConveyor } from './conveyor.js';

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

export function buildUI(app, ctx) {
  const { cfg, names, vfx, dispatch } = ctx;

  // ---- top bar ----
  const topbar = el('header', 'topbar');
  const beliefMeter = el('div', 'meter belief');
  beliefMeter.hidden = true;
  const beliefLabel = el('div', 'label');
  const beliefName = el('span', null, names.meters.belief);
  const beliefVal = el('span');
  beliefLabel.append(beliefName, beliefVal);
  const beliefBar = el('div', 'bar');
  const beliefFill = el('div');
  beliefBar.appendChild(beliefFill);
  beliefMeter.append(beliefLabel, beliefBar);

  const stirMeter = el('div', 'meter stir');
  stirMeter.hidden = true;
  const stirLabel = el('div', 'label');
  const stirName = el('span', null, names.meters.stir);
  const stirVal = el('span');
  stirLabel.append(stirName, stirVal);
  const stirBar = el('div', 'bar');
  const stirFill = el('div');
  stirBar.appendChild(stirFill);
  stirMeter.append(stirLabel, stirBar);

  const spacer = el('div', 'spacer');
  const notesChip = el('button', 'chip');
  notesChip.hidden = true;
  notesChip.dataset.testid = 'notes-chip';
  notesChip.addEventListener('click', () => dispatch('readNote'));
  const journalBtn = el('button', 'iconbtn', '☾');
  journalBtn.title = names.verbs.journal;
  journalBtn.setAttribute('aria-label', names.verbs.journal);
  journalBtn.dataset.testid = 'journal-open';
  journalBtn.hidden = true;
  const settingsBtn = el('button', 'iconbtn', '⚙');
  settingsBtn.dataset.testid = 'settings-open';
  topbar.append(beliefMeter, stirMeter, spacer, notesChip, journalBtn, settingsBtn);
  app.appendChild(topbar);

  // ---- stage ----
  const stageEl = el('main');
  app.appendChild(stageEl);
  const stage = createStage(stageEl, {
    vfx,
    script: ctx.script,
    onRespond: (beat) => {
      dispatch('applyBeatEffects', { effects: beat.effects });
      dispatch('dismissBeat', { id: beat.id });
      ctx.onBeatDismissed(beat);
    },
    onOrphan: (id) => { dispatch('dismissBeat', { id }); },
  });

  // ---- roost ----
  const roostEl = el('section');
  app.appendChild(roostEl);
  const roost = createRoost(roostEl, {
    cfg, names, vfx, dispatch, onCeremony: ctx.onCeremony,
  });

  // ---- tray ----
  const tray = el('footer', 'tray');
  const counterWrap = el('div', 'counterWrap');
  const count = el('div', 'count', '0');
  count.dataset.testid = 'tooth-count';
  const rate = el('div', 'rate', '');
  counterWrap.append(count, rate);
  const verbs = el('div', 'trayVerbs');
  const tiptoeBtn = el('button', 'chip');
  tiptoeBtn.hidden = true;
  tiptoeBtn.dataset.testid = 'tiptoe';
  tiptoeBtn.title = names.ui.tiptoeHint;
  tiptoeBtn.addEventListener('click', () => dispatch('tiptoe'));
  verbs.appendChild(tiptoeBtn);
  const conveyorWrap = el('div', 'conveyorWrap');
  const conveyorCanvas = document.createElement('canvas');
  conveyorCanvas.className = 'conveyor';
  const tapBtn = el('button', 'toothBtn');
  tapBtn.dataset.testid = 'tap';
  tapBtn.hidden = true;
  tapBtn.setAttribute('aria-label', 'gather a tooth');
  tapBtn.appendChild(toothSVG());
  conveyorWrap.append(conveyorCanvas, tapBtn);
  tray.append(counterWrap, verbs, conveyorWrap);
  app.appendChild(tray);

  const overlays = createOverlays(app, ctx);
  journalBtn.addEventListener('click', () => overlays.openJournal(ctx.getState(), ctx.script));
  settingsBtn.addEventListener('click', () => overlays.openSettings());

  const conveyor = createConveyor(conveyorCanvas, vfx, (amount) => {
    spawnFloat('+' + fmt(amount), 0.5);
    tapBtn.classList.add('pressed');
    setTimeout(() => tapBtn.classList.remove('pressed'), vfx.pulse.buttonPressMs);
  });

  // ---- floats ----
  let floatCount = 0;
  function spawnFloat(text, xFrac) {
    if (floatCount >= vfx.floats.maxConcurrent) return;
    floatCount++;
    const div = el('div', 'float', text);
    const rect = conveyorWrap.getBoundingClientRect();
    const appRect = app.getBoundingClientRect();
    const x = (xFrac ?? 0.5) * rect.width + (Math.random() * 36 - 18);
    div.style.left = rect.left - appRect.left + x + 'px';
    div.style.top = rect.top - appRect.top - 8 + 'px';
    div.style.setProperty('--dwellMs', vfx.floats.dwellMs + 'ms');
    app.appendChild(div);
    setTimeout(() => { div.remove(); floatCount--; }, vfx.floats.dwellMs + 60);
  }

  // ---- per-frame update, signature-guarded ----
  const cache = {};
  const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };

  function update(state) {
    const palette = vfx.palettes[state.act] || vfx.palettes[0];
    set('act', state.act, () => {
      app.dataset.act = String(state.act);
      for (const [key, val] of Object.entries(palette)) {
        app.style.setProperty('--' + key, val);
      }
    });
    set('count', fmt(Math.floor(state.teeth)), (v) => { count.textContent = v; });
    set('countShow', state.counterShown, (v) => count.classList.toggle('show', v));
    const rps = effectiveRatePerSec(state, cfg);
    set('rate', rps > 0 ? '≈ ' + fmt(rps) + names.meters.perSec : '', (v) => {
      rate.textContent = v;
    });
    set('tap', state.tapShown, (v) => { tapBtn.hidden = !v; });
    set('belief', state.beliefShown ? state.belief.toFixed(0) : '', (v) => {
      beliefMeter.hidden = !v;
      if (v) { beliefVal.textContent = v; beliefFill.style.width = v + '%'; }
    });
    set('stir', state.stirShown ? state.stir.toFixed(0) : '', (v) => {
      stirMeter.hidden = !v;
      if (v) { stirVal.textContent = v; stirFill.style.width = v + '%'; }
    });
    set('notes', state.notesShown ? `${names.meters.notes}: ${state.notes}` : '', (v) => {
      notesChip.hidden = !v;
      if (v) notesChip.textContent = v;
    });
    set('notesOn', state.act >= 2 && state.notes > 0, (v) => { notesChip.disabled = !v; });
    set('journal', state.beatsSeen.length > 3, (v) => { journalBtn.hidden = !v; });
    set('tiptoe', !state.tiptoeShown ? '' :
      state.tiptoeTicks > 0 ? `${names.verbs.tiptoe} ${(state.tiptoeTicks * cfg.TICK_MS / 1000).toFixed(0)}s` :
      names.verbs.tiptoe, (v) => {
      tiptoeBtn.hidden = !v;
      if (v) {
        tiptoeBtn.textContent = v;
        tiptoeBtn.disabled = state.tiptoeTicks > 0;
      }
    });
    stage.update(state, ctx.script);
    roost.update(state);
  }

  return { update, stage, roost, overlays, conveyor, tapBtn, spawnFloat };
}
