// Pure formatting/assembly logic factored out of js/playtest/panel.js.
// The panel's DOM shell itself has no unit coverage — this repo has no
// jsdom — so every decision worth pinning down lives in panel-core.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClockMs, formatWallClock, formatMarkerLine, entryIcon,
  formatEntryHeader, formatProgress, shouldStartTextMarker,
  buildGameInfo, buildBundle,
} from '../js/playtest/panel-core.js';

test('formatClockMs: mm:ss, zero-padded seconds', () => {
  assert.equal(formatClockMs(0), '0:00');
  assert.equal(formatClockMs(5000), '0:05');
  assert.equal(formatClockMs(65000), '1:05');
  assert.equal(formatClockMs(600000), '10:00');
});

test('formatClockMs: negative/fractional input never crashes or goes negative', () => {
  assert.equal(formatClockMs(-500), '0:00');
  assert.equal(formatClockMs(1999), '0:01');
});

test('formatWallClock: HH:MM:SS shape', () => {
  const s = formatWallClock(Date.now());
  assert.match(s, /^\d{2}:\d{2}:\d{2}$/);
});

test('formatMarkerLine: t=<gameS>s act <act> night <night>', () => {
  const marker = { gameS: 123.6, act: 2, night: 5 };
  assert.equal(formatMarkerLine(marker), 't=124s act 2 night 5');
});

test('formatMarkerLine: null marker is empty string, not a throw', () => {
  assert.equal(formatMarkerLine(null), '');
  assert.equal(formatMarkerLine(undefined), '');
});

test('entryIcon: voice vs text', () => {
  assert.equal(entryIcon('voice'), '\u{1F3A4}');
  assert.equal(entryIcon('text'), '\u{1F4DD}');
});

test('formatEntryHeader: seq, icon, wall clock, marker line', () => {
  const entry = {
    seq: 3, kind: 'voice', createdAt: Date.UTC(2026, 0, 1, 12, 0, 0),
    markerStart: { gameS: 612, act: 2, night: 7 },
  };
  const header = formatEntryHeader(entry);
  assert.match(header, /^#3 \u{1F3A4} \d{2}:\d{2}:\d{2} t=612s act 2 night 7$/u);
});

test('formatProgress: done/total name', () => {
  assert.equal(formatProgress({ done: 2, total: 5, name: 'tf-session-x-v1.m4a' }),
    '2/5 tf-session-x-v1.m4a');
});

test('formatProgress: falsy progress is empty string', () => {
  assert.equal(formatProgress(null), '');
  assert.equal(formatProgress(undefined), '');
});

test('shouldStartTextMarker: fires only on the empty-to-nonempty transition', () => {
  assert.equal(shouldStartTextMarker('', 'h'), true);
  assert.equal(shouldStartTextMarker('h', 'he'), false);
  assert.equal(shouldStartTextMarker('', ''), false);
  assert.equal(shouldStartTextMarker('he', ''), false);
});

test('buildGameInfo: pulls version/seed/act/town/tick', () => {
  const state = { seed: 42, act: 2, town: 1, tick: 900, extra: 'ignored' };
  assert.deepEqual(buildGameInfo(state, '0.9.1'),
    { version: '0.9.1', seed: 42, act: 2, town: 1, tick: 900 });
});

test('buildBundle: shape matches the plan\'s section-4 contract', () => {
  const bundle = buildBundle({
    sessionId: '123-abcd', startedAt: 1, endedAt: 2,
    game: { version: '0.9.1', seed: 1, act: 0, town: 0, tick: 0 },
    save: 'c2F2ZQ==', ua: 'ua', viewport: { w: 1000, h: 800 },
    entries: [{ id: 'e1' }],
  });
  assert.deepEqual(Object.keys(bundle),
    ['sessionId', 'startedAt', 'endedAt', 'game', 'save', 'ua', 'viewport', 'entries']);
  assert.equal(bundle.entries.length, 1);
});

test('buildBundle: missing entries defaults to an empty array, not undefined', () => {
  const bundle = buildBundle({ sessionId: 's', startedAt: 1, endedAt: 2, game: {}, save: '', ua: '', viewport: {} });
  assert.deepEqual(bundle.entries, []);
});
