// The playtest feedback panel: a fixed column to the right of the game,
// not an overlay — js/main.js's tick loop halts on ui.overlays.anyOpen(),
// and a tester must be able to talk (or type) while the game keeps
// running. Self-injects its own <style>, mirroring js/dev/panel.js.
//
// Every DOM decision worth pinning down (formatting, marker timing, the
// bundle shape) lives in panel-core.js, which is node-testable. This file
// is a thin shell: wire events, hold the entry queue, talk to the store
// and the recorder.

import { VERSION } from '../version.js';
import { serialize } from '../engine/state.js';
import { captureMarker, createTrail } from './marker.js';
import { makeTextEntry, makeVoiceEntry, editText, voiceIndex } from './entries.js';
import { createStore } from './store.js';
import { pickMime, createRecorder } from './recorder.js';
import { submitSession } from './submit.js';
import { SUBMIT_ENV } from '../submit/env.js';
import { zipFiles } from '../submit/zip.js';
import {
  formatClockMs, formatEntryHeader, formatProgress,
  shouldStartTextMarker, buildGameInfo, buildBundle, nextSeq,
} from './panel-core.js';

const PANEL_W = 'clamp(360px, 32vw, 460px)';

const CSS = `
body.playtest #app { margin-right: calc(${PANEL_W} + 24px); }
.ptPanel { position: fixed; top: 0; right: 0; bottom: 0; width: ${PANEL_W};
  z-index: 30; background: #0b0e17f5; color: #d7dceb;
  font: 13px/1.45 ui-monospace, Menlo, monospace;
  display: flex; flex-direction: column; overflow: hidden;
  border-left: 1px solid #ffffff22; }
.ptHead { padding: 10px 12px; border-bottom: 1px solid #ffffff22;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ptHead h2 { font-size: 13px; letter-spacing: 0.04em; margin-right: auto; }
.ptMeta { color: #8b93ad; font-size: 11px; }
.ptCompose { padding: 10px 12px; border-bottom: 1px solid #ffffff22; }
.ptCompose h3 { font-size: 11px; letter-spacing: 0.1em; color: #8b93ad;
  text-transform: uppercase; margin: 0 0 6px; }
.ptRow { display: flex; align-items: center; gap: 8px; }
.ptRec { display: flex; gap: 8px; align-items: center; }
.ptRecTime { color: #cfa8ea; min-width: 40px; }
.ptCompose textarea { width: 100%; min-height: 56px; font: inherit; font-size: 12px;
  background: #0007; color: #d7dceb; border: 1px solid #ffffff22;
  border-radius: 6px; padding: 6px; resize: vertical; margin-bottom: 6px; }
.ptQueue { flex: 1; overflow-y: auto; list-style: none; margin: 0; padding: 8px 12px; }
.ptItem { border: 1px solid #ffffff14; border-radius: 10px; padding: 8px 10px;
  margin-bottom: 8px; background: #12172a; }
.ptItem .ptItemHead { color: #8b93ad; font-size: 11px; margin-bottom: 6px;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ptItem .ptItemHead .edited { color: #cfa8ea; }
.ptItem textarea { width: 100%; font: inherit; font-size: 12px; background: #0007;
  color: #d7dceb; border: 1px solid #ffffff22; border-radius: 6px; padding: 6px;
  resize: vertical; min-height: 40px; }
.ptItem audio { width: 100%; }
.ptItemFoot { display: flex; gap: 8px; margin-top: 6px; align-items: center; }
.ptBtn { font: inherit; font-size: 12px; background: #202a41; color: #d7dceb;
  border: 1px solid #7b96c9; border-radius: 8px; padding: 5px 10px; cursor: pointer; }
.ptBtn.warn { border-color: #c9707b; color: #c98b8b; }
.ptBtn:disabled { opacity: 0.5; cursor: default; }
.ptFoot { padding: 10px 12px; border-top: 1px solid #ffffff22; }
.ptStatus { color: #8b93ad; font-size: 11px; margin-top: 6px; min-height: 14px; }
.ptNote { color: #6a7188; font-size: 11px; margin: 4px 0; }
.ptDrawer { display: none; }
@media (max-width: 1099px) {
  body.playtest #app { margin-right: 0; }
  .ptPanel { top: auto; height: 55vh; border-top: 1px solid #ffffff22; border-left: none; }
  .ptDrawer { display: block; }
}
`;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

export function mountPlaytestPanel(ctx) {
  const { cfg, names, getState } = ctx;
  const n = names.playtest;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  document.body.classList.add('playtest');

  const panel = el('aside', 'ptPanel');
  panel.dataset.testid = 'pt-panel';

  // ---- header ----
  const head = el('div', 'ptHead');
  head.appendChild(el('h2', null, n.title));
  const meta = el('span', 'ptMeta', '');
  head.appendChild(meta);
  const submitTop = el('button', 'ptBtn', n.submit);
  submitTop.dataset.testid = 'pt-submit-top';
  head.appendChild(submitTop);
  panel.appendChild(head);

  panel.appendChild(el('div', 'ptDrawer ptNote', n.narrowNote));

  // ---- compose: voice ----
  const voiceBox = el('div', 'ptCompose');
  voiceBox.appendChild(el('h3', null, n.voiceHeading));
  const recRow = el('div', 'ptRow ptRec');
  const recBtn = el('button', 'ptBtn', n.record);
  recBtn.dataset.testid = 'pt-rec';
  const recTime = el('span', 'ptRecTime', formatClockMs(0));
  recTime.dataset.testid = 'pt-rec-time';
  const recCancel = el('button', 'ptBtn warn', n.cancel);
  recCancel.dataset.testid = 'pt-rec-cancel';
  recCancel.disabled = true;
  recRow.append(recBtn, recTime, recCancel);
  voiceBox.appendChild(recRow);
  const micNote = el('div', 'ptNote', n.noMic);
  micNote.hidden = true;
  voiceBox.appendChild(micNote);
  panel.appendChild(voiceBox);

  // ---- compose: text ----
  const textBox = el('div', 'ptCompose');
  textBox.appendChild(el('h3', null, n.textHeading));
  const textArea = document.createElement('textarea');
  textArea.placeholder = n.textPlaceholder;
  textArea.dataset.testid = 'pt-text';
  textBox.appendChild(textArea);
  const textSubmit = el('button', 'ptBtn', n.textSubmit);
  textSubmit.dataset.testid = 'pt-text-submit';
  textBox.appendChild(textSubmit);
  panel.appendChild(textBox);

  // ---- queue ----
  const queue = el('ol', 'ptQueue');
  queue.dataset.testid = 'pt-queue';
  panel.appendChild(queue);

  // ---- footer ----
  const foot = el('div', 'ptFoot');
  const submitBottom = el('button', 'ptBtn', n.submit);
  submitBottom.dataset.testid = 'pt-submit-bottom';
  foot.appendChild(submitBottom);
  const newSessionRow = el('div', 'ptRow');
  foot.appendChild(newSessionRow);
  const status = el('div', 'ptStatus', '');
  status.dataset.testid = 'pt-status';
  foot.appendChild(status);
  panel.appendChild(foot);

  document.body.appendChild(panel);

  // ---- state ----
  const entries = []; // in-memory mirror of the store, seq order
  const objectUrls = new Map(); // entry id -> blob object URL
  let seq = 0;
  let session = { id: '', startedAt: Date.now() };
  let store = null;
  let textMarkerStart = null;
  let prevTextValue = '';
  const pendingDelete = new Set();
  let newSessionConfirming = false;
  const trail = createTrail();

  function clock() {
    return { nowMs: Date.now(), sessionStartMs: session.startedAt, tickMs: cfg.TICK_MS };
  }
  function marker() {
    return captureMarker(getState(), clock());
  }

  function refreshMeta() {
    meta.textContent = `${n.session}${session.id}${n.entries}: ${entries.length}`;
  }

  function nextId() {
    return `${Date.now()}-${seq}`;
  }

  // ---- queue rendering ----
  function objectUrlFor(entry) {
    if (!objectUrls.has(entry.id)) objectUrls.set(entry.id, URL.createObjectURL(entry.blob));
    return objectUrls.get(entry.id);
  }

  function revokeUrl(id) {
    const url = objectUrls.get(id);
    if (url) { URL.revokeObjectURL(url); objectUrls.delete(id); }
  }

  function renderItem(entry) {
    const li = el('li', 'ptItem');
    li.dataset.id = entry.id;

    const itemHead = el('div', 'ptItemHead', formatEntryHeader(entry));
    if (entry.edited) itemHead.appendChild(el('span', 'edited', ' ' + n.edited));
    li.appendChild(itemHead);

    if (entry.kind === 'voice') {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = objectUrlFor(entry);
      li.appendChild(audio);
      li.appendChild(el('div', 'ptMeta', formatClockMs(entry.durationMs)));
    } else {
      const area = document.createElement('textarea');
      area.value = entry.text;
      area.dataset.testid = 'pt-edit-' + entry.id;
      const save = () => {
        if (area.value === entry.text) return;
        const updated = editText(entry, area.value, Date.now());
        const i = entries.findIndex((e) => e.id === entry.id);
        entries[i] = updated;
        if (store) store.putEntry(updated);
        replaceItem(li, updated);
      };
      area.addEventListener('change', save);
      area.addEventListener('blur', save);
      li.appendChild(area);
    }

    const itemFoot = el('div', 'ptItemFoot');
    li.appendChild(itemFoot);
    renderDeleteControls(itemFoot, entry, li);

    return li;
  }

  function replaceItem(oldLi, entry) {
    const newLi = renderItem(entry);
    oldLi.replaceWith(newLi);
  }

  function renderDeleteControls(itemFoot, entry, li) {
    while (itemFoot.firstChild) itemFoot.removeChild(itemFoot.firstChild);
    if (pendingDelete.has(entry.id)) {
      itemFoot.appendChild(el('span', null, n.deleteConfirm));
      const yes = el('button', 'ptBtn warn', n.deleteYes);
      yes.dataset.testid = 'pt-del-yes-' + entry.id;
      yes.addEventListener('click', () => deleteEntry(entry.id));
      const no = el('button', 'ptBtn', n.deleteNo);
      no.dataset.testid = 'pt-del-no-' + entry.id;
      no.addEventListener('click', () => {
        pendingDelete.delete(entry.id);
        renderDeleteControls(itemFoot, entry, li);
      });
      itemFoot.append(yes, no);
    } else {
      const del = el('button', 'ptBtn warn', n.delete);
      del.dataset.testid = 'pt-del-' + entry.id;
      del.addEventListener('click', (e) => {
        if (e.shiftKey) { deleteEntry(entry.id); return; }
        pendingDelete.add(entry.id);
        renderDeleteControls(itemFoot, entry, li);
      });
      itemFoot.appendChild(del);
    }
  }

  function addEntry(entry) {
    entries.push(entry);
    if (store) store.putEntry(entry);
    queue.appendChild(renderItem(entry));
    queue.scrollTop = queue.scrollHeight;
    refreshMeta();
  }

  function deleteEntry(id) {
    pendingDelete.delete(id);
    revokeUrl(id);
    const i = entries.findIndex((e) => e.id === id);
    if (i !== -1) entries.splice(i, 1);
    if (store) store.deleteEntry(id);
    const li = queue.querySelector(`li[data-id="${CSS_ESCAPE(id)}"]`);
    if (li) li.remove();
    refreshMeta();
  }

  // dataset values never contain quotes (ids are `${ms}-${seq}`), but this
  // keeps the selector construction honest if that ever changes.
  function CSS_ESCAPE(s) {
    return String(s).replace(/["\\]/g, '\\$&');
  }

  // ---- new session ----
  // Clears the store and the in-memory queue, then opens a fresh session —
  // mirrors the init IIFE below, minus restoring entries (there are none to
  // restore right after a clear).
  async function startNewSession() {
    if (!store) return;
    await store.clear();
    const fresh = await store.openSession(Date.now(), Math.random);
    for (const id of [...objectUrls.keys()]) revokeUrl(id);
    entries.length = 0;
    while (queue.firstChild) queue.removeChild(queue.firstChild);
    pendingDelete.clear();
    session = fresh;
    seq = fresh.seqNext;
    refreshMeta();
  }

  function renderNewSessionControls() {
    while (newSessionRow.firstChild) newSessionRow.removeChild(newSessionRow.firstChild);
    if (newSessionConfirming) {
      newSessionRow.appendChild(el('span', null, n.newSessionConfirm));
      const yes = el('button', 'ptBtn warn', n.newSessionYes);
      yes.dataset.testid = 'pt-new-session-yes';
      yes.addEventListener('click', async () => {
        newSessionConfirming = false;
        await startNewSession();
        renderNewSessionControls();
      });
      const no = el('button', 'ptBtn', n.newSessionNo);
      no.dataset.testid = 'pt-new-session-no';
      no.addEventListener('click', () => {
        newSessionConfirming = false;
        renderNewSessionControls();
      });
      newSessionRow.append(yes, no);
    } else {
      const btn = el('button', 'ptBtn warn', n.newSession);
      btn.dataset.testid = 'pt-new-session';
      btn.addEventListener('click', () => {
        newSessionConfirming = true;
        renderNewSessionControls();
      });
      newSessionRow.appendChild(btn);
    }
  }
  renderNewSessionControls();

  // ---- trail sampler: own 2s interval, independent of rAF ----
  const trailTimer = setInterval(() => {
    if (session.id) trail.sample(getState(), clock());
  }, 2000);

  // ---- voice recording ----
  const recorderDeps = {
    getUserMedia: (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      : undefined,
    MediaRecorderCtor: window.MediaRecorder,
    now: () => Date.now(),
  };
  const mimeOk = pickMime(recorderDeps.MediaRecorderCtor);
  const micAvailable = !!mimeOk && !!recorderDeps.getUserMedia;
  const recorder = micAvailable ? createRecorder(recorderDeps) : null;
  if (!micAvailable) {
    recBtn.disabled = true;
    micNote.hidden = false;
  }

  // The store's openSession() is async; recording or submitting text before
  // it resolves would hand out entry ids/seqs that collide with restored
  // entries once session.seqNext is known. Compose stays disabled until then.
  recBtn.disabled = true;
  textSubmit.disabled = true;

  let recTimer = null;
  function stopRecTimer() {
    if (recTimer) { clearInterval(recTimer); recTimer = null; }
    recTime.textContent = formatClockMs(0);
  }

  recBtn.addEventListener('click', async () => {
    if (!recorder) return;
    if (!recorder.isRecording()) {
      recBtn.disabled = true;
      const mStart = marker();
      try {
        await recorder.start();
      } catch {
        recBtn.disabled = false;
        return;
      }
      recBtn.disabled = false;
      recBtn.textContent = n.stopSubmit;
      recCancel.disabled = false;
      recTimer = setInterval(() => { recTime.textContent = formatClockMs(recorder.durationMs()); }, 200);
      recBtn._markerStart = mStart;
    } else {
      const mStart = recBtn._markerStart;
      const result = await recorder.stop();
      stopRecTimer();
      recBtn.textContent = n.record;
      recCancel.disabled = true;
      if (result) {
        const mEnd = marker();
        const entry = makeVoiceEntry({
          id: nextId(), blob: result.blob, mime: result.mime, ext: result.ext,
          durationMs: result.durationMs, markerStart: mStart, markerEnd: mEnd,
          trail: trail.window(mEnd.atMs), createdAt: Date.now(), seq: seq++,
        });
        addEntry(entry);
      }
    }
  });

  recCancel.addEventListener('click', async () => {
    if (!recorder || !recorder.isRecording()) return;
    await recorder.cancel();
    stopRecTimer();
    recBtn.textContent = n.record;
    recCancel.disabled = true;
  });

  // ---- text compose ----
  textArea.addEventListener('input', () => {
    if (shouldStartTextMarker(prevTextValue, textArea.value)) textMarkerStart = marker();
    prevTextValue = textArea.value;
  });

  function submitText() {
    if (!textArea.value.trim()) return;
    const mStart = textMarkerStart || marker();
    const mEnd = marker();
    const entry = makeTextEntry({
      id: nextId(), text: textArea.value, markerStart: mStart, markerEnd: mEnd,
      trail: trail.window(mEnd.atMs), createdAt: Date.now(), seq: seq++,
    });
    if (!entry) return;
    addEntry(entry);
    textArea.value = '';
    prevTextValue = '';
    textMarkerStart = null;
  }
  textSubmit.addEventListener('click', submitText);

  // ---- submit session ----
  function setSubmitDisabled(disabled) {
    submitTop.disabled = disabled;
    submitBottom.disabled = disabled;
  }

  async function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function submit() {
    setSubmitDisabled(true);
    status.textContent = n.statusSubmitting;
    try {
      const state = getState();
      const game = buildGameInfo(state, VERSION);
      const save = btoa(serialize(state));
      const bundle = buildBundle({
        sessionId: session.id,
        startedAt: session.startedAt,
        endedAt: Date.now(),
        game, save,
        ua: navigator.userAgent,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        entries,
      });
      await submitSession(bundle, {
        env: SUBMIT_ENV,
        fetch: window.fetch ? window.fetch.bind(window) : undefined,
        zip: zipFiles,
        download,
        onProgress: (p) => { status.textContent = formatProgress(p); },
      });
      status.textContent = n.statusDone;
    } catch (err) {
      status.textContent = n.statusError + (err && err.message ? err.message : String(err));
    } finally {
      setSubmitDisabled(false);
    }
  }
  submitTop.addEventListener('click', submit);
  submitBottom.addEventListener('click', submit);

  // ---- init: open the store, restore any queued entries ----
  (async () => {
    store = await createStore({ indexedDB: window.indexedDB });
    session = await store.openSession(Date.now(), Math.random);
    seq = session.seqNext;
    const restored = await store.allEntries();
    for (const entry of restored) {
      entries.push(entry);
      queue.appendChild(renderItem(entry));
    }
    seq = nextSeq(seq, restored);
    if (restored.length) queue.scrollTop = queue.scrollHeight;
    refreshMeta();
    textSubmit.disabled = false;
    if (micAvailable) recBtn.disabled = false;
  })();

  refreshMeta();

  function dispose() {
    clearInterval(trailTimer);
    stopRecTimer();
    for (const id of [...objectUrls.keys()]) revokeUrl(id);
    panel.remove();
    style.remove();
    document.body.classList.remove('playtest');
  }
  window.addEventListener('pagehide', () => {
    for (const id of [...objectUrls.keys()]) revokeUrl(id);
  });

  return { dispose, voiceIndex: (id) => voiceIndex(entries, id) };
}
