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
    scout:    Object.freeze({ base: 50,       growth: 1.15, rate: 1,     noise: 0.5 }),
    mouse:    Object.freeze({ base: 600,      growth: 1.14, rate: 10,    noise: 1.5 }),
    sprite:   Object.freeze({ base: 2500,     growth: 1.05, rate: 40,    noise: 6,
                              lifeTicks: 450, afterglowFrac: 0.5,
                              swarmCap: 8, capPerMult: 4 }),
    phantom:  Object.freeze({ base: 12000,    growth: 1.13, rate: 120,   noise: 0 }),
    ferry:    Object.freeze({ base: 140000,   growth: 1.12, rate: 0,     noise: 0.3,
                              lumpAmount: 12000, lumpEveryTicks: 60, noiseSpike: 6 }),
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

  LOOM: Object.freeze({ base: 4000, growth: 1.5, hushPerLevel: 20 }),

  STIR: Object.freeze({
    HUSH_BASE: 10,        // quiet capacity before the loom
    RATE: 0.3,          // stir points/sec per point of excess noise
    FALL_RATE: 4,        // stir points/sec recovery when under hush
    WAKE_AT: 100,
    WAKE_BELIEF_COST: 10,
    WAKE_RESET: 25,
    STUN_TICKS: 50,      // noisiest unit type stunned 10 s
    SETTLE_TICKS: 150,   // post-wake: the house pretends to sleep, stir frozen 30 s
    FIRST_WAKE_AT: 55,   // the scripted flashlight wake fires early, provably
    REVEAL_NOISE: 20,     // STIR meter appears when noise first reaches this
  }),

  BELIEF: Object.freeze({
    START: 50,
    DRIFT_PER_S: 0.002,  // toward 50; with the streak this equilibrates at STREAK_CAP
    STREAK_PER_S: 0.05,  // gain while producing quietly
    STREAK_CAP: 75,
    NOTE_VALUE: 2,
  }),

  NOTES: Object.freeze({ EVERY_S: 45, CAP: 12 }),

  TIPTOE: Object.freeze({ FACTOR: 0.5, TICKS: 75, SANDMAN_AT: 85 }),

  OFFLINE: Object.freeze({ MAX_STEPS: 10000 }),

  ENDING: Object.freeze({ LIFETIME: 50e6 }),

  OUTLINE: Object.freeze({
    MAX_SIZE: 64,          // stage outline sets double up to this
    HELPER_FILL_CAP: 6,    // max outline slots automated income fills per tick
  }),

  NIGHT: Object.freeze({
    LENGTH_TICKS: 10500,  // ~35 min of productive play at 200ms ticks
    MIN_GAP_S: 7200,      // dawn rest before the next dusk (2 h)
    LEDGER_CAP: 30,       // night-ledger entries kept
  }),
});

// Deep-copies defaults into a LIVE-MUTABLE object (the dev panel tunes the
// running game in place); unknown override keys are ignored, never invented.
function merge(defaults, overrides) {
  if (Array.isArray(defaults)) {
    return Array.isArray(overrides) ? overrides.slice() : defaults.slice();
  }
  const src = overrides && typeof overrides === 'object' ? overrides : {};
  const out = {};
  for (const k of Object.keys(defaults)) {
    const d = defaults[k];
    if (d && typeof d === 'object') out[k] = merge(d, src[k]);
    else out[k] = (k in src) ? src[k] : d;
  }
  return out;
}

export function buildConstants(overrides) {
  return merge(DEFAULTS, overrides);
}
