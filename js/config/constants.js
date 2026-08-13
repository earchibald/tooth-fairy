// Balance constants. DEFAULTS is the documented baseline; the dev panel's
// Balance tab merges a partial override layer on top via buildConstants().
// Knob keys ARE these key paths — the panel iterates this object, so a slider
// cannot exist without a constant or vice versa.

export const DEFAULTS = Object.freeze({
  TICK_MS: 200,

  TAP: Object.freeze({
    BASE: 1,            // teeth per landed tap before upgrades
    MAX_PER_TICK: 2,    // anti-autoclicker floor (10/s); never advertised
  }),

  // Generators. rate is teeth/sec at level 0 multipliers. noise is per unit owned.
  UNITS: Object.freeze({
    scout:    Object.freeze({ base: 50,       growth: 1.15, rate: 1,     noise: 1 }),
    mouse:    Object.freeze({ base: 600,      growth: 1.14, rate: 10,    noise: 2 }),
    sprite:   Object.freeze({ base: 2500,     growth: 1.05, rate: 40,    noise: 6,
                              lifeTicks: 450, afterglowFrac: 0.5 }),
    phantom:  Object.freeze({ base: 12000,    growth: 1.13, rate: 120,   noise: 0 }),
    ferry:    Object.freeze({ base: 140000,   growth: 1.12, rate: 0,     noise: 0.5,
                              lumpAmount: 12000, lumpEveryTicks: 60, noiseSpike: 10 }),
    pact:     Object.freeze({ base: 1.2e6,    growth: 1.15, rate: 6000,  noise: 0,
                              stirFactor: 0.96, netBonusPer: 0.01, netBonusCap: 3 }),
    ministry: Object.freeze({ base: 8e6,      growth: 1.15, rate: 60000, noise: 0 }),
  }),

  // Per-unit ×2 springboards become buyable at these owned counts.
  MULT_THRESHOLDS: Object.freeze([10, 25, 50]),
  MULT_COST_FACTOR: 12,   // threshold upgrade costs = unit base × factor × 8^tier

  // Tap ladder (one-shot flags, each ×2 except starlight).
  UPGRADES: Object.freeze({
    babyfae:      Object.freeze({ cost: 25 }),
    pincers:      Object.freeze({ cost: 400 }),
    tweezers:     Object.freeze({ cost: 5000 }),
    gloves:       Object.freeze({ cost: 60000 }),
    starlight:    Object.freeze({ cost: 750000, tapRateFrac: 0.01 }),
    afterglow:    Object.freeze({ cost: 9000 }),
    sandman:      Object.freeze({ cost: 30000 }),
    dreamledger:  Object.freeze({ cost: 2000,  offlineRate: 0.5, offlineCapHours: 2 }),
    nightledger:  Object.freeze({ cost: 100000, offlineCapHours: 8 }),
    lucidcontract:Object.freeze({ cost: 2e6,   offlineRate: 1.0, offlineCapHours: 24 }),
  }),

  LOOM: Object.freeze({ base: 1500, growth: 1.5, hushPerLevel: 12 }),

  STIR: Object.freeze({
    HUSH_BASE: 6,        // quiet capacity before the loom
    RATE: 0.55,          // stir points/sec per point of excess noise
    FALL_RATE: 4,        // stir points/sec recovery when under hush
    WAKE_AT: 100,
    WAKE_BELIEF_COST: 15,
    WAKE_RESET: 40,
    STUN_TICKS: 50,      // noisiest unit type stunned 10 s
    FIRST_WAKE_AT: 70,   // the scripted flashlight wake fires early, provably
    REVEAL_NOISE: 8,     // STIR meter appears when noise first reaches this
  }),

  BELIEF: Object.freeze({
    START: 50,
    DRIFT_PER_S: 0.01,   // toward 50
    STREAK_PER_S: 0.02,  // gain while producing quietly
    STREAK_CAP: 75,
    NOTE_VALUE: 2,
  }),

  NOTES: Object.freeze({ EVERY_S: 45 }),

  TIPTOE: Object.freeze({ FACTOR: 0.5, TICKS: 75, SANDMAN_AT: 85 }),

  OFFLINE: Object.freeze({ MAX_STEPS: 10000 }),

  ENDING: Object.freeze({ LIFETIME: 50e6 }),

  OUTLINE: Object.freeze({ MAX_SIZE: 64 }), // stage outline sets double up to this
});

function merge(defaults, overrides) {
  if (!overrides || typeof overrides !== 'object') return defaults;
  const out = Array.isArray(defaults) ? defaults.slice() : { ...defaults };
  for (const k of Object.keys(overrides)) {
    if (!(k in defaults)) continue; // unknown keys are ignored, never invented
    const d = defaults[k];
    const o = overrides[k];
    out[k] = (d && typeof d === 'object' && !Array.isArray(d)) ? merge(d, o) : o;
  }
  return Object.freeze(out);
}

export function buildConstants(overrides) {
  return merge(DEFAULTS, overrides);
}
