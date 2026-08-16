// Boot, main loop, feedback drain, keyboard, debug API, dev-panel gate.

import { buildConstants } from './config/constants.js';
import { buildNames } from './config/names.js';
import { buildVfx } from './config/vfx.js';
import { buildScript } from './config/script.js';
import { buildContracts } from './config/contracts.js';
import { createState, serialize, deserialize, departTown } from './engine/state.js';
import { dispatch as engineDispatch } from './engine/actions.js';
import { tick, runOffline } from './engine/tick.js';
import { fmt } from './engine/math.js';
import { buildUI } from './ui/render.js';
import { initSound, play } from './ui/sound.js';

const params = new URLSearchParams(location.search);
const SPEED = Math.max(0.1, Math.min(1000, Number(params.get('speed')) || 1));
const AUTOPILOT = params.get('autopilot') === '1';
const PLAYTEST = params.get('playtest') === '1';
const DEV = params.get('dev') === '1' || AUTOPILOT ||
  ['localhost', '127.0.0.1'].includes(location.hostname);

function loadOverrides(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

const cfg = buildConstants(loadOverrides('tf-ov-constants'));
const names = buildNames(loadOverrides('tf-ov-names'));
const vfx = buildVfx(loadOverrides('tf-ov-vfx'));
const script = buildScript(loadOverrides('tf-ov-script'));
const contracts = buildContracts(loadOverrides('tf-ov-contracts'));

initSound(vfx);

// ---- state ----
const box = { state: null };
let savedAt = null;
const savedRaw = DEV && params.get('fresh') === '1' ? null : localStorage.getItem('tf-save');
if (savedRaw) {
  const parsed = deserialize(savedRaw);
  if (parsed) { box.state = parsed.state; savedAt = parsed.savedAt; }
}
if (!box.state) box.state = createState((Date.now() & 0xfffffff) || 1);

// A queued beat id the current script does not know would freeze the game
// forever (the loop pauses while the queue is non-empty). Drop orphans; their
// triggers re-queue naturally if still valid, since the id was never seen.
function sanitizeQueue(state) {
  state.beatQueue = state.beatQueue.filter((id) => script.beats.some((b) => b.id === id));
}
sanitizeQueue(box.state);

// Reset must win the race against the exit hooks: location.reload() fires
// pagehide, whose save() would write the just-forgotten state straight back.
let resetting = false;

function save() {
  if (resetting) return;
  try { localStorage.setItem('tf-save', serialize(box.state)); } catch { /* storage full */ }
}

function dispatch(action, arg) {
  return engineDispatch(box.state, cfg, action, arg);
}

// Swaps in a whole new state (save import, town departure): rebind box.state,
// drop unknown queued beats, persist. Anything that replaces the run wholesale
// must go through this, not assign box.state directly.
function loadState(s) {
  sanitizeQueue(s);
  box.state = s;
  save();
}

// ---- UI ----
const app = document.getElementById('app');
const ui = buildUI(app, {
  cfg, names, vfx, script, contracts,
  dispatch,
  getState: () => box.state,
  loadState,
  resetGame: () => {
    resetting = true;
    localStorage.removeItem('tf-save');
    location.reload();
  },
  onBeatDismissed: () => { save(); },
  onCeremony: () => { play.buy(); },
  onDepart: () => {
    const next = departTown(box.state, cfg);
    if (!next) return;
    loadState(next);
    ui.tabs.show('tonight');
  },
});

// Offline catch-up on boot.
if (savedAt) {
  const away = (Date.now() - savedAt) / 1000;
  const gain = runOffline(box.state, cfg, script, away, contracts);
  if (gain.teeth > 0) ui.overlays.showReturn(gain.teeth, gain.seconds);
}

// ---- tap wiring (pointer) ----
ui.tapBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  doTap();
});

function doTap() {
  if (dispatch('tap')) {
    ui.pressTap();
  }
  // A refused tap is silent: sound rides the sfx queue, which only fills on effect.
}

// ---- main loop: 50ms accumulator driving fixed ticks ----
let accum = 0;
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(2000, now - last);
  last = now;
  if (document.hidden && !DEV) return; // dev keeps running for tuning + automation
  if (box.state.beatQueue.length || ui.overlays.anyOpen()) return;
  accum += dt * SPEED;
  let safety = 0;
  while (accum >= cfg.TICK_MS && safety++ < 200) {
    accum -= cfg.TICK_MS;
    tick(box.state, cfg, script, { contracts });
  }
}, 50);

// ---- feedback drain + render, rAF gated on uiSeq ----
let lastSeq = -1;
const notePool = script.notes;
function drainSfx() {
  const events = box.state.sfx;
  if (!events.length) return;
  box.state.sfx = [];
  const now = performance.now();
  for (const ev of events) {
    switch (ev.type) {
      case 'tap':
        play.tap();
        ui.spawnFloat('+' + fmt(ev.gain), 0.5);
        ui.conveyor.tapPulse(now);
        ui.flashTapGlow();
        break;
      case 'fillset': play.fill(); break;
      case 'income': ui.conveyor.credit(ev.amount, now); break;
      case 'buy': play.buy(); ui.conveyor.buySweep(now); break;
      case 'beatDismiss': play.press(); save(); break;
      case 'wake': {
        play.wake();
        const unitName = ev.unit ? names.units[ev.unit].name.toLowerCase() : '';
        ui.stage.aside(names.ui.wakeAside.replace('{unit}', unitName), 'wake');
        break;
      }
      case 'note': {
        play.note();
        const text = notePool[(box.state.noteIdx - 1) % notePool.length];
        ui.stage.aside(text, 'note');
        break;
      }
      case 'noteArrive': break; // the chip count changing is the feedback
      case 'aside': {
        const aside = script.asides.find((a) => a.id === ev.id);
        if (aside) ui.stage.aside(aside.text);
        break;
      }
      case 'reveal': {
        ui.tabs.setBadge('roost', true);
        const [kind, id] = ev.key.split(':');
        const label = kind === 'unit' ? names.units[id].name
          : kind === 'up' ? names.upgrades[id].name : names.loom.name;
        ui.stage.aside(names.ui.roostNew + label.toLowerCase(), 'roostNew');
        break;
      }
      case 'ferry': break;     // the conveyor lump is the feedback
      case 'expire': break;
      case 'dawn': play.beat(); break;
      case 'dusk': play.fill(); break;
      case 'sail': ui.conveyor.credit(ev.amount, now); break;
      case 'pick': play.buy(); break;
      case 'trace': play.buy(); break;
      case 'contract': {
        play.fill();
        if (ev.fragment) ui.stage.aside(ev.fragment, 'note');
        break;
      }
      default: break;
    }
  }
}

function frame() {
  drainSfx();
  if (box.state.uiSeq !== lastSeq) {
    lastSeq = box.state.uiSeq;
    ui.update(box.state);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// rAF freezes in hidden tabs; in dev, a slow interval keeps the DOM honest
// so automated screenshots never capture a stale frame.
if (DEV) {
  setInterval(() => {
    drainSfx();
    if (box.state.uiSeq !== lastSeq) {
      lastSeq = box.state.uiSeq;
      ui.update(box.state);
    }
  }, 400);
}

// ---- whispers ----
setInterval(() => {
  if (document.hidden || ui.overlays.anyOpen()) return;
  ui.stage.whisper(box.state, script);
}, vfx.beats.whisperEveryS * 1000);

// ---- autosave ----
setInterval(save, 5000);
window.addEventListener('pagehide', save);
let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    hiddenAt = Date.now();
  } else if (hiddenAt) {
    const away = (Date.now() - hiddenAt) / 1000;
    hiddenAt = null;
    if (away >= 10) {
      const gain = runOffline(box.state, cfg, script, away, contracts);
      if (gain.teeth > 0) ui.overlays.showReturn(gain.teeth, gain.seconds);
    }
    // The main loop's accumulator clock must not double-count the gap the
    // offline replay just consumed.
    last = performance.now();
    accum = 0;
  }
});

// ---- keyboard ----
const TAB_ORDER = ['tonight', 'log', 'roost', 'sky'];
function cycle(d) {
  const order = TAB_ORDER.filter((id) => ui.tabs.isVisible(id));
  const i = order.indexOf(ui.tabs.active());
  ui.tabs.show(order[(i + d + order.length) % order.length]);
}
document.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  // While an overlay is up, only closing keys work — a hidden beat response
  // or a purchase must never fire behind a dialog.
  if (ui.overlays.anyOpen()) {
    if (e.key === 'Escape') ui.overlays.closeAll();
    return;
  }
  // A story response requires deliberate input: while a beat card is up,
  // the global SPACE/Enter shortcuts are swallowed so they can neither
  // dismiss it nor tap through. Native activation of the focused response
  // button stays — keyboard players respond by tabbing to it.
  if (document.querySelector('.beatCard.show') && (e.key === ' ' || e.key === 'Enter')) {
    if (!(t && t.closest && t.closest('[data-testid="beat-response"]'))) e.preventDefault();
    return;
  }
  switch (e.key) {
    case ' ': case 't': e.preventDefault(); doTap(); break;
    case 's': dispatch('tiptoe'); break;
    case 'n': dispatch('readNote'); break;
    case 'j': ui.tabs.show('log'); break;
    case 'Escape': ui.overlays.closeAll(); break;
    case '[': cycle(-1); break;
    case ']': cycle(1); break;
    case 'ArrowLeft': e.preventDefault(); cycle(-1); break;
    case 'ArrowRight': e.preventDefault(); cycle(1); break;
    default:
      if (e.key >= '1' && e.key <= '9') ui.roost.pressKey(Number(e.key));
  }
});

// ---- debug API ----
window.game = {
  get state() { return box.state; },
  dispatch,
  cfg, names, vfx, script, contracts,
  debug: {
    advanceTicks(n) { for (let i = 0; i < n; i++) tick(box.state, cfg, script, { contracts }); },
    runUntil(fn, maxTicks = 100000) {
      let i = 0;
      while (!fn(box.state) && i++ < maxTicks) tick(box.state, cfg, script, { contracts });
      return i;
    },
    grant(n) { dispatch('devGrant', { n }); },
    save,
    offline(seconds) { return runOffline(box.state, cfg, script, seconds, contracts); },
  },
};

// ---- dev panel gate ----
if (DEV) {
  import('./dev/panel.js')
    .then((m) => m.mountDevPanel({ app, box, cfg, names, vfx, script, dispatch, ui, save }))
    .catch((err) => console.warn('[dev] panel failed to load', err));
}

// ---- playtest panel gate ----
// Not an overlay: the tick loop above only halts on ui.overlays.anyOpen(),
// and a tester must be able to talk (or type) while the game keeps running.
if (PLAYTEST) {
  import('./playtest/panel.js')
    .then((m) => m.mountPlaytestPanel({ app, box, cfg, names, save, getState: () => box.state }))
    .catch((err) => console.warn('[playtest] panel failed to load', err));
}

// ---- autopilot gate ----
if (AUTOPILOT) {
  import('./dev/autopilot.js')
    .then((m) => m.startAutopilot({
      policyName: params.get('policy') || 'steady',
      rngSeed: Number(params.get('rngSeed')) || 1,
    }))
    .catch((err) => console.warn('[dev] autopilot failed to load', err));
}
