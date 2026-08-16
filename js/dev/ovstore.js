// The override layer, shared by the dev panel and the chat agent. Every
// tuned value lives twice: written into the LIVE config object the running
// game reads, and persisted (only the diff from defaults) under one of the
// OV storage keys, merged over frozen defaults at boot. DOM-free; when
// localStorage is absent (node tests) an in-memory map stands in.

export const OV = {
  constants: 'tf-ov-constants',
  names: 'tf-ov-names',
  vfx: 'tf-ov-vfx',
  script: 'tf-ov-script',
};

const memory = new Map();
const store = (typeof localStorage !== 'undefined') ? localStorage : {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

export function loadOv(key) {
  try { return JSON.parse(store.getItem(OV[key]) || 'null') || {}; }
  catch { return {}; }
}

export function saveOv(key, obj) {
  if (obj && Object.keys(obj).length) store.setItem(OV[key], JSON.stringify(obj));
  else store.removeItem(OV[key]);
}

export function setPath(obj, path, value) {
  let node = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (typeof node[path[i]] !== 'object' || node[path[i]] === null) node[path[i]] = {};
    node = node[path[i]];
  }
  node[path[path.length - 1]] = value;
}

export function deletePath(obj, path) {
  const parents = [obj];
  let node = obj;
  for (let i = 0; i < path.length - 1; i++) {
    node = node && node[path[i]];
    parents.push(node);
  }
  if (!node) return;
  delete node[path[path.length - 1]];
  for (let i = parents.length - 1; i > 0; i--) {
    const parent = parents[i - 1];
    const key = path[i - 1];
    if (parent[key] && typeof parent[key] === 'object' && !Object.keys(parent[key]).length) {
      delete parent[key];
    }
  }
}

export function getPath(obj, path) {
  let node = obj;
  for (const k of path) { if (node == null) return undefined; node = node[k]; }
  return node;
}

// Apply one knob edit end to end: validate, write live, persist the diff.
// Numbers are rejected, never clamped: a clamped value is a lie about what
// you applied, and a positive default never accepts zero or less (a 0 tick
// divisor once froze a whole tab). Array members persist wholesale — the
// override layer only merges whole arrays.
export function applyKnob({ defaults, live, ovKey, path, value }) {
  const defVal = getPath(defaults, path);
  if (defVal === undefined) return { ok: false, reason: 'unknown path ' + path.join('.') };
  if (typeof defVal === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, reason: 'not a finite number' };
    }
    if (defVal > 0 && value <= 0) {
      return { ok: false, reason: 'must be > 0 (default ' + defVal + ')' };
    }
  }
  setPath(live, path, value);
  const ov = loadOv(ovKey);
  // Is the leaf inside an array? Walk defaults to find the nearest array parent.
  let arrayParent = null;
  for (let i = path.length - 1; i > 0; i--) {
    if (Array.isArray(getPath(defaults, path.slice(0, i)))) { arrayParent = path.slice(0, i); break; }
  }
  if (arrayParent) {
    const liveArr = getPath(live, arrayParent);
    const defArr = getPath(defaults, arrayParent);
    if (JSON.stringify(liveArr) === JSON.stringify(defArr)) deletePath(ov, arrayParent);
    else setPath(ov, arrayParent, JSON.parse(JSON.stringify(liveArr)));
  } else if (value === defVal) {
    deletePath(ov, path);
  } else {
    setPath(ov, path, value);
  }
  saveOv(ovKey, ov);
  return { ok: true };
}
