// SVG output: completeness of the matrix, XML validity, semantics and size budgets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { XMLValidator } from 'fast-xml-parser';
import { ROOT } from '../scripts/build/lib.js';
import { PARTITIONS, modesFor, fileName } from '../scripts/build/config.js';
import FRAME from '../src/frame.js';

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/manifest.json'), 'utf8'));
const count = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/data', `${p}.json`), 'utf8')).length;

const BUDGET = { full: 16e6, high: 8e6, medium: 4e6, low: 1.5e6, tiny: 400e3 };

const expected = PARTITIONS.flatMap((p) => p.lods.flatMap((lod) => modesFor(p, lod).map((m) => ({ p, lod, mode: m.id }))));

test('the full partition × LOD × mode matrix is generated', () => {
  for (const { p, lod, mode } of expected) {
    const f = path.join(ROOT, 'dist/svg', p.id, fileName(p.id, lod, mode));
    assert.ok(fs.existsSync(f), `missing ${f}`);
  }
  const svgs = manifest.files.filter((f) => f.type === 'svg');
  assert.equal(svgs.length, expected.length);
});

test('GeoJSON and TopoJSON exist for every partition and LOD', () => {
  for (const p of PARTITIONS) for (const lod of p.lods) {
    for (const [dir, ext] of [['geojson', 'geojson'], ['topojson', 'topojson']]) {
      const f = path.join(ROOT, 'dist', dir, `tunisia-${p.id}-${lod}.${ext}`);
      assert.ok(fs.existsSync(f), `missing ${f}`);
    }
  }
});

for (const { p, lod, mode } of expected) {
  test(`svg ${p.id}/${lod}/${mode}`, () => {
    const file = path.join(ROOT, 'dist/svg', p.id, fileName(p.id, lod, mode));
    const svg = fs.readFileSync(file, 'utf8');
    const valid = XMLValidator.validate(svg);
    assert.equal(valid, true, JSON.stringify(valid));
    assert.ok(svg.includes(`viewBox="0 0 ${FRAME.width} ${FRAME.height}"`), 'shared frame');
    assert.ok(svg.includes('<title id="map-title">') && svg.includes('<desc id="map-desc">'), 'accessible title/desc');
    assert.ok(svg.includes('OpenStreetMap contributors'), 'attribution');
    assert.ok(svg.includes('Alaa Taieb'), 'author credit');
    const units = [...svg.matchAll(/<path id="([^"]+)" class="unit /g)].map((m) => m[1]);
    assert.equal(units.length, count(p.id), 'one path per unit');
    assert.equal(new Set(units).size, units.length, 'unique ids');
    assert.ok(!/ d=""/.test(svg), 'no empty paths');
    assert.ok(!/<script|\son[a-z]+=|href=|<foreignObject/i.test(svg), 'no script, event handlers or external references');
    if (mode.startsWith('labeled')) {
      const labels = (svg.match(/<text class="label"/g) || []).length;
      assert.equal(labels, units.length, 'one label per unit');
    }
    if (mode === 'labeled-ar') assert.match(svg, /<text class="label"[^>]*>\p{Script=Arabic}/u);
    assert.ok(fs.statSync(file).size < BUDGET[lod], `size budget for ${lod}`);
  });
}
