import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WARNING, parseJsonl, parseWhisper, voiceIndexFromName, fmtClock, fmtNum,
  loadTranscripts, renderEntry, renderReport, parseArgs,
} from '../scripts/playtest-merge.mjs';

function marker(overrides = {}) {
  return {
    atMs: 1700000010000, sessionMs: 10000, tick: 50, gameS: 10, act: 1, town: 1,
    night: 1, nightPhase: 'evening', teeth: 100, lifetime: 100, taps: 5, wakes: 0,
    tiptoes: 0, belief: 10, stir: 0, stars: 0, beats: 0, ended: false,
    ...overrides,
  };
}

function makeBundleJsonl({ entries = [], trails = {} } = {}) {
  const lines = [];
  lines.push(JSON.stringify({
    type: 'header', v: 1, sessionId: '1700000000000-aaaa',
    startedAt: 1700000000000, endedAt: 1700000020000,
    game: { version: '0.9.1', seed: 1, act: 1, town: 1, tick: 100 },
    save: 'YmFzZTY0', ua: 'test-ua', viewport: { w: 1200, h: 800 },
  }));
  for (const e of entries) lines.push(JSON.stringify(e));
  for (const [entryId, samples] of Object.entries(trails)) {
    lines.push(JSON.stringify({ type: 'trail', entryId, samples }));
  }
  return lines.join('\n') + '\n'; // trailing newline, exactly like bundleToJsonl()
}

test('parseJsonl skips the trailing blank line from bundleToJsonl and sorts entries by seq', () => {
  const text = makeBundleJsonl({
    entries: [
      { type: 'entry', id: 'e2', seq: 2, kind: 'text', text: 'second', createdAt: 2, editedAt: null, edited: false, markerStart: marker(), markerEnd: marker() },
      { type: 'entry', id: 'e1', seq: 1, kind: 'text', text: 'first', createdAt: 1, editedAt: null, edited: false, markerStart: marker(), markerEnd: marker() },
    ],
  });
  assert.equal(text.endsWith('\n'), true);
  const { header, entries } = parseJsonl(text);
  assert.equal(header.sessionId, '1700000000000-aaaa');
  assert.deepEqual(entries.map((e) => e.id), ['e1', 'e2']);
});

test('parseJsonl throws when there is no header line', () => {
  assert.throws(() => parseJsonl('\n\n'), /missing header/);
});

test('parseJsonl collects trail samples keyed by entryId', () => {
  const text = makeBundleJsonl({
    entries: [{ type: 'entry', id: 'e1', seq: 1, kind: 'text', text: 'hi', createdAt: 1, editedAt: null, edited: false, markerStart: marker(), markerEnd: marker() }],
    trails: { e1: [marker({ gameS: 5 }), marker({ gameS: 7 })] },
  });
  const { trails } = parseJsonl(text);
  assert.equal(trails.get('e1').length, 2);
  assert.equal(trails.get('e1')[1].gameS, 7);
});

test('parseWhisper reads whisper.cpp -oj shape (.transcription, ms offsets)', () => {
  const segs = parseWhisper({
    transcription: [
      { offsets: { from: 0, to: 1200 }, text: ' hello ' },
      { offsets: { from: 1200, to: 2000 }, text: 'world' },
    ],
  });
  assert.deepEqual(segs, [
    { startMs: 0, endMs: 1200, text: 'hello' },
    { startMs: 1200, endMs: 2000, text: 'world' },
  ]);
});

test('parseWhisper reads mlx_whisper shape (.segments, second start/end) and drops empty text', () => {
  const segs = parseWhisper({
    segments: [
      { start: 0, end: 1.2, text: ' hi ' },
      { start: 1.2, end: 1.5, text: '' },
    ],
  });
  assert.deepEqual(segs, [{ startMs: 0, endMs: 1200, text: 'hi' }]);
});

test('parseWhisper throws on an unrecognized shape', () => {
  assert.throws(() => parseWhisper({ nope: true }), /unrecognized Whisper JSON shape/);
});

test('voiceIndexFromName recovers the LAST -v<digits>. match, not the first', () => {
  // A session id that itself contains a "-v"-looking substring.
  assert.equal(voiceIndexFromName('tf-session-1700000000000-v9zz-v2.json'), 2);
  assert.equal(voiceIndexFromName('tf-session-1700000000000-aaaa-v10.json'), 10);
  assert.equal(voiceIndexFromName('tf-session-1700000000000-aaaa.json'), null);
});

test('fmtClock renders HH:MM:SS', () => {
  const d = new Date(2026, 7, 16, 21, 14, 7);
  assert.equal(fmtClock(d.getTime()), '21:14:07');
});

test('fmtNum abbreviates thousands with one decimal, passes small numbers through', () => {
  assert.equal(fmtNum(1200), '1.2K');
  assert.equal(fmtNum(999), '999');
  assert.equal(fmtNum(0), '0');
});

test('loadTranscripts keys segments by the voice index recovered from the filename', () => {
  const files = ['out/tf-session-1700000000000-aaaa-v1.json', 'out/tf-session-1700000000000-aaaa-v2.json'];
  const fakeFiles = {
    'out/tf-session-1700000000000-aaaa-v1.json': JSON.stringify({ segments: [{ start: 0, end: 1, text: 'one' }] }),
    'out/tf-session-1700000000000-aaaa-v2.json': JSON.stringify({ segments: [{ start: 0, end: 1, text: 'two' }] }),
  };
  const byIndex = loadTranscripts(files, { readFile: (f) => fakeFiles[f] });
  assert.equal(byIndex.get(1)[0].text, 'one');
  assert.equal(byIndex.get(2)[0].text, 'two');
});

test('renderEntry renders a text entry with its window and quote', () => {
  const entry = {
    id: 'e1', seq: 3, kind: 'text', text: 'the dawn meter jumped', createdAt: 1700000000000,
    markerStart: marker({ gameS: 600, teeth: 1200 }),
    markerEnd: marker({ atMs: 1700000018400, gameS: 630, act: 2, night: 7, teeth: 1400 }),
  };
  const md = renderEntry(entry, null, undefined);
  assert.match(md, /^### #3 · text · \d{2}:\d{2}:\d{2}/);
  assert.match(md, /window: t=600s … t=630s · act 2 · night 7 · teeth 1\.2K → 1\.4K/);
  assert.match(md, /> the dawn meter jumped/);
});

test('renderEntry renders a voice entry with its duration and transcript text', () => {
  const entry = {
    id: 'e2', seq: 4, kind: 'voice', durationMs: 18400, createdAt: 1700000000000,
    markerStart: marker({ gameS: 612 }),
    markerEnd: marker({ atMs: 1700000018400, gameS: 630, act: 2, night: 7 }),
  };
  const segments = [{ startMs: 0, endMs: 18000, text: 'And the dawn meter jumped again.' }];
  const md = renderEntry(entry, null, segments);
  assert.match(md, /· voice ·/);
  assert.match(md, /18\.4 s/);
  assert.match(md, /> And the dawn meter jumped again\./);
});

test('renderEntry with no transcript still renders, with a placeholder quote', () => {
  const entry = {
    id: 'e3', seq: 5, kind: 'voice', durationMs: 4000, createdAt: 1700000000000,
    markerStart: marker(), markerEnd: marker(),
  };
  const md = renderEntry(entry, null, undefined);
  assert.match(md, /\*\(no transcript available\)\*/);
});

test('renderEntry\'s trail table rows match the samples passed in', () => {
  const entry = {
    id: 'e4', seq: 6, kind: 'text', text: 'hi', createdAt: 1700000000000,
    markerStart: marker(), markerEnd: marker(),
  };
  const samples = [
    marker({ gameS: 500, act: 1, night: 5, teeth: 900, belief: 20, stir: 1 }),
    marker({ gameS: 502, act: 1, night: 5, teeth: 950, belief: 21, stir: 2 }),
  ];
  const md = renderEntry(entry, samples, undefined);
  assert.match(md, /<details><summary>trail \(180 s before submit\)<\/summary>/);
  assert.match(md, /\| 500s \| 1 \| 5 \| 900 \| 20 \| 1 \|/);
  assert.match(md, /\| 502s \| 1 \| 5 \| 950 \| 21 \| 2 \|/);
});

test('renderEntry omits the trail block when there are no samples', () => {
  const entry = {
    id: 'e5', seq: 7, kind: 'text', text: 'hi', createdAt: 1700000000000,
    markerStart: marker(), markerEnd: marker(),
  };
  const md = renderEntry(entry, [], undefined);
  assert.doesNotMatch(md, /<details>/);
});

test('renderReport carries the delay warning in its header', () => {
  const header = { sessionId: '1700000000000-aaaa', startedAt: 1700000000000, endedAt: 1700000020000 };
  const md = renderReport(header, [], new Map(), new Map());
  assert.match(md, /markerEnd/);
  assert.ok(md.includes(WARNING));
});

test('renderReport matches voice entries to transcripts in seq order via a running voice counter', () => {
  const header = { sessionId: '1700000000000-aaaa', startedAt: 1700000000000, endedAt: 1700000020000 };
  const entries = [
    { id: 'e1', seq: 1, kind: 'text', text: 'note', createdAt: 1, markerStart: marker(), markerEnd: marker() },
    { id: 'e2', seq: 2, kind: 'voice', durationMs: 1000, createdAt: 2, markerStart: marker(), markerEnd: marker() },
    { id: 'e3', seq: 3, kind: 'voice', durationMs: 1000, createdAt: 3, markerStart: marker(), markerEnd: marker() },
  ];
  const transcriptsByIndex = new Map([
    [1, [{ startMs: 0, endMs: 100, text: 'first voice note' }]],
    [2, [{ startMs: 0, endMs: 100, text: 'second voice note' }]],
  ]);
  const md = renderReport(header, entries, new Map(), transcriptsByIndex);
  assert.match(md, /first voice note/);
  assert.match(md, /second voice note/);
});

test('parseArgs finds the .jsonl file among positional args and separates --out', () => {
  const out = parseArgs(['events.jsonl', 't1.json', 't2.json', '--out', 'report.md']);
  assert.equal(out.eventsPath, 'events.jsonl');
  assert.deepEqual(out.transcriptPaths, ['t1.json', 't2.json']);
  assert.equal(out.out, 'report.md');
});

test('parseArgs throws when no .jsonl file is given', () => {
  assert.throws(() => parseArgs(['t1.json']), /usage/);
});
