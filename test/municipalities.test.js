// Municipalities (baladiyat): a partition of its own that does not nest in delegations or sectors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../scripts/build/lib.js';
import { PARTITIONS, modesFor, fileName } from '../scripts/build/config.js';

const D = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/data', `${p}.json`), 'utf8'));
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const report = read('data/source/municipalities-report.json');
const municipalities = D('municipalities');
const PARTITION = PARTITIONS.find((p) => p.id === 'municipalities');

test('municipality count matches the extraction and the 2016 division', () => {
  assert.equal(municipalities.length, report.counts.municipalities);
  // Tunisia has 350 municipalities since the 2016 division; OSM maps 338 of them as of the 2026-10-16 extract.
  assert.ok(municipalities.length >= 335 && municipalities.length <= 350, `${municipalities.length} municipalities`);
  assert.equal(report.counts.governorates, 24, 'every governorate has municipalities');
});

test('municipality ids are unique, well-formed and point to their OSM relation', () => {
  const ids = municipalities.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of municipalities) {
    assert.match(m.id, /^municipality-\d+$/);
    assert.equal(m.id, `municipality-${m.osm_relation}`);
  }
});

test('every municipality has names and a consistent governorate, region and district', () => {
  const gov = Object.fromEntries(D('governorates').map((g) => [g.id, g]));
  for (const m of municipalities) {
    assert.ok(m.name_fr, `${m.id} has a Latin name`);
    assert.doesNotMatch(m.name_fr, /\p{Script=Arabic}/u, `${m.id} Latin name has no Arabic script`);
    assert.match(m.name_ar, /\p{Script=Arabic}/u, `${m.id} has an Arabic name`);
    assert.doesNotMatch(m.name_ar, /[\p{Bidi_Control}یک]/u, `${m.id} has no Persian look-alikes or stray direction marks`);
    assert.doesNotMatch(m.name_ar, /^بلدية /, `${m.id} has no "municipality" prefix`);
    const g = gov[m.governorate];
    assert.ok(g, `${m.id} → ${m.governorate}`);
    assert.equal(m.region, g.region);
    assert.equal(m.district, g.district);
  }
});

test('municipalities are not assumed to nest in delegations or sectors', () => {
  assert.deepEqual(PARTITION.parents, [], 'no parent borders are derived from the municipalities');
  assert.ok(PARTITION.source, 'built from its own source layer, not dissolved from sectors');
  for (const lod of PARTITION.lods) assert.ok(!modesFor(PARTITION, lod).some((m) => m.id === 'nested'), 'no nested mode');
  for (const m of municipalities) {
    assert.equal(m.delegation, undefined, `${m.id} carries no delegation`);
    assert.equal(m.sector, undefined, `${m.id} carries no sector`);
  }
  // The data really does not nest: some municipalities spread over several delegations.
  assert.ok(report.topology.across_delegations > 0);
});

test('municipalities do not overlap, stay on land and cover most of it', () => {
  const t = report.topology;
  assert.ok(t.overlap_km2 < 1e-4, `overlap ${t.overlap_km2} km²`);
  assert.ok(t.outside_land_km2 < 1e-4, `outside land ${t.outside_land_km2} km²`);
  assert.equal(t.invalid_geometries, 0);
  assert.ok(t.coverage > 0.97, `coverage ${t.coverage}`);
  // Areas are not forced to add up to the country: uncovered land stays uncovered.
  const country = Number(D('country')[0].area_km2);
  const total = municipalities.reduce((s, m) => s + Number(m.area_km2), 0);
  assert.ok(total < country, 'municipalities cover less than the whole country');
  assert.ok(Math.abs(total - t.covered_km2) / t.covered_km2 < 0.005, `area ${total.toFixed(0)} vs covered ${t.covered_km2}`);
  for (const m of municipalities) assert.ok(Number(m.area_km2) > 0, `${m.id} has an area`);
});

/** Structural validity of a GeoJSON polygon geometry in WGS84. */
function checkGeometry(id, g) {
  assert.ok(g.type === 'Polygon' || g.type === 'MultiPolygon', `${id} is polygonal`);
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  assert.ok(polygons.length > 0, `${id} has parts`);
  for (const rings of polygons) {
    for (const ring of rings) {
      assert.ok(ring.length >= 4, `${id} ring has at least 4 positions`);
      assert.deepEqual(ring[0], ring[ring.length - 1], `${id} ring is closed`);
      for (const [lon, lat] of ring) assert.ok(lon > 7.4 && lon < 11.7 && lat > 30.2 && lat < 37.6, `${id} at ${lon},${lat}`);
    }
    let s = 0;
    const r = rings[0];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
    assert.ok(Math.abs(s) > 0, `${id} outer ring has an area`);
  }
}

for (const lod of PARTITION.lods) {
  test(`municipalities GeoJSON and TopoJSON (${lod})`, () => {
    const gj = read(`dist/geojson/tunisia-municipalities-${lod}.geojson`);
    assert.equal(gj.features.length, municipalities.length);
    const ids = gj.features.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length, 'unique feature ids');
    assert.deepEqual([...ids].sort(), municipalities.map((m) => m.id).sort());
    for (const f of gj.features) {
      assert.equal(f.properties.id, f.id);
      assert.ok(f.properties.name_fr && f.properties.governorate);
      checkGeometry(f.id, f.geometry);
    }
    const topo = read(`dist/topojson/tunisia-municipalities-${lod}.topojson`);
    const geoms = topo.objects.municipalities.geometries;
    assert.equal(geoms.length, municipalities.length);
    assert.equal(new Set(geoms.map((g) => g.id)).size, geoms.length);
  });
}

test('municipality SVGs draw the land outside every municipality under the units', () => {
  for (const lod of PARTITION.lods) for (const mode of modesFor(PARTITION, lod)) {
    const svg = fs.readFileSync(path.join(ROOT, 'dist/svg/municipalities', fileName('municipalities', lod, mode.id)), 'utf8');
    const base = svg.indexOf('<path id="municipalities-base" class="base"');
    assert.ok(base > 0, `${lod}/${mode.id} has the land base`);
    assert.ok(base < svg.indexOf('<g id="municipalities" class="units"'), `${lod}/${mode.id} base is drawn first`);
    assert.ok(svg.includes('data-governorate="TN-'), 'units carry their governorate');
  }
});
