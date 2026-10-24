// Cities layer: the national capital, the governorate capitals and the municipal seats, as points over the land.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readCSV, polygonsOf } from '../scripts/build/lib.js';
import { PARTITIONS, CITY_TYPES, modesFor, fileName } from '../scripts/build/config.js';
import { project, svgPath, dataPath } from '../src/index.js';

const D = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/data', `${p}.json`), 'utf8'));
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const report = read('data/source/cities-report.json');
const cities = D('cities');
const PARTITION = PARTITIONS.find((p) => p.id === 'cities');
const fold = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

test('city counts match the extraction: one national capital, 24 governorate capitals, the municipal seats', () => {
  assert.equal(cities.length, report.counts.cities);
  assert.equal(readCSV(path.join(ROOT, 'data/attributes/cities.csv')).length, cities.length);
  for (const t of CITY_TYPES) assert.equal(cities.filter((c) => c.type === t).length, report.per_type[t], t);
  for (const c of cities) assert.ok(CITY_TYPES.includes(c.type), `${c.id} type ${c.type}`);
  assert.equal(cities.filter((c) => c.type === 'national_capital').length, 1);
  // Tunis is the national capital and the capital of its governorate: 1 + 23 points carry the 24 governorate capitals.
  assert.equal(cities.filter((c) => c.type === 'governorate_capital').length, 23);
  // OSM maps 338 of the 350 municipalities; most have a seat node, the rest are listed in the report.
  assert.ok(cities.length >= 250 && cities.length <= 360, `${cities.length} cities`);
  assert.equal(report.counts.municipalities_with_seat + report.counts.municipalities_without_seat, report.counts.municipalities);
  assert.equal(report.no_seat.length, report.counts.municipalities_without_seat);
});

test('Tunis is the national capital, and every governorate has exactly one capital inside it', () => {
  const tunis = cities.find((c) => c.type === 'national_capital');
  assert.equal(tunis.name_fr, 'Tunis');
  assert.equal(tunis.name_ar, 'تونس');
  assert.equal(tunis.capital_of, 'TN TN-11');
  assert.equal(tunis.governorate, 'TN-11');
  const govs = D('governorates');
  for (const g of govs) {
    const caps = cities.filter((c) => c.capital_of.split(' ').includes(g.id));
    assert.equal(caps.length, 1, `${g.id} has one capital`);
    const [c] = caps;
    assert.equal(c.governorate, g.id, `${c.id} lies in the governorate it is the capital of`);
    // The OSM admin_centre agrees with the curated capital of governorates.csv (accents aside).
    assert.equal(fold(c.name_fr), fold(g.capital_fr), `${g.id}: ${c.name_fr} vs ${g.capital_fr}`);
    assert.equal(c.name_ar, g.capital_ar, `${g.id} Arabic name`);
  }
  for (const c of cities.filter((x) => x.type === 'city')) assert.equal(c.capital_of, '', `${c.id} is no capital`);
});

test('city ids are unique and point to their OSM node', () => {
  assert.equal(new Set(cities.map((c) => c.id)).size, cities.length);
  for (const c of cities) {
    assert.match(c.osm, /^node\/\d+$/);
    assert.equal(c.id, `city-n${c.osm.split('/')[1]}`);
    assert.ok(['city', 'town', 'village', 'suburb', 'quarter', 'neighbourhood'].includes(c.place), `${c.id} place ${c.place}`);
  }
});

test('every city has names and a consistent governorate, delegation, sector, region and district', () => {
  const gov = Object.fromEntries(D('governorates').map((g) => [g.id, g]));
  const del = Object.fromEntries(D('delegations').map((d) => [d.id, d]));
  const sec = Object.fromEntries(D('sectors').map((s) => [s.id, s]));
  const mun = Object.fromEntries(D('municipalities').map((m) => [m.id, m]));
  const seats = new Set();
  for (const c of cities) {
    assert.ok(c.name_fr || c.name_ar, `${c.id} is named`);
    if (c.type !== 'city') assert.ok(c.name_fr && c.name_ar && c.name_en, `${c.id}: a capital has all three names`);
    if (c.name_fr) assert.doesNotMatch(c.name_fr, /\p{Script=Arabic}/u, `${c.id} Latin name has no Arabic script`);
    if (c.name_en) assert.doesNotMatch(c.name_en, /\p{Script=Arabic}/u, `${c.id} English name has no Arabic script`);
    if (c.name_ar) {
      assert.match(c.name_ar, /\p{Script=Arabic}/u, `${c.id} Arabic name`);
      assert.doesNotMatch(c.name_ar, /[\p{Bidi_Control}یک]/u, `${c.id} has no Persian look-alikes or stray direction marks`);
    }
    const g = gov[c.governorate];
    assert.ok(g, `${c.id} → ${c.governorate}`);
    assert.equal(c.region, g.region);
    assert.equal(c.district, g.district);
    assert.equal(del[c.delegation]?.governorate, c.governorate, `${c.id} delegation ${c.delegation}`);
    assert.equal(sec[c.sector]?.delegation, c.delegation, `${c.id} sector ${c.sector}`);
    if (c.type === 'city') assert.ok(c.municipality, `${c.id}: a city is published as the seat of a municipality`);
    if (c.municipality) {
      assert.ok(mun[c.municipality], `${c.id} → ${c.municipality}`);
      assert.ok(!seats.has(c.municipality), `${c.municipality} has one seat`);
      seats.add(c.municipality);
    }
    assert.ok(['country_admin_centre', 'governorate_admin_centre', 'municipality_admin_centre', 'name', 'partial_name'].includes(c.seat_source), c.id);
  }
  assert.equal(seats.size, report.counts.municipalities_with_seat);
});

/** Even-odd point-in-polygon test on a GeoJSON (Multi)Polygon. */
function inside([x, y], geometry) {
  let hit = false;
  for (const rings of polygonsOf(geometry)) for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

test('every city falls inside its governorate (full-precision borders)', () => {
  const govs = read('dist/geojson/tunisia-governorates-full.geojson').features;
  for (const c of cities) {
    const at = [Number(c.lon), Number(c.lat)];
    const home = govs.filter((g) => inside(at, g.geometry)).map((g) => g.id);
    assert.deepEqual(home, [c.governorate], `${c.id} (${c.name_fr}) at ${c.lon},${c.lat}`);
  }
});

test('x and y are the position in the shared SVG frame, as project() computes it', () => {
  for (const c of cities) {
    const [x, y] = project([Number(c.lon), Number(c.lat)]);
    assert.ok(Math.abs(x - Number(c.x)) < 0.002 && Math.abs(y - Number(c.y)) < 0.002, `${c.id}: ${c.x},${c.y} vs ${x},${y}`);
  }
});

test('the cities layer is an overlay of points without a nested mode', () => {
  assert.equal(PARTITION.points, true);
  assert.deepEqual(PARTITION.parents, []);
  for (const lod of PARTITION.lods) assert.ok(!modesFor(PARTITION, lod).some((m) => m.id === 'nested'), 'no nested mode');
  assert.throws(() => svgPath('cities', 'medium', 'nested'), /no "nested"/);
  assert.throws(() => svgPath('cities', 'tiny'), /no "tiny"/);
  assert.equal(svgPath('cities', 'medium', 'labeled'), 'dist/svg/cities/tunisia-cities-medium-labeled.svg');
  assert.equal(dataPath('cities', 'low', 'geojson'), 'dist/geojson/tunisia-cities-low.geojson');
});

for (const lod of PARTITION.lods) {
  test(`cities GeoJSON and TopoJSON (${lod})`, () => {
    const decimals = lod === 'full' ? 7 : lod === 'high' ? 6 : 5;
    const byId = Object.fromEntries(cities.map((c) => [c.id, c]));
    const gj = read(`dist/geojson/tunisia-cities-${lod}.geojson`);
    assert.equal(gj.name, `tunisia-cities-${lod}`);
    assert.equal(gj.features.length, cities.length);
    for (const f of gj.features) {
      const c = byId[f.id];
      assert.ok(c, f.id);
      assert.equal(f.properties.id, f.id);
      assert.equal(f.properties.type, c.type);
      assert.equal(f.properties.governorate, c.governorate);
      assert.equal(f.geometry.type, 'Point');
      const [lon, lat] = f.geometry.coordinates;
      assert.ok(Math.abs(lon - c.lon) <= 10 ** -decimals && Math.abs(lat - c.lat) <= 10 ** -decimals, `${f.id} coordinates`);
    }
    const topo = read(`dist/topojson/tunisia-cities-${lod}.topojson`);
    const geoms = topo.objects.cities.geometries;
    assert.equal(geoms.length, cities.length);
    assert.ok(geoms.every((g) => g.type === 'Point'));
    assert.equal(new Set(geoms.map((g) => g.id)).size, geoms.length);
  });
}

test('city SVGs draw the land first, one dot per city, the capital on top, coloured by type', () => {
  const capitals = cities.filter((c) => c.type !== 'city');
  for (const lod of PARTITION.lods) for (const mode of modesFor(PARTITION, lod)) {
    const svg = fs.readFileSync(path.join(ROOT, 'dist/svg/cities', fileName('cities', lod, mode.id)), 'utf8');
    const base = svg.indexOf('<path id="cities-base" class="base"');
    assert.ok(base > 0 && base < svg.indexOf('<g id="cities" class="units"'), `${lod}/${mode.id} land is drawn first`);
    const dots = [...svg.matchAll(/<circle id="([^"]+)" class="unit city ([a-z_]+)(?: c(\d))?" [^>]*data-type="([a-z_]+)"/g)];
    assert.equal(dots.length, cities.length, `${lod}/${mode.id} one dot per city`);
    assert.equal(dots.at(-1)[2], 'national_capital', 'the national capital is drawn last');
    for (const [, id, cls, colour, type] of dots) {
      assert.equal(cls, type, id);
      if (['light', 'dark', 'interactive', 'labeled', 'labeled-ar'].includes(mode.id)) assert.equal(CITY_TYPES[Number(colour)], type, `${id} coloured as ${type}`);
    }
    if (mode.id.startsWith('labeled')) {
      const labelled = new Set([...svg.matchAll(/<text class="label l\d"[^>]*data-for="([^"]+)"/g)].map((m) => m[1]));
      for (const c of capitals) assert.ok(labelled.has(c.id), `${lod}/${mode.id} names ${c.name_fr}`);
      if (lod === 'low') assert.equal(labelled.size, capitals.length, 'the low level names the capitals only');
      else assert.ok(labelled.size > cities.length * 0.6, `${lod}/${mode.id}: ${labelled.size} labels`);
    }
  }
});
