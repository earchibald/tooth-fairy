// Synthesized WebAudio blips — no assets, tiny gains, silence for refusals.
// ?mute=1 is a module flag that never touches the persisted preference.

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

export const play = {
  tap()  { blip({ type: 'triangle', from: 1500, to: 900, ms: 30, gain: vfx.sound.tap }); },
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
};
