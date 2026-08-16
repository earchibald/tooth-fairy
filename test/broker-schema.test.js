import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileSchema, compileSuffix, filenameRegexFor,
} from '../submission-broker/modules/broker/lambda/schema.mjs';

function baseDoc(overrides = {}) {
  return {
    prefix: 'tf-session',
    sessionIdPattern: '^\\d{13}-[a-z0-9]{4}$',
    keyTemplate: 'submissions/{date}/{sessionId}/{filename}',
    files: [
      { suffix: '.jsonl', contentTypes: ['text/plain', 'application/x-ndjson'], maxBytes: 26214400 },
      { suffix: '-v{n}.m4a', contentTypes: ['audio/mp4'], maxBytes: 209715200 },
      { suffix: '-v{n}.webm', contentTypes: ['audio/webm'], maxBytes: 209715200 },
    ],
    ...overrides,
  };
}

test('compileSuffix: {n} expands to \\d+', () => {
  assert.equal(compileSuffix('-v{n}.m4a'), '-v\\d+\\.m4a');
});

test('compileSuffix: every non-{n} character is regex-escaped', () => {
  // '.', '(', ')', '+' are all regex metacharacters and must come out escaped.
  // '-' is not a metacharacter outside a character class and stays plain.
  assert.equal(compileSuffix('.jsonl'), '\\.jsonl');
  assert.equal(compileSuffix('-v{n}(x)+.webm'), '-v\\d+\\(x\\)\\+\\.webm');
});

test('compileSchema: happy path compiles a matching regex per file entry', () => {
  const schema = compileSchema(baseDoc());
  assert.equal(schema.files.length, 3);
  const id = '1786061130678-nx1j';
  assert.equal(schema.sessionIdRe.test(id), true);
  assert.equal(filenameRegexFor(schema, id, schema.files[0]).test(`tf-session-${id}.jsonl`), true);
  assert.equal(filenameRegexFor(schema, id, schema.files[1]).test(`tf-session-${id}-v2.m4a`), true);
  assert.equal(filenameRegexFor(schema, id, schema.files[2]).test(`tf-session-${id}-v10.webm`), true);
  // suffix regex must not match a differently-shaped filename
  assert.equal(filenameRegexFor(schema, id, schema.files[0]).test(`tf-session-${id}.jsonl.exe`), false);
  assert.equal(filenameRegexFor(schema, id, schema.files[1]).test(`tf-session-${id}-vX.m4a`), false);
});

test('compileSchema: {n} matches multi-digit indices only', () => {
  const schema = compileSchema(baseDoc());
  const id = '1786061130678-nx1j';
  const re = filenameRegexFor(schema, id, schema.files[1]);
  assert.equal(re.test(`tf-session-${id}-v0.m4a`), true);
  assert.equal(re.test(`tf-session-${id}-v123.m4a`), true);
  assert.equal(re.test(`tf-session-${id}-v.m4a`), false);
  assert.equal(re.test(`tf-session-${id}-va.m4a`), false);
});

test('filenameRegexFor: a filename embedding a different session id does not match', () => {
  const schema = compileSchema(baseDoc());
  const idA = '1786061130678-nx1j';
  const idB = '1786061130678-zzzz';
  const re = filenameRegexFor(schema, idA, schema.files[0]);
  assert.equal(re.test(`tf-session-${idB}.jsonl`), false);
});

test('compileSchema: rejects a sessionIdPattern that could match a path separator', () => {
  for (const sessionIdPattern of ['^.*$', '^[\\w/]+$', '^a/b$']) {
    assert.throws(() => compileSchema(baseDoc({ sessionIdPattern })), /sessionIdPattern/);
  }
});

test('compileSchema: rejects a sessionIdPattern that could match ".."', () => {
  assert.throws(() => compileSchema(baseDoc({ sessionIdPattern: '^..$' })), /sessionIdPattern/);
});

test('compileSchema: rejects a sessionIdPattern that could match a backslash', () => {
  assert.throws(() => compileSchema(baseDoc({ sessionIdPattern: '^[a\\\\]+$' })), /sessionIdPattern/);
});

test('compileSchema: rejects a prefix containing a path separator', () => {
  assert.throws(() => compileSchema(baseDoc({ prefix: 'a/b' })), /prefix/);
  assert.throws(() => compileSchema(baseDoc({ prefix: '../etc' })), /prefix/);
});

test('compileSchema: rejects malformed documents', () => {
  assert.throws(() => compileSchema(null));
  assert.throws(() => compileSchema({}));
  assert.throws(() => compileSchema(baseDoc({ files: [] })));
  assert.throws(() => compileSchema(baseDoc({ keyTemplate: '' })));
  assert.throws(() => compileSchema(baseDoc({
    files: [{ suffix: '.jsonl', contentTypes: [], maxBytes: 10 }],
  })));
  assert.throws(() => compileSchema(baseDoc({
    files: [{ suffix: '.jsonl', contentTypes: ['text/plain'], maxBytes: 0 }],
  })));
});
