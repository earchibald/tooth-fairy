import { test } from 'node:test';
import assert from 'node:assert';
import { mosaicPoints, insideTooth } from '../js/ui/mosaic.js';

test('exact counts for the shipped set sizes', () => {
  assert.equal(mosaicPoints(32).length, 32);
  assert.equal(mosaicPoints(64).length, 64);
});

test('every point lies inside the tooth silhouette', () => {
  for (const n of [32, 64]) {
    for (const p of mosaicPoints(n)) {
      assert.ok(insideTooth(p.x, p.y), `outside: ${p.x},${p.y} (n=${n})`);
    }
  }
});

test('points are sorted bottom-up, ties left-to-right', () => {
  for (const n of [32, 64]) {
    const pts = mosaicPoints(n);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      assert.ok(b.y <= a.y, `row ${i} rises (n=${n})`);
      if (b.y === a.y) assert.ok(b.x >= a.x, `tie ${i} not left-to-right (n=${n})`);
    }
  }
});

test('deterministic and identity-cached', () => {
  assert.strictEqual(mosaicPoints(32), mosaicPoints(32));
  assert.deepEqual(mosaicPoints(64), mosaicPoints(64));
});

test('extreme sizes return exactly n without throwing', () => {
  assert.equal(mosaicPoints(1).length, 1);
  assert.equal(mosaicPoints(200).length, 200);
});
