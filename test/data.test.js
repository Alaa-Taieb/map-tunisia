// Data integrity: counts, identifiers, hierarchy, areas and populations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readCSV } from '../scripts/build/lib.js';

const A = (f) => readCSV(path.join(ROOT, 'data/attributes', f));
const D = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/data', `${p}.json`), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/source/extract-report.json'), 'utf8'));

const ISO = ['TN-11', 'TN-12', 'TN-13', 'TN-14', 'TN-21', 'TN-22', 'TN-23', 'TN-31', 'TN-32', 'TN-33', 'TN-34', 'TN-41',
  'TN-42', 'TN-43', 'TN-51', 'TN-52', 'TN-53', 'TN-61', 'TN-71', 'TN-72', 'TN-73', 'TN-81', 'TN-82', 'TN-83'];

test('partition counts', () => {
  assert.equal(D('country').length, 1);
  assert.equal(D('regions').length, 7);
  assert.equal(D('districts').length, 5);
  assert.equal(D('governorates').length, 24);
  assert.equal(D('delegations').length, report.counts.delegations);
  assert.equal(D('sectors').length, report.counts.sectors);
  assert.equal(D('delegations').length, 279, 'the 279 delegations of the INS 2024 nomenclature');
  assert.ok(D('sectors').length >= 2080, 'about 2,084 imadas');
});

test('governorates use ISO 3166-2 codes', () => {
  assert.deepEqual(D('governorates').map((g) => g.id).sort(), ISO);
});

test('identifiers are unique and well-formed', () => {
  for (const p of ['regions', 'districts', 'governorates', 'delegations', 'sectors']) {
    const ids = D(p).map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, `${p} ids unique`);
  }
  for (const d of D('delegations')) assert.match(d.id, /^delegation-(\d{4}|\d{2}-[a-z0-9-]+)$/);
  for (const s of D('sectors')) assert.match(s.id, /^sector-(\d{6}|x\d+)(-\d+)?$/);
});

test('every unit has names in Arabic and Latin script', () => {
  const missingAr = [];
  for (const p of ['regions', 'districts', 'governorates', 'delegations', 'sectors']) {
    for (const r of D(p)) {
      assert.ok(r.name_fr, `${p} ${r.id} has a Latin name`);
      assert.doesNotMatch(r.name_fr, /\p{Script=Arabic}/u, `${p} ${r.id} Latin name has no Arabic script`);
      if (!r.name_ar) { missingAr.push(r.id); continue; }
      assert.match(r.name_ar, /\p{Script=Arabic}/u, `${p} ${r.id} Arabic name uses Arabic script`);
      assert.doesNotMatch(r.name_ar, /[\p{Bidi_Control}یک]/u, `${p} ${r.id} has no Persian look-alikes or stray direction marks`);
    }
  }
  // Units without an Arabic name in OpenStreetMap are listed in the extraction report; keep them rare.
  assert.ok(missingAr.length <= 3, `missing Arabic names: ${missingAr.join(', ')}`);
  for (const id of missingAr) assert.ok(report.warnings.some((w) => w.includes(id)), `${id} is reported`);
});

test('hierarchy is consistent (sector ⊂ delegation ⊂ governorate ⊂ region/district)', () => {
  const gov = Object.fromEntries(A('governorates.csv').map((g) => [g.id, g]));
  const del = Object.fromEntries(D('delegations').map((d) => [d.id, d]));
  for (const d of Object.values(del)) assert.ok(gov[d.governorate], `${d.id} → ${d.governorate}`);
  for (const s of D('sectors')) {
    assert.ok(del[s.delegation], `${s.id} → ${s.delegation}`);
    assert.equal(del[s.delegation].governorate, s.governorate, `${s.id} governorate matches its delegation`);
  }
  const regions = new Set(A('regions.csv').map((r) => r.id));
  const districts = new Set(A('districts.csv').map((r) => r.id));
  for (const g of Object.values(gov)) {
    assert.ok(regions.has(g.region));
    assert.ok(districts.has(g.district));
  }
});

test('regions follow the INS grouping and districts follow Decree 2023-589', () => {
  const groups = (f) => Object.fromEntries(A(f).map((r) => [r.id, r.governorates.split(' ').sort().join(' ')]));
  assert.deepEqual(groups('districts.csv'), {
    'district-1': 'TN-23 TN-31 TN-32 TN-33',
    'district-2': 'TN-11 TN-12 TN-13 TN-14 TN-21 TN-22',
    'district-3': 'TN-34 TN-41 TN-42 TN-51 TN-52 TN-53',
    'district-4': 'TN-43 TN-61 TN-71 TN-72',
    'district-5': 'TN-73 TN-81 TN-82 TN-83',
  });
  assert.deepEqual(groups('regions.csv'), {
    'grand-tunis': 'TN-11 TN-12 TN-13 TN-14',
    'nord-est': 'TN-21 TN-22 TN-23',
    'nord-ouest': 'TN-31 TN-32 TN-33 TN-34',
    'centre-est': 'TN-51 TN-52 TN-53 TN-61',
    'centre-ouest': 'TN-41 TN-42 TN-43',
    'sud-est': 'TN-81 TN-82 TN-83',
    'sud-ouest': 'TN-71 TN-72 TN-73',
  });
});

test('areas add up exactly across levels', () => {
  const total = (p) => D(p).reduce((s, r) => s + Number(r.area_km2), 0);
  const country = total('country');
  for (const p of ['regions', 'districts', 'governorates', 'delegations', 'sectors']) {
    const rel = Math.abs(total(p) - country) / country;
    assert.ok(rel < 1e-5, `${p} total area ${total(p).toFixed(1)} vs country ${country.toFixed(1)}`);
  }
  // Land area of Tunisia is ~155,360 km² (CIA World Factbook); OSM-derived land should be within 0.5 %.
  assert.ok(Math.abs(country - 155360) / 155360 < 0.005, `country land area ${country.toFixed(0)} km²`);
});

test('extracted topology has no overlaps or gaps', () => {
  assert.ok(report.topology.overlap_km2 < 1e-4, `overlap ${report.topology.overlap_km2} km²`);
  assert.ok(Math.abs(report.topology.uncovered_km2) < 1e-4, `uncovered ${report.topology.uncovered_km2} km²`);
});

test('census populations add up to the national totals', () => {
  const gov = A('governorates.csv');
  assert.equal(gov.reduce((s, g) => s + Number(g.population_2024), 0), 11972169); // RGPH 2024
  assert.equal(gov.reduce((s, g) => s + Number(g.population_2014), 0), 10982754); // RGPH 2014
  const country = D('country')[0];
  assert.equal(Number(country.population_2024), 11972169);
  // Delegation populations (INS 2024 nomenclature) add up to their governorate.
  const byGov = {};
  for (const d of D('delegations')) byGov[d.governorate] = (byGov[d.governorate] || 0) + Number(d.population_2024);
  for (const g of gov) assert.equal(byGov[g.id], Number(g.population_2024), `${g.id} delegations sum to the governorate total`);
});

test('every INS 2024 delegation is mapped exactly once', () => {
  const ins = readCSV(path.join(ROOT, 'data/reference/ins-delegations-2024.csv')).map((r) => r.ins_code).sort();
  const mapped = D('delegations').map((d) => d.ins_code).sort();
  assert.deepEqual(mapped, ins);
});

test('governorate areas agree with published figures', () => {
  const pub = Object.fromEntries(readCSV(path.join(ROOT, 'data/reference/governorate-areas.csv')).map((r) => [r.id, Number(r.area_km2_published)]));
  const errs = D('governorates').map((g) => Math.abs(Number(g.area_km2) - pub[g.id]) / pub[g.id]);
  const median = errs.sort((a, b) => a - b)[Math.floor(errs.length / 2)];
  assert.ok(median < 0.03, `median relative difference ${(median * 100).toFixed(1)} %`);
});

test('label points lie inside Tunisia', () => {
  for (const p of ['governorates', 'delegations', 'sectors']) {
    for (const r of D(p)) {
      const lon = Number(r.label_lon), lat = Number(r.label_lat);
      assert.ok(lon > 7.4 && lon < 11.7 && lat > 30.2 && lat < 37.6, `${r.id} label at ${lon},${lat}`);
    }
  }
});
