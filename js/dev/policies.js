// Bot strategies as swappable decision hooks. steadyPolicy must reproduce
// the historical fixed bot decision-for-decision — test/e2e.test.js pins a
// measured run against it. All randomness flows through mulberry32 so every
// run is reproducible from its seed; Math.random is banned here.

export const BUY_PRIORITY = ['starwrights', 'ministry', 'pact', 'barge', 'ferry', 'owl',
  'phantom', 'sprite', 'bunny', 'mouse', 'scout'];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function steadyPolicy() {
  return {
    name: 'steady',
    tapsPerTick: () => 1,
    shouldTiptoe: (s) => s.stir > 75,
    shouldReadNote: () => true,
    shouldBuyUpgrade: () => true,
    shouldBuyLoom: (s) => !!s.revealed.loom && s.stir > 40,
    unitOrder: () => BUY_PRIORITY,
    shouldBuyUnit: (s, unit, q) =>
      unit === q.top || (q.cost / q.rate <= 450 && q.cost < q.lifeCap),
    pickContract: (board) => board.slice()
      .sort((a, b) => (b.reward.burstS || 0) - (a.reward.burstS || 0))[0].id,
    beatDelayTicks: () => 0,
  };
}

export function chaosPolicy(seed = 1) {
  const rng = mulberry32(seed);
  return {
    name: 'chaos',
    tapsPerTick: () => Math.floor(rng() * 4),
    shouldTiptoe: (s) => s.stir > 30 + rng() * 60,
    shouldReadNote: () => rng() < 0.7,
    shouldBuyUpgrade: () => rng() < 0.5,
    shouldBuyLoom: (s) => !!s.revealed.loom && s.stir > 20 && rng() < 0.3,
    unitOrder: () => shuffle(BUY_PRIORITY.slice(), rng),
    shouldBuyUnit: () => rng() < 0.5,
    pickContract: (board) => board[Math.floor(rng() * board.length)].id,
    beatDelayTicks: () => Math.floor(rng() * 21),
  };
}

// The worst diligent player: max noise, no mitigation, money burned on the
// most expensive thing in sight, the weakest job every night. Upgrades stay
// bought — skipping them starves reveals, which is stalling, not strategy.
export function wrongPolicy() {
  return {
    name: 'wrong',
    tapsPerTick: () => 5,
    shouldTiptoe: () => false,
    shouldReadNote: () => false,
    shouldBuyUpgrade: () => true,
    shouldBuyLoom: () => false,
    unitOrder: () => BUY_PRIORITY,
    shouldBuyUnit: () => true,
    pickContract: (board) => board.slice()
      .sort((a, b) => (a.reward.burstS || 0) - (b.reward.burstS || 0))[0].id,
    beatDelayTicks: () => 0,
  };
}
