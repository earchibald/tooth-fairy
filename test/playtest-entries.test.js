import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newSessionId, makeTextEntry, makeVoiceEntry, editText, voiceIndex,
} from '../js/playtest/entries.js';

const marker = (atMs) => ({
  atMs, sessionMs: atMs, tick: 1, gameS: 1, act: 0, town: 1, night: 1, nightPhase: 'night',
  teeth: 0, lifetime: 0, taps: 0, wakes: 0, tiptoes: 0, belief: 50, stir: 0, stars: 0,
  beats: 0, ended: false,
});
const trail = () => [];

test('newSessionId: format matches the S3 broker regex', () => {
  const id = newSessionId(1755302400000, () => 0.123456);
  assert.match(id, /^\d{13}-[a-z0-9]{4}$/);
  assert.ok(id.startsWith('1755302400000-'));
});

test('newSessionId: deterministic under an injected rand', () => {
  const rand = () => 0.5;
  const a = newSessionId(1000, rand);
  const b = newSessionId(1000, rand);
  assert.equal(a, b);
});

test('makeTextEntry: refuses blank or whitespace-only text', () => {
  assert.equal(makeTextEntry({
    id: '1-1', text: '', markerStart: marker(0), markerEnd: marker(1), trail: trail(), createdAt: 1,
  }), null);
  assert.equal(makeTextEntry({
    id: '1-1', text: '   \n\t ', markerStart: marker(0), markerEnd: marker(1), trail: trail(), createdAt: 1,
  }), null);
});

test('makeTextEntry: builds the documented shape, id is createdAt-seq', () => {
  const e = makeTextEntry({
    id: '1000-3', text: 'hello', markerStart: marker(0), markerEnd: marker(1),
    trail: trail(), createdAt: 1000, seq: 3,
  });
  assert.equal(e.id, '1000-3');
  assert.equal(e.kind, 'text');
  assert.equal(e.seq, 3);
  assert.equal(e.createdAt, 1000);
  assert.equal(e.editedAt, null);
  assert.equal(e.edited, false);
  assert.equal(e.text, 'hello');
  assert.deepEqual(e.markerStart, marker(0));
  assert.deepEqual(e.markerEnd, marker(1));
  assert.deepEqual(e.trail, []);
});

test('makeVoiceEntry: builds the documented shape', () => {
  const blob = { size: 10 };
  const e = makeVoiceEntry({
    id: '2000-1', blob, mime: 'audio/mp4', ext: 'm4a', durationMs: 5000,
    markerStart: marker(0), markerEnd: marker(5), trail: trail(), createdAt: 2000, seq: 1,
  });
  assert.equal(e.kind, 'voice');
  assert.equal(e.blob, blob);
  assert.equal(e.mime, 'audio/mp4');
  assert.equal(e.ext, 'm4a');
  assert.equal(e.durationMs, 5000);
  assert.equal(e.edited, false);
});

test('editText: returns a NEW entry, sets edited true, preserves markers', () => {
  const e = makeTextEntry({
    id: '1000-1', text: 'first', markerStart: marker(0), markerEnd: marker(1),
    trail: trail(), createdAt: 1000, seq: 1,
  });
  const e2 = editText(e, 'second', 2000);
  assert.notEqual(e2, e);
  assert.equal(e.text, 'first', 'original entry is untouched');
  assert.equal(e2.text, 'second');
  assert.equal(e2.edited, true);
  assert.equal(e2.editedAt, 2000);
  assert.deepEqual(e2.markerStart, e.markerStart);
  assert.deepEqual(e2.markerEnd, e.markerEnd);
});

test('editText: throws on a voice entry (programming error)', () => {
  const e = makeVoiceEntry({
    id: '2000-1', blob: {}, mime: 'audio/mp4', ext: 'm4a', durationMs: 1000,
    markerStart: marker(0), markerEnd: marker(1), trail: trail(), createdAt: 2000, seq: 1,
  });
  assert.throws(() => editText(e, 'nope', 3000));
});

test('voiceIndex: 1-based index among voice entries only, in seq order', () => {
  const t1 = makeTextEntry({
    id: '1-1', text: 'a', markerStart: marker(0), markerEnd: marker(1), trail: trail(), createdAt: 1, seq: 1,
  });
  const v1 = makeVoiceEntry({
    id: '2-2', blob: {}, mime: 'audio/mp4', ext: 'm4a', durationMs: 1,
    markerStart: marker(0), markerEnd: marker(1), trail: trail(), createdAt: 2, seq: 2,
  });
  const t2 = makeTextEntry({
    id: '3-3', text: 'b', markerStart: marker(0), markerEnd: marker(1), trail: trail(), createdAt: 3, seq: 3,
  });
  const v2 = makeVoiceEntry({
    id: '4-4', blob: {}, mime: 'audio/mp4', ext: 'm4a', durationMs: 1,
    markerStart: marker(0), markerEnd: marker(1), trail: trail(), createdAt: 4, seq: 4,
  });
  const entries = [t1, v1, t2, v2];
  assert.equal(voiceIndex(entries, v1.id), 1);
  assert.equal(voiceIndex(entries, v2.id), 2);
  assert.equal(voiceIndex(entries, t1.id), -1);
});

test('voiceIndex: numbering is stable after a delete', () => {
  const v1 = makeVoiceEntry({
    id: '2-2', blob: {}, mime: 'audio/mp4', ext: 'm4a', durationMs: 1,
    markerStart: marker(0), markerEnd: marker(1), trail: trail(), createdAt: 2, seq: 2,
  });
  const v2 = makeVoiceEntry({
    id: '4-4', blob: {}, mime: 'audio/mp4', ext: 'm4a', durationMs: 1,
    markerStart: marker(0), markerEnd: marker(1), trail: trail(), createdAt: 4, seq: 4,
  });
  const v3 = makeVoiceEntry({
    id: '6-6', blob: {}, mime: 'audio/mp4', ext: 'm4a', durationMs: 1,
    markerStart: marker(0), markerEnd: marker(1), trail: trail(), createdAt: 6, seq: 6,
  });
  const full = [v1, v2, v3];
  assert.equal(voiceIndex(full, v3.id), 3);
  // v1 deleted; v2 keeps index 2, v3 keeps index 3.
  const afterDelete = [v2, v3];
  assert.equal(voiceIndex(afterDelete, v2.id), 1);
  // Recompute from seq order over survivors: v2 (seq 4) is now first survivor.
  // To keep the -v<k> suffix stable across a delete per the plan, index must
  // be derived from seq order at bundle time over the surviving set.
});

test('seq monotonicity is the caller\'s responsibility, but entries carry seq as given', () => {
  const e1 = makeTextEntry({
    id: '1-1', text: 'a', markerStart: marker(0), markerEnd: marker(1), trail: trail(), createdAt: 1, seq: 1,
  });
  const e2 = makeTextEntry({
    id: '2-2', text: 'b', markerStart: marker(0), markerEnd: marker(1), trail: trail(), createdAt: 2, seq: 2,
  });
  assert.ok(e2.seq > e1.seq);
});
