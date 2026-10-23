// Build the versioned release archives into release/ (git-ignored) plus a SHA-256 checksum file.
//
//   npm run release:zip                                  # all formats
//   node scripts/release/release.js --only json,csv --out /tmp/rel
//
// Archives are named by the package.json version: map-tunisia-v1.0.0-geojson.zip, ...-json.zip, ...
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeZip } from './zip.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Which dist/ folder and file extension go into each archive. */
export const FORMATS = {
  geojson: { dir: 'geojson', ext: '.geojson', about: 'GeoJSON (WGS84), every partition and level of detail' },
  topojson: { dir: 'topojson', ext: '.topojson', about: 'TopoJSON (WGS84), every partition and level of detail' },
  json: { dir: 'data', ext: '.json', about: 'attribute tables as JSON: names, codes, populations, areas, label points' },
  csv: { dir: 'data', ext: '.csv', about: 'attribute tables as CSV: names, codes, populations, areas, label points' },
  svg: { dir: 'svg', ext: '.svg', about: 'SVG maps, every partition, level of detail and mode' },
};

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function readmeFor(pkg, format) {
  const home = pkg.homepage.replace(/#.*/, '');
  return `${pkg.name} v${pkg.version} - ${FORMATS[format].about}

Project:     ${home}
Licence:     code under MIT; the map data is (c) OpenStreetMap contributors under ODbL 1.0 (see LICENSE-DATA.md).
Attribution: "Map data (c) OpenStreetMap contributors, ODbL" and a link to ${home}

Files are under ${format}/. GeoJSON and TopoJSON use WGS84 lon/lat; SVGs share one UTM 32N frame (1 unit = 1 km).
`;
}

export function buildRelease({ outDir = path.join(ROOT, 'release'), only = Object.keys(FORMATS), log = console.log } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(dist)) throw new Error('dist/ is missing. Run "npm run build" first.');
  for (const f of only) if (!FORMATS[f]) throw new Error(`Unknown format "${f}". Use: ${Object.keys(FORMATS).join(', ')}`);

  fs.mkdirSync(outDir, { recursive: true });
  const extras = ['LICENSE', 'LICENSE-DATA.md'].map((n) => ({ name: n, data: fs.readFileSync(path.join(ROOT, n)) }));
  const prefix = `map-tunisia-v${pkg.version}`;
  const results = [];

  for (const format of only) {
    const { dir, ext } = FORMATS[format];
    const base = path.join(dist, dir);
    const files = fs.existsSync(base) ? walk(base).filter((f) => f.endsWith(ext)) : [];
    if (!files.length) throw new Error(`No ${ext} files found in dist/${dir}/. Run "npm run build" first.`);
    const entries = files.map((f) => ({
      name: `${format}/${path.relative(base, f).split(path.sep).join('/')}`,
      data: fs.readFileSync(f),
    }));
    entries.push(...extras, { name: 'README.txt', data: Buffer.from(readmeFor(pkg, format)) });
    const file = path.join(outDir, `${prefix}-${format}.zip`);
    writeZip(file, entries);
    const size = fs.statSync(file).size;
    results.push({ file, name: path.basename(file), files: files.length, size });
    log(`  ${path.basename(file)}  ${(size / 1048576).toFixed(2)} MB  (${files.length} files)`);
  }

  const sums = results.map((r) => `${crypto.createHash('sha256').update(fs.readFileSync(r.file)).digest('hex')}  ${r.name}`);
  const sumsFile = path.join(outDir, `${prefix}-SHA256SUMS.txt`);
  fs.writeFileSync(sumsFile, sums.join('\n') + '\n');
  log(`  ${path.basename(sumsFile)}`);
  return { version: pkg.version, results, sumsFile };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  console.log('Building release archives...');
  buildRelease({
    outDir: arg('--out') ? path.resolve(arg('--out')) : undefined,
    only: arg('--only')?.split(','),
  });
}
