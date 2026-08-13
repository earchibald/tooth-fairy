// The one tooth shape, used everywhere: button, outlines, motif, favicon.
export const TOOTH_PATH =
  'M50 12 C28 12 16 26 16 44 C16 56 22 64 27 78 C30 88 35 94 40 92 ' +
  'C45 90 44 76 50 76 C56 76 55 90 60 92 C65 94 70 88 73 78 ' +
  'C78 64 84 56 84 44 C84 26 72 12 50 12 Z';

export function toothSVG(cls) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', TOOTH_PATH);
  svg.appendChild(path);
  return svg;
}

export function toothPath2D() {
  return new Path2D(TOOTH_PATH);
}
