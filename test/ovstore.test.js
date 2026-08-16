// test/ovstore.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadOv, saveOv, setPath, getPath, deletePath, applyKnob,
} from '../js/dev/ovstore.js';

test('setPath/getPath/deletePath round-trip and prune empty parents', () => {
  const o = {};
  setPath(o, ['a', 'b', 'c'], 5);
  assert.equal(getPath(o, ['a', 'b', 'c']), 5);
  deletePath(o, ['a', 'b', 'c']);
  assert.deepEqual(o, {});
});

test('loadOv/saveOv work without localStorage (memory fallback)', () => {
  saveOv('vfx', { sound: { tap: 0.5 } });
  assert.deepEqual(loadOv('vfx'), { sound: { tap: 0.5 } });
  saveOv('vfx', {});               // empty object clears the key
  assert.deepEqual(loadOv('vfx'), {});
});

test('applyKnob writes live + override, clears override at default', () => {
  const defaults = { sound: { tap: 0.3 } };
  const live = { sound: { tap: 0.3 } };
  saveOv('vfx', {});
  let r = applyKnob({ defaults, live, ovKey: 'vfx', path: ['sound', 'tap'], value: 0.5 });
  assert.equal(r.ok, true);
  assert.equal(live.sound.tap, 0.5);
  assert.deepEqual(loadOv('vfx'), { sound: { tap: 0.5 } });
  r = applyKnob({ defaults, live, ovKey: 'vfx', path: ['sound', 'tap'], value: 0.3 });
  assert.equal(r.ok, true);
  assert.deepEqual(loadOv('vfx'), {});
});

test('applyKnob rejects, never clamps', () => {
  const defaults = { TICK_MS: 200 };
  const live = { TICK_MS: 200 };
  const r = applyKnob({ defaults, live, ovKey: 'constants', path: ['TICK_MS'], value: 0 });
  assert.equal(r.ok, false);
  assert.equal(live.TICK_MS, 200);          // untouched
  const r2 = applyKnob({ defaults, live, ovKey: 'constants', path: ['TICK_MS'], value: NaN });
  assert.equal(r2.ok, false);
});

test('applyKnob honors a declared min range', () => {
  const defaults = { alpha: 0.5 };
  const live = { alpha: 0.5 };
  saveOv('vfx', {});
  let r = applyKnob({ defaults, live, ovKey: 'vfx', path: ['alpha'], value: 0, min: 0 });
  assert.equal(r.ok, true);
  assert.equal(live.alpha, 0);
  assert.deepEqual(loadOv('vfx'), { alpha: 0 });
  r = applyKnob({ defaults, live, ovKey: 'vfx', path: ['alpha'], value: -0.1, min: 0 });
  assert.equal(r.ok, false);
  const live2 = { alpha: 0.5 };
  r = applyKnob({ defaults, live: live2, ovKey: 'vfx', path: ['alpha'], value: 0 });
  assert.equal(r.ok, false);
  assert.equal(live2.alpha, 0.5);
});

test('applyKnob stores whole arrays wholesale', () => {
  const defaults = { ramp: { steps: [1, 2, 3] } };
  const live = { ramp: { steps: [1, 2, 3] } };
  saveOv('vfx', {});
  applyKnob({ defaults, live, ovKey: 'vfx', path: ['ramp', 'steps', 1], value: 9 });
  assert.deepEqual(loadOv('vfx'), { ramp: { steps: [1, 9, 3] } });
  applyKnob({ defaults, live, ovKey: 'vfx', path: ['ramp', 'steps', 1], value: 2 });
  assert.deepEqual(loadOv('vfx'), {});
});
