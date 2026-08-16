import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32, steadyPolicy, chaosPolicy, wrongPolicy, BUY_PRIORITY }
  from '../js/dev/policies.js';

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = Array.from({ length: 100 }, () => a());
  const seqB = Array.from({ length: 100 }, () => b());
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
  const c = mulberry32(43);
  assert.notDeepEqual(seqA, Array.from({ length: 100 }, () => c()));
});

test('steadyPolicy reproduces the fixed strategy decisions', () => {
  const p = steadyPolicy();
  assert.equal(p.name, 'steady');
  assert.equal(p.tapsPerTick({}), 1);
  assert.equal(p.shouldTiptoe({ stir: 75 }), false);
  assert.equal(p.shouldTiptoe({ stir: 76 }), true);
  assert.equal(p.shouldReadNote({}), true);
  assert.equal(p.shouldBuyUpgrade({}, 'sandman'), true);
  assert.equal(p.shouldBuyLoom({ revealed: {}, stir: 90 }), false);
  assert.equal(p.shouldBuyLoom({ revealed: { loom: true }, stir: 40 }), false);
  assert.equal(p.shouldBuyLoom({ revealed: { loom: true }, stir: 41 }), true);
  assert.deepEqual(p.unitOrder({}), BUY_PRIORITY);
  assert.equal(p.beatDelayTicks(), 0);
  // Payback rule: the top revealed tier is always bought; others need
  // cost/rate <= 450 and cost under the mortal life cap.
  assert.equal(p.shouldBuyUnit({}, 'owl', { cost: 10, rate: 1, lifeCap: Infinity, top: 'owl' }), true);
  assert.equal(p.shouldBuyUnit({}, 'mouse', { cost: 450, rate: 1, lifeCap: Infinity, top: 'owl' }), true);
  assert.equal(p.shouldBuyUnit({}, 'mouse', { cost: 451, rate: 1, lifeCap: Infinity, top: 'owl' }), false);
  assert.equal(p.shouldBuyUnit({}, 'mouse', { cost: 100, rate: 1, lifeCap: 100, top: 'owl' }), false);
  const board = [
    { id: 'a', reward: { burstS: 10 } },
    { id: 'b', reward: { burstS: 30 } },
    { id: 'c', reward: {} },
  ];
  assert.equal(p.pickContract(board), 'b');
});

test('chaosPolicy is reproducible per seed', () => {
  const record = (p) => {
    const out = [];
    for (let i = 0; i < 200; i++) {
      out.push(p.tapsPerTick({}), p.shouldTiptoe({ stir: 50 }),
        p.shouldReadNote({}), p.shouldBuyUpgrade({}, 'sandman'),
        p.shouldBuyLoom({ revealed: { loom: true }, stir: 50 }),
        p.unitOrder({}).join(','),
        p.shouldBuyUnit({}, 'mouse', { cost: 1, rate: 1, lifeCap: 2, top: 'owl' }),
        p.pickContract([{ id: 'a', reward: {} }, { id: 'b', reward: {} }]),
        p.beatDelayTicks());
    }
    return out;
  };
  assert.deepEqual(record(chaosPolicy(5)), record(chaosPolicy(5)));
  assert.notDeepEqual(record(chaosPolicy(5)), record(chaosPolicy(6)));
});

test('chaosPolicy decisions stay inside their designed ranges', () => {
  const p = chaosPolicy(9);
  for (let i = 0; i < 500; i++) {
    const taps = p.tapsPerTick({});
    assert.ok(Number.isInteger(taps) && taps >= 0 && taps <= 3);
    const delay = p.beatDelayTicks();
    assert.ok(Number.isInteger(delay) && delay >= 0 && delay <= 20);
    const order = p.unitOrder({});
    assert.deepEqual([...order].sort(), [...BUY_PRIORITY].sort());
  }
  // Tiptoe threshold never fires below 30 or refuses above 90.
  assert.equal(p.shouldTiptoe({ stir: 30 }), false);
  for (let i = 0; i < 50; i++) assert.equal(chaosPolicy(i).shouldTiptoe({ stir: 91 }), true);
});

test('wrongPolicy plays badly on purpose, deterministically', () => {
  const p = wrongPolicy();
  assert.equal(p.name, 'wrong');
  assert.equal(p.tapsPerTick({}), 5);
  assert.equal(p.shouldTiptoe({ stir: 99 }), false);
  assert.equal(p.shouldReadNote({}), false);
  assert.equal(p.shouldBuyUpgrade({}, 'sandman'), true);
  assert.equal(p.shouldBuyLoom({ revealed: { loom: true }, stir: 99 }), false);
  assert.deepEqual(p.unitOrder({}), BUY_PRIORITY);
  assert.equal(p.shouldBuyUnit({}, 'mouse', { cost: 1e9, rate: 0.1, lifeCap: 1, top: 'owl' }), true);
  const board = [
    { id: 'a', reward: { burstS: 10 } },
    { id: 'b', reward: { burstS: 30 } },
    { id: 'c', reward: {} },
  ];
  assert.equal(p.pickContract(board), 'c');
  assert.equal(p.beatDelayTicks(), 0);
});
