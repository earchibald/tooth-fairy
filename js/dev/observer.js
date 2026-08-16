// Pure run observer: invariant checks + balance statistics. Fed by the
// headless bot (test/e2e.test.js) and the browser autopilot. Read-only —
// it must never mutate state or advance the engine.

import { noiseLevel, hushCapacity } from '../engine/predicates.js';
import { UNIT_IDS } from '../engine/state.js';

const MAX_VIOLATIONS = 50;
const SAMPLE_EVERY = 50;

export function createObserver(cfg, script) {
  const beatIds = new Set(script.beats.map((b) => b.id));
  const violations = [];
  const samples = [];
  const loomBuys = [];
  const perAct = {};
  let ticks = 0;
  let lastTick = null;
  let lastLifetime = null;
  let lastTown = null;
  let lastLoom = null;

  function violate(state, rule, detail) {
    if (violations.length < MAX_VIOLATIONS) {
      violations.push({ tick: state.tick, rule, detail });
    }
  }

  function onTick(state) {
    // The browser autopilot polls; between engine ticks the state is
    // unchanged and must not be double-counted.
    if (state.town === lastTown && state.tick === lastTick) return;
    if (state.town !== lastTown) { lastTick = null; lastLifetime = null; lastLoom = null; }
    ticks++;
    const noise = noiseLevel(state, cfg);
    const hush = hushCapacity(state, cfg);

    for (const [key, v] of [['teeth', state.teeth], ['lifetime', state.lifetime],
      ['stars', state.stars], ['stir', state.stir], ['belief', state.belief],
      ['notes', state.notes], ['noise', noise], ['hush', hush]]) {
      if (!Number.isFinite(v) || v < 0) violate(state, 'finite:' + key, String(v));
    }
    if (state.stir > 100) violate(state, 'range:stir', String(state.stir));
    if (state.belief > 100) violate(state, 'range:belief', String(state.belief));
    for (const u of UNIT_IDS) {
      if (!Number.isInteger(state.units[u]) || state.units[u] < 0) {
        violate(state, 'units:' + u, String(state.units[u]));
      }
      if (!Number.isInteger(state.buys[u]) || state.buys[u] < 0) {
        violate(state, 'buys:' + u, String(state.buys[u]));
      }
    }
    if (lastTick !== null && state.tick < lastTick) {
      violate(state, 'tick:regressed', lastTick + '->' + state.tick);
    }
    if (lastLifetime !== null && state.lifetime < lastLifetime) {
      violate(state, 'lifetime:decreased', lastLifetime + '->' + state.lifetime);
    }
    for (const id of state.beatQueue) {
      if (!beatIds.has(id)) violate(state, 'beat:unknown-queued', id);
    }
    for (const id of state.beatsSeen) {
      if (!beatIds.has(id)) violate(state, 'beat:unknown-seen', id);
    }

    const act = perAct[state.act] ||
      (perAct[state.act] = { ticks: 0, pressureTicks: 0, stirTicks: 0, maxStir: 0 });
    act.ticks++;
    if (noise > hush) act.pressureTicks++;
    if (state.stir > 0) act.stirTicks++;
    if (state.stir > act.maxStir) act.maxStir = state.stir;
    if (lastLoom !== null && state.loom > lastLoom) {
      loomBuys.push({ tick: state.tick, level: state.loom });
    }
    if (ticks % SAMPLE_EVERY === 1) {
      samples.push({ tick: state.tick, act: state.act, noise, hush,
        stir: state.stir, loom: state.loom });
    }

    lastTick = state.tick;
    lastLifetime = state.lifetime;
    lastTown = state.town;
    lastLoom = state.loom;
  }

  function report() {
    return { violations, stats: { ticks, perAct, loomBuys, samples } };
  }

  return { onTick, report };
}
