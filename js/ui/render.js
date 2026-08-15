// Builds the app DOM once and updates it by signature-guarded writes.
// The renderer reads state and config; it never computes economy numbers
// beyond formatting what the engine already decided.

import { fmt, figureDone } from '../engine/math.js';
import { effectiveRatePerSec, noiseLevel, hushCapacity } from '../engine/predicates.js';
import { toothSVG } from './tooth.js';
import { createStage } from './stage.js';
import { createRoost } from './roost.js';
import { createOverlays } from './overlays.js';
import { createConveyor } from './conveyor.js';
import { createTabs } from './tabs.js';
import { createLog } from './log.js';
import { createBoard } from './board.js';
import { createSkyTab } from './skytab.js';
import { attachTip } from './tooltip.js';

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
  attachTip(beliefMeter, names.tips.belief);
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
  attachTip(stirMeter, names.tips.stir);
  const stirLabel = el('div', 'label');
  const stirName = el('span', null, names.meters.stir);
  const stirVal = el('span');
  stirLabel.append(stirName, stirVal);
  const stirBar = el('div', 'bar');
  const stirFill = el('div');
  stirBar.appendChild(stirFill);
  const stirSub = el('div', 'sublabel');
  stirMeter.append(stirLabel, stirBar, stirSub);

  const starChip = el('div', 'chip starChip');
  starChip.hidden = true;
  starChip.dataset.testid = 'star-chip';
  attachTip(starChip, names.tips.stars);

  const spacer = el('div', 'spacer');
  const notesChip = el('button', 'chip');
  notesChip.hidden = true;
  notesChip.dataset.testid = 'notes-chip';
  notesChip.addEventListener('click', () => dispatch('readNote'));
  attachTip(notesChip, names.tips.notes);
  const journalBtn = el('button', 'iconbtn', '☾');
  journalBtn.title = names.verbs.journal;
  journalBtn.setAttribute('aria-label', names.verbs.journal);
  journalBtn.dataset.testid = 'journal-open';
  journalBtn.hidden = true;
  const settingsBtn = el('button', 'iconbtn', '⚙');
  settingsBtn.dataset.testid = 'settings-open';
  topbar.append(beliefMeter, stirMeter, starChip, spacer, notesChip, journalBtn, settingsBtn);
  app.appendChild(topbar);

  // ---- tabs ----
  const tabs = createTabs(app, names);
  attachTip(tabs.bar.children[0], names.tips.tabTonight);
  attachTip(tabs.bar.children[1], names.tips.tabLog);
  attachTip(tabs.bar.children[2], names.tips.tabRoost);
  attachTip(tabs.bar.children[3], names.tips.tabSky);
  app.appendChild(tabs.bar);
  app.appendChild(tabs.panels.tonight);
  app.appendChild(tabs.panels.log);
  app.appendChild(tabs.panels.roost);
  app.appendChild(tabs.panels.sky);

  // ---- stage ----
  const stageEl = el('main');
  tabs.panels.tonight.appendChild(stageEl);
  const stage = createStage(stageEl, {
    vfx,
    script: ctx.script,
    names,
    cfg,
    onDepart: ctx.onDepart,
    onRespond: (beat) => {
      dispatch('applyBeatEffects', { effects: beat.effects });
      dispatch('dismissBeat', { id: beat.id });
      ctx.onBeatDismissed(beat);
    },
    onOrphan: (id) => { dispatch('dismissBeat', { id }); },
  });

  // ---- contract board ----
  const board = createBoard(tabs.panels.tonight, { names, contracts: ctx.contracts, dispatch });

  // ---- morning card ----
  const morning = el('div', 'morningCard');
  morning.hidden = true;
  const morningTitle = el('div', 'cardName');
  const morningBody = el('div', 'cardInfo');
  morning.append(morningTitle, morningBody);
  tabs.panels.tonight.appendChild(morning);

  // ---- the log ----
  const log = createLog(tabs.panels.log, { names });

  // ---- roost ----
  const roostEl = el('section');
  tabs.panels.roost.appendChild(roostEl);
  const roost = createRoost(roostEl, {
    cfg, names, vfx, dispatch, onCeremony: ctx.onCeremony,
  });

  // ---- the sky (constellations) ----
  const skyTabEl = el('section');
  tabs.panels.sky.appendChild(skyTabEl);
  const skyTab = createSkyTab(skyTabEl, { cfg, names, vfx, dispatch });

  // ---- tray ----
  const tray = el('footer', 'tray');
  const counterWrap = el('div', 'counterWrap');
  const count = el('div', 'count', '0');
  count.dataset.testid = 'tooth-count';
  const rate = el('div', 'rate', '');
  attachTip(rate, names.tips.rate);
  counterWrap.append(count, rate);
  const dawn = el('div', 'dawnMeter');
  dawn.hidden = true;
  attachTip(dawn, names.tips.dawn);
  counterWrap.appendChild(dawn);
  const verbs = el('div', 'trayVerbs');
  const tiptoeBtn = el('button', 'chip');
  tiptoeBtn.hidden = true;
  tiptoeBtn.dataset.testid = 'tiptoe';
  attachTip(tiptoeBtn, names.tips.tiptoe);
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
  journalBtn.addEventListener('click', () => {
    tabs.show('log');
    dispatch('openJournal');
  });
  settingsBtn.addEventListener('click', () => overlays.openSettings());

  let tapPressTimer = null;
  function pressTap() {
    tapBtn.classList.add('pressed');
    clearTimeout(tapPressTimer);
    tapPressTimer = setTimeout(() => tapBtn.classList.remove('pressed'), vfx.juice.tapPop.ms);
  }

  const ticksPerBatch = Math.max(1, Math.round(1000 / cfg.TICK_MS));
  const conveyor = createConveyor(conveyorCanvas, vfx, ticksPerBatch, (amount) => {
    spawnFloat('+' + fmt(amount), 0.5);
    pressTap();
  });

  // ---- floats ----
  let floatCount = 0;
  let glowTimer = null;
  function applyTapVars() {
    tapBtn.style.setProperty('--tapPopScale', String(vfx.juice.tapPop.scale));
    tapBtn.style.setProperty('--tapPopMs', String(vfx.juice.tapPop.ms));
    tapBtn.style.setProperty('--tapGlowSize', String(vfx.juice.tapGlow.size));
    tapBtn.style.setProperty('--tapGlowAlpha', String(vfx.juice.tapGlow.alpha));
    tapBtn.style.setProperty('--tapGlowMs', String(vfx.juice.tapGlow.ms));
  }
  applyTapVars();
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
    if (state.beatQueue.length && tabs.active() !== 'tonight') tabs.show('tonight');
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
    conveyor.setRate(rps);
    conveyor.setTeeth(Math.floor(state.teeth));
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
    // Why STIR moves: the noise the crew makes against the hush the night
    // absorbs. Both come from the same engine predicates the tick uses.
    set('stirSub', !state.stirShown ? '' :
      `${names.meters.noise} ${Math.round(noiseLevel(state, cfg))} · ` +
      `${names.meters.hush} ${Math.round(hushCapacity(state, cfg))}`, (v) => {
      stirSub.textContent = v;
    });
    set('notes', state.notesShown ? `${names.meters.notes}: ${state.notes}` : '', (v) => {
      notesChip.hidden = !v;
      if (v) notesChip.textContent = v;
    });
    set('notesOn', state.act >= 2 && state.notes > 0, (v) => { notesChip.disabled = !v; });
    set('stars', state.starsEarned > 0 ? `★ ${state.stars}` : '', (v) => {
      starChip.hidden = !v;
      if (v) starChip.textContent = v;
    });
    set('skyTabVis', state.starsEarned > 0, (v) => tabs.setVisible('sky', v));
    set('skyBadge', state.stars >= 1 &&
      Object.keys(cfg.CONSTELLATIONS).some((id) => !figureDone(state, cfg, id)),
      (v) => tabs.setBadge('sky', v));
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
    set('dawn', !state.nightShown ? '' :
      state.nightPhase === 'dawn'
        ? names.ui.duskIn.replace('{m}', String(Math.max(1, Math.ceil(state.duskGapS / 60))))
        : state.nightTicksLeft < cfg.NIGHT.LENGTH_TICKS * 0.1
          ? names.ui.dawnSoon
          : `night ${state.night}`, (v) => {
      dawn.hidden = !v;
      if (v) dawn.textContent = v;
    });
    set('morning', state.nightShown && state.nightPhase === 'dawn'
      ? String(state.night) : '', (v) => {
      morning.hidden = !v;
      if (v) {
        const st = state.nightLedger[state.nightLedger.length - 1];
        morningTitle.textContent = names.ui.morningTitle.replace('{n}', v);
        morningBody.textContent = st
          ? `${fmt(st.teeth)} teeth · wakes ${st.wakes} · contracts ${st.contractsDone}${st.sailed ? ' · sailed' : ''}`
          : '';
      }
    });
    stage.update(state, ctx.script);
    board.update(state);
    roost.update(state);
    log.update(state, ctx.script);
    skyTab.update(state);
  }

  return {
    update, stage, roost, overlays, conveyor, tapBtn, spawnFloat, tabs,
    applyTapVars, pressTap,
    flashTapGlow() {
      tapBtn.classList.add('glowing');
      clearTimeout(glowTimer);
      glowTimer = setTimeout(() => tapBtn.classList.remove('glowing'), vfx.juice.tapGlow.ms);
    },
  };
}
