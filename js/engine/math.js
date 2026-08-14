// Closed-form purchase math. Never loop to price a bulk buy.

// Cost of the next unit when `owned` are held.
export function nextCost(base, growth, owned) {
  return Math.ceil(base * Math.pow(growth, owned));
}

// Total cost of buying n units starting from `owned` held.
export function bulkCost(base, growth, owned, n) {
  if (n <= 0) return 0;
  if (growth === 1) return Math.ceil(base * n);
  const r = growth;
  return Math.ceil(base * (Math.pow(r, owned) * (Math.pow(r, n) - 1)) / (r - 1));
}

// Largest n purchasable with `teeth` starting from `owned` held. 0 if none.
export function maxAffordable(base, growth, owned, teeth) {
  if (teeth < nextCost(base, growth, owned)) return 0;
  if (growth === 1) return Math.floor(teeth / base);
  const r = growth;
  const n = Math.floor(Math.log((teeth * (r - 1)) / (base * Math.pow(r, owned)) + 1) / Math.log(r));
  // Ceil-rounding in bulkCost can overshoot by one; step down if needed.
  let k = Math.max(0, n);
  while (k > 0 && bulkCost(base, growth, owned, k) > teeth) k--;
  return k;
}

// Stars banked when a town is left: closed-form from that town's lifetime.
export function starsAtLifetime(lifetime, cfg) {
  if (!(lifetime > 0)) return 0;
  return Math.floor(cfg.STARS.AT_PIVOT * Math.pow(lifetime / cfg.STARS.PIVOT, cfg.STARS.EXP));
}

export function fmt(n) {
  if (n < 1000) return String(Math.floor(n));
  const units = ['k', 'm', 'b', 't', 'q'];
  let u = -1;
  let v = n;
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
  return (v >= 100 ? Math.floor(v) : v.toFixed(v >= 10 ? 1 : 2)) + units[u];
}

// A figure is done when every slot is traced. Bonuses are all-or-nothing.
export function figureDone(state, cfg, id) {
  const def = cfg.CONSTELLATIONS[id];
  if (!def) return false;
  return ((state.constellations && state.constellations[id]) || 0) >= def.slots;
}
