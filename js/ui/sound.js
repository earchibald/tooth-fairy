// Synthesized WebAudio blips plus one recorded clip for the tap.
// ?mute=1 is a module flag that never touches the persisted preference.
//
// Tap clip: microtick.wav by Saltbearer — https://freesound.org/s/481984/ —
// License: Creative Commons 0. The raw burst sits above 10 kHz; played at
// quarter speed it lands near 4 kHz and reads as a crisp, tiny tick.

const urlMuted = new URLSearchParams(location.search).get('mute') === '1';
let ctx = null;
let master = null;
let vfx = null;
let prefMuted = false;

export function initSound(vfxConfig) {
  vfx = vfxConfig;
  prefMuted = localStorage.getItem('tf-muted') === '1';
}

export function setMuted(m) {
  prefMuted = m;
  localStorage.setItem('tf-muted', m ? '1' : '0');
}
export function isMuted() { return prefMuted; }

export function setMasterGain(v) {
  if (master) master.gain.value = v;
}

function ensure() {
  if (urlMuted || prefMuted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = vfx ? vfx.sound.master : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  master.gain.value = vfx.sound.master; // follow live VFX-tab tuning
  return ctx;
}

function blip({ type = 'sine', from = 440, to = 0, ms = 60, gain = 0.02, delay = 0 }) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + ms / 1000);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + ms / 1000 + 0.02);
  osc.onended = () => { osc.disconnect(); g.disconnect(); };
}

// In the artifact build the wav rides along as base64 (CSP blocks fetch);
// on the normal page it is fetched relative to this module as before.
const TAP_CLIP_B64 = (typeof window !== 'undefined' && window.TF_TAP_CLIP_B64) || null;
const TAP_CLIP_URL = TAP_CLIP_B64 ? null
  : new URL('../../assets/microtick.wav', import.meta.url);
const TAP_CLIP_RATE = 0.25;
const clips = new Map();   // href -> AudioBuffer | 'pending' | 'failed'

// Plays a decoded clip through the master gain. Returns false while the clip
// is still fetching (or failed) so the caller can fall back to a blip —
// the first press of a session must not be silent.
function playClip(url, gain, rate) {
  const c = ensure();
  if (!c) return true;   // muted: swallow, no fallback either
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
  const buf = clips.get(key);
  if (buf === 'pending' || buf === 'failed') return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.onended = () => { src.disconnect(); g.disconnect(); };
  src.start();
  return true;
}

export const play = {
  tap()  {
    if (!playClip(TAP_CLIP_URL, vfx.sound.tap, TAP_CLIP_RATE)) {
      blip({ type: 'triangle', from: 1500, to: 900, ms: 30, gain: vfx.sound.tap });
    }
  },
  fill() {
    blip({ type: 'sine', from: 660, ms: 110, gain: vfx.sound.fill });
    blip({ type: 'sine', from: 880, ms: 130, gain: vfx.sound.fill, delay: 0.09 });
  },
  beat() { blip({ type: 'sine', from: 220, to: 330, ms: 320, gain: vfx.sound.beat }); },
  buy()  { blip({ type: 'square', from: 300, to: 620, ms: 70, gain: vfx.sound.buy }); },
  wake() {
    blip({ type: 'sine', from: 95, to: 60, ms: 200, gain: vfx.sound.wake });
  },
  note() { blip({ type: 'triangle', from: 990, to: 720, ms: 90, gain: vfx.sound.note }); },
  // Story-button acknowledgment: a quick two-blip page-turn tick.
  press() {
    blip({ type: 'triangle', from: 520, to: 660, ms: 45, gain: vfx.sound.press });
    blip({ type: 'triangle', from: 740, to: 880, ms: 55, gain: vfx.sound.press, delay: 0.05 });
  },
};
