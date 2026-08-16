import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, MemoryStore, IdbStore } from '../js/playtest/store.js';

const entry = (id, seq) => ({
  id, kind: 'text', seq, createdAt: seq, editedAt: null, edited: false, text: `t${seq}`,
  markerStart: null, markerEnd: null, trail: [],
});

test('createStore returns a MemoryStore when deps.indexedDB is absent', async () => {
  const store = await createStore({});
  assert.ok(store instanceof MemoryStore);
});

test('MemoryStore: putEntry/allEntries round trip', async () => {
  const store = new MemoryStore();
  await store.putEntry(entry('a-0', 0));
  const all = await store.allEntries();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, 'a-0');
  assert.equal(all[0].text, 't0');
});

test('MemoryStore: allEntries sorts ascending by seq', async () => {
  const store = new MemoryStore();
  await store.putEntry(entry('a-2', 2));
  await store.putEntry(entry('a-0', 0));
  await store.putEntry(entry('a-1', 1));
  const all = await store.allEntries();
  assert.deepEqual(all.map((e) => e.seq), [0, 1, 2]);
});

test('MemoryStore: deleteEntry removes the entry', async () => {
  const store = new MemoryStore();
  await store.putEntry(entry('a-0', 0));
  await store.putEntry(entry('a-1', 1));
  await store.deleteEntry('a-0');
  const all = await store.allEntries();
  assert.deepEqual(all.map((e) => e.id), ['a-1']);
});

test('MemoryStore: clear empties entries and meta', async () => {
  const store = new MemoryStore();
  await store.openSession(1000, () => 0.5);
  await store.putEntry(entry('a-0', 0));
  await store.clear();
  assert.deepEqual(await store.allEntries(), []);
  const session = await store.openSession(2000, () => 0.5);
  // A fresh session id proves the old meta record was actually cleared.
  assert.notEqual(session.id.split('-')[0], '1000');
});

test('MemoryStore: openSession mints a new session id on first call', async () => {
  const store = new MemoryStore();
  const session = await store.openSession(1000, () => 0);
  assert.match(session.id, /^\d+-[a-z0-9]{4}$/);
  assert.equal(session.startedAt, 1000);
  assert.equal(session.seqNext, 0);
});

test('MemoryStore: openSession reuses the stored session across calls', async () => {
  const store = new MemoryStore();
  const first = await store.openSession(1000, () => 0.111);
  const second = await store.openSession(9999, () => 0.999);
  assert.equal(second.id, first.id);
  assert.equal(second.startedAt, first.startedAt);
});

test('MemoryStore: openSession reports seqNext one past the highest stored seq', async () => {
  const store = new MemoryStore();
  await store.openSession(1000, () => 0.5);
  await store.putEntry(entry('a-0', 0));
  await store.putEntry(entry('a-3', 3));
  await store.putEntry(entry('a-1', 1));
  const session = await store.openSession(1000, () => 0.5);
  assert.equal(session.seqNext, 4);
});

test('IdbStore is exported with the same async interface shape', () => {
  const methods = ['openSession', 'putEntry', 'deleteEntry', 'allEntries', 'clear'];
  for (const m of methods) {
    assert.equal(typeof MemoryStore.prototype[m], 'function', `MemoryStore.${m}`);
    assert.equal(typeof IdbStore.prototype[m], 'function', `IdbStore.${m}`);
  }
  assert.equal(typeof IdbStore.open, 'function');
});
