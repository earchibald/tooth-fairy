import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from '../scripts/build-artifact.js';

const ROOT = new URL('..', import.meta.url).pathname;

test('build produces a working self-contained bundle', async () => {
  build();

  // The registry loads in plain node and the engine runs headless from it.
  await import(pathToFileURL(ROOT + 'dist/bundle.js').href);
  const mods = globalThis.TF_MODULES;
  assert.ok(mods && typeof globalThis.TF_START === 'function');
  const { createState } = mods['js/engine/state.js'];
  const { tick } = mods['js/engine/tick.js'];
  const { buildConstants } = mods['js/config/constants.js'];
  const { buildScript } = mods['js/config/script.js'];
  const cfg = buildConstants(null);
  const script = buildScript(null);
  const state = createState(7);
  for (let i = 0; i < 500; i++) tick(state, cfg, script, {});
  assert.equal(state.tick, 500);

  // The artifact file is publish-shaped: no document skeleton tags, has a title,
  // and carries the bundle + embed flag + clip inline.
  const html = readFileSync(ROOT + 'dist/dev-suite.html', 'utf8');
  assert.ok(!/<!doctype|<html|<head|<body/i.test(html));
  assert.ok(html.includes('<title>'));
  assert.ok(html.includes('dev suite v'), 'version embedded in title/brand');
  assert.ok(html.includes('TF_EMBED'));
  assert.ok(html.includes('TF_TAP_CLIP_B64'));
  assert.ok(html.includes('TF_START()'));
  assert.ok(html.includes('id="tf-dev"') && html.includes('id="app"'));

  const local = readFileSync(ROOT + 'dist/dev-suite-local.html', 'utf8');
  assert.ok(/<!doctype html>/i.test(local));
});

test('emitted bundle has no ESM syntax remnants', () => {
  build();
  const js = readFileSync(ROOT + 'dist/bundle.js', 'utf8');
  assert.ok(!/(^|\n)\s*import\s/.test(js), 'stray import statement');
  assert.ok(!/(^|\n)\s*export\s/.test(js), 'stray export statement');
  assert.ok(!/import\s*\(/.test(js), 'stray dynamic import');
  assert.ok(!/import\.meta/.test(js), 'stray import.meta');
  assert.ok(!/<\/script/i.test(js), 'script-terminator sequence in bundle');
});
