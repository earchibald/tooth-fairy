import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devTabForKey } from '../js/dev/panel.js';

const TABS = ['Workshop', 'Hoard', 'Script', 'Balance', 'Names', 'VFX', 'State', 'Pacing'];
const ev = (o) => ({ code: '', key: '', shiftKey: false, ctrlKey: false,
  metaKey: false, altKey: false, targetTag: 'BODY', ...o });

test('Shift+Digit selects a tab directly', () => {
  assert.equal(devTabForKey(ev({ code: 'Digit3', shiftKey: true }), TABS, 'Workshop'), 'Script');
  assert.equal(devTabForKey(ev({ code: 'Digit8', shiftKey: true }), TABS, 'Workshop'), 'Pacing');
  assert.equal(devTabForKey(ev({ code: 'Digit9', shiftKey: true }), TABS, 'Workshop'), null);
});

test('brackets cycle with wrap', () => {
  assert.equal(devTabForKey(ev({ key: ']' }), TABS, 'Pacing'), 'Workshop');
  assert.equal(devTabForKey(ev({ key: '[' }), TABS, 'Workshop'), 'Pacing');
});

test('typing contexts and modifier chords are ignored', () => {
  assert.equal(devTabForKey(ev({ key: ']', targetTag: 'INPUT' }), TABS, 'Workshop'), null);
  assert.equal(devTabForKey(ev({ key: ']', targetTag: 'TEXTAREA' }), TABS, 'Workshop'), null);
  assert.equal(devTabForKey(ev({ key: ']', ctrlKey: true }), TABS, 'Workshop'), null);
  assert.equal(devTabForKey(ev({ code: 'Digit3' }), TABS, 'Workshop'), null); // no shift
});
