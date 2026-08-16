// Compiles a SUBMISSION_SCHEMA document (JSON) into a form validate.mjs can
// apply directly: a compiled sessionId regex, and one compiled { re,
// contentTypes, maxBytes } per file entry.
//
// Security note: the session id is interpolated straight into the S3 key
// (see keyTemplate), so it must be constrained to characters that cannot
// escape the intended prefix *before* it ever reaches a key. A schema
// whose sessionIdPattern could match a string containing '/', '\', or
// '..' is rejected here, at compile time — a consumer cannot configure a
// path-traversing schema, only supply one that is safe by construction.
// `prefix` is a literal string, never a pattern: assertSafePrefix rejects
// path separators and '..' as defence in depth, and filenameRegexFor
// regex-escapes it (like sessionId) before interpolating it into the
// filename regex, so any regex metacharacters it contains are matched
// literally rather than treated as wildcards.

const N_TOKEN = '{n}';

function escapeRegexChar(ch) {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

// Compile a `files[].suffix` into a regex fragment: `{n}` expands to
// `\d+`, every other character is regex-escaped individually.
export function compileSuffix(suffix) {
  let out = '';
  let i = 0;
  while (i < suffix.length) {
    if (suffix.startsWith(N_TOKEN, i)) {
      out += '\\d+';
      i += N_TOKEN.length;
    } else {
      out += escapeRegexChar(suffix[i]);
      i += 1;
    }
  }
  return out;
}

// True if `source` contains an unescaped occurrence of `ch` — i.e. `ch`
// not immediately preceded by a backslash that isn't itself escaped.
// Used to tell a literal '.' metacharacter (matches any character,
// including '/') apart from an intentionally-escaped '\.'.
function hasUnescapedChar(source, ch) {
  let escaped = false;
  for (const c of source) {
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === ch) return true;
  }
  return false;
}

// A pattern is "traversal-capable" if it could match a value containing a
// path separator or a '..' segment. We don't attempt a general regex
// analyzer; instead we reject any pattern that could plausibly reach
// those characters:
//   - an explicit '/' in the source — a legitimate session id never
//     needs one.
//   - two consecutive backslash characters — an escaped backslash,
//     i.e. the pattern can match a literal '\'.
//   - an *unescaped* '.' — the regex wildcard metacharacter, which
//     matches '/' (and anything else) unless explicitly escaped as '\.'.
// This is deliberately conservative: legitimate session-id patterns
// (digits, dashes, character classes like [a-z0-9]) never trip it.
function patternIsTraversalCapable(patternSource) {
  if (patternSource.includes('/')) return true;
  if (patternSource.includes('\\\\')) return true;
  if (hasUnescapedChar(patternSource, '.')) return true;
  return false;
}

function assertSafeSessionIdPattern(sessionIdPattern) {
  if (typeof sessionIdPattern !== 'string' || sessionIdPattern.length === 0) {
    throw new Error('SUBMISSION_SCHEMA: sessionIdPattern must be a non-empty string');
  }
  if (patternIsTraversalCapable(sessionIdPattern)) {
    throw new Error(
      `SUBMISSION_SCHEMA: sessionIdPattern must not be able to match '/', '\\', or '..': ${sessionIdPattern}`,
    );
  }
}

function assertSafePrefix(prefix) {
  if (typeof prefix !== 'string' || prefix.length === 0) {
    throw new Error('SUBMISSION_SCHEMA: prefix must be a non-empty string');
  }
  if (prefix.includes('/') || prefix.includes('\\') || prefix.includes('..')) {
    throw new Error(`SUBMISSION_SCHEMA: prefix must not contain a path separator: ${prefix}`);
  }
}

// Regex-escape a literal string for safe interpolation into a `new
// RegExp(...)` source — used for the *specific, already-validated*
// sessionId of a request, not for schema compilation.
export function escapeRegexLiteral(str) {
  return str.split('').map(escapeRegexChar).join('');
}

// compileSchema(doc) — doc is the parsed SUBMISSION_SCHEMA JSON document.
// Throws on an unsafe or malformed schema (fail closed at cold start,
// not per-request). Returns { prefix, sessionIdRe, keyTemplate,
// files: [{ suffixPattern, contentTypes, maxBytes }] }.
//
// Note `files[].suffixPattern` is a regex *fragment* (a string), not a
// standalone RegExp: the filename regex is only complete once the caller
// (validate.mjs) interpolates the request's own, already-validated
// sessionId — see `filenameRegexFor` below. Baking the general
// `sessionIdPattern` into a precompiled filename regex here would let a
// filename naming *any* valid-looking session id match *any* request's
// session id, which is wrong (and was caught by a test: a filename
// embedding session id A must be refused for a request claiming session
// id B).
export function compileSchema(doc) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('SUBMISSION_SCHEMA: must be an object');
  }
  const { prefix, sessionIdPattern, keyTemplate, files } = doc;
  assertSafePrefix(prefix);
  assertSafeSessionIdPattern(sessionIdPattern);
  if (typeof keyTemplate !== 'string' || keyTemplate.length === 0) {
    throw new Error('SUBMISSION_SCHEMA: keyTemplate must be a non-empty string');
  }
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('SUBMISSION_SCHEMA: files must be a non-empty array');
  }
  const sessionIdRe = new RegExp(sessionIdPattern);
  const compiledFiles = files.map((f) => {
    if (typeof f.suffix !== 'string' || f.suffix.length === 0) {
      throw new Error('SUBMISSION_SCHEMA: files[].suffix must be a non-empty string');
    }
    if (!Array.isArray(f.contentTypes) || f.contentTypes.length === 0) {
      throw new Error('SUBMISSION_SCHEMA: files[].contentTypes must be a non-empty array');
    }
    if (!Number.isInteger(f.maxBytes) || f.maxBytes < 1) {
      throw new Error('SUBMISSION_SCHEMA: files[].maxBytes must be a positive integer');
    }
    return {
      suffixPattern: compileSuffix(f.suffix),
      contentTypes: f.contentTypes,
      maxBytes: f.maxBytes,
    };
  });
  return {
    prefix, sessionIdRe, keyTemplate, files: compiledFiles,
  };
}

// filenameRegexFor(schema, sessionId, fileEntry) — the complete filename
// regex for one compiled `schema.files[]` entry, specific to a single
// request's already-validated sessionId (regex-escaped before
// interpolation, though by this point it can only contain characters
// sessionIdPattern allowed, which compileSchema already verified are
// traversal-safe).
export function filenameRegexFor(schema, sessionId, fileEntry) {
  return new RegExp(`^${escapeRegexLiteral(schema.prefix)}-${escapeRegexLiteral(sessionId)}${fileEntry.suffixPattern}$`);
}
