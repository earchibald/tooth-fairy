import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toSubmission, submitSession } from '../js/playtest/submit.js';
import { makeTextEntry, makeVoiceEntry } from '../js/playtest/entries.js';

function fixtureBundle() {
  const t0 = makeTextEntry({ id: 't0', text: 'note one', createdAt: 1000, seq: 0, markerStart: null, markerEnd: null, trail: [] });
  const v1 = makeVoiceEntry({
    id: 'v1', blob: new Blob(['audio-bytes']), mime: 'audio/webm;codecs=opus', ext: 'webm',
    durationMs: 1500, createdAt: 2000, seq: 1, markerStart: null, markerEnd: null, trail: [],
  });
  const v2 = makeVoiceEntry({
    id: 'v2', blob: new Blob(['more-audio']), mime: 'audio/mp4', ext: 'm4a',
    durationMs: 800, createdAt: 3000, seq: 2, markerStart: null, markerEnd: null, trail: [],
  });
  return {
    sessionId: '1755302400000-ab12',
    startedAt: 500,
    endedAt: 4000,
    game: { version: '0.9.1', seed: 1, act: 0, town: 1, tick: 10 },
    save: 'e30=',
    ua: 'test',
    viewport: { w: 100, h: 100 },
    entries: [t0, v1, v2],
  };
}

test('toSubmission: file count and order — jsonl first, then voice files in seq order', () => {
  const bundle = fixtureBundle();
  const submission = toSubmission(bundle);
  assert.equal(submission.sessionId, bundle.sessionId);
  assert.equal(submission.files.length, 3);
  assert.equal(submission.files[0].name, 'tf-session-1755302400000-ab12.jsonl');
  assert.equal(submission.files[1].name, 'tf-session-1755302400000-ab12-v1.webm');
  assert.equal(submission.files[2].name, 'tf-session-1755302400000-ab12-v2.m4a');
});

test('toSubmission: the jsonl file has content type text/plain', () => {
  const bundle = fixtureBundle();
  const submission = toSubmission(bundle);
  assert.equal(submission.files[0].contentType, 'text/plain');
});

test('toSubmission: audio content types follow the recorded mime', () => {
  const bundle = fixtureBundle();
  const submission = toSubmission(bundle);
  assert.equal(submission.files[1].contentType, 'audio/webm;codecs=opus');
  assert.equal(submission.files[2].contentType, 'audio/mp4');
});

test('toSubmission: with no voice entries, only the jsonl file is produced', () => {
  const bundle = fixtureBundle();
  bundle.entries = bundle.entries.filter((e) => e.kind === 'text');
  const submission = toSubmission(bundle);
  assert.equal(submission.files.length, 1);
});

test('submitSession: routes through pickSink and streams progress', async () => {
  const bundle = fixtureBundle();
  const events = [];
  const downloaded = [];
  const result = await submitSession(bundle, {
    env: { enabled: false, brokerUrl: '' },
    zip: async (files, name) => ({ name, files }),
    download: async (file) => downloaded.push(file),
    onProgress: (p) => events.push(p),
  });
  assert.equal(result, 'saved');
  assert.equal(downloaded.length, 1);
  assert.ok(events.length > 0);
});

test('submitSession: with a configured broker, uses fetch instead of download', async () => {
  const bundle = fixtureBundle();
  bundle.entries = bundle.entries.filter((e) => e.kind === 'text'); // single file, no S3 mocking needed for grant
  const grantCalls = [];
  const fetchStub = async (url, opts) => {
    grantCalls.push(url);
    if (opts && opts.body) {
      return { ok: true, status: 200, async json() { return { url: 'https://s3.example/upload', fields: {} }; } };
    }
    return { ok: true, status: 200, async json() { return {}; } };
  };
  const result = await submitSession(bundle, {
    env: { enabled: true, brokerUrl: 'https://broker.example/grant', token: 'tok' },
    fetch: fetchStub,
    download: async () => { throw new Error('should not download when broker is active'); },
  });
  assert.equal(result, 'submitted');
  assert.ok(grantCalls.includes('https://broker.example/grant'));
});
