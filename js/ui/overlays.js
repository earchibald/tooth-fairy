// Journal, settings, and the offline-return screen. Settings is reachable
// from every screen, including the ending — no dead ends.

import { fmt } from '../engine/math.js';
import { serialize, deserialize } from '../engine/state.js';
import { isMuted, setMuted, setMasterGain } from './sound.js';
import { VERSION } from '../version.js';

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

export function createOverlays(root, ctx) {
  const { names, dispatch } = ctx;

  // ---- journal ----
  const journal = el('div', 'overlay');
  journal.hidden = true;
  journal.dataset.testid = 'journal';
  journal.setAttribute('role', 'dialog');
  journal.setAttribute('aria-modal', 'true');
  journal.setAttribute('aria-label', names.verbs.journal);
  const jClose = el('button', 'iconbtn closeBtn', '✕');
  jClose.setAttribute('aria-label', 'close');
  jClose.addEventListener('click', () => { journal.hidden = true; });
  const jTitle = el('h2', null, names.verbs.journal);
  const jList = el('div');
  journal.append(jClose, jTitle, jList);
  root.appendChild(journal);

  function openJournal(state, script) {
    dispatch('openJournal');
    while (jList.firstChild) jList.removeChild(jList.firstChild);
    for (const id of state.beatsSeen) {
      const beat = script.beats.find((b) => b.id === id);
      if (!beat || (!beat.text && !beat.response)) continue;
      const entry = el('div', 'journalEntry' + (beat.register === 'ledger' ? ' ledger' : ''));
      if (beat.text) entry.appendChild(el('div', 'jt', beat.text));
      entry.appendChild(el('div', 'jr', beat.response));
      jList.appendChild(entry);
    }
    if (!jList.firstChild) jList.appendChild(el('div', 'jt', '(nothing yet. get some teeth.)'));
    journal.hidden = false;
    jClose.focus();
  }

  // ---- settings ----
  const settings = el('div', 'overlay');
  settings.hidden = true;
  settings.dataset.testid = 'settings';
  settings.setAttribute('role', 'dialog');
  settings.setAttribute('aria-modal', 'true');
  settings.setAttribute('aria-label', names.ui.settings);
  const sClose = el('button', 'iconbtn closeBtn', '✕');
  sClose.setAttribute('aria-label', 'close');
  sClose.addEventListener('click', () => { settings.hidden = true; });
  settings.append(sClose, el('h2', null, names.ui.settings));

  const rowMute = el('div', 'settingsRow');
  rowMute.appendChild(el('span', null, names.ui.mute));
  const muteBtn = el('button', null, isMuted() ? 'muted' : 'sound on');
  muteBtn.dataset.testid = 'mute-toggle';
  muteBtn.addEventListener('click', () => {
    setMuted(!isMuted());
    muteBtn.textContent = isMuted() ? 'muted' : 'sound on';
  });
  rowMute.appendChild(muteBtn);
  settings.appendChild(rowMute);

  const rowVol = el('div', 'settingsRow');
  rowVol.appendChild(el('span', null, 'volume'));
  const vol = document.createElement('input');
  vol.type = 'range';
  vol.min = '0';
  vol.max = '1';
  vol.step = '0.05';
  vol.value = String(ctx.vfx.sound.master);
  vol.setAttribute('aria-label', 'volume');
  vol.addEventListener('input', () => setMasterGain(Number(vol.value)));
  rowVol.appendChild(vol);
  settings.appendChild(rowVol);

  const rowExport = el('div', 'settingsRow');
  rowExport.appendChild(el('span', null, names.ui.exportSave));
  const expBtn = el('button', null, 'copy');
  rowExport.appendChild(expBtn);
  settings.appendChild(rowExport);
  const expBox = document.createElement('textarea');
  expBox.className = 'saveBox';
  expBox.readOnly = true;
  expBox.hidden = true;
  settings.appendChild(expBox);
  expBtn.addEventListener('click', () => {
    expBox.hidden = false;
    expBox.value = btoa(serialize(ctx.getState()));
    expBox.select();
    try { navigator.clipboard.writeText(expBox.value); } catch { /* select is the fallback */ }
  });

  const rowImport = el('div', 'settingsRow');
  rowImport.appendChild(el('span', null, names.ui.importSave));
  const impBtn = el('button', null, 'paste below, then load');
  rowImport.appendChild(impBtn);
  settings.appendChild(rowImport);
  const impBox = document.createElement('textarea');
  impBox.className = 'saveBox';
  settings.appendChild(impBox);
  impBtn.addEventListener('click', () => {
    try {
      const parsed = deserialize(atob(impBox.value.trim()));
      if (parsed) { ctx.loadState(parsed.state); settings.hidden = true; }
      else impBtn.textContent = 'that is not a night';
    } catch { impBtn.textContent = 'that is not a night'; }
  });

  const rowReset = el('div', 'settingsRow');
  rowReset.appendChild(el('span', null, names.ui.reset));
  const resetInput = document.createElement('input');
  resetInput.type = 'text';
  resetInput.placeholder = names.ui.resetConfirm;
  resetInput.setAttribute('aria-label', names.ui.resetConfirm);
  const resetBtn = el('button', null, 'forget');
  resetBtn.dataset.testid = 'reset';
  resetBtn.addEventListener('click', () => {
    if (resetInput.value.trim().toUpperCase() === 'FORGET') ctx.resetGame();
  });
  rowReset.append(resetInput, resetBtn);
  settings.appendChild(rowReset);

  settings.appendChild(el('div', 'version', 'tooth fairy v' + VERSION));

  root.appendChild(settings);

  // ---- offline return ----
  const ret = el('div', 'overlay');
  ret.hidden = true;
  ret.dataset.testid = 'return-screen';
  const retCard = el('div', 'returnCard');
  const retTitle = el('h2', null, names.ui.offlineTitle);
  const retBig = el('div', 'big');
  const retSub = el('div', null, '');
  const retBtn = el('button', 'beatBtn', names.ui.offlineButton);
  retBtn.addEventListener('click', () => { ret.hidden = true; });
  retCard.append(retTitle, retBig, retSub, retBtn);
  ret.appendChild(retCard);
  root.appendChild(ret);

  return {
    openJournal,
    openSettings: () => { settings.hidden = false; sClose.focus(); },
    showReturn(gain, seconds) {
      retBig.textContent = '+' + fmt(gain) + ' teeth';
      const h = Math.floor(seconds / 3600);
      const m = Math.round((seconds % 3600) / 60);
      retSub.textContent = `the night ran ${h ? h + 'h ' : ''}${m}m without you.`;
      ret.hidden = false;
    },
    anyOpen: () => !journal.hidden || !settings.hidden || !ret.hidden,
    closeAll: () => { journal.hidden = true; settings.hidden = true; ret.hidden = true; },
  };
}
