#!/usr/bin/env node
/**
 * Build every map in dist/ from data/source + data/attributes.
 *
 *   node scripts/build/build.js [--only governorates,delegations] [--lods medium,low]
 *
 * For each partition: dissolve the nested sector layer at full precision (municipalities,
 * which do not nest, and the water overlay come from their own source layers drawn over the land;
 * the cities are points, drawn over the land and the governorate borders),
 * project to UTM 32N, simplify per level of detail (topology-aware, mapshaper),
 * then write SVG (all modes), GeoJSON + TopoJSON (WGS84) and attribute tables.
 */
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';
import polylabel from 'polylabel';
import { LODS, PARTITIONS, MODES, PROJ4, CRS, PROJECT, FRAME_PADDING_KM, modesFor, fileName, PALETTES, WATER_TYPES, CITY_TYPES, CITY_STYLE, LABEL_MODES, CHAR_W } from './config.js';
import { ROOT, readCSV, toCSV, writeFile, polygonsOf, polygonArea, ringArea, formatBytes } from './lib.js';
import { renderSVG, renderPointSVG } from './svg.js';
import { withNames } from './names.js';
import { fromUTM, toUTM } from '../../src/utm.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1].split(',') : null;
};
const ONLY = opt('only');
const ONLY_LODS = opt('lods');

const DIST = path.join(ROOT, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/source/extract-report.json'), 'utf8'));
const SOURCE = { osm_date: report.source.osm_date, version: pkg.version };

// ------------------------------------------------------------------ attributes
// Every record gets its Tifinagh and English names (scripts/build/names.js): the Tamazight name from OSM where there
// is one (data/source/tifinagh-names.json), and an English transliteration of the English name for the country,
// regions, districts and governorates, of the name the `labeled` mode shows for the other layers.
const TIFINAGH_OSM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/source/tifinagh-names.json'), 'utf8')).names;
const A = (f, latin = (r) => r.label_latin || r.name_fr) => readCSV(path.join(ROOT, 'data/attributes', f)).map((r) => withNames(r, latin(r), TIFINAGH_OSM));
const english = (r) => r.name_en;
const govRows = A('governorates.csv', english);
const regionRows = A('regions.csv', english);
const districtRows = A('districts.csv', english);
const delRows = A('delegations.csv');
const secRows = A('sectors.csv');
const munRows = A('municipalities.csv');
const waterRows = A('water.csv');
const cityRows = A('cities.csv');
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
const GOV = byId(govRows), REG = byId(regionRows), DIS = byId(districtRows), DEL = byId(delRows), SEC = byId(secRows), MUN = byId(munRows);
const WAT = byId(waterRows), CIT = byId(cityRows);

const sumPop = (ids, year) => ids.reduce((s, g) => s + Number(GOV[g][`population_${year}`]), 0);
const ALL_GOVS = govRows.map((g) => g.id);
const COUNTRY = withNames({
  id: 'TN', iso_3166_1: 'TN', name_en: 'Tunisia', name_fr: 'Tunisie', name_ar: 'تونس', label_latin: 'Tunisie',
  population_2014: sumPop(ALL_GOVS, 2014), population_2024: sumPop(ALL_GOVS, 2024),
}, 'Tunisia', TIFINAGH_OSM);
for (const r of [...regionRows, ...districtRows]) {
  const ids = r.governorates.split(' ');
  r.population_2014 = sumPop(ids, 2014);
  r.population_2024 = sumPop(ids, 2024);
}

/** Attribute record for a unit of a partition, normalised to a common shape. */
function attributes(partition, id) {
  switch (partition) {
    case 'country': return { ...COUNTRY };
    case 'regions': return { ...REG[id] };
    case 'districts': return { ...DIS[id], label_latin: DIS[id].name_en };
    case 'governorates': return { ...GOV[id] };
    case 'delegations': {
      const d = DEL[id];
      const g = GOV[d.governorate];
      return { ...d, region: g.region, district: g.district };
    }
    case 'sectors': {
      const s = SEC[id];
      const g = GOV[s.governorate];
      return { ...s, region: g.region, district: g.district };
    }
    case 'municipalities': {
      const m = MUN[id];
      const g = GOV[m.governorate];
      return { ...m, region: g.region, district: g.district };
    }
    case 'water': {
      const w = WAT[id];
      const g = GOV[w.governorate];
      return { ...w, region: g.region, district: g.district };
    }
    case 'cities': {
      const c = CIT[id];
      const g = GOV[c.governorate];
      return { ...c, region: g.region, district: g.district };
    }
  }
  throw new Error(partition);
}

// ------------------------------------------------------------------ source
console.log('Loading source …');
const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/source/tunisia-sectors.geojson'), 'utf8'));
for (const f of source.features) {
  const g = GOV[f.properties.governorate];
  if (!g) throw new Error(`unknown governorate ${f.properties.governorate}`);
  if (!DEL[f.properties.delegation]) throw new Error(`unknown delegation ${f.properties.delegation}`);
  if (!SEC[f.properties.sector]) throw new Error(`unknown sector ${f.properties.sector}`);
  Object.assign(f.properties, { country: 'TN', region: g.region, district: g.district });
}
const SRC = JSON.stringify(source);

async function ms(cmd, inputs) {
  return mapshaper.applyCommands(cmd, inputs);
}

// Municipalities and water: their own layers plus one `LAND` feature (the exact union of the sectors).
// Both are simplified together, so the units and the land under them share one topology.
const LAND = '__land';
const land = JSON.parse((await ms('-i src.json -dissolve country -o land.json format=geojson geojson-type=FeatureCollection precision=0.0000001', { 'src.json': SRC }))['land.json']);
function overlay(file, key, rows) {
  const fc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/source', file), 'utf8'));
  for (const f of fc.features) {
    const g = GOV[f.properties.governorate];
    if (!g) throw new Error(`unknown governorate ${f.properties.governorate}`);
    if (!rows[f.properties[key]]) throw new Error(`unknown ${key} ${f.properties[key]}`);
    Object.assign(f.properties, { country: 'TN', region: g.region, district: g.district });
  }
  fc.features.push({ type: 'Feature', properties: { [key]: LAND, country: 'TN' }, geometry: land.features[0].geometry });
  return JSON.stringify(fc);
}
const SOURCES = {
  sectors: SRC,
  municipalities: overlay('tunisia-municipalities.geojson', 'municipality', MUN),
  water: overlay('tunisia-water.geojson', 'water', WAT),
};

// ------------------------------------------------------------------ frame
console.log('Computing the shared frame …');
const countryFull = JSON.parse((await ms(`-i src.json -dissolve country -proj ${PROJ4} -o c.json format=geojson geojson-type=FeatureCollection precision=0.001`, { 'src.json': SRC }))['c.json']);
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const rings of polygonsOf(countryFull.features[0].geometry)) for (const [x, y] of rings[0]) {
  minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
}
const FRAME = {
  x0: Math.floor(minX / 1000 - FRAME_PADDING_KM),
  y0: Math.ceil(maxY / 1000 + FRAME_PADDING_KM),
};
FRAME.width = Math.ceil(maxX / 1000 + FRAME_PADDING_KM) - FRAME.x0;
FRAME.height = FRAME.y0 - Math.floor(minY / 1000 - FRAME_PADDING_KM);
writeFile(
  path.join(ROOT, 'src/frame.js'),
  `// Generated by scripts/build/build.js — the shared frame of every Map Tunisia SVG (kilometres, UTM 32N).\n` +
    `export default ${JSON.stringify(FRAME)};\n`,
);
console.log('  frame', FRAME);

const toFrame = (geometry) => {
  const tx = ([x, y]) => [x / 1000 - FRAME.x0, FRAME.y0 - y / 1000];
  if (geometry.type === 'Polygon') return { type: 'Polygon', coordinates: geometry.coordinates.map((r) => r.map(tx)) };
  if (geometry.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: geometry.coordinates.map((p) => p.map((r) => r.map(tx))) };
  if (geometry.type === 'LineString') return { type: 'LineString', coordinates: geometry.coordinates.map(tx) };
  if (geometry.type === 'MultiLineString') return { type: 'MultiLineString', coordinates: geometry.coordinates.map((l) => l.map(tx)) };
  throw new Error(geometry.type);
};

/** Drop secondary island parts smaller than `minKm2`; the largest part of each feature is always kept. */
function dropIslands(geometry, minKm2) {
  if (!minKm2 || geometry.type !== 'MultiPolygon') return geometry;
  const parts = geometry.coordinates.map((p) => ({ p, a: polygonArea(p) / 1e6 }));
  const maxA = Math.max(...parts.map((x) => x.a));
  const kept = parts.filter((x) => x.a >= minKm2 || x.a === maxA).map((x) => x.p);
  return kept.length === 1 ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept };
}

/**
 * Ellipsoidal area (km²) from UTM coordinates. The transverse Mercator scale factor
 * k(x) ≈ k0·(1 + x²/2R²) inflates areas by k²; by Green's theorem the true area is
 * ∮ F(x) dy with F(x) = ∫ dx / k(x)². Evaluated edge by edge, the result is exactly
 * additive: shared borders cancel, so child areas always sum to their parent's area.
 */
const R2 = 6.3675e6 ** 2; // mean radius of curvature at Tunisian latitudes, squared
const F = (E) => { const x = E - 500000; return (x - (x * x * x) / (3 * R2)) / (0.9996 * 0.9996); };
function trueAreaKm2(geometry) {
  let total = 0;
  for (const rings of polygonsOf(geometry)) for (const ring of rings) {
    let s = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += ((F(ring[i][0]) + F(ring[j][0])) / 2) * (ring[i][1] - ring[j][1]);
    total += s; // outer rings and holes have opposite orientation, so holes subtract themselves
  }
  return Math.abs(total) / 1e6;
}

// ------------------------------------------------------------------ colouring
/** Greedy graph colouring on shared borders so that neighbours never share a colour. */
function colourUnits(features, k) {
  const owners = new Map();
  features.forEach((f, idx) => {
    for (const rings of polygonsOf(f.geometry)) for (const ring of rings) for (const [x, y] of ring) {
      const key = `${Math.round(x)},${Math.round(y)}`;
      let s = owners.get(key);
      if (!s) owners.set(key, (s = new Set()));
      s.add(idx);
    }
  });
  const shared = features.map(() => new Map());
  for (const s of owners.values()) {
    if (s.size < 2) continue;
    for (const a of s) for (const b of s) if (a !== b) shared[a].set(b, (shared[a].get(b) || 0) + 1);
  }
  const adj = shared.map((m) => [...m].filter(([, n]) => n >= 2).map(([b]) => b));
  const order = features.map((_, i) => i).sort((a, b) => adj[b].length - adj[a].length || a - b);
  const colour = new Array(features.length).fill(-1);
  const used = new Array(k).fill(0);
  for (const i of order) {
    const taken = new Set(adj[i].map((j) => colour[j]));
    let best = -1;
    for (let c = 0; c < k; c++) if (!taken.has(c) && (best < 0 || used[c] < used[best])) best = c;
    if (best < 0) best = features.length % k;
    colour[i] = best;
    used[best]++;
  }
  const conflicts = adj.reduce((s, a, i) => s + a.filter((j) => colour[j] === colour[i]).length, 0) / 2;
  return { colour, conflicts, adjacency: adj };
}

// ------------------------------------------------------------------ labels

/** Pole of inaccessibility of the largest part and a font size that fits the unit. */
function labelAnchor(partition, geometry, text, script) {
  const parts = polygonsOf(geometry).map((p) => ({ p, a: polygonArea(p) }));
  parts.sort((a, b) => b.a - a.a);
  const pt = polylabel(parts[0].p, 0.05);
  const r = pt.distance; // radius of the largest inscribed circle, km
  const [minS, maxS] = partition.labelSize;
  const len = Math.max(3, [...(text || 'xxx')].length);
  const fit = Math.min((2.7 * r) / (CHAR_W[script] * len), 1.4 * r);
  return { ax: pt[0], ay: pt[1], x: pt[0], y: pt[1], size: Math.max(minS, Math.min(maxS, fit)), fitSize: fit, fits: fit >= minS, len, script };
}

const boxOf = (l) => {
  const w = l.size * CHAR_W[l.script] * l.len, h = l.size * 1.15;
  return [l.x - w / 2, l.y - h / 2, l.x + w / 2, l.y + h / 2];
};
const hit = (a, b, pad) => a[0] - pad < b[2] && b[0] - pad < a[2] && a[1] - pad < b[3] && b[1] - pad < a[3];

function pointInGeometry(x, y, geometry) {
  let inside = false;
  for (const rings of polygonsOf(geometry)) for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
const boxPoints = (b) => {
  const pts = [];
  for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) pts.push([b[0] + (b[2] - b[0]) * fx, b[1] + (b[3] - b[1]) * fy]);
  return pts;
};

/**
 * Greedy label layout, biggest first:
 *   1. natural position (pole of inaccessibility);
 *   2. shrink (down to the partition minimum);
 *   3. nudge, staying inside the unit's own polygon;
 *   4. partitions with `displace`: callout outside the land (usually in the sea) with a leader line;
 *   5. otherwise keep the smallest size at the anchor.
 */
function layoutLabels(partition, labels, geoms) {
  const placed = [];
  const [minS] = partition.labelSize;
  const ids = Object.keys(labels).sort((a, b) => labels[b].size - labels[a].size);
  const allGeoms = Object.entries(geoms);
  const free = (bx, pad) => !placed.some((p) => hit(bx, p, pad));
  for (const id of ids) {
    const l = labels[id];
    const own = geoms[id];
    const pad = l.size * 0.12;
    const inOwn = (bx) => boxPoints(bx).every(([x, y]) => pointInGeometry(x, y, own));
    const tryAt = (x, y, size) => {
      const c = { ...l, x, y, size };
      return [c, boxOf(c)];
    };
    let chosen = null;
    // Units that almost fit keep their label inside at up to 15% below the minimum size.
    if (!l.fits && partition.displace && l.fitSize >= minS * 0.85) {
      const [c, bx] = tryAt(l.ax, l.ay, Math.max(l.fitSize, minS * 0.85));
      if (free(bx, pad)) chosen = [c, bx];
    }
    if (!chosen && (l.fits || !partition.displace)) {
      for (let size = l.size; !chosen && size >= Math.min(minS, l.size) - 1e-9; size *= 0.88) {
        const [c, bx] = tryAt(l.ax, l.ay, size);
        if (free(bx, pad)) chosen = [c, bx];
      }
      for (let k = 1; !chosen && k <= 4; k++) {
        for (let a = 0; !chosen && a < 16; a++) {
          const ang = (a / 16) * 2 * Math.PI;
          const [c, bx] = tryAt(l.ax + Math.cos(ang) * l.size * 0.6 * k, l.ay + Math.sin(ang) * l.size * 0.45 * k, Math.max(minS, l.size * 0.88));
          if (free(bx, pad) && inOwn(bx)) chosen = [c, bx];
        }
      }
    }
    if (!chosen && partition.displace) {
      const size = Math.max(minS, l.size);
      const onLand = (x, y) => allGeoms.some(([, g]) => pointInGeometry(x, y, g));
      for (let k = 1.5; !chosen && k <= 12; k += 0.75) {
        for (let a = 0; !chosen && a < 24; a++) {
          const ang = (a / 24) * 2 * Math.PI;
          const w = size * CHAR_W[l.script] * l.len;
          const [c, bx] = tryAt(l.ax + Math.cos(ang) * (w / 2 + size * k * 0.5), l.ay + Math.sin(ang) * size * k, size);
          if (bx[0] < 0 || bx[1] < 0 || bx[2] > FRAME.width || bx[3] > FRAME.height) continue;
          if (!free(bx, pad)) continue;
          if (boxPoints(bx).some(([x, y]) => onLand(x, y))) continue;
          chosen = [{ ...c, leader: true }, bx];
        }
      }
    }
    if (!chosen) chosen = tryAt(l.ax, l.ay, Math.min(minS, l.size));
    Object.assign(l, chosen[0]);
    placed.push(chosen[1]);
  }
  return labels;
}

// ------------------------------------------------------------------ point layers (cities)
const PLACE_RANK = ['city', 'town', 'village', 'suburb', 'quarter', 'neighbourhood'];

/**
 * Greedy point-label layout, capitals first, then cities by OSM place rank. Each label tries eight positions around
 * its dot (right, left, above, below, then the diagonals) and takes the first that overlaps no dot and no label.
 * A capital then tries the same positions twice and three times as far, with a leader line, and as a last resort
 * keeps the right-hand one; another city goes unlabelled.
 */
function layoutPointLabels(points, mode, lodId) {
  const { script, text: name } = LABEL_MODES[mode];
  const placed = points.map((u) => {
    const r = CITY_STYLE[u.attrs.type].r;
    return [u.x - r, u.y - r, u.x + r, u.y + r];
  });
  const labels = {};
  for (const u of points) {
    const style = CITY_STYLE[u.attrs.type];
    if (!style.lods.includes(lodId)) continue;
    const text = name(u.attrs);
    if (!text) continue;
    const size = style.label;
    const w = size * CHAR_W[script] * [...text].length, h = size * 1.15;
    const spots = [];
    // Capitals may move out to three times the distance, with a leader line back to the dot; other cities stay next to theirs.
    for (const k of u.attrs.type === 'city' ? [1] : [1, 2, 3]) {
      const g = (style.r + size * 0.25) * k;
      const d = g * Math.SQRT1_2;
      spots.push(
        [u.x + g + w / 2, u.y], [u.x - g - w / 2, u.y], [u.x, u.y - g - h / 2], [u.x, u.y + g + h / 2],
        [u.x + d + w / 2, u.y - d - h / 2], [u.x - d - w / 2, u.y - d - h / 2], [u.x + d + w / 2, u.y + d + h / 2], [u.x - d - w / 2, u.y + d + h / 2],
      );
    }
    const box = ([x, y]) => [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
    const inFrame = (b) => b[0] >= 0 && b[1] >= 0 && b[2] <= FRAME.width && b[3] <= FRAME.height;
    let i = spots.findIndex((s) => inFrame(box(s)) && !placed.some((p) => hit(box(s), p, 0)));
    if (i < 0 && u.attrs.type === 'city') continue;
    if (i < 0) i = 0;
    const at = spots[i];
    placed.push(box(at));
    labels[u.id] = { x: at[0], y: at[1], size, text, w, h, leader: i >= 8 };
  }
  return labels;
}

/** Build a point layer: attribute table, SVG (land and governorate borders underneath), GeoJSON and TopoJSON per level of detail. */
async function buildPoints(partition) {
  const t0 = Date.now();
  const key = partition.key;
  const fc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/source/tunisia-cities.geojson'), 'utf8'));
  const ids = new Set(fc.features.map((f) => f.properties[key]));
  for (const f of fc.features) {
    const c = CIT[f.properties[key]];
    if (!c) throw new Error(`unknown ${key} ${f.properties[key]}`);
    if (!GOV[c.governorate] || f.properties.governorate !== c.governorate) throw new Error(`${c.id}: governorate ${f.properties.governorate}`);
    if (!CITY_TYPES.includes(c.type)) throw new Error(`${c.id}: type ${c.type}`);
  }
  for (const r of cityRows) if (!ids.has(r.id)) throw new Error(`${r.id} is in cities.csv but not in tunisia-cities.geojson`);

  // Drawing order: other cities, then governorate capitals, the national capital last (on top).
  const order = (a, b) => CITY_TYPES.indexOf(b.type) - CITY_TYPES.indexOf(a.type) || (a.id < b.id ? -1 : 1);
  const points = cityRows.map((r) => attributes(partition.id, r.id)).sort(order).map((at) => {
    const [E, N] = toUTM([Number(at.lon), Number(at.lat)]);
    return { id: at.id, attrs: at, x: E / 1000 - FRAME.x0, y: FRAME.y0 - N / 1000 };
  });
  const priority = [...points].sort((a, b) => CITY_TYPES.indexOf(a.attrs.type) - CITY_TYPES.indexOf(b.attrs.type) ||
    PLACE_RANK.indexOf(a.attrs.place) - PLACE_RANK.indexOf(b.attrs.place) || (a.id < b.id ? -1 : 1));

  // ---- attribute table
  const rows = points.map((u) => ({ ...u.attrs, x: u.x.toFixed(3), y: u.y.toFixed(3) })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const columns = ['id', 'type', 'capital_of', 'governorate', 'region', 'district', 'delegation', 'sector', 'municipality', 'name_en', 'name_fr', 'name_ar',
    'name_tfng', 'name_tfng_source', 'name_translit', 'lon', 'lat', 'x', 'y', 'place', 'seat_source', 'wikidata', 'osm'];
  writeFile(path.join(DIST, 'data', `${partition.id}.csv`), toCSV(rows, columns));
  writeFile(path.join(DIST, 'data', `${partition.id}.json`), JSON.stringify(rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]]))), null, 1) + '\n');
  const pinfo = { id: partition.id, title: partition.title, count: rows.length, lods: [] };

  // ---- the land and the governorate borders underneath, simplified like the other layers
  const base = (await ms(`-i src.json name=units -dissolve governorate copy-fields=country -proj ${PROJ4} -o base.json format=geojson geojson-type=FeatureCollection precision=0.001`, { 'src.json': SRC }))['base.json'];
  for (const lod of LODS.filter((l) => partition.lods.includes(l.id))) {
    if (ONLY_LODS && !ONLY_LODS.includes(lod.id)) continue;
    const o = 'format=geojson geojson-type=FeatureCollection precision=0.001';
    let cmd = `-i base.json name=units -innerlines target=units + name=borders -dissolve country target=units + name=land `;
    if (lod.interval) cmd += `-simplify target=units interval=${lod.interval} keep-shapes planar `;
    cmd += `-o target=borders borders.json ${o} -o target=land land.json ${o}`;
    const out = await ms(cmd, { 'base.json': base });
    const land = toFrame(dropIslands(JSON.parse(out['land.json']).features[0].geometry, lod.minIsland));
    const borders = JSON.parse(out['borders.json']).features.map((f) => toFrame(f.geometry));
    const labels = Object.fromEntries(Object.keys(LABEL_MODES).map((m) => [m, layoutPointLabels(priority, m, lod.id)]));
    const drawn = points.map((u) => ({ ...u, labels: Object.fromEntries(Object.keys(LABEL_MODES).map((m) => [m, labels[m][u.id]])) }));
    const lodInfo = { id: lod.id, files: [] };

    for (const mode of modesFor(partition, lod.id)) {
      const svg = renderPointSVG({ partition, lod, mode: mode.id, frame: FRAME, points: drawn, land, borders, source: SOURCE });
      const rel = `svg/${partition.id}/${fileName(partition.id, lod.id, mode.id)}`;
      writeFile(path.join(DIST, rel), svg);
      const bytes = Buffer.byteLength(svg);
      totals.svg += bytes;
      manifest.files.push({ path: `dist/${rel}`, type: 'svg', partition: partition.id, lod: lod.id, mode: mode.id, bytes });
      lodInfo.files.push(rel);
    }

    // GeoJSON / TopoJSON points in WGS84, rounded like the polygons of the same level of detail.
    const decimals = lod.id === 'full' ? 7 : lod.id === 'high' ? 6 : 5;
    const r = (v) => Math.round(Number(v) * 10 ** decimals) / 10 ** decimals;
    const features = rows.map((row) => {
      const props = Object.fromEntries(columns.filter((c) => !['lon', 'lat', 'x', 'y'].includes(c)).map((c) => [c, row[c]]));
      return { type: 'Feature', id: row.id, properties: props, geometry: { type: 'Point', coordinates: [r(row.lon), r(row.lat)] } };
    });
    const gj = { type: 'FeatureCollection', name: `tunisia-${partition.id}-${lod.id}`, crs_note: 'WGS84 (EPSG:4326)', attribution: `${PROJECT.attribution} (ODbL). ${PROJECT.repo}`, features };
    const gjText = JSON.stringify(gj);
    const gjRel = `geojson/tunisia-${partition.id}-${lod.id}.geojson`;
    writeFile(path.join(DIST, gjRel), gjText);
    totals.geojson += gjText.length;
    manifest.files.push({ path: `dist/${gjRel}`, type: 'geojson', partition: partition.id, lod: lod.id, bytes: Buffer.byteLength(gjText) });

    const q = lod.id === 'full' ? 1e6 : 1e5;
    const tjText = (await ms(`-i in.json name=${partition.id} -o out.topojson format=topojson quantization=${q} id-field=id`, { 'in.json': gjText }))['out.topojson'];
    const tjRel = `topojson/tunisia-${partition.id}-${lod.id}.topojson`;
    writeFile(path.join(DIST, tjRel), tjText);
    totals.topojson += tjText.length;
    manifest.files.push({ path: `dist/${tjRel}`, type: 'topojson', partition: partition.id, lod: lod.id, bytes: Buffer.byteLength(tjText) });
    pinfo.lods.push(lodInfo);
  }
  manifest.partitions.push(pinfo);
  const labelled = Object.keys(layoutPointLabels(priority, 'labeled', 'medium')).length;
  console.log(`${partition.id}: ${rows.length} points, ${labelled} labelled at medium`);
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ------------------------------------------------------------------ main loop
const manifest = { name: PROJECT.name, version: pkg.version, osm_date: SOURCE.osm_date, crs: CRS, frame: FRAME, partitions: [], files: [] };
const totals = { svg: 0, geojson: 0, topojson: 0 };

fs.rmSync(path.join(DIST, 'svg'), { recursive: true, force: true });
fs.rmSync(path.join(DIST, 'geojson'), { recursive: true, force: true });
fs.rmSync(path.join(DIST, 'topojson'), { recursive: true, force: true });

for (const partition of PARTITIONS) {
  if (ONLY && !ONLY.includes(partition.id)) continue;
  if (partition.points) {
    await buildPoints(partition);
    continue;
  }
  const t0 = Date.now();
  const key = partition.key;
  const copy = ['delegation', 'governorate', 'region', 'district', 'country'].filter((f) => f !== key && levelBelow(f, key));
  const dissolve = partition.id === 'sectors' || partition.source ? '' : `-dissolve ${key}${copy.length ? ` copy-fields=${copy.join(',')}` : ''}`;
  const parents = partition.parents;

  let colours = null, labels = null, areas = null;
  const pinfo = { id: partition.id, title: partition.title, count: 0, lods: [] };

  // Process LODs from full to tiny; labels/colours come from the medium geometry.
  const lodOrder = [...LODS].filter((l) => partition.lods.includes(l.id));
  const medium = lodOrder.find((l) => l.id === 'medium');
  const runOrder = [medium, ...lodOrder.filter((l) => l !== medium), ].filter(Boolean);

  // Stage 1: dissolve + project once at full precision. Re-importing the result rebuilds the
  // topology from scratch, so only nodes where units of *this* partition meet stay fixed.
  const src = SOURCES[partition.source || 'sectors'];
  const base = (await ms(`-i src.json name=units ${dissolve} -proj ${PROJ4} -o base.json format=geojson geojson-type=FeatureCollection precision=0.001`, { 'src.json': src }))['base.json'];

  const results = {};
  for (const lod of runOrder) {
    // Derived border layers are created before simplifying so that every layer shares
    // one simplified topology (borders line up exactly with the unit fills).
    let cmd = `-i base.json name=units `;
    for (const h of parents) cmd += `-dissolve ${h} target=units + name=p_${h} -innerlines target=p_${h} + name=l_${h} `;
    // The coastline: the land feature alone where units reach into the sea (lagoons), else the union of the units.
    cmd += partition.landOutline
      ? `-filter "${key} === '${LAND}'" target=units + name=outline -dissolve country target=outline `
      : `-dissolve country target=units + name=outline `;
    if (lod.interval) cmd += `-simplify target=units interval=${lod.interval} keep-shapes planar `;
    const o = 'format=geojson geojson-type=FeatureCollection precision=0.001';
    cmd += `-o target=units units.json ${o} `;
    for (const h of parents) cmd += `-o target=l_${h} l_${h}.json ${o} `;
    cmd += `-o target=outline outline.json ${o}`;
    const out = await ms(cmd, { 'base.json': base });
    const units = JSON.parse(out['units.json']).features.filter((f) => f.properties[key] !== LAND);
    const borders = parents.flatMap((h) => JSON.parse(out[`l_${h}.json`]).features.map((f) => ({ level: h, geometry: f.geometry })));
    const outline = JSON.parse(out['outline.json']).features[0].geometry;
    results[lod.id] = { units, borders, outline };
  }

  // Areas from the full-precision geometry, colours and label points from medium (or best available).
  const ref = results.medium || results[lodOrder[0].id];
  units_sorted(ref.units, key);
  if (results.full) {
    areas = Object.fromEntries(results.full.units.map((f) => [f.properties[key], trueAreaKm2(f.geometry)]));
  }
  const col = colourUnits(ref.units, PALETTES.light.length);
  colours = partition.colourBy === 'type'
    ? Object.fromEntries(ref.units.map((f) => [f.properties[key], WATER_TYPES.indexOf(attributes(partition.id, f.properties[key]).type)]))
    : Object.fromEntries(ref.units.map((f, i) => [f.properties[key], col.colour[i]]));
  labels = Object.fromEntries(Object.keys(LABEL_MODES).map((m) => [m, {}]));
  const frameGeoms = {};
  for (const f of ref.units) {
    const id = f.properties[key];
    const at = attributes(partition.id, id);
    const fg = toFrame(f.geometry);
    frameGeoms[id] = fg;
    for (const [m, { text, script }] of Object.entries(LABEL_MODES)) labels[m][id] = labelAnchor(partition, fg, text(at), script);
  }
  for (const m of Object.keys(LABEL_MODES)) layoutLabels(partition, labels[m], frameGeoms);
  console.log(`${partition.id}: ${ref.units.length} units, colour conflicts ${col.conflicts}`);

  // ---- attribute table (once per partition)
  const rows = ref.units.map((f) => {
    const id = f.properties[key];
    const at = attributes(partition.id, id);
    const l = labels.labeled[id];
    const [lon, lat] = fromUTM([(l.ax + FRAME.x0) * 1000, (FRAME.y0 - l.ay) * 1000]);
    return { id: partition.id === 'country' ? 'TN' : id, ...at, area_km2: areas ? areas[id].toFixed(2) : '', label_lon: lon.toFixed(5), label_lat: lat.toFixed(5), label_x: l.ax.toFixed(2), label_y: l.ay.toFixed(2) };
  });
  rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => !['label_latin', 'reason'].includes(c));
  writeFile(path.join(DIST, 'data', `${partition.id}.csv`), toCSV(rows, columns));
  writeFile(path.join(DIST, 'data', `${partition.id}.json`), JSON.stringify(rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]]))), null, 1) + '\n');
  pinfo.count = rows.length;

  // ---- per LOD outputs
  for (const lod of lodOrder) {
    if (ONLY_LODS && !ONLY_LODS.includes(lod.id)) continue;
    const { units, borders, outline } = results[lod.id];
    units_sorted(units, key);
    const unitsOut = units.map((f) => {
      const id = f.properties[key];
      const geometry = dropIslands(f.geometry, lod.minIsland);
      return { id: partition.id === 'country' ? 'TN' : id, rawId: id, attrs: attributes(partition.id, id), utm: geometry, geometry: toFrame(geometry), color: colours[id], labels: Object.fromEntries(Object.keys(LABEL_MODES).map((m) => [m, labels[m][id]])) };
    });
    const outlineGeom = toFrame(dropIslands(outline, lod.minIsland));
    const borderGeoms = borders.map((b) => ({ level: b.level, geometry: toFrame(b.geometry) }));
    const lodInfo = { id: lod.id, files: [] };

    for (const mode of modesFor(partition, lod.id)) {
      const svg = renderSVG({ partition, lod, mode: mode.id, frame: FRAME, units: unitsOut, borders: borderGeoms, outline: outlineGeom, base: partition.base ? outlineGeom : null, source: SOURCE });
      const rel = `svg/${partition.id}/${fileName(partition.id, lod.id, mode.id)}`;
      writeFile(path.join(DIST, rel), svg);
      const bytes = Buffer.byteLength(svg);
      totals.svg += bytes;
      manifest.files.push({ path: `dist/${rel}`, type: 'svg', partition: partition.id, lod: lod.id, mode: mode.id, bytes });
      lodInfo.files.push(rel);
    }

    // GeoJSON / TopoJSON in WGS84 with full attributes.
    const decimals = lod.id === 'full' ? 7 : lod.id === 'high' ? 6 : 5;
    const r = (v) => Math.round(v * 10 ** decimals) / 10 ** decimals;
    const inv = (ring) => ring.map((p) => fromUTM(p).map(r));
    const features = unitsOut.map((u) => {
      const g = u.utm;
      const coordinates = g.type === 'Polygon' ? g.coordinates.map(inv) : g.coordinates.map((p) => p.map(inv));
      const props = { id: u.id, ...Object.fromEntries(Object.entries(u.attrs).filter(([k]) => !['id', 'label_latin', 'reason'].includes(k))) };
      if (areas) props.area_km2 = Number(areas[u.rawId].toFixed(2));
      return { type: 'Feature', id: u.id, properties: props, geometry: { type: g.type, coordinates } };
    });
    const fc = { type: 'FeatureCollection', name: `tunisia-${partition.id}-${lod.id}`, crs_note: 'WGS84 (EPSG:4326)', attribution: `${PROJECT.attribution} (ODbL). ${PROJECT.repo}`, features };
    const gjText = JSON.stringify(fc);
    const gjRel = `geojson/tunisia-${partition.id}-${lod.id}.geojson`;
    writeFile(path.join(DIST, gjRel), gjText);
    totals.geojson += gjText.length;
    manifest.files.push({ path: `dist/${gjRel}`, type: 'geojson', partition: partition.id, lod: lod.id, bytes: Buffer.byteLength(gjText) });

    const q = lod.id === 'full' ? 1e6 : 1e5;
    const topo = await ms(`-i in.json name=${partition.id} -o out.topojson format=topojson quantization=${q} id-field=id`, { 'in.json': gjText });
    const tjText = topo['out.topojson'];
    const tjRel = `topojson/tunisia-${partition.id}-${lod.id}.topojson`;
    writeFile(path.join(DIST, tjRel), tjText);
    totals.topojson += tjText.length;
    manifest.files.push({ path: `dist/${tjRel}`, type: 'topojson', partition: partition.id, lod: lod.id, bytes: Buffer.byteLength(tjText) });
    pinfo.lods.push(lodInfo);
  }
  manifest.partitions.push(pinfo);
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function units_sorted(units, key) {
  units.sort((a, b) => (String(a.properties[key]) < String(b.properties[key]) ? -1 : 1));
}

function levelBelow(field, key) {
  // fields that are strictly coarser than `key` can be copied after dissolving by `key`
  const order = ['sector', 'delegation', 'governorate', 'region', 'district', 'country'];
  if (key === 'region') return field === 'country';
  if (key === 'district') return field === 'country';
  return order.indexOf(field) > order.indexOf(key);
}

if (!ONLY && !ONLY_LODS) {
  writeFile(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  const catalog = {
    osmDate: SOURCE.osm_date,
    partitions: PARTITIONS.map((p) => ({ id: p.id, title: p.title, titleAr: p.titleAr, count: manifest.partitions.find((x) => x.id === p.id)?.count, lods: p.lods })),
    lods: LODS.map(({ id, interval, use }) => ({ id, toleranceMeters: interval, use })),
    modes: MODES.map(({ id, title, description }) => ({ id, title, description })),
    files: Object.fromEntries(PARTITIONS.map((p) => [p.id, Object.fromEntries(p.lods.map((l) => [l, modesFor(p, l).map((m) => m.id)]))])),
  };
  writeFile(
    path.join(ROOT, 'src/catalog.js'),
    `// Generated by scripts/build/build.js — what exists in dist/. Do not edit.\nexport default ${JSON.stringify(catalog, null, 2)};\n`,
  );
}
console.log(`SVG ${formatBytes(totals.svg)} · GeoJSON ${formatBytes(totals.geojson)} · TopoJSON ${formatBytes(totals.topojson)} · ${manifest.files.length} files`);
