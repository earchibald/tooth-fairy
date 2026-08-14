// Workshop: batcher regression, ramp math, particle lifecycles, dev server.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBatcher, rampFactor, makeParticles } from '../js/ui/juice.js';
import { buildVfx } from '../js/config/vfx.js';

test('batcher exposes pending pool so the frame loop can keep running', () => {
  const b = makeBatcher(3);
  assert.equal(b.pending(), false);
  assert.equal(b.credit(5, true), null);
  assert.equal(b.pending(), true);          // pool holds 5, no batch yet
  assert.equal(b.credit(5, true), null);
  assert.equal(b.credit(5, true), 15);      // third credit cuts the batch
  assert.equal(b.pending(), false);
  b.credit(2, false);                       // canLaunch false: pool keeps filling
  b.credit(2, false);
  b.credit(2, false);
  assert.equal(b.pending(), true);
});

test('rampFactor: log-linear between anchors, clamped, degenerate-safe', () => {
  assert.equal(rampFactor(0, 10, 1e9, 3), 1);
  assert.equal(rampFactor(-5, 10, 1e9, 3), 1);
  assert.equal(rampFactor(10, 10, 1e9, 3), 1);
  assert.equal(rampFactor(1e9, 10, 1e9, 3), 3);
  assert.equal(rampFactor(1e12, 10, 1e9, 3), 3);
  // geometric midpoint of 10..1e9 is 10^5 -> halfway factor
  assert.ok(Math.abs(rampFactor(1e5, 10, 1e9, 3) - 2) < 1e-9);
  // degenerate anchors (lo >= hi): 1 below hi, max at/above hi
  assert.equal(rampFactor(5, 100, 100, 3), 1);
  assert.equal(rampFactor(100, 100, 100, 3), 3);
  assert.equal(rampFactor(500, 100, 10, 3), 3);
});

test('particles: spawn, live, expire', () => {
  const p = makeParticles(10);
  p.spawnSparks(50, 50, 1000, { count: 4, size: 2, spreadPx: 20, lifeMs: 400 }, () => 0.5);
  p.spawnRipple(50, 50, 1000, { ms: 300, size: 40 });
  p.spawnSweep(1000, { ms: 700, alpha: 0.2 });
  assert.equal(p.step(1100), 6);
  assert.equal(p.step(1350), 5);            // ripple (300ms) gone; sparks+sweep remain
  assert.equal(p.step(1800), 0);            // sweep (700ms) gone
});

test('particles: pool cap drops oldest, never grows past max', () => {
  const p = makeParticles(5);
  p.spawnSparks(0, 0, 0, { count: 9, size: 1, spreadPx: 10, lifeMs: 100 }, () => 0.5);
  assert.equal(p.step(1), 5);
});

test('vfx.juice defaults exist with the spec values', () => {
  const vfx = buildVfx();
  assert.equal(vfx.juice.tapPop.scale, 1.12);
  assert.equal(vfx.juice.tapGlow.ms, 260);
  assert.equal(vfx.juice.tapSparks.count, 6);
  assert.equal(vfx.juice.inbound.trailPerS, 14);
  assert.equal(vfx.juice.landSparks.count, 5);
  assert.equal(vfx.juice.buySweep.alpha, 0.22);
  assert.equal(vfx.juice.ramp.rateHi, 1e9);
});

import { createWorkshopServer, RELEASE_STEPS } from '../scripts/workshop-server.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'tf-workshop-'));
  mkdirSync(join(root, 'js', 'config'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>t</title>');
  return root;
}

async function withServer(opts, fn) {
  const server = createWorkshopServer(opts);
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(base); }
  finally { await new Promise((res) => server.close(res)); }
}

test('save-vfx writes tuned.js as importable ESM that round-trips', async () => {
  const root = tempRoot();
  await withServer({ root }, async (base) => {
    const res = await fetch(base + '/api/save-vfx', {
      method: 'POST',
      body: JSON.stringify({ vfx: { juice: { tapPop: { scale: 1.3 } } } }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  });
  const file = join(root, 'js', 'config', 'tuned.js');
  assert.ok(readFileSync(file, 'utf8').startsWith('// Written by the Workshop'));
  const mod = await import(pathToFileURL(file).href);
  assert.deepEqual(mod.TUNED, { juice: { tapPop: { scale: 1.3 } } });
});

test('save-vfx rejects bad bodies', async () => {
  const root = tempRoot();
  await withServer({ root }, async (base) => {
    for (const body of ['not json', JSON.stringify({}), JSON.stringify({ vfx: [1] })]) {
      const res = await fetch(base + '/api/save-vfx', { method: 'POST', body });
      assert.equal(res.status, 400);
    }
  });
});

test('release runs the step sequence and stops at the first failure', async () => {
  // All-ok runner: `git diff --cached --quiet` exit 0 means NOTHING staged,
  // so the release short-circuits cleanly before commit/push.
  const calls = [];
  const okRunner = async (cmd, args) => { calls.push([cmd, ...args]); return { ok: true, output: '' }; };
  await withServer({ root: tempRoot(), runner: okRunner }, async (base) => {
    const res = await fetch(base + '/api/release', { method: 'POST' });
    const out = await res.json();
    assert.equal(out.ok, true);
    assert.equal(out.steps.length, 3);                  // tests, stage, check
    assert.equal(out.steps.at(-1).output, 'nothing to release');
  });
  assert.equal(calls[0][0], 'node');                    // tests first
  assert.ok(!calls.some((c) => c[0] === 'git' && c[1] === 'push'));
  assert.ok(calls.every((c) => c[0] !== 'git' || c.every((a) => a !== '-A')));

  const calls2 = [];
  const failRunner = async (cmd, args) => {
    calls2.push([cmd, ...args]);
    return { ok: cmd !== 'node', output: cmd === 'node' ? '1 failing' : '' };
  };
  await withServer({ root: tempRoot(), runner: failRunner }, async (base) => {
    const out = await (await fetch(base + '/api/release', { method: 'POST' })).json();
    assert.equal(out.ok, false);
    assert.equal(out.steps.length, 1);                  // stopped at tests
  });
  assert.equal(calls2.length, 1);
});

test('release pushes when the diff check reports staged changes', async () => {
  const calls = [];
  const runner = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const isDiff = cmd === 'git' && args[0] === 'diff';
    return { ok: !isDiff, output: '' };   // diff exit 1 = something staged
  };
  await withServer({ root: tempRoot(), runner }, async (base) => {
    const out = await (await fetch(base + '/api/release', { method: 'POST' })).json();
    assert.equal(out.ok, true);
    assert.equal(out.steps.length, RELEASE_STEPS.length);
  });
  assert.ok(calls.some((c) => c[0] === 'git' && c[1] === 'push'));
});

test('static serving guards path traversal', async () => {
  await withServer({ root: tempRoot() }, async (base) => {
    assert.equal((await fetch(base + '/index.html')).status, 200);
    const res = await fetch(base + '/..%2f..%2fetc%2fpasswd');
    assert.ok(res.status === 403 || res.status === 404);
    assert.equal((await fetch(base + '/api/save-vfx')).status, 405);   // GET
    assert.equal((await fetch(base + '/api/nope', { method: 'POST' })).status, 404);
  });
});
