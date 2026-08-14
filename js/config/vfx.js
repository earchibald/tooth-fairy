// Visual & audio tuning. The dev panel's VFX tab edits an override layer.
// Times are milliseconds (perception gaps must not move with the tick rate).

export const VFX_DEFAULTS = Object.freeze({
  motif: Object.freeze({
    toothPx: 26,          // motif tooth height on the strip
    stripPad: 6,          // strip extends button height + this many px
    scrollPxPerS: 8,      // idle drift of the background motif
    inboundMs: 1400,      // an incoming tooth's travel time edge → button
    inboundMax: 12,       // max concurrent inbound sprites; excess batches
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
    25: Object.freeze({ bg: '#081420', surface: '#0e1b2b', ink: '#dfeaf2', dim: '#8fa3b4', accent: '#7fb0c9', glow: '#b8e0ef' }),
    3: Object.freeze({ bg: '#080c1c', surface: '#101527', ink: '#e8ecf7', dim: '#98a0bb', accent: '#93b0e4', glow: '#ccdefc' }),
  }),
  constellations: Object.freeze({   // fixed figure patterns; points light in order
    littlest: Object.freeze({
      points: Object.freeze([[35, 22], [65, 22], [58, 72], [42, 72]]),
      edges: Object.freeze([[0, 1], [1, 2], [2, 3], [3, 0]]),
    }),
    fieldmouse: Object.freeze({
      points: Object.freeze([[15, 65], [35, 55], [55, 50], [75, 45], [85, 28], [65, 24]]),
      edges: Object.freeze([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]),
    }),
    quietloom: Object.freeze({
      points: Object.freeze([[25, 25], [75, 25], [75, 75], [25, 75], [42, 25], [42, 75], [58, 25], [58, 75]]),
      edges: Object.freeze([[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [6, 7]]),
    }),
    ferryman: Object.freeze({
      points: Object.freeze([[10, 60], [30, 70], [50, 72], [70, 70], [90, 60], [50, 40], [50, 15], [35, 32], [65, 32], [50, 55]]),
      edges: Object.freeze([[0, 1], [1, 2], [2, 3], [3, 4], [2, 9], [9, 5], [5, 6], [6, 7], [6, 8]]),
    }),
    toothfairy: Object.freeze({
      points: Object.freeze([[50, 8], [42, 20], [58, 20], [50, 30], [35, 40], [65, 40], [20, 30], [80, 30], [28, 55], [72, 55], [42, 60], [58, 60], [46, 86], [54, 86]]),
      edges: Object.freeze([[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 7], [6, 8], [7, 9], [4, 10], [5, 11], [10, 12], [11, 13]]),
    }),
  }),
  sound: Object.freeze({
    master: 0.5,
    // tap rides the recorded microtick clip (raw peak 1.24); through the 0.5
    // master this lands at the edge-of-noticeable level the clip shipped with.
    tap: 0.06, fill: 0.03, beat: 0.035, buy: 0.03, wake: 0.05, note: 0.03,
  }),
});

// Deep-copies defaults into a live-mutable object; unknown keys ignored.
function merge(defaults, overrides) {
  const src = overrides && typeof overrides === 'object' ? overrides : {};
  if (Array.isArray(defaults)) return defaults.slice();
  const out = {};
  for (const k of Object.keys(defaults)) {
    const d = defaults[k];
    if (d && typeof d === 'object') out[k] = merge(d, src[k]);
    else out[k] = (k in src) ? src[k] : d;
  }
  return out;
}

export function buildVfx(overrides) {
  return merge(VFX_DEFAULTS, overrides);
}
