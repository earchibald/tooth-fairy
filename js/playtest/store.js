// Playtest entry persistence. MemoryStore backs node tests and any
// environment without IndexedDB (e.g. private browsing). IdbStore persists
// across reloads so queued audio blobs survive. Both expose the same async
// interface: openSession(nowMs, rand), putEntry(entry), deleteEntry(id),
// allEntries(), clear(). `indexedDB` is injected via deps rather than read
// off the global, so createStore stays node-testable.
//
// Clone of alignment-issues/game/js/telemetry/store.js, trimmed to the
// one entries store this phase needs (no separate events/audio stores —
// a playtest entry already carries its own blob, and IndexedDB stores
// Blob natively, so there is nothing to chunk).

import { newSessionId } from './entries.js';

const DB_NAME = 'tf-playtest';
const DB_VERSION = 1;

export class MemoryStore {
  constructor() {
    this.entries = new Map(); // id -> entry
    this.meta = new Map(); // k -> record
  }

  async openSession(nowMs, rand) {
    const existing = this.meta.get('session');
    if (existing) {
      return { id: existing.id, startedAt: existing.startedAt, seqNext: this._seqNext() };
    }
    const id = newSessionId(nowMs, rand);
    this.meta.set('session', { k: 'session', id, startedAt: nowMs });
    return { id, startedAt: nowMs, seqNext: 0 };
  }

  async putEntry(entry) {
    this.entries.set(entry.id, entry);
  }

  async deleteEntry(id) {
    this.entries.delete(id);
  }

  async allEntries() {
    return [...this.entries.values()].sort((a, b) => a.seq - b.seq);
  }

  async clear() {
    this.entries.clear();
    this.meta.clear();
  }

  _seqNext() {
    let max = -1;
    for (const e of this.entries.values()) if (e.seq > max) max = e.seq;
    return max + 1;
  }
}

// --- IndexedDB implementation ---------------------------------------
// Same interface as MemoryStore. Multi-request writes issue all requests
// synchronously inside one transaction and await tx completion, so the
// transaction can never auto-commit out from under a pending request.

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export class IdbStore {
  static async open(indexedDB) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('entries', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'k' });
    };
    return new IdbStore(await req(request));
  }

  constructor(db) {
    this.db = db;
  }

  async openSession(nowMs, rand) {
    const meta = this.db.transaction(['meta']).objectStore('meta');
    const existing = await req(meta.get('session'));
    if (existing) {
      return { id: existing.id, startedAt: existing.startedAt, seqNext: await this._seqNext() };
    }
    const id = newSessionId(nowMs, rand);
    const tx = this.db.transaction(['meta'], 'readwrite');
    tx.objectStore('meta').put({ k: 'session', id, startedAt: nowMs });
    await txDone(tx);
    return { id, startedAt: nowMs, seqNext: 0 };
  }

  async putEntry(entry) {
    const tx = this.db.transaction(['entries'], 'readwrite');
    tx.objectStore('entries').put(entry);
    await txDone(tx);
  }

  async deleteEntry(id) {
    const tx = this.db.transaction(['entries'], 'readwrite');
    tx.objectStore('entries').delete(id);
    await txDone(tx);
  }

  async allEntries() {
    const entries = this.db.transaction(['entries']).objectStore('entries');
    const all = await req(entries.getAll());
    return all.sort((a, b) => a.seq - b.seq);
  }

  async clear() {
    const tx = this.db.transaction(['entries', 'meta'], 'readwrite');
    tx.objectStore('entries').clear();
    tx.objectStore('meta').clear();
    await txDone(tx);
  }

  async _seqNext() {
    const all = await this.allEntries();
    return all.length ? all[all.length - 1].seq + 1 : 0;
  }
}

// deps.indexedDB is injected (never read off the global) so this stays
// testable under plain node --test, which has no IndexedDB at all.
export async function createStore(deps = {}) {
  if (deps.indexedDB) {
    try {
      return await IdbStore.open(deps.indexedDB);
    } catch (err) {
      console.warn('playtest store: IndexedDB unavailable, falling back to memory', err);
      return new MemoryStore();
    }
  }
  return new MemoryStore();
}
