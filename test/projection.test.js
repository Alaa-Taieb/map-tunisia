// The JS projection helper must agree with PROJ (via mapshaper) and with the SVG frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mapshaper from 'mapshaper';
import { project, invert, toUTM, fromUTM, FRAME } from '../src/projection.js';
import { PROJ4 } from '../scripts/build/config.js';

const PLACES = {
  Tunis: [10.1815, 36.8065],
  Bizerte: [9.8739, 37.2744],
  'Cap Bon': [11.0457, 37.0789],
  Djerba: [10.8573, 33.8076],
  Tozeur: [8.1335, 33.9197],
  'Borj El Khadra': [9.4489, 30.2482],
  'Ain Draham': [8.6869, 36.7764],
};

test('toUTM matches PROJ to the millimetre', async () => {
  const fc = { type: 'FeatureCollection', features: Object.entries(PLACES).map(([name, c]) => ({ type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: c } })) };
  const out = await mapshaper.applyCommands(`-i in.json -proj ${PROJ4} -o out.json precision=0.0001`, { 'in.json': JSON.stringify(fc) });
  const res = JSON.parse(out['out.json']);
  for (const f of res.features) {
    const [E, N] = toUTM(PLACES[f.properties.name]);
    const [e, n] = f.geometry.coordinates;
    assert.ok(Math.abs(E - e) < 0.001 && Math.abs(N - n) < 0.001, `${f.properties.name}: ${E},${N} vs ${e},${n}`);
  }
});

test('central meridian / equator reference values', () => {
  const [E, N] = toUTM([9, 0]);
  assert.ok(Math.abs(E - 500000) < 1e-6 && Math.abs(N) < 1e-6);
});

test('inverse round-trips to 1e-9 degrees', () => {
  for (const c of Object.values(PLACES)) {
    const back = fromUTM(toUTM(c));
    assert.ok(Math.abs(back[0] - c[0]) < 1e-9 && Math.abs(back[1] - c[1]) < 1e-9, `${c} → ${back}`);
    const back2 = invert(project(c));
    assert.ok(Math.abs(back2[0] - c[0]) < 1e-9 && Math.abs(back2[1] - c[1]) < 1e-9);
  }
});

test('every place in Tunisia projects inside the SVG frame', () => {
  for (const [name, c] of Object.entries(PLACES)) {
    const [x, y] = project(c);
    assert.ok(x > 0 && x < FRAME.width && y > 0 && y < FRAME.height, `${name} → ${x},${y}`);
  }
});
