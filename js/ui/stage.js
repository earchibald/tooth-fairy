// The stage: outline teeth, memory beats, asides, whispers, the ending sky.

import { toothSVG } from './tooth.js';
import { mulberry32 } from '../engine/rng.js';
import { fmt } from '../engine/math.js';

export function createStage(el, { vfx, script, onRespond, onOrphan }) {
  el.classList.add('stage');

  const asideLayer = document.createElement('div');
  asideLayer.className = 'asideLayer';
  el.appendChild(asideLayer);

  const outlineRow = document.createElement('div');
  outlineRow.className = 'outlineRow';
  outlineRow.dataset.testid = 'outline-row';
  el.appendChild(outlineRow);

  const beatCard = document.createElement('div');
  beatCard.className = 'beatCard';
  beatCard.hidden = true;
  const beatArt = document.createElement('div');
  beatArt.className = 'stageArt';
  const beatText = document.createElement('div');
  beatText.className = 'beatText';
  const beatBtn = document.createElement('button');
  beatBtn.className = 'beatBtn';
  beatBtn.dataset.testid = 'beat-response';
  beatCard.append(beatArt, beatText, beatBtn);
  el.appendChild(beatCard);

  const whisperEl = document.createElement('div');
  whisperEl.className = 'whisper';
  el.appendChild(whisperEl);

  const sky = document.createElement('div');
  sky.className = 'sky';
  sky.hidden = true;
  const skyCanvas = document.createElement('canvas');
  const skyStats = document.createElement('div');
  skyStats.className = 'skyStats';
  sky.append(skyCanvas, skyStats);
  el.appendChild(sky);

  let shownBeat = null;
  let beatTimer = null;
  let outlineSig = '';
  let whisperIdx = -1;
  let skySig = '';

  beatBtn.addEventListener('click', () => {
    if (shownBeat) onRespond(shownBeat);
  });

  function buildArt(kind) {
    while (beatArt.firstChild) beatArt.removeChild(beatArt.firstChild);
    beatArt.classList.toggle('pile', kind === 'pile');
    const n = kind === 'icon' ? 1 : kind === 'few' ? 3 : kind === 'pile' ? 12 : 0;
    for (let i = 0; i < n; i++) beatArt.appendChild(toothSVG('tooth-fill'));
    beatArt.hidden = n === 0;
  }

  function showBeat(beat) {
    shownBeat = beat;
    buildArt(beat.stage);
    beatText.textContent = beat.text || '';
    beatText.hidden = !beat.text;
    beatBtn.textContent = beat.response;
    beatCard.classList.toggle('ledger', beat.register === 'ledger');
    beatCard.hidden = false;
    setTimeout(() => beatCard.classList.add('show'), 20);
  }

  function hideBeat() {
    shownBeat = null;
    beatCard.classList.remove('show');
    beatCard.hidden = true;
  }

  function updateOutline(state) {
    if (!state.tapShown || state.ended) { outlineRow.hidden = true; return; }
    outlineRow.hidden = false;
    const { size, filled } = state.outline;
    const sig = size + ':' + filled;
    if (sig === outlineSig) return;
    outlineSig = sig;
    outlineRow.className = 'outlineRow' +
      (size >= 64 ? ' sz64' : size >= 32 ? ' sz32' : size >= 16 ? ' sz16' : size >= 8 ? ' sz8' : '');
    while (outlineRow.children.length > size) outlineRow.removeChild(outlineRow.lastChild);
    while (outlineRow.children.length < size) outlineRow.appendChild(toothSVG());
    for (let i = 0; i < size; i++) {
      const svg = outlineRow.children[i];
      const isFilled = i < filled;
      svg.setAttribute('class', isFilled ? 'tooth-fill' : 'tooth-outline pulse');
      svg.style.setProperty('--pulseMs', vfx.pulse.outlineMs + 'ms');
    }
  }

  function updateSky(state) {
    if (!state.ended) { sky.hidden = true; return; }
    sky.hidden = false;
    outlineRow.hidden = true;
    const stars = Math.min(vfx.sky.starsMax, Math.floor(Math.sqrt(state.lifetime) / 30));
    const sig = stars + ':' + state.taps;
    if (sig === skySig) return;
    skySig = sig;
    const dpr = window.devicePixelRatio || 1;
    const w = sky.clientWidth || 300;
    const h = sky.clientHeight || 200;
    skyCanvas.width = w * dpr;
    skyCanvas.height = h * dpr;
    const c = skyCanvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const rand = mulberry32(state.seed ^ 0x51ab);
    for (let i = 0; i < stars; i++) {
      const x = rand() * w;
      const y = rand() * (h - 40);
      const r = 0.6 + rand() * 1.4;
      c.globalAlpha = 0.35 + rand() * 0.6;
      c.fillStyle = '#dfe8ff';
      c.beginPath();
      c.arc(x, y, r, 0, 7);
      c.fill();
    }
    while (skyStats.firstChild) skyStats.removeChild(skyStats.firstChild);
    const stat = (label, value) => {
      const span = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = fmt(value);
      span.append(b, document.createTextNode(' ' + label));
      skyStats.appendChild(span);
    };
    stat('teeth became stars', state.lifetime);
    stat('taps', state.taps);
    stat('scouts flew', state.buys.scout);
    stat('pacts signed', state.buys.pact);
    stat('notes read', state.notesRead);
    stat('wakes', state.wakes);
    stat('journal visits', state.journalOpens);
  }

  return {
    update(state, script2) {
      const activeScript = script2 || script;
      const queuedId = state.beatQueue[0] || null;
      if (queuedId && (!shownBeat || shownBeat.id !== queuedId)) {
        const beat = activeScript.beats.find((b) => b.id === queuedId);
        if (!beat) {
          // An id the script no longer knows must never freeze the game.
          if (onOrphan) onOrphan(queuedId);
          return;
        }
        if (beat && !beatTimer) {
          beatTimer = setTimeout(() => {
            beatTimer = null;
            showBeat(beat);
          }, shownBeat ? vfx.beats.settleMs : vfx.beats.settleMs + 200);
          if (shownBeat) hideBeat();
        }
      } else if (!queuedId && shownBeat) {
        hideBeat();
      }
      updateOutline(state);
      updateSky(state);
    },

    aside(text, cls) {
      const div = document.createElement('div');
      div.className = 'aside' + (cls ? ' ' + cls : '');
      div.textContent = text;
      div.addEventListener('click', () => div.remove());
      asideLayer.appendChild(div);
      while (asideLayer.children.length > 3) asideLayer.removeChild(asideLayer.firstChild);
      setTimeout(() => div.classList.add('show'), 20);
      const dwell = Math.max(vfx.beats.asideMinMs,
        Math.min(vfx.beats.asideMaxMs, text.length * vfx.beats.asideMsPerChar));
      setTimeout(() => {
        div.classList.remove('show');
        setTimeout(() => div.remove(), 500);
      }, dwell);
    },

    whisper(state, script2) {
      const pool = (script2 || script).whispers[state.act];
      if (!pool || !pool.length || state.beatQueue.length || state.ended) return;
      whisperIdx = (whisperIdx + 1) % pool.length;
      whisperEl.textContent = pool[whisperIdx];
      whisperEl.classList.add('show');
      setTimeout(() => whisperEl.classList.remove('show'), vfx.beats.whisperDwellMs);
    },

    hasBeatOpen: () => !!shownBeat || !!beatTimer,
  };
}
