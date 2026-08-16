import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../js/engine/state.js';
import { captureMarker, createTrail } from '../js/playtest/marker.js';

const clock = (nowMs, sessionStartMs = 0, tickMs = 200) => ({ nowMs, sessionStartMs, tickMs });

test('captureMarker: reads the documented fields from state', () => {
  const state = createState(1);
  state.tick = 500;
  state.act = 1;
  state.town = 2;
  state.night = 3;
  state.nightPhase = 'dusk';
  state.teeth = 12.5;
  state.lifetime = 999;
  state.taps = 4;
  state.wakes = 1;
  state.tiptoes = 2;
  state.belief = 60;
  state.stir = 5;
  state.stars = 7;
  state.beatsSeen = ['a', 'b', 'c'];
  state.ended = false;

  const m = captureMarker(state, clock(100000, 40000, 200));

  assert.equal(m.atMs, 100000);
  assert.equal(m.sessionMs, 60000);
  assert.equal(m.tick, 500);
  // Measured: gameS = tick * tickMs / 1000 = 500 * 200 / 1000 = 100.
  assert.equal(m.gameS, 100);
  assert.equal(m.act, 1);
  assert.equal(m.town, 2);
  assert.equal(m.night, 3);
  assert.equal(m.nightPhase, 'dusk');
  assert.equal(m.teeth, 12.5);
  assert.equal(m.lifetime, 999);
  assert.equal(m.taps, 4);
  assert.equal(m.wakes, 1);
  assert.equal(m.tiptoes, 2);
  assert.equal(m.belief, 60);
  assert.equal(m.stir, 5);
  assert.equal(m.stars, 7);
  assert.equal(m.beats, 3);
  assert.equal(m.ended, false);
});

test('captureMarker: is flat and JSON-safe (round-trips through JSON)', () => {
  const state = createState(1);
  const m = captureMarker(state, clock(1000));
  const round = JSON.parse(JSON.stringify(m));
  assert.deepEqual(round, m);
  for (const v of Object.values(m)) {
    assert.ok(['number', 'string', 'boolean'].includes(typeof v), `${typeof v} is flat`);
  }
});

test('captureMarker: never touches rngState', () => {
  const state = createState(1);
  const before = state.rngState;
  captureMarker(state, clock(1000));
  assert.equal(state.rngState, before);
});

test('createTrail: sample() honours everyMs', () => {
  const trail = createTrail({ everyMs: 2000, spanMs: 180000 });
  const state = createState(1);
  trail.sample(state, clock(0));
  trail.sample(state, clock(1000)); // too soon, skipped
  trail.sample(state, clock(2000)); // exactly everyMs later, sampled
  trail.sample(state, clock(2500)); // too soon, skipped
  assert.equal(trail.all().length, 2);
  assert.equal(trail.all()[0].atMs, 0);
  assert.equal(trail.all()[1].atMs, 2000);
});

test('createTrail: evicts samples past spanMs', () => {
  const trail = createTrail({ everyMs: 1000, spanMs: 5000 });
  const state = createState(1);
  for (let t = 0; t <= 10000; t += 1000) {
    trail.sample(state, clock(t));
  }
  const all = trail.all();
  // Newest sample is at 10000; span is 5000, so oldest surviving is 5000.
  assert.equal(all[0].atMs, 5000);
  assert.equal(all[all.length - 1].atMs, 10000);
  assert.ok(all.every((m) => m.atMs >= 10000 - 5000));
});

test('createTrail: window(atMs) is inclusive at both bounds, oldest first', () => {
  const trail = createTrail({ everyMs: 1000, spanMs: 100000 });
  const state = createState(1);
  for (let t = 0; t <= 10000; t += 1000) {
    trail.sample(state, clock(t));
  }
  const win = trail.window(5000);
  // window is [atMs - spanMs, atMs]; spanMs=100000 so everything <= 5000 included.
  assert.deepEqual(win.map((m) => m.atMs), [0, 1000, 2000, 3000, 4000, 5000]);

  // Query a narrower window than the trail's own span, to check the
  // window() bound math independent of ring-buffer eviction.
  const win2 = trail.window(3000);
  assert.deepEqual(win2.map((m) => m.atMs), [0, 1000, 2000, 3000]);
});
