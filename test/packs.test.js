import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate } from '../scripts/gen-agent-packs.js';

const TABS = ['Workshop', 'Hoard', 'Script', 'Balance', 'Names', 'VFX', 'State', 'Pacing'];

test('packs.gen.js is fresh (regenerate and diff)', () => {
  const disk = readFileSync(new URL('../js/embed/packs.gen.js', import.meta.url), 'utf8');
  assert.equal(disk, generate(),
    'packs.gen.js is stale — run: node scripts/gen-agent-packs.js');
});

test('every dev tab has a pack and knobs carry defaults', async () => {
  const { PACKS } = await import('../js/embed/packs.gen.js');
  for (const t of TABS) assert.ok(PACKS.tabs[t], t);
  assert.ok(PACKS.tabs['Dev Suite']);
  for (const [name, p] of Object.entries(PACKS.tabs)) {
    for (const field of ['summary', 'visual', 'files', 'capabilities']) {
      assert.ok(p[field], name + ' missing ' + field);
    }
  }
  assert.ok(PACKS.knobs.length > 100);
  for (const k of PACKS.knobs) {
    assert.ok(TABS.includes(k.tab));
    assert.ok(['constants', 'names', 'vfx'].includes(k.ovKey));
    assert.ok(Array.isArray(k.path) && k.path.length);
    assert.notEqual(k.def, undefined);
  }
  const ranged = PACKS.knobs.find((k) => k.min !== undefined);
  assert.ok(ranged, 'workshop knobs carry min/max');
});
