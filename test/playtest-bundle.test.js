import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bundleFilenames, bundleToJsonl, voiceEntriesInOrder } from '../js/playtest/bundle.js';
import { makeTextEntry, makeVoiceEntry } from '../js/playtest/entries.js';

const trail = (n = 0) => Array.from({ length: n }, (_, i) => ({ atMs: i * 1000 }));

function fixtureBundle() {
  const t0 = makeTextEntry({
    id: 't0', text: 'first note', createdAt: 1000, seq: 0,
    markerStart: { atMs: 1000 }, markerEnd: { atMs: 1000 }, trail: trail(1),
  });
  const v1 = makeVoiceEntry({
    id: 'v1', blob: 'blob-1', mime: 'audio/webm;codecs=opus', ext: 'webm', durationMs: 2500,
    createdAt: 2000, seq: 1, markerStart: { atMs: 2000 }, markerEnd: { atMs: 4500 }, trail: trail(2),
  });
  const t2 = makeTextEntry({
    id: 't2', text: 'second note', createdAt: 3000, seq: 2,
    markerStart: { atMs: 3000 }, markerEnd: { atMs: 3000 }, trail: [],
  });
  const v3 = makeVoiceEntry({
    id: 'v3', blob: 'blob-2', mime: 'audio/mp4', ext: 'm4a', durationMs: 900,
    createdAt: 4000, seq: 3, markerStart: { atMs: 4000 }, markerEnd: { atMs: 4900 }, trail: [],
  });

  return {
    sessionId: '1755302400000-ab12',
    startedAt: 500,
    endedAt: 5000,
    game: { version: '0.9.1', seed: 42, act: 1, town: 2, tick: 900 },
    save: Buffer.from('{"v":4,"state":{}}').toString('base64'),
    ua: 'test-agent/1.0',
    viewport: { w: 390, h: 844 },
    // deliberately out of seq order, to prove bundleToJsonl sorts.
    entries: [v3, t0, t2, v1],
  };
}

test('bundleFilenames: events name and voice numbering with a mix of text and voice entries', () => {
  const bundle = fixtureBundle();
  const names = bundleFilenames(bundle);
  assert.equal(names.events, 'tf-session-1755302400000-ab12.jsonl');
  // v1 (seq 1) is the 1st voice entry, v3 (seq 3) is the 2nd — text entries
  // (seq 0, 2) do not consume a voice index.
  assert.deepEqual(names.audio, [
    'tf-session-1755302400000-ab12-v1.webm',
    'tf-session-1755302400000-ab12-v2.m4a',
  ]);
});

test('voiceEntriesInOrder: sorts voice entries by seq, ignoring text entries', () => {
  const bundle = fixtureBundle();
  const order = voiceEntriesInOrder(bundle.entries).map((e) => e.id);
  assert.deepEqual(order, ['v1', 'v3']);
});

test('bundleToJsonl: line count is 1 header + N entries + N trails', () => {
  const bundle = fixtureBundle();
  const jsonl = bundleToJsonl(bundle);
  const lines = jsonl.trim().split('\n');
  // 1 header + 4 entries + 4 trails = 9
  assert.equal(lines.length, 9);
});

test('bundleToJsonl: parse round trip — every line is valid JSON with the right type tag', () => {
  const bundle = fixtureBundle();
  const lines = bundleToJsonl(bundle).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[0].type, 'header');
  const entryLines = lines.filter((l) => l.type === 'entry');
  const trailLines = lines.filter((l) => l.type === 'trail');
  assert.equal(entryLines.length, 4);
  assert.equal(trailLines.length, 4);
  // entries are emitted in seq order, not input order.
  assert.deepEqual(entryLines.map((l) => l.id), ['t0', 'v1', 't2', 'v3']);
});

test('bundleToJsonl: header carries the save, game info, and session bounds', () => {
  const bundle = fixtureBundle();
  const [header] = bundleToJsonl(bundle).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(header.type, 'header');
  assert.equal(header.v, 1);
  assert.equal(header.sessionId, bundle.sessionId);
  assert.equal(header.startedAt, 500);
  assert.equal(header.endedAt, 5000);
  assert.deepEqual(header.game, { version: '0.9.1', seed: 42, act: 1, town: 2, tick: 900 });
  assert.equal(header.save, bundle.save);
  assert.equal(Buffer.from(header.save, 'base64').toString(), '{"v":4,"state":{}}');
  assert.equal(header.ua, 'test-agent/1.0');
  assert.deepEqual(header.viewport, { w: 390, h: 844 });
});

test('bundleToJsonl: voice entry lines carry audioFile + durationMs, not a blob', () => {
  const bundle = fixtureBundle();
  const lines = bundleToJsonl(bundle).trim().split('\n').map((l) => JSON.parse(l));
  const v1 = lines.find((l) => l.type === 'entry' && l.id === 'v1');
  assert.equal(v1.audioFile, 'tf-session-1755302400000-ab12-v1.webm');
  assert.equal(v1.durationMs, 2500);
  assert.equal(v1.blob, undefined);
  assert.equal(v1.text, undefined);
});

test('bundleToJsonl: text entry lines carry text, not audioFile', () => {
  const bundle = fixtureBundle();
  const lines = bundleToJsonl(bundle).trim().split('\n').map((l) => JSON.parse(l));
  const t0 = lines.find((l) => l.type === 'entry' && l.id === 't0');
  assert.equal(t0.text, 'first note');
  assert.equal(t0.audioFile, undefined);
});

test('bundleToJsonl: trail lines carry the entry id and its samples verbatim', () => {
  const bundle = fixtureBundle();
  const lines = bundleToJsonl(bundle).trim().split('\n').map((l) => JSON.parse(l));
  const v1trail = lines.find((l) => l.type === 'trail' && l.entryId === 'v1');
  assert.equal(v1trail.samples.length, 2);
  const t2trail = lines.find((l) => l.type === 'trail' && l.entryId === 't2');
  assert.deepEqual(t2trail.samples, []);
});

test('bundleFilenames: no voice entries yields an empty audio list', () => {
  const bundle = fixtureBundle();
  bundle.entries = bundle.entries.filter((e) => e.kind === 'text');
  const names = bundleFilenames(bundle);
  assert.deepEqual(names.audio, []);
});
