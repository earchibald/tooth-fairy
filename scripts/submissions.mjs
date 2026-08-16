#!/usr/bin/env node
// scripts/submissions.mjs — work with the playtest submissions S3 bucket
// through the aws CLI. Zero dependencies. Generalised port of
// alignment-issues/scripts/sessions.mjs: no bucket, region, or profile is
// baked in.
//
// usage:
//   node scripts/submissions.mjs list
//   node scripts/submissions.mjs pull <sessionId> [--dest <dir>]
//   node scripts/submissions.mjs pull --latest [--dest <dir>]
//   node scripts/submissions.mjs rm <sessionId>
//
// Config resolution, first hit wins:
//   1. SUBMISSION_BUCKET / SUBMISSION_REGION / SUBMISSION_PROFILE env vars
//   2. submission-broker/consumers/tooth-fairy/outputs.json
//   3. submission.config.json at the repo root
// Profile defaults to "default" — the tooth-fairy-analyst user does not
// exist until infra ships, and this account's default credentials can
// already read the bucket.

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PREFIX = 'submissions/';
const USAGE = 'usage: submissions.mjs list | pull <sessionId>|--latest [--dest <dir>] | rm <sessionId>';
const SESSION_ID_RE = /^\d{13}-[a-z0-9]{4}$/;
const VOICE_RE = /-v\d+\.(m4a|webm)$/;

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function outputsPathDefault() {
  return fileURLToPath(new URL('../submission-broker/consumers/tooth-fairy/outputs.json', import.meta.url));
}

function configPathDefault() {
  return fileURLToPath(new URL('../submission.config.json', import.meta.url));
}

export function resolveConfig({ env = process.env, outputsPath, configPath } = {}) {
  const outputs = readJsonSafe(outputsPath ?? outputsPathDefault());
  const config = readJsonSafe(configPath ?? configPathDefault());

  const bucket = env.SUBMISSION_BUCKET || outputs?.bucket || config?.bucket || null;
  const region = env.SUBMISSION_REGION || outputs?.region || config?.region || null;
  const profile = env.SUBMISSION_PROFILE || outputs?.profile || config?.profile || 'default';

  if (!bucket) {
    throw new Error(
      'no bucket configured: set SUBMISSION_BUCKET, or provide '
      + 'submission-broker/consumers/tooth-fairy/outputs.json or submission.config.json',
    );
  }
  return { bucket, region, profile };
}

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'list' && rest.length === 0) return { cmd: 'list' };
  if (cmd === 'pull' || cmd === 'rm') {
    const out = { cmd, sessionId: null, latest: false, dest: '.' };
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === '--latest') out.latest = true;
      else if (arg === '--dest') {
        out.dest = rest[++i];
        if (!out.dest) throw new Error('--dest needs a directory');
      } else if (!out.sessionId) out.sessionId = arg;
      else throw new Error(`unexpected argument: ${arg}`);
    }
    if (cmd === 'rm' && out.latest) {
      throw new Error(`rm refuses --latest: the newest submission is the one you most likely need — ${USAGE}`);
    }
    if (cmd === 'rm' && !out.sessionId) {
      throw new Error(`rm needs an explicit <sessionId> — ${USAGE}`);
    }
    if (cmd === 'pull' && !out.latest && !out.sessionId) {
      throw new Error(`pull needs <sessionId> or --latest — ${USAGE}`);
    }
    if (out.sessionId && !out.latest && !SESSION_ID_RE.test(out.sessionId)) {
      throw new Error(`bad session id: ${out.sessionId}`);
    }
    return out;
  }
  throw new Error(USAGE);
}

// Keys look like submissions/<yyyy-mm-dd>/<sessionId>/<filename>.
export function groupKeysBySession(keys) {
  const sessions = new Map();
  for (const key of keys) {
    const parts = key.split('/');
    if (parts.length !== 4 || parts[0] !== 'submissions') continue;
    const [, date, sessionId] = parts;
    if (!sessions.has(sessionId)) sessions.set(sessionId, { sessionId, date, keys: [] });
    sessions.get(sessionId).keys.push(key);
  }
  // Session ids start with epoch ms, so a lexicographic sort is newest-first.
  return [...sessions.values()].sort((a, b) => (a.sessionId < b.sessionId ? 1 : -1));
}

export function keyBasename(key) {
  return key.slice(key.lastIndexOf('/') + 1);
}

export function hasVoice(keys) {
  return keys.some((k) => VOICE_RE.test(keyBasename(k)));
}

function awsCli(args, { runner = execFileSync, region, profile = 'default' } = {}) {
  const full = [...args, '--profile', profile];
  if (region) full.push('--region', region);
  return runner('aws', full, { encoding: 'utf8' });
}

export function listSessions(bucket, { runner, region, profile } = {}) {
  const contents = [];
  let token;
  do {
    const args = ['s3api', 'list-objects-v2', '--bucket', bucket, '--prefix', PREFIX, '--output', 'json'];
    if (token) args.push('--continuation-token', token);
    const out = awsCli(args, { runner, region, profile });
    const parsed = JSON.parse(out || '{}');
    contents.push(...(parsed.Contents || []));
    token = parsed.IsTruncated && parsed.NextContinuationToken ? parsed.NextContinuationToken : undefined;
  } while (token);
  const keys = contents.map((c) => c.Key);
  return groupKeysBySession(keys);
}

function requireSession(sessions, sessionId, latest) {
  if (latest) {
    if (sessions.length === 0) throw new Error('no submissions found');
    return sessions[0];
  }
  const hit = sessions.find((s) => s.sessionId === sessionId);
  if (!hit) throw new Error(`session not found: ${sessionId}`);
  return hit;
}

export function selectSession(sessions, { sessionId, latest }) {
  return requireSession(sessions, sessionId, latest);
}

// Downloads one S3 object per key to `<dest>/<filename>`. Returns the local paths.
export function pullSession(sessionId, keys, dest, bucket, runner, region, profile) {
  mkdirSync(dest, { recursive: true });
  const paths = [];
  for (const key of keys) {
    const target = `${dest}/${keyBasename(key)}`;
    awsCli(['s3', 'cp', `s3://${bucket}/${key}`, target], { runner, region, profile });
    paths.push(target);
  }
  return paths;
}

// Deletes one S3 object per key. Returns the removed keys.
export function rmSession(sessionId, keys, bucket, runner, region, profile) {
  for (const key of keys) {
    awsCli(['s3', 'rm', `s3://${bucket}/${key}`], { runner, region, profile });
  }
  return keys;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { bucket, region, profile } = resolveConfig();
  const sessions = listSessions(bucket, { region, profile });
  if (opts.cmd === 'list') {
    if (sessions.length === 0) {
      console.log('no submissions');
      return;
    }
    for (const s of sessions) {
      const mic = hasVoice(s.keys) ? ' \u{1F399}' : '';
      console.log(`${s.sessionId}  ${s.date}  ${s.keys.length} file(s)${mic}`);
    }
    return;
  }
  const session = selectSession(sessions, opts);
  if (opts.cmd === 'pull') {
    const paths = pullSession(session.sessionId, session.keys, opts.dest, bucket, undefined, region, profile);
    for (const p of paths) console.log(`pulled ${p}`);
    return;
  }
  // rm
  const removed = rmSession(session.sessionId, session.keys, bucket, undefined, region, profile);
  for (const key of removed) console.log(`removed s3://${bucket}/${key}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(String(err && err.message ? err.message : err));
    process.exit(1);
  }
}
