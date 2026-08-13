// Shared derivations and reveal predicates. ONE function per unlock, read by
// the hint, the card renderer, and the buy guard — they must never diverge.

import { nextCost } from './math.js';
import { UNIT_IDS } from './state.js';

export function multFactor(state, unit) {
  return Math.pow(2, state.mults[unit] || 0);
}

export function pactNet(state, cfg) {
  const n = state.units.pact;
  const bonus = cfg.UNITS.pact.netBonusPer * (n * (n - 1)) / 2;
  return 1 + Math.min(cfg.UNITS.pact.netBonusCap - 1, bonus);
}

// Belief 50 is the neutral, half-believing world: ×1.0 exactly, so the
// opening tap pays the printed 1 tooth. Range ×0.5 (belief 0) – ×1.5 (100).
export function beliefMult(state) {
  return 1 + (state.belief - 50) / 100;
}

export function tiptoeFactor(state, cfg) {
  return state.tiptoeTicks > 0 ? cfg.TIPTOE.FACTOR : 1;
}

// Continuous production, teeth/sec, before belief/net/tiptoe multipliers.
// Ferry lumps and afterglow bursts are handled in the tick, not here.
export function baseRatePerSec(state, cfg) {
  let rate = 0;
  for (const u of UNIT_IDS) {
    const def = cfg.UNITS[u];
    if (!def.rate) continue;
    if (state.stunUnit === u && state.stunTicks > 0) continue;
    rate += def.rate * state.units[u] * multFactor(state, u);
  }
  return rate;
}

// The number the rate readout shows: everything applied.
export function effectiveRatePerSec(state, cfg) {
  const ferryStunned = state.stunUnit === 'ferry' && state.stunTicks > 0;
  const lumps = state.units.ferry > 0 && cfg.UNITS.ferry.lumpEveryTicks > 0 && !ferryStunned
    ? (cfg.UNITS.ferry.lumpAmount * state.units.ferry * multFactor(state, 'ferry')) /
      (cfg.UNITS.ferry.lumpEveryTicks * (cfg.TICK_MS / 1000))
    : 0;
  return (baseRatePerSec(state, cfg) + lumps) *
    beliefMult(state) * pactNet(state, cfg) * tiptoeFactor(state, cfg);
}

export function tapPower(state, cfg) {
  let mult = 1;
  for (const id of ['babyfae', 'pincers', 'tweezers', 'gloves']) {
    if (state.upgrades[id]) mult *= 2;
  }
  let power = cfg.TAP.BASE * mult;
  if (state.upgrades.starlight) {
    power += cfg.UPGRADES.starlight.tapRateFrac * effectiveRatePerSec(state, cfg);
  }
  return power;
}

export function noiseLevel(state, cfg) {
  let noise = 0;
  for (const u of UNIT_IDS) {
    const def = cfg.UNITS[u];
    if (!def.noise) continue;
    if (state.stunUnit === u && state.stunTicks > 0) continue;
    noise += def.noise * state.units[u];
  }
  noise *= Math.pow(cfg.UNITS.pact.stirFactor, state.units.pact);
  noise *= tiptoeFactor(state, cfg);
  return noise;
}

export function hushCapacity(state, cfg) {
  return cfg.STIR.HUSH_BASE + state.loom * cfg.LOOM.hushPerLevel;
}

export function loomCost(state, cfg) {
  return nextCost(cfg.LOOM.base, cfg.LOOM.growth, state.loom);
}

export function multTier(state, unit, cfg) {
  const tier = state.mults[unit] || 0;
  if (tier >= cfg.MULT_THRESHOLDS.length) return null;
  return { tier, threshold: cfg.MULT_THRESHOLDS[tier],
           cost: Math.ceil(cfg.UNITS[unit].base * cfg.MULT_COST_FACTOR * Math.pow(8, tier)) };
}

// Springboard thresholds count lifetime buys for sprites (they expire) and
// the live roster for everything else.
export function multOwned(state, unit) {
  return unit === 'sprite' ? state.buys.sprite : state.units[unit];
}

// ---- Reveal predicates (sticky; tick copies true results into state.revealed) ----

export function revealChecks(state, cfg) {
  const t = state.teeth;
  const prevTap = (id) => state.upgrades[id];
  // Hint at affordability — with a lifetime backstop, because an eager
  // spender's BALANCE may never cross the price even as the economy grows.
  // A reveal that can be stranded by playstyle is a soft-lock in costume.
  const afford = (cost) => t >= cost || state.lifetime >= cost * 3;
  return {
    'unit:scout': state.upgrades.babyfae && afford(cfg.UNITS.scout.base),
    'unit:mouse': state.buys.scout >= 1 && afford(cfg.UNITS.mouse.base),
    'unit:sprite': state.act >= 2 && afford(cfg.UNITS.sprite.base),
    'unit:phantom': state.act >= 2 && afford(cfg.UNITS.phantom.base),
    'unit:ferry': state.act >= 2 && afford(cfg.UNITS.ferry.base),
    'unit:pact': state.act >= 3, // the fold beat is the ceremony; the card may tease
    'unit:ministry': state.buys.pact >= 3, // the ledger beat is the hint; the card teases

    'up:babyfae': state.act >= 1,
    'up:pincers': prevTap('babyfae') && state.buys.scout >= 3 && afford(cfg.UPGRADES.pincers.cost),
    'up:tweezers': prevTap('pincers') && afford(cfg.UPGRADES.tweezers.cost),
    'up:gloves': prevTap('tweezers') && afford(cfg.UPGRADES.gloves.cost),
    'up:starlight': prevTap('gloves') && afford(cfg.UPGRADES.starlight.cost),
    'up:afterglow': state.buys.sprite >= 3 && afford(cfg.UPGRADES.afterglow.cost),
    'up:sandman': state.tiptoes >= 2 && afford(cfg.UPGRADES.sandman.cost),
    'up:dreamledger': state.beatsSeen.includes('a1-rounds') && state.lifetime >= 5000 && afford(cfg.UPGRADES.dreamledger.cost),
    'up:nightledger': state.upgrades.dreamledger && afford(cfg.UPGRADES.nightledger.cost),
    'up:lucidcontract': state.upgrades.nightledger && afford(cfg.UPGRADES.lucidcontract.cost),
    'loom': state.stirShown && afford(cfg.LOOM.base),
  };
}
