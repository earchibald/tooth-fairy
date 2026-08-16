import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSchema } from '../submission-broker/modules/broker/lambda/schema.mjs';
import { validateGrant } from '../submission-broker/modules/broker/lambda/validate.mjs';

const ID = '1786061130678-nx1j';

const SCHEMA_DOC = {
  prefix: 'tf-session',
  sessionIdPattern: '^\\d{13}-[a-z0-9]{4}$',
  keyTemplate: 'submissions/{date}/{sessionId}/{filename}',
  files: [
    { suffix: '.jsonl', contentTypes: ['text/plain', 'application/x-ndjson'], maxBytes: 26214400 },
    { suffix: '-v{n}.m4a', contentTypes: ['audio/mp4'], maxBytes: 209715200 },
    { suffix: '-v{n}.webm', contentTypes: ['audio/webm'], maxBytes: 209715200 },
  ],
};

const schema = compileSchema(SCHEMA_DOC);

const CFG = { expectedToken: 'sekrit', schema, date: new Date('2026-08-06T20:00:00Z') };

function req(overrides = {}) {
  return {
    token: 'sekrit',
    sessionId: ID,
    filename: `tf-session-${ID}.jsonl`,
    size: 1024,
    contentType: 'text/plain',
    ...overrides,
  };
}

test('happy jsonl grant: server-built key, jsonl cap', () => {
  const v = validateGrant(req(), CFG);
  assert.deepEqual(v, {
    ok: true,
    key: `submissions/2026-08-06/${ID}/tf-session-${ID}.jsonl`,
    maxBytes: 26214400,
    contentType: 'text/plain',
  });
});

test('application/x-ndjson is accepted for jsonl', () => {
  const v = validateGrant(req({ contentType: 'application/x-ndjson' }), CFG);
  assert.equal(v.ok, true);
  assert.equal(v.contentType, 'application/x-ndjson');
});

test('happy audio grants: m4a and webm with audio cap', () => {
  const m4a = validateGrant(req({
    filename: `tf-session-${ID}-v2.m4a`, contentType: 'audio/mp4', size: 5000,
  }), CFG);
  assert.equal(m4a.ok, true);
  assert.equal(m4a.maxBytes, 209715200);
  assert.equal(m4a.key, `submissions/2026-08-06/${ID}/tf-session-${ID}-v2.m4a`);

  const webm = validateGrant(req({
    filename: `tf-session-${ID}-v2.webm`, contentType: 'audio/webm', size: 5000,
  }), CFG);
  assert.equal(webm.ok, true);
  assert.equal(webm.key, `submissions/2026-08-06/${ID}/tf-session-${ID}-v2.webm`);
});

test('no expected token means the pathway is disabled', () => {
  const v = validateGrant(req(), { ...CFG, expectedToken: undefined });
  assert.deepEqual(v, { ok: false, status: 503, reason: 'submissions disabled' });
});

test('empty configured token is a kill switch: rejects even empty request token', () => {
  const v = validateGrant(req({ token: '' }), { ...CFG, expectedToken: '' });
  assert.deepEqual(v, { ok: false, status: 503, reason: 'submissions disabled' });
});

test('wrong token is refused', () => {
  const v = validateGrant(req({ token: 'nope' }), CFG);
  assert.deepEqual(v, { ok: false, status: 403, reason: 'bad token' });
});

test('non-object body is refused', () => {
  assert.deepEqual(validateGrant(null, CFG), { ok: false, status: 400, reason: 'bad request' });
  assert.deepEqual(validateGrant('x', CFG), { ok: false, status: 400, reason: 'bad request' });
});

test('bad session id is refused', () => {
  for (const sessionId of ['123-abcd', '1786061130678-ABCD', '1786061130678-nx1j2', 'x']) {
    const v = validateGrant(req({ sessionId }), CFG);
    assert.deepEqual(v, { ok: false, status: 400, reason: 'bad session id' }, sessionId);
  }
});

test('filename must embed the same session id', () => {
  const v = validateGrant(req({ filename: 'tf-session-1786061130678-zzzz.jsonl' }), CFG);
  assert.deepEqual(v, { ok: false, status: 400, reason: 'bad filename' });
});

test('traversal and stray filenames are refused', () => {
  for (const filename of [
    `../tf-session-${ID}.jsonl`,
    `tf-session-${ID}.jsonl.exe`,
    `tf-session-${ID}-v1.mp3`,
    'notes.txt',
  ]) {
    const v = validateGrant(req({ filename }), CFG);
    assert.deepEqual(v, { ok: false, status: 400, reason: 'bad filename' }, filename);
  }
});

test('content type must match the file class exactly', () => {
  const audioTypeOnJsonl = validateGrant(req({ contentType: 'audio/mp4' }), CFG);
  assert.deepEqual(audioTypeOnJsonl, { ok: false, status: 415, reason: 'bad content type' });

  const wrongAudioPair = validateGrant(req({
    filename: `tf-session-${ID}-v1.m4a`, contentType: 'audio/webm',
  }), CFG);
  assert.deepEqual(wrongAudioPair, { ok: false, status: 415, reason: 'bad content type' });

  const codecsSuffix = validateGrant(req({
    filename: `tf-session-${ID}-v1.webm`, contentType: 'audio/webm;codecs=opus',
  }), CFG);
  assert.deepEqual(codecsSuffix, { ok: false, status: 415, reason: 'bad content type' });
});

test('size must be an integer within the class cap', () => {
  for (const size of [0, -1, 1.5, '10', 26214400 + 1]) {
    const v = validateGrant(req({ size }), CFG);
    assert.deepEqual(v, { ok: false, status: 413, reason: 'bad size' }, String(size));
  }
  assert.equal(validateGrant(req({ size: 26214400 }), CFG).ok, true);
  assert.equal(
    validateGrant(req({
      filename: `tf-session-${ID}-v1.m4a`, contentType: 'audio/mp4', size: 209715200,
    }), CFG).ok,
    true,
  );
});

test('key date is UTC from the injected clock', () => {
  const nearMidnight = { ...CFG, date: new Date('2026-12-31T23:59:59Z') };
  const v = validateGrant(req(), nearMidnight);
  assert.match(v.key, /^submissions\/2026-12-31\//);
});
