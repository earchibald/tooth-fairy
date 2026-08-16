// Mosaic layout: n points inside the tooth silhouette, in the 0-100 tooth
// coordinate space, sorted bottom-up so fills read as liquid rising.
// Pure and node-testable; the DOM/canvas tooth keeps using TOOTH_PATH —
// this module owns the flattened polygon for hit-testing only.

const CUBICS = [
  [[50, 12], [28, 12], [16, 26], [16, 44]],
  [[16, 44], [16, 56], [22, 64], [27, 78]],
  [[27, 78], [30, 88], [35, 94], [40, 92]],
  [[40, 92], [45, 90], [44, 76], [50, 76]],
  [[50, 76], [56, 76], [55, 90], [60, 92]],
  [[60, 92], [65, 94], [70, 88], [73, 78]],
  [[73, 78], [78, 64], [84, 56], [84, 44]],
  [[84, 44], [84, 26], [72, 12], [50, 12]],
];
const POLY = [];
for (const [p0, p1, p2, p3] of CUBICS) {
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const u = 1 - t;
    POLY.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

export function insideTooth(x, y) {
  let odd = false;
  for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
    const [xi, yi] = POLY[i];
    const [xj, yj] = POLY[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd;
  }
  return odd;
}

// Nearest-outline-vertex distance: which grid points hug the edge.
function edgeDist(x, y) {
  let best = Infinity;
  for (const [px, py] of POLY) {
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

const cache = new Map();

export function mosaicPoints(n) {
  if (cache.has(n)) return cache.get(n);
  let pts = [];
  // Densify the grid until at least n cells land inside the silhouette.
  for (let cols = Math.ceil(Math.sqrt(n)); cols <= 64; cols++) {
    const step = 100 / (cols + 1);
    pts = [];
    for (let gy = step; gy < 100; gy += step) {
      for (let gx = step; gx < 100; gx += step) {
        if (insideTooth(gx, gy)) pts.push({ x: gx, y: gy });
      }
    }
    if (pts.length >= n) break;
  }
  // Trim the points hugging the outline first; keep the meaty interior.
  pts.sort((a, b) => edgeDist(b.x, b.y) - edgeDist(a.x, a.y));
  pts = pts.slice(0, n);
  pts.sort((a, b) => b.y - a.y || a.x - b.x);
  cache.set(n, pts);
  return pts;
}
