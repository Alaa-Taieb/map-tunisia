/**
 * Names for the `labeled-tfng` and `labeled-en` modes.
 *
 * Tifinagh: the Tamazight name OpenStreetMap holds for the unit (data/source/tifinagh-names.json, read by
 * scripts/extract/tifinagh.py), otherwise the Arabic name written letter by letter in Neo-Tifinagh (IRCAM letters).
 * That is a transliteration, not a translation: it gives no Tamazight name that is not in the source.
 *
 * English: the Latin name with English generic terms (Lake, Lagoon, Dam) and without French accents, in plain ASCII.
 */

const TFNG = {
  'ب': 'ⴱ', 'پ': 'ⴱ', 'ت': 'ⵜ', 'ث': 'ⵜ', 'ج': 'ⵊ', 'ح': 'ⵃ', 'خ': 'ⵅ', 'د': 'ⴷ', 'ذ': 'ⴷ', 'ر': 'ⵔ', 'ز': 'ⵣ',
  'س': 'ⵙ', 'ش': 'ⵛ', 'ص': 'ⵚ', 'ض': 'ⴹ', 'ط': 'ⵟ', 'ظ': 'ⴹ', 'ع': 'ⵄ', 'غ': 'ⵖ', 'ف': 'ⴼ', 'ڥ': 'ⴼ', 'ق': 'ⵇ',
  'ڤ': 'ⴳ', 'ڨ': 'ⴳ', 'ك': 'ⴽ', 'ک': 'ⴽ', 'ل': 'ⵍ', 'م': 'ⵎ', 'ن': 'ⵏ', 'ه': 'ⵀ', 'ھ': 'ⵀ',
};
/** Letters that only write a vowel; `ة` is the feminine ending -a. */
const VOWEL_LETTER = { 'ا': 'ⴰ', 'آ': 'ⴰ', 'أ': 'ⴰ', 'إ': 'ⵉ', 'ى': 'ⴰ', 'ة': 'ⴰ', 'ئ': 'ⵉ', 'ؤ': 'ⵓ' };
/** Short-vowel marks, written when the Arabic name carries them. */
const HARAKA = { 'َ': 'ⴰ', 'ِ': 'ⵉ', 'ُ': 'ⵓ' };
const SHADDA = 'ّ';
/** Glides: consonant (w, y) or long vowel (u, i) depending on their neighbours. */
const GLIDE = { 'و': ['ⵡ', 'ⵓ'], 'ࢫ': ['ⵡ', 'ⵓ'], 'ي': ['ⵢ', 'ⵉ'], 'ی': ['ⵢ', 'ⵉ'] };
/** The Arabic article assimilates to these ("sun") letters: الطارف → ⵟⵟⴰⵔⴼ. */
const SUN = new Set('تثدذرزسشصضطظلن');
const TFNG_VOWELS = new Set(['ⴰ', 'ⵉ', 'ⵓ']);

function tifinaghWord(word) {
  let chars = [...word.replace(/ـ/g, '')]; // tatweel
  let out = [];
  if (chars.length > 3 && chars[0] === 'ا' && chars[1] === 'ل') {
    chars = chars.slice(2);
    if (!SUN.has(chars[0])) out.push('ⵍ');
    else out.push(TFNG[chars[0]]); // doubled by the letter itself below
  }
  const isVowelNext = (i) => VOWEL_LETTER[chars[i + 1]] !== undefined || HARAKA[chars[i + 1]] !== undefined;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const prev = out[out.length - 1];
    if (TFNG[c]) out.push(TFNG[c]);
    else if (VOWEL_LETTER[c]) {
      if (c === 'ة' && i < chars.length - 1) out.push('ⵜ');
      else out.push(VOWEL_LETTER[c]);
    } else if (HARAKA[c]) out.push(HARAKA[c]);
    else if (c === SHADDA) {
      // A doubled glide is a consonant: ـوّ → ⵡⵡ, ـيّ → ⵢⵢ.
      if (GLIDE[chars[i - 1]]) out[out.length - 1] = GLIDE[chars[i - 1]][0];
      if (out.length && !TFNG_VOWELS.has(out[out.length - 1])) out.push(out[out.length - 1]);
    }
    else if (GLIDE[c]) {
      const [consonant, vowel] = GLIDE[c];
      const next = chars[i + 1];
      const asConsonant = i === 0 || (prev && TFNG_VOWELS.has(prev)) || isVowelNext(i) || (next && GLIDE[next] && i + 2 < chars.length);
      out.push(asConsonant ? consonant : vowel);
    } else if (c === 'ء') continue;
    else out.push(c); // digits, punctuation, Latin letters stay as they are
  }
  return out.join('');
}

/** Arabic name → Neo-Tifinagh, word by word (spaces, hyphens and brackets kept). */
export function arabicToTifinagh(text) {
  if (!text) return '';
  return text.normalize('NFC').split(/([\s\-()]+)/).map((part, i) => (i % 2 ? part : tifinaghWord(part))).join('');
}

/** True when the text is written in Tifinagh (letters U+2D30–U+2D7F, with spaces, digits and punctuation). */
export const isTifinagh = (text) => /[\u2D30-\u2D7F]/u.test(text) && /^[\u2D30-\u2D7F\s\d\-()'\u2019.]+$/u.test(text);

/** French generic terms of the water bodies, in English word order. */
const GENERIC_EN = [
  [/^Lac (Nord|Sud) de (.+)$/, (m, side, rest) => `${side === 'Nord' ? 'North' : 'South'} Lake of ${rest}`],
  [/^Lac de (.+)$/, (m, rest) => `Lake ${rest}`],
  [/^Lac (.+)$/, (m, rest) => `Lake ${rest}`],
  [/^Lagune de (.+)$/, (m, rest) => `${rest} Lagoon`],
  [/^Barrage (?:de |d['’])?(.+)$/, (m, rest) => `${rest} Dam`],
];

/** Plain ASCII: accents and ligatures resolved, typographic quotes and dashes simplified. */
export function toASCII(text) {
  return (text || '')
    .replace(/[œŒ]/g, (c) => (c === 'œ' ? 'oe' : 'Oe')).replace(/[æÆ]/g, (c) => (c === 'æ' ? 'ae' : 'Ae')).replace(/ß/g, 'ss')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[’‘ʼ]/g, "'").replace(/[“”«»]/g, '"').replace(/[‐‑–—]/g, '-')
    .replace(/\s+/g, ' ').trim();
}

/** English transliteration of a Latin name: English generic terms, plain ASCII. Empty when there is no Latin name. */
export function englishName(latin) {
  let s = (latin || '').trim();
  for (const [re, fn] of GENERIC_EN) if (re.test(s)) { s = s.replace(re, fn); break; }
  s = toASCII(s).replace(/^[a-z]/, (c) => c.toUpperCase()); // "el Kebir Dam" → "El Kebir Dam"
  return /^[\x20-\x7E]+$/.test(s) ? s : '';
}

/**
 * Add `name_tfng`, `name_tfng_source` (`osm` or `transliterated`) and `name_translit` to an attribute record,
 * right after `name_ar`. `latin` is the Latin name to transliterate into English (the English name for the
 * country, regions, districts and governorates, else the name the `labeled` mode shows).
 */
export function withNames(record, latin, osmTifinagh) {
  const osm = osmTifinagh?.[record.id];
  const tfng = osm ? osm.name : arabicToTifinagh(record.name_ar);
  const extra = {
    name_tfng: tfng,
    name_tfng_source: osm ? 'osm' : tfng ? 'transliterated' : '',
    name_translit: englishName(latin),
  };
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = v;
    if (k === 'name_ar') Object.assign(out, extra);
  }
  return 'name_ar' in record ? out : { ...out, ...extra };
}
