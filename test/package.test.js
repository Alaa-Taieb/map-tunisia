// npm package surface (entry point, subpath exports, types) and the release ZIP script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../scripts/build/lib.js';
import { buildRelease } from '../scripts/release/release.js';
import { readZip, writeZip } from '../scripts/release/zip.js';

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('smoke: the package imports itself by name and the data has the expected counts', async () => {
  // Self-reference goes through package.json "exports", exactly like a consumer would.
  const api = await import('map-tunisia');
  assert.equal(typeof api.project, 'function');
  assert.equal(typeof api.svgPath, 'function');
  const counts = Object.fromEntries(api.catalog.partitions.map((p) => [p.id, p.count]));
  assert.deepEqual(counts, { country: 1, regions: 7, districts: 5, governorates: 24, delegations: 279, sectors: 2083, municipalities: 338, water: 67, cities: 284 });

  const require = createRequire(import.meta.url);
  for (const [id, n] of Object.entries(counts)) {
    const rows = require(`map-tunisia/${api.attributesPath(id, 'json').replace(/^dist\//, '')}`);
    assert.equal(rows.length, n, id);
  }
  assert.equal(api.attributesPath('delegations', 'csv'), 'dist/data/delegations.csv');
  assert.throws(() => api.attributesPath('provinces'), /Unknown partition/);
  assert.throws(() => api.attributesPath('sectors', 'xml'), /json" or "csv/);

  // Every layer's files resolve through the subpath exports, the municipalities, water and cities layers included.
  for (const sub of ['geojson/tunisia-municipalities-medium.geojson', 'topojson/tunisia-municipalities-low.topojson',
    'svg/municipalities/tunisia-municipalities-medium-light.svg', 'data/municipalities.csv',
    'geojson/tunisia-water-medium.geojson', 'topojson/tunisia-water-low.topojson', 'svg/water/tunisia-water-medium-light.svg', 'data/water.csv',
    'geojson/tunisia-cities-medium.geojson', 'topojson/tunisia-cities-low.topojson', 'svg/cities/tunisia-cities-medium-labeled.svg', 'data/cities.csv']) {
    assert.ok(fs.existsSync(fileURLToPath(import.meta.resolve(`map-tunisia/${sub}`))), sub);
  }

  const proj = await import('map-tunisia/projection');
  assert.equal(proj.project, api.project);
});

test('package.json is publish-ready and every export target exists', () => {
  assert.equal(pkg.name, 'map-tunisia');
  assert.match(pkg.version, /^\d+\.\d+\.\d+(-[\w.]+)?$/);
  assert.ok(pkg.description && pkg.license && pkg.keywords.length && pkg.repository);
  assert.ok(fs.existsSync(path.join(ROOT, pkg.main)));
  assert.ok(fs.existsSync(path.join(ROOT, pkg.types)));
  assert.ok(pkg.files.includes('dist/') && pkg.files.includes('src/'));
  const targets = [];
  const collect = (v) => (typeof v === 'string' ? targets.push(v) : Object.values(v).forEach(collect));
  collect(pkg.exports);
  for (const t of targets) {
    const probe = t.replace('*', '');
    assert.ok(fs.existsSync(path.join(ROOT, probe)), `export target ${t}`);
  }
  assert.ok(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).includes('/release/'), 'the release/ output folder is git-ignored');
});

test('zip writer/reader round-trip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-zip-'));
  try {
    const f = path.join(dir, 'a.zip');
    const big = Buffer.from('x'.repeat(100_000));
    writeZip(f, [{ name: 'b/two.txt', data: Buffer.from('تونس') }, { name: 'a/one.bin', data: big }, { name: 'empty', data: Buffer.alloc(0) }]);
    const z = readZip(f);
    assert.deepEqual([...z.keys()], ['a/one.bin', 'b/two.txt', 'empty']);
    assert.ok(z.get('a/one.bin').equals(big));
    assert.equal(z.get('b/two.txt').toString(), 'تونس');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('release script builds versioned ZIPs and a matching checksum file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-rel-'));
  try {
    const { version, results, sumsFile } = buildRelease({ outDir: dir, only: ['json', 'csv'], log: () => {} });
    assert.equal(version, pkg.version);
    assert.deepEqual(results.map((r) => r.name), [`map-tunisia-v${pkg.version}-json.zip`, `map-tunisia-v${pkg.version}-csv.zip`]);

    const sums = Object.fromEntries(fs.readFileSync(sumsFile, 'utf8').trim().split('\n').map((l) => l.split('  ').reverse()));
    assert.equal(path.basename(sumsFile), `map-tunisia-v${pkg.version}-SHA256SUMS.txt`);
    for (const r of results) {
      assert.equal(sums[r.name], crypto.createHash('sha256').update(fs.readFileSync(r.file)).digest('hex'));
    }

    const json = readZip(results[0].file);
    assert.equal(JSON.parse(json.get('json/delegations.json')).length, 279);
    assert.equal(JSON.parse(json.get('json/sectors.json')).length, 2083);
    assert.equal(JSON.parse(json.get('json/municipalities.json')).length, 338);
    assert.equal(JSON.parse(json.get('json/water.json')).length, 67);
    assert.equal(JSON.parse(json.get('json/cities.json')).length, 284);
    for (const extra of ['LICENSE', 'LICENSE-DATA.md', 'README.txt']) assert.ok(json.has(extra), extra);
    const csv = readZip(results[1].file);
    assert.equal(csv.get('csv/delegations.csv').toString().trim().split('\n').length, 280, 'header + 279 rows');
    assert.ok(![...csv.keys()].some((k) => k.endsWith('.json')), 'csv zip holds no json');

    assert.throws(() => buildRelease({ outDir: dir, only: ['pdf'], log: () => {} }), /Unknown format/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
