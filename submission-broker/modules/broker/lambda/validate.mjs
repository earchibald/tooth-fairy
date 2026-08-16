// Pure grant validation for the submission broker. No AWS, no I/O — this
// module is unit-tested directly (test/broker-validate.test.js) and
// imported by broker.mjs inside the Lambda zip.
//
// The server, never the client, constructs the object key.
//
// Schema-driven: `schema` is a *compiled* schema (see schema.mjs's
// compileSchema), not the raw JSON document — compilation (and its
// safety checks) happens once at cold start, not per request.

import { createHash, timingSafeEqual } from 'node:crypto';
import { filenameRegexFor } from './schema.mjs';

function refuse(status, reason) {
  return { ok: false, status, reason };
}

function tokenMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || b.length === 0) return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function validateGrant(body, { expectedToken, schema, date = new Date() }) {
  if (typeof expectedToken !== 'string' || expectedToken.length === 0) return refuse(503, 'submissions disabled');
  if (!body || typeof body !== 'object') return refuse(400, 'bad request');
  const { token, sessionId, filename, size, contentType } = body;
  if (!tokenMatches(token, expectedToken)) return refuse(403, 'bad token');
  if (typeof sessionId !== 'string' || !schema.sessionIdRe.test(sessionId)) {
    return refuse(400, 'bad session id');
  }
  // sessionId matched schema.sessionIdRe (compile-time verified to be
  // free of '/', '\', and '..'), safe to interpolate into a key.
  if (typeof filename !== 'string') return refuse(400, 'bad filename');
  const match = schema.files.find((f) => filenameRegexFor(schema, sessionId, f).test(filename));
  if (!match) return refuse(400, 'bad filename');
  if (!match.contentTypes.includes(contentType)) return refuse(415, 'bad content type');
  if (!Number.isInteger(size) || size < 1 || size > match.maxBytes) {
    return refuse(413, 'bad size');
  }
  const day = date.toISOString().slice(0, 10);
  const key = schema.keyTemplate
    .replace('{date}', day)
    .replace('{sessionId}', sessionId)
    .replace('{filename}', filename);
  return {
    ok: true,
    key,
    maxBytes: match.maxBytes,
    contentType,
  };
}
