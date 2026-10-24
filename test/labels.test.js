// Label modes in Tifinagh (labeled-tfng) and English (labeled-en): the transliteration rules, the name columns and the maps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../scripts/build/lib.js';
import { PARTITIONS, MODES, LABEL_MODES, modesFor, fileName } from '../scripts/build/config.js';
import { arabicToTifinagh, englishName, isTifinagh, toASCII } from '../scripts/build/names.js';
import catalog from '../src/catalog.js';

const D = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/data', `${p}.json`), 'utf8'));
const osm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/source/tifinagh-names.json'), 'utf8'));

test('Arabic names are written in Neo-Tifinagh letter by letter', () => {
  const cases = {
    'تونس': 'ⵜⵓⵏⵙ', // the same as OSM name:zgh of the country
    'سوسة': 'ⵙⵓⵙⴰ', // the same as OSM name:ber of the city
    'توزر': 'ⵜⵓⵣⵔ',
    'صفاقس': 'ⵚⴼⴰⵇⵙ', // emphatics keep their own letters
    'القيروان': 'ⵍⵇⵉⵔⵡⴰⵏ', // article before a moon letter; و before ا is a consonant
    'الطارف': 'ⵟⵟⴰⵔⴼ', // the article assimilates to a sun letter
    'سيدي بوزيد': 'ⵙⵉⴷⵉ ⴱⵓⵣⵉⴷ', // و and ي between consonants are long vowels
    'سليانة': 'ⵙⵍⵢⴰⵏⴰ', // ي before a vowel is a consonant; ة is -a
    'أولاد حفوز': 'ⴰⵡⵍⴰⴷ ⵃⴼⵓⵣ',
    'بئر الحفي': 'ⴱⵉⵔ ⵍⵃⴼⵉ',
    'عويجة': 'ⵄⵡⵉⵊⴰ',
    'قوّة': 'ⵇⵡⵡⴰ', // shadda doubles, a doubled glide is a consonant
    'ڨرعة': 'ⴳⵔⵄⴰ', // Tunisian g
    'حي 2 مارس': 'ⵃⵉ 2 ⵎⴰⵔⵙ',
  };
  for (const [ar, tfng] of Object.entries(cases)) assert.equal(arabicToTifinagh(ar), tfng, ar);
  assert.equal(arabicToTifinagh(''), '');
  assert.ok(isTifinagh('ⵜⵓⵏⵙ ⵍⴽⴱⵔⴰ') && !isTifinagh('Tunis') && !isTifinagh('ⵜⵓⵏⵙ تونس'));
});

test('English names are plain ASCII with English generic terms', () => {
  const cases = {
    'Gabès': 'Gabes', 'Médenine': 'Medenine', 'Djedaïda': 'Djedaida', 'Sebkhet el Mèlah': 'Sebkhet el Melah',
    'Lac de Bizerte': 'Lake Bizerte', 'Lac Sud de Tunis': 'South Lake of Tunis', 'Lagune de Ghar El Melh': 'Ghar El Melh Lagoon',
    'Barrage de Sidi Salem': 'Sidi Salem Dam', 'Barrage el Kebir': 'El Kebir Dam', 'Cité El Khadra': 'Cite El Khadra',
  };
  for (const [fr, en] of Object.entries(cases)) assert.equal(englishName(fr), en, fr);
  assert.equal(englishName('بحيرة غدير القلة'), '', 'no Latin name, no English transliteration');
  assert.equal(toASCII('Ksar  Hellal – Œuvre'), 'Ksar Hellal - Oeuvre');
});

test('the OSM Tifinagh names are Tifinagh only and belong to published units', () => {
  const ids = new Set(['TN', ...PARTITIONS.filter((p) => p.id !== 'country').flatMap((p) => D(p.id).map((r) => r.id))]);
  assert.ok(osm.counts.names >= 1 && osm.counts.names === Object.keys(osm.names).length);
  assert.equal(osm.source.license, 'ODbL-1.0');
  for (const [id, n] of Object.entries(osm.names)) {
    assert.ok(ids.has(id), `${id} is a published unit`);
    assert.ok(isTifinagh(n.name), `${id} ${n.name}`);
    assert.ok(osm.tags.includes(n.tag), `${id} ${n.tag}`);
  }
  assert.equal(osm.names.TN.name, 'ⵜⵓⵏⵙ');
});

test('every published record carries name_tfng, name_tfng_source and name_translit', () => {
  for (const p of PARTITIONS) {
    for (const r of D(p.id)) {
      for (const k of ['name_tfng', 'name_tfng_source', 'name_translit']) assert.ok(k in r, `${p.id} ${r.id} has ${k}`);
      if (r.name_ar) {
        assert.ok(isTifinagh(r.name_tfng), `${p.id} ${r.id}: ${r.name_tfng}`);
        assert.equal(r.name_tfng_source, osm.names[r.id] ? 'osm' : 'transliterated', r.id);
        if (!osm.names[r.id]) assert.equal(r.name_tfng, arabicToTifinagh(r.name_ar), r.id);
      } else assert.ok(r.name_tfng === '' || r.name_tfng_source === 'osm', `${r.id}: no Arabic name, nothing to transliterate`);
      if (r.name_translit) assert.match(r.name_translit, /^[\x20-\x7E]+$/, `${p.id} ${r.id} ASCII`);
    }
    const kept = D(p.id).filter((r) => r.name_translit).length;
    assert.ok(kept >= D(p.id).length - 1, `${p.id}: ${kept} English names`);
  }
  assert.equal(D('country')[0].name_tfng_source, 'osm');
  assert.equal(D('regions').find((r) => r.id === 'grand-tunis').name_translit, 'Greater Tunis');
  assert.equal(D('governorates').find((r) => r.id === 'TN-81').name_translit, 'Gabes');
  const tunis = D('cities').find((r) => r.type === 'national_capital');
  assert.deepEqual([tunis.name_tfng, tunis.name_tfng_source], [osm.names[tunis.id].name, 'osm']);
});

test('the new label modes exist wherever labelling exists, and in the catalog', () => {
  const ids = MODES.map((m) => m.id);
  for (const m of Object.keys(LABEL_MODES)) assert.ok(ids.includes(m), m);
  for (const p of PARTITIONS) for (const lod of p.lods) {
    const modes = modesFor(p, lod).map((m) => m.id);
    for (const m of ['labeled-tfng', 'labeled-en']) assert.equal(modes.includes(m), modes.includes('labeled'), `${p.id}/${lod}/${m}`);
    assert.deepEqual(catalog.files[p.id][lod], modes);
  }
});

test('labeled-tfng and labeled-en write the names of the data tables, one label per unit', () => {
  for (const p of PARTITIONS.filter((x) => !x.points)) {
    const rows = Object.fromEntries(D(p.id).map((r) => [r.id, r]));
    for (const mode of ['labeled-tfng', 'labeled-en']) {
      const svg = fs.readFileSync(path.join(ROOT, 'dist/svg', p.id, fileName(p.id, 'medium', mode)), 'utf8');
      const unescape = (s) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const labels = [...svg.matchAll(/<text class="label"[^>]*data-for="([^"]+)">([^<]*)<\/text>/g)];
      assert.equal(labels.length, Object.keys(rows).length, `${p.id} ${mode}`);
      for (const [, id, text] of labels) {
        const r = rows[id];
        const want = mode === 'labeled-tfng' ? r.name_tfng : r.name_translit;
        if (want) assert.equal(unescape(text), want, `${p.id} ${mode} ${id}`);
      }
    }
  }
});

test('the Tifinagh city map uses the Tamazight names OSM holds', () => {
  const svg = fs.readFileSync(path.join(ROOT, 'dist/svg/cities', fileName('cities', 'medium', 'labeled-tfng')), 'utf8');
  const cityNames = Object.entries(osm.names).filter(([id]) => id.startsWith('city-'));
  assert.ok(cityNames.length > 0);
  for (const [id, n] of cityNames) {
    const m = svg.match(new RegExp(`data-for="${id}">([^<]*)<`));
    if (m) assert.equal(m[1], n.name, id);
  }
});
