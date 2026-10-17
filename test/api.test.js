// Public JS API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svgPath, dataPath, cdnURL, fileURL, catalog, project } from '../src/index.js';

test('svgPath resolves to existing files for the whole catalog', () => {
  for (const [p, lods] of Object.entries(catalog.files)) {
    for (const [lod, modes] of Object.entries(lods)) {
      for (const m of modes) assert.ok(fs.existsSync(fileURLToPath(fileURL(svgPath(p, lod, m)))), `${p}/${lod}/${m}`);
      assert.ok(fs.existsSync(fileURLToPath(fileURL(dataPath(p, lod, 'geojson')))));
      assert.ok(fs.existsSync(fileURLToPath(fileURL(dataPath(p, lod, 'topojson')))));
    }
  }
});

test('helpful errors for unknown combinations', () => {
  assert.throws(() => svgPath('provinces'), /Unknown partition/);
  assert.throws(() => svgPath('sectors', 'tiny'), /no "tiny"/);
  assert.throws(() => svgPath('country', 'medium', 'nested'), /no "nested"/);
});

test('defaults and CDN URLs', () => {
  assert.equal(svgPath('governorates'), 'dist/svg/governorates/tunisia-governorates-medium-plain.svg');
  assert.equal(cdnURL(svgPath('governorates'), 'v1.0.0'), 'https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.0.0/dist/svg/governorates/tunisia-governorates-medium-plain.svg');
  assert.equal(typeof project([10.18, 36.8])[0], 'number');
});
