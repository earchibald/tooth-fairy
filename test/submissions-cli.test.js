import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveConfig, parseArgs, groupKeysBySession, keyBasename, hasVoice,
  listSessions, selectSession, pullSession, rmSession,
} from '../scripts/submissions.mjs';

const KEYS = [
  'submissions/2026-08-01/1700000000000-aaaa/tf-session-1700000000000-aaaa.jsonl',
  'submissions/2026-08-02/1800000000000-bbbb/tf-session-1800000000000-bbbb.jsonl',
  'submissions/2026-08-02/1800000000000-bbbb/tf-session-1800000000000-bbbb-v1.m4a',
  'submissions/2026-08-03/1900000000000-cccc/tf-session-1900000000000-cccc.jsonl',
  'submissions/2026-08-03/1900000000000-cccc/tf-session-1900000000000-cccc-v1.webm',
  'submissions/2026-08-03/1900000000000-cccc/tf-session-1900000000000-cccc-v2.webm',
];

test('resolveConfig: env vars win first', () => {
  const cfg = resolveConfig({
    env: { SUBMISSION_BUCKET: 'b1', SUBMISSION_REGION: 'r1', SUBMISSION_PROFILE: 'p1' },
  });
  assert.deepEqual(cfg, { bucket: 'b1', region: 'r1', profile: 'p1' });
});

test('resolveConfig: no config anywhere throws a helpful error', () => {
  assert.throws(
    () => resolveConfig({ env: {}, outputsPath: '/nonexistent-outputs.json', configPath: '/nonexistent-config.json' }),
    /no bucket configured/,
  );
});

test('resolveConfig: falls back to outputs.json, profile defaults to "default"', (t) => {
  const path = join(tmpdir(), `tf-outputs-${process.pid}-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify({ bucket: 'from-outputs', region: 'us-east-1' }));
  t.after(() => unlinkSync(path));
  const cfg = resolveConfig({ env: {}, outputsPath: path, configPath: '/nonexistent-config.json' });
  assert.equal(cfg.bucket, 'from-outputs');
  assert.equal(cfg.region, 'us-east-1');
  assert.equal(cfg.profile, 'default');
});

test('resolveConfig: outputs.json wins over submission.config.json', (t) => {
  const outputsPath = join(tmpdir(), `tf-outputs-${process.pid}-${Date.now()}-a.json`);
  const configPath = join(tmpdir(), `tf-config-${process.pid}-${Date.now()}-b.json`);
  writeFileSync(outputsPath, JSON.stringify({ bucket: 'from-outputs' }));
  writeFileSync(configPath, JSON.stringify({ bucket: 'from-config', profile: 'analyst' }));
  t.after(() => { unlinkSync(outputsPath); unlinkSync(configPath); });
  const cfg = resolveConfig({ env: {}, outputsPath, configPath });
  assert.equal(cfg.bucket, 'from-outputs');
});

test('groupKeysBySession: groups by session id, newest-first order', () => {
  const sessions = groupKeysBySession(KEYS);
  assert.deepEqual(sessions.map((s) => s.sessionId), [
    '1900000000000-cccc', '1800000000000-bbbb', '1700000000000-aaaa',
  ]);
  assert.equal(sessions[0].keys.length, 3);
  assert.equal(sessions[1].keys.length, 2);
  assert.equal(sessions[2].keys.length, 1);
});

test('keyBasename strips the path prefix', () => {
  assert.equal(keyBasename(KEYS[0]), 'tf-session-1700000000000-aaaa.jsonl');
});

test('hasVoice marks a session with a voice file, not one without', () => {
  const sessions = groupKeysBySession(KEYS);
  const byId = Object.fromEntries(sessions.map((s) => [s.sessionId, s]));
  assert.equal(hasVoice(byId['1700000000000-aaaa'].keys), false);
  assert.equal(hasVoice(byId['1800000000000-bbbb'].keys), true);
  assert.equal(hasVoice(byId['1900000000000-cccc'].keys), true);
});

test('parseArgs: list takes no arguments', () => {
  assert.deepEqual(parseArgs(['list']), { cmd: 'list' });
});

test('parseArgs: pull with --latest and --dest', () => {
  assert.deepEqual(parseArgs(['pull', '--latest', '--dest', 'out']), {
    cmd: 'pull', sessionId: null, latest: true, dest: 'out',
  });
});

test('parseArgs: pull with an explicit session id', () => {
  const out = parseArgs(['pull', '1700000000000-aaaa']);
  assert.equal(out.sessionId, '1700000000000-aaaa');
  assert.equal(out.latest, false);
  assert.equal(out.dest, '.');
});

test('parseArgs: rm --latest is refused', () => {
  assert.throws(() => parseArgs(['rm', '--latest']), /refuses --latest/);
});

test('parseArgs: rm with no session id is refused', () => {
  assert.throws(() => parseArgs(['rm']), /needs an explicit/);
});

test('parseArgs: pull with neither a session id nor --latest is refused', () => {
  assert.throws(() => parseArgs(['pull']), /needs <sessionId> or --latest/);
});

test('parseArgs: a malformed session id is refused', () => {
  assert.throws(() => parseArgs(['pull', 'not-a-session']), /bad session id/);
});

test('listSessions paginates via the injected runner and groups the result', () => {
  const calls = [];
  const runner = (cmd, args) => {
    calls.push(args);
    if (!args.includes('--continuation-token')) {
      return JSON.stringify({
        Contents: [{ Key: KEYS[0] }, { Key: KEYS[1] }],
        IsTruncated: true,
        NextContinuationToken: 'tok2',
      });
    }
    return JSON.stringify({ Contents: [{ Key: KEYS[2] }], IsTruncated: false });
  };
  const sessions = listSessions('my-bucket', { runner, region: 'us-east-1', profile: 'analyst' });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes('my-bucket'));
  assert.ok(calls[0].includes('--profile') && calls[0].includes('analyst'));
  assert.ok(calls[0].includes('--region') && calls[0].includes('us-east-1'));
  assert.equal(sessions.length, 2);
});

test('selectSession: --latest picks the newest, explicit id picks that one, unknown id throws', () => {
  const sessions = groupKeysBySession(KEYS);
  assert.equal(selectSession(sessions, { latest: true }).sessionId, '1900000000000-cccc');
  assert.equal(selectSession(sessions, { sessionId: '1700000000000-aaaa' }).sessionId, '1700000000000-aaaa');
  assert.throws(() => selectSession(sessions, { sessionId: 'nope' }), /session not found/);
});

test('pullSession copies each key via the injected runner', (t) => {
  const dest = join(tmpdir(), `tf-pull-dest-${process.pid}-${Date.now()}`);
  const calls = [];
  const runner = (cmd, args) => { calls.push(args); return ''; };
  const paths = pullSession(
    'sid', ['submissions/2026-08-01/sid/a.jsonl', 'submissions/2026-08-01/sid/a-v1.m4a'],
    dest, 'bkt', runner, 'us-east-1', 'default',
  );
  assert.deepEqual(paths, [`${dest}/a.jsonl`, `${dest}/a-v1.m4a`]);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes('s3'));
  assert.ok(calls[0].includes('cp'));
  t.after(() => rmSync(dest, { recursive: true, force: true }));
});

test('rmSession deletes each key via the injected runner', () => {
  const calls = [];
  const runner = (cmd, args) => { calls.push(args); return ''; };
  const removed = rmSession('sid', ['submissions/2026-08-01/sid/a.jsonl'], 'bkt', runner, undefined, 'default');
  assert.deepEqual(removed, ['submissions/2026-08-01/sid/a.jsonl']);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('rm'));
});
