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
.tfChatWin[hidden] { display: none !important; }
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
  const chip = el('button', 'tfChatChip', '✦ chat  `');
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
      ? '(' + delivered.join('; ') + ' — paste or open it in Claude Code at the repo)'
      : 'Clipboard and save were both unavailable — here is the package:\n\n' + action.body);
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
    const x = el('button', 'x', '✕');
    x.dataset.testid = 'chat-close';
    x.addEventListener('click', hide);
    head.appendChild(x);
    logEl = el('div', 'tfChatLog');
    logEl.style.height = '190px';        // ~10 history lines to start
    const inBar = el('div', 'tfChatIn');
    inputEl = document.createElement('textarea');
    inputEl.rows = 3;
    inputEl.placeholder = 'ask, tune ("set sound tap to 0.5"), or request code…';
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    const send = el('button', null, 'send ⏎');
    send.addEventListener('click', submit);
    inBar.append(inputEl, send);
    const note = el('div', 'tfChatNote',
      'Ctrl+←/→ switch agents · Esc or ` dismiss · Enter sends, Shift+Enter newline');
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
      // Grip must track the cursor, so resizing re-anchors top-left first.
      win.style.left = rect.left + 'px';
      win.style.top = rect.top + 'px';
      win.style.right = 'auto';
      win.style.bottom = 'auto';
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
