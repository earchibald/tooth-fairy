import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKSHOP_KNOBS, HOARD_SHARED_KNOBS } from '../js/dev/knob-ranges.js';
import { VFX_DEFAULTS } from '../js/config/vfx.js';

function leaf(obj, path) {
  let n = obj;
  for (const k of path) { n = n?.[k]; }
  return n;
}

test('every workshop knob path resolves to a numeric VFX default', () => {
  for (const group of WORKSHOP_KNOBS) {
    for (const row of group.rows) {
      assert.equal(typeof leaf(VFX_DEFAULTS, row.path), 'number',
        row.path.join('.'));
      assert.ok(row.min < row.max);
    }
  }
});

test('hoard shared knobs resolve too', () => {
  for (const row of HOARD_SHARED_KNOBS) {
    assert.equal(typeof leaf(VFX_DEFAULTS, row.path), 'number', row.path.join('.'));
  }
});
