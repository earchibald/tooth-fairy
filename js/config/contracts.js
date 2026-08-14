// Contract pool. Pure data. type: gather|notes|tiptoes (threshold, n scales
// noted below) · quiet|calm (endurance, judged at dawn).
export const CONTRACT_DEFAULTS = Object.freeze({
  pool: [
    { id: 'c-gather-s', minAct: 2, type: 'gather', n: 900,
      text: "a molar under the blue house's window. nine hundred teeth on the books by dawn.",
      reward: { burstS: 45 } },
    { id: 'c-gather-m', minAct: 2, type: 'gather', n: 3000,
      text: 'the ministry wants volume. three thousand before the light.',
      reward: { burstS: 90 } },
    { id: 'c-quiet', minAct: 2, type: 'quiet',
      text: 'the flashlight kid is on a sleepover. their host must not wake. no one wakes tonight.',
      reward: { belief: 8 } },
    { id: 'c-calm', minAct: 2, type: 'calm', n: 30,
      text: 'end the night with the houses barely stirring. under thirty on the meter at dawn.',
      reward: { belief: 5 } },
    { id: 'c-notes', minAct: 2, type: 'notes', n: 2,
      text: 'two letters need answering tonight. read them properly.',
      reward: { fragment: "'dear tooth fairy. the sleepover kid snores. i kept watch for you.' — the flashlight kid" } },
    { id: 'c-tiptoe', minAct: 2, type: 'tiptoes', n: 2,
      text: 'the floorboards by the nursery are proud. humble yourself twice.',
      reward: { belief: 4 } },
    { id: 'c-gather-r', minAct: 25, type: 'gather', n: 40000,
      text: 'the barge master wants a full hold. forty thousand by dawn.',
      reward: { burstS: 120 } },
    { id: 'c-quiet-r', minAct: 25, type: 'quiet',
      text: 'fog on the river carries sound. tonight, none to carry.',
      reward: { belief: 10 } },
    { id: 'c-fragment-r', minAct: 25, type: 'notes', n: 3,
      text: 'three letters came upriver, water-stained. read them anyway.',
      reward: { fragment: "'dear tooth fairy. dad says the river was here before the town. what was it FOR?'" } },
    { id: 'c-gather-f', minAct: 3, type: 'gather', n: 2e6,
      text: 'the fold expects a tithe. two million on the books tonight.',
      reward: { burstS: 180 } },
    { id: 'c-calm-f', minAct: 3, type: 'calm', n: 20,
      text: 'signatories sleep lightly. under twenty at dawn.',
      reward: { belief: 12 } },
  ],
});

export function buildContracts(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.pool) || !o.pool.length) {
    return CONTRACT_DEFAULTS;
  }
  return Object.freeze({ pool: o.pool.filter((c) => c && c.id) });
}
