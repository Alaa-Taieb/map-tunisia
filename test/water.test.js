// Water layer: lakes, dams, sebkhas, chotts and sea-side lagoons, an overlay that leaves the nested partitions untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readCSV } from '../scripts/build/lib.js';
import { PARTITIONS, WATER_TYPES, modesFor, fileName } from '../scripts/build/config.js';

const D = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/data', `${p}.json`), 'utf8'));
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const report = read('data/source/water-report.json');
const water = D('water');
const PARTITION = PARTITIONS.find((p) => p.id === 'water');

test('water count matches the extraction, and every type is present', () => {
  assert.equal(water.length, report.counts.water);
  assert.ok(water.length >= 50 && water.length <= 120, `${water.length} water bodies`);
  assert.equal(readCSV(path.join(ROOT, 'data/attributes/water.csv')).length, water.length);
  for (const t of WATER_TYPES) {
    const n = water.filter((w) => w.type === t).length;
    assert.equal(n, report.per_type[t].count, t);
    assert.ok(n > 0, `at least one ${t}`);
  }
  for (const w of water) assert.ok(WATER_TYPES.includes(w.type), `${w.id} type ${w.type}`);
});

test('water ids are unique, well-formed and point to their OSM source', () => {
  assert.equal(new Set(water.map((w) => w.id)).size, water.length);
  for (const w of water) {
    if (w.geometry_source === 'osm_polygon') {
      const [type, num] = w.osm.split('/');
      assert.ok(type === 'way' || type === 'relation', `${w.id} osm ${w.osm}`);
      assert.equal(w.id, `water-${type[0]}${num}`);
    } else {
      assert.equal(w.geometry_source, 'osm_coastline', w.id);
      assert.equal(w.type, 'lagoon', `${w.id}: only lagoons are cut from the coastline`);
      assert.match(w.id, /^water-[a-z-]+$/);
    }
  }
});

test('every water body has a name, a governorate, a region and a district', () => {
  const gov = Object.fromEntries(D('governorates').map((g) => [g.id, g]));
  for (const w of water) {
    assert.ok(w.name_fr || w.name_ar, `${w.id} is named`);
    if (w.name_fr) assert.doesNotMatch(w.name_fr, /\p{Script=Arabic}/u, `${w.id} Latin name has no Arabic script`);
    if (w.name_ar) {
      assert.match(w.name_ar, /\p{Script=Arabic}/u, `${w.id} Arabic name`);
      assert.doesNotMatch(w.name_ar, /[\p{Bidi_Control}یک]/u, `${w.id} has no Persian look-alikes or stray direction marks`);
    }
    const g = gov[w.governorate];
    assert.ok(g, `${w.id} → ${w.governorate}`);
    assert.equal(w.region, g.region);
    assert.equal(w.district, g.district);
    const all = w.governorates.split(' ');
    assert.ok(all.includes(w.governorate), `${w.id} lists its main governorate`);
    for (const id of all) assert.ok(gov[id], `${w.id} → ${id}`);
    assert.ok(Number(w.area_km2) >= 0.9, `${w.id} area ${w.area_km2}`);
    if (w.type === 'sebkha' || w.type === 'chott') assert.equal(w.salt, 'yes', `${w.id} is salt`);
  }
});

test('the landmark water bodies are there, with the right type and governorate', () => {
  const find = (fr) => water.find((w) => w.name_fr === fr);
  const expect = [
    ['Chott el-Jérid', 'chott', 'TN-73'],
    ['Ichkeul', 'lake', 'TN-23'],
    ['Barrage de Sidi Salem', 'reservoir', 'TN-31'],
    ['Sebkhat Sidi El Hani', 'sebkha', 'TN-51'],
    ['Lac de Tunis', 'lagoon', 'TN-11'],
    ['Lagune de Ghar El Melh', 'lagoon', 'TN-23'],
    ['Lac de Bizerte', 'lagoon', 'TN-23'],
    ['Bahiret el Bibane', 'lagoon', 'TN-82'],
  ];
  for (const [name, type, gov] of expect) {
    const w = find(name);
    assert.ok(w, name);
    assert.equal(w.type, type, name);
    assert.equal(w.governorate, gov, name);
  }
  // Areas against published figures: Chott el-Jérid ~5,000 km² (dry-season OSM outline is smaller), Ichkeul ~85-90 km²,
  // Bizerte lagoon ~128 km², El Bibane ~230 km².
  const area = (name) => Number(find(name).area_km2);
  assert.ok(area('Chott el-Jérid') > 3000 && area('Chott el-Jérid') < 5500);
  assert.ok(area('Ichkeul') > 70 && area('Ichkeul') < 100);
  assert.ok(area('Lac de Bizerte') > 110 && area('Lac de Bizerte') < 140);
  assert.ok(area('Bahiret el Bibane') > 200 && area('Bahiret el Bibane') < 260);
});

test('water bodies never overlap, stay in Tunisia, and lagoons stay on the sea side', () => {
  const t = report.topology;
  assert.ok(t.overlap_km2 < 1e-4, `overlap ${t.overlap_km2} km²`);
  assert.ok(t.outside_tunisia_km2 < 1e-4, `outside Tunisia ${t.outside_tunisia_km2} km²`);
  assert.equal(t.invalid_geometries, 0);
  assert.ok(t.in_sea_km2 > 300, 'the Bizerte, Ghar El Melh and El Bibane lagoons lie outside the land');
  const total = water.reduce((s, w) => s + Number(w.area_km2), 0);
  assert.ok(Math.abs(total - t.total_km2) / t.total_km2 < 0.005, `area ${total.toFixed(0)} vs ${t.total_km2}`);
});

test('the water layer is an overlay: it does not alter the nested partitions', () => {
  assert.deepEqual(PARTITION.parents, []);
  assert.equal(PARTITION.source, 'water', 'built from its own source layer');
  for (const lod of PARTITION.lods) assert.ok(!modesFor(PARTITION, lod).some((m) => m.id === 'nested'), 'no nested mode');
  for (const w of water) {
    assert.equal(w.delegation, undefined, `${w.id} carries no delegation`);
    assert.equal(w.sector, undefined, `${w.id} carries no sector`);
  }
  // Inland water stays inside the governorates: the governorates still add up to the country, gaps and all.
  const country = Number(D('country')[0].area_km2);
  const govs = D('governorates').reduce((s, g) => s + Number(g.area_km2), 0);
  assert.ok(Math.abs(govs - country) < 0.5, `governorates ${govs.toFixed(2)} vs country ${country}`);
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
  }
}

for (const lod of PARTITION.lods) {
  test(`water GeoJSON and TopoJSON (${lod})`, () => {
    const gj = read(`dist/geojson/tunisia-water-${lod}.geojson`);
    assert.equal(gj.name, `tunisia-water-${lod}`);
    assert.equal(gj.features.length, water.length);
    const ids = gj.features.map((f) => f.id);
    assert.deepEqual([...ids].sort(), water.map((w) => w.id).sort());
    for (const f of gj.features) {
      assert.equal(f.properties.id, f.id);
      assert.ok(WATER_TYPES.includes(f.properties.type), `${f.id} type`);
      assert.ok(f.properties.governorate && f.properties.area_km2 > 0);
      checkGeometry(f.id, f.geometry);
    }
    const topo = read(`dist/topojson/tunisia-water-${lod}.topojson`);
    const geoms = topo.objects.water.geometries;
    assert.equal(geoms.length, water.length);
    assert.equal(new Set(geoms.map((g) => g.id)).size, geoms.length);
  });
}

test('water SVGs draw the land under the water bodies and colour them by type', () => {
  for (const lod of PARTITION.lods) for (const mode of modesFor(PARTITION, lod)) {
    const svg = fs.readFileSync(path.join(ROOT, 'dist/svg/water', fileName('water', lod, mode.id)), 'utf8');
    const base = svg.indexOf('<path id="water-base" class="base"');
    assert.ok(base > 0, `${lod}/${mode.id} has the land base`);
    assert.ok(base < svg.indexOf('<g id="water" class="units"'), `${lod}/${mode.id} land is drawn first`);
    assert.ok(svg.includes('<title>Land</title>'), 'the base is titled Land');
    for (const w of water) assert.ok(svg.includes(`<path id="${w.id}" class="unit water-body`), `${lod}/${mode.id} draws ${w.id}`);
    if (['light', 'dark', 'interactive'].includes(mode.id)) {
      for (const m of svg.matchAll(/<path id="([^"]+)" class="unit water-body c(\d)" [^>]*data-type="([a-z]+)"/g)) {
        assert.equal(WATER_TYPES[Number(m[2])], m[3], `${m[1]} coloured as ${m[3]}`);
      }
    }
  }
});
