// Config modules must parse and import: the game suite never touched
// names.js, so a corrupted string literal once shipped green. Importing
// every config module here makes "the game cannot boot" a test failure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { buildNames } from '../js/config/names.js';
import { buildScript } from '../js/config/script.js';
import { buildContracts } from '../js/config/contracts.js';
import { buildVfx } from '../js/config/vfx.js';

test('every config module imports and builds', () => {
  const cfg = buildConstants();
  const names = buildNames();
  assert.ok(cfg.STARS && cfg.SKY);
  assert.ok(buildScript(null).beats.length > 0);
  assert.ok(buildContracts().pool.length > 0);
  assert.ok(buildVfx().palettes);
  assert.equal(names.ui.depart, 'another town');
  for (const id of Object.keys(cfg.SKY)) {
    assert.ok(names.sky[id] && names.sky[id].name, `names.sky.${id} missing`);
  }
});
