// End-to-end contract test: the bundle↔broker filename contract is defined
// independently in three places (bundle.js's hardcoded 'tf-session-' prefix,
// schema.json's "prefix", and (until now) broker-validate.test.js's inline
// SCHEMA_DOC fixture). Nothing linked them, so a prefix or session-id-shape
// change in only one place would leave every existing test green while real
// uploads started failing with 400 bad filename.
//
// This test loads the real schema.json off disk and calls the real
// bundleFilenames() — no copied literals — so it fails loudly the moment
// any of the three sides drifts from the others.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { compileSchema } from '../submission-broker/modules/broker/lambda/schema.mjs';
import { validateGrant } from '../submission-broker/modules/broker/lambda/validate.mjs';
import { newSessionId } from '../js/playtest/entries.js';
import { bundleFilenames } from '../js/playtest/bundle.js';
import { makeTextEntry, makeVoiceEntry } from '../js/playtest/entries.js';

const SCHEMA_PATH = fileURLToPath(
  new URL('../submission-broker/consumers/tooth-fairy/schema.json', import.meta.url),
);
const schemaDoc = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const schema = compileSchema(schemaDoc);

const DATE = new Date('2026-08-06T20:00:00Z');
const CFG = { expectedToken: 'sekrit', schema, date: DATE };

function contentTypeFor(filename) {
  if (filename.endsWith('.jsonl')) return 'text/plain';
  if (filename.endsWith('.m4a')) return 'audio/mp4';
  if (filename.endsWith('.webm')) return 'audio/webm';
  throw new Error(`no content type mapping for ${filename}`);
}

test('bundleFilenames output validates end-to-end against the real broker schema.json', () => {
  const sessionId = newSessionId(1786061130678, () => 0.5);

  const t0 = makeTextEntry({
    id: 't0', text: 'first note', createdAt: 1000, seq: 0,
    markerStart: { atMs: 1000 }, markerEnd: { atMs: 1000 }, trail: [],
  });
  const v1 = makeVoiceEntry({
    id: 'v1', blob: 'blob-1', mime: 'audio/webm;codecs=opus', ext: 'webm', durationMs: 2500,
    createdAt: 2000, seq: 1, markerStart: { atMs: 2000 }, markerEnd: { atMs: 4500 }, trail: [],
  });
  const v2 = makeVoiceEntry({
    id: 'v2', blob: 'blob-2', mime: 'audio/mp4', ext: 'm4a', durationMs: 900,
    createdAt: 3000, seq: 2, markerStart: { atMs: 3000 }, markerEnd: { atMs: 3900 }, trail: [],
  });

  const bundle = {
    sessionId,
    startedAt: 500,
    endedAt: 5000,
    game: { version: '0.9.1', seed: 42, act: 1, town: 2, tick: 900 },
    save: Buffer.from('{"v":4,"state":{}}').toString('base64'),
    ua: 'test-agent/1.0',
    viewport: { w: 390, h: 844 },
    entries: [t0, v1, v2],
  };

  const names = bundleFilenames(bundle);
  assert.equal(names.audio.length, 2, 'fixture must produce at least two audio filenames');
  assert.ok(names.audio.some((n) => n.endsWith('.m4a')), 'fixture must mix in an .m4a filename');
  assert.ok(names.audio.some((n) => n.endsWith('.webm')), 'fixture must mix in a .webm filename');

  const allFilenames = [names.events, ...names.audio];

  for (const filename of allFilenames) {
    const req = {
      token: 'sekrit',
      sessionId,
      filename,
      size: 1024,
      contentType: contentTypeFor(filename),
    };
    const v = validateGrant(req, CFG);
    assert.equal(v.ok, true, `expected ok:true for ${filename}, got ${JSON.stringify(v)}`);
  }

  const day = DATE.toISOString().slice(0, 10);
  const jsonlReq = {
    token: 'sekrit',
    sessionId,
    filename: names.events,
    size: 1024,
    contentType: contentTypeFor(names.events),
  };
  const jsonlGrant = validateGrant(jsonlReq, CFG);
  assert.equal(jsonlGrant.key, `submissions/${day}/${sessionId}/${names.events}`);
});
