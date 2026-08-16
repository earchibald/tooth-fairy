import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatKeyAction, loadHistory, saveHistory } from '../js/embed/chat.js';

const ev = (o) => ({ code: '', key: '', ctrlKey: false, metaKey: false,
  altKey: false, shiftKey: false, targetTag: 'BODY', ...o });

test('backquote toggles even while typing; Esc dismisses only when open', () => {
  assert.equal(chatKeyAction(ev({ code: 'Backquote', targetTag: 'TEXTAREA' }), false), 'toggle');
  assert.equal(chatKeyAction(ev({ code: 'Backquote' }), true), 'toggle');
  assert.equal(chatKeyAction(ev({ key: 'Escape' }), true), 'dismiss');
  assert.equal(chatKeyAction(ev({ key: 'Escape' }), false), null);
});

test('Ctrl+arrows switch chat tabs only while open', () => {
  assert.equal(chatKeyAction(ev({ key: 'ArrowRight', ctrlKey: true }), true), 'nextTab');
  assert.equal(chatKeyAction(ev({ key: 'ArrowLeft', ctrlKey: true }), true), 'prevTab');
  assert.equal(chatKeyAction(ev({ key: 'ArrowRight', ctrlKey: true }), false), null);
  assert.equal(chatKeyAction(ev({ key: 'ArrowRight' }), true), null);
});

test('history persists and truncates to 200 entries', () => {
  const many = Array.from({ length: 250 }, (_, i) => ({ tab: 'suite', who: 'you', text: 'm' + i }));
  saveHistory(many);
  const back = loadHistory();
  assert.equal(back.length, 200);
  assert.equal(back[199].text, 'm249');
});
