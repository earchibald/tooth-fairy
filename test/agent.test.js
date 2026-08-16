import { test } from 'node:test';
import assert from 'node:assert/strict';
import { respond, buildPrompt } from '../js/embed/agent.js';
import { PACKS } from '../js/embed/packs.gen.js';
import { VFX_DEFAULTS } from '../js/config/vfx.js';

function ctx(tab = 'VFX') {
  return {
    scope: 'tab', tab, packs: PACKS,
    live: { vfx: JSON.parse(JSON.stringify(VFX_DEFAULTS)), constants: {}, names: {} },
    overrides: { vfx: {}, constants: {}, names: {}, script: {} },
  };
}

test('help: a bare knob mention lists matches with current and default', () => {
  const r = respond({ ...ctx(), text: 'what does sound tap do?' });
  assert.match(r.reply, /sound\.tap/);
  assert.equal(r.action, undefined);
});

test('set: "set sound tap to 0.5" produces a set action', () => {
  const r = respond({ ...ctx(), text: 'set sound tap to 0.5' });
  assert.deepEqual(r.action, {
    type: 'set', ovKey: 'vfx', path: ['sound', 'tap'], value: 0.5, tab: 'VFX' });
  assert.match(r.reply, /0\.5/);
});

test('relative: "double the sound tap"', () => {
  const c = ctx();
  const before = c.live.vfx.sound.tap;
  const r = respond({ ...c, text: 'double the sound tap gain' });
  assert.equal(r.action.type, 'set');
  assert.equal(r.action.value, before * 2);
});

test('reset uses the default', () => {
  const c = ctx();
  c.live.vfx.sound.tap = 0.9;
  const r = respond({ ...c, text: 'reset sound tap' });
  assert.equal(r.action.value, VFX_DEFAULTS.sound.tap);
});

test('ambiguous match lists candidates instead of acting', () => {
  const r = respond({ ...ctx(), text: 'set glow to 3' });
  assert.equal(r.action, undefined);
  assert.match(r.reply, /which/i);
});

test('code-change request yields a prompt package', () => {
  const r = respond({ ...ctx('Workshop'), text: 'add a slider for conveyor speed to this tab' });
  assert.equal(r.action.type, 'prompt');
  assert.match(r.action.body, /Workshop/);
  assert.match(r.action.body, /add a slider for conveyor speed/);
  assert.match(r.action.body, /node scripts\/build-artifact\.js/);
});

test('suite scope answers overview questions and routes', () => {
  const r = respond({ ...ctx(), scope: 'suite', text: 'which tab edits the story beats?' });
  assert.match(r.reply, /Script/);
});

test('buildPrompt carries contract, overrides, request, SDLC steps', () => {
  const p = buildPrompt({
    tab: 'VFX', request: 'make sparks pool their DOM nodes', packs: PACKS,
    overrides: { vfx: { sound: { tap: 0.5 } } }, matchedKnobs: [],
  });
  assert.match(p.filename, /\.md$/);
  assert.match(p.body, /make sparks pool their DOM nodes/);
  assert.match(p.body, /"tap": 0\.5/);
  assert.match(p.body, /npm test/);
  assert.match(p.body, /gen-agent-packs/);
});
