// Visual & audio tuning. The dev panel's VFX tab edits an override layer.
// Times are milliseconds (perception gaps must not move with the tick rate).

export const VFX_DEFAULTS = Object.freeze({
  motif: Object.freeze({
    toothPx: 26,          // motif tooth height on the strip
    stripPad: 6,          // strip extends button height + this many px
    scrollPxPerS: 8,      // idle drift of the background motif
    inboundMs: 1400,      // an incoming tooth's travel time edge → button
    inboundMax: 12,       // max concurrent inbound sprites; excess batches
    batchWindowMs: 500,   // credited teeth pooled into one sprite per window at high rates
    color: '#7b96c9',     // muted cornflower
    inboundColor: '#a8c0ea',
  }),
  pulse: Object.freeze({
    outlineMs: 1600,      // gentle pulse period of an unfilled outline tooth
    fillMs: 260,          // outline → filled transition
    setFadeMs: 700,       // completed set fade
    buttonPressMs: 90,
  }),
  floats: Object.freeze({
    dwellMs: 1200, riseGap: 18, maxConcurrent: 3,
  }),
  beats: Object.freeze({
    settleMs: 350,        // quiet gap before a beat card appears
    fadeInMs: 450,
    asideMsPerChar: 60, asideMinMs: 2200, asideMaxMs: 9000,
    whisperEveryS: 28, whisperDwellMs: 5200,
  }),
  ceremony: Object.freeze({   // new shop card arrival
    dropMs: 420, sparkleMs: 900, flashMs: 620,
  }),
  wake: Object.freeze({ flashMs: 900 }),
  sky: Object.freeze({ starsMax: 400, twinkleS: 6 }),
  palettes: Object.freeze({   // data-act drives these custom properties
    0: Object.freeze({ bg: '#10131c', surface: '#171b27', ink: '#d7dceb', dim: '#8b93ad', accent: '#7b96c9', glow: '#a8c0ea' }),
    1: Object.freeze({ bg: '#0e1220', surface: '#151a2b', ink: '#dde2f0', dim: '#8f97b2', accent: '#84a1d8', glow: '#b4cbf2' }),
    2: Object.freeze({ bg: '#0b0f1e', surface: '#12172a', ink: '#e2e6f3', dim: '#939bb6', accent: '#8ba8de', glow: '#bfd4f7' }),
    3: Object.freeze({ bg: '#080c1c', surface: '#101527', ink: '#e8ecf7', dim: '#98a0bb', accent: '#93b0e4', glow: '#ccdefc' }),
  }),
  sound: Object.freeze({
    master: 0.5,
    tap: 0.02, fill: 0.03, beat: 0.035, buy: 0.03, wake: 0.05, note: 0.03,
  }),
});

function merge(defaults, overrides) {
  if (!overrides || typeof overrides !== 'object') return defaults;
  const out = { ...defaults };
  for (const k of Object.keys(overrides)) {
    if (!(k in defaults)) continue;
    const d = defaults[k];
    const o = overrides[k];
    out[k] = (d && typeof d === 'object') ? merge(d, o) : o;
  }
  return Object.freeze(out);
}

export function buildVfx(overrides) {
  return merge(VFX_DEFAULTS, overrides);
}
