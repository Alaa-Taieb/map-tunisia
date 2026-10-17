/** Small, dependency-free helpers shared by the build scripts and tests. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Parse RFC 4180 CSV text into an array of objects keyed by the header row. */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip a UTF-8 byte-order mark
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

export const readCSV = (file) => parseCSV(fs.readFileSync(file, 'utf8'));

export function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export const escapeXML = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Signed area of a ring (shoelace), in squared input units. */
export function ringArea(ring) {
  let s = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return s / 2;
}

/** Polygons of a (Multi)Polygon geometry as an array of ring arrays. */
export const polygonsOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

export const polygonArea = (rings) => Math.abs(ringArea(rings[0])) - rings.slice(1).reduce((s, r) => s + Math.abs(ringArea(r)), 0);

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
