/**
 * Build matrix: partitions × levels of detail × modes.
 * Everything that defines *what* gets generated lives here.
 */

export const PROJECT = {
  name: 'Map Tunisia',
  repo: 'https://github.com/Alaa-Taieb/map-tunisia',
  author: 'Alaa Taieb',
  authorUrl: 'https://github.com/Alaa-Taieb',
  license: 'ODbL-1.0',
  attribution: '© OpenStreetMap contributors',
};

/** UTM zone 32N on WGS84 — Tunisia (7.5°E–11.6°E) lies entirely inside the zone. */
export const PROJ4 = '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs';
export const CRS = 'EPSG:32632';

/** Map frame padding around the country, in kilometres (= SVG user units). */
export const FRAME_PADDING_KM = 12;

/**
 * Levels of detail. `interval` is the mapshaper simplification interval in metres,
 * `precision` the number of decimals kept in SVG coordinates (1 unit = 1 km),
 * `minIsland` the area (km²) under which a feature's *secondary* island parts are dropped.
 */
export const LODS = [
  { id: 'full', interval: 0, precision: 3, minIsland: 0, use: 'Original OpenStreetMap precision (~1 m). Print, GIS, deep zoom.' },
  { id: 'high', interval: 20, precision: 2, minIsland: 0, use: 'Large prints and zoomable web maps.' },
  { id: 'medium', interval: 100, precision: 2, minIsland: 0.02, use: 'Default for websites, dashboards and slides.' },
  { id: 'low', interval: 500, precision: 1, minIsland: 0.5, use: 'Small embeds, mobile, social cards.' },
  { id: 'tiny', interval: 2500, precision: 1, minIsland: 5, use: 'Icons, favicons, sparkline-size thumbnails.' },
];

/**
 * Partitions. `key` is the source property that identifies a unit,
 * `parents` lists the higher levels drawn by the `nested` mode (innermost first).
 */
export const PARTITIONS = [
  {
    id: 'country',
    key: 'country',
    singular: 'country',
    title: 'Tunisia',
    titleAr: 'تونس',
    parents: [],
    lods: ['full', 'high', 'medium', 'low', 'tiny'],
    labelSize: [22, 34], displace: true,
  },
  {
    id: 'regions',
    key: 'region',
    singular: 'region',
    title: 'Economic regions',
    titleAr: 'الأقاليم الاقتصادية',
    parents: [],
    lods: ['full', 'high', 'medium', 'low', 'tiny'],
    labelSize: [10, 17], displace: true,
  },
  {
    id: 'districts',
    key: 'district',
    singular: 'district',
    title: 'Districts (2023)',
    titleAr: 'الأقاليم',
    parents: [],
    lods: ['full', 'high', 'medium', 'low', 'tiny'],
    labelSize: [11, 19], displace: true,
  },
  {
    id: 'governorates',
    key: 'governorate',
    singular: 'governorate',
    title: 'Governorates',
    titleAr: 'الولايات',
    parents: ['region'],
    lods: ['full', 'high', 'medium', 'low', 'tiny'],
    labelSize: [8, 13], displace: true,
  },
  {
    id: 'delegations',
    key: 'delegation',
    singular: 'delegation',
    title: 'Delegations',
    titleAr: 'المعتمديات',
    parents: ['governorate'],
    lods: ['full', 'high', 'medium', 'low'],
    labelSize: [1.1, 6],
  },
  {
    id: 'sectors',
    key: 'sector',
    singular: 'sector',
    title: 'Sectors (imadas)',
    titleAr: 'العمادات',
    parents: ['delegation', 'governorate'],
    lods: ['full', 'high', 'medium', 'low'],
    labelSize: [0.35, 2.6],
  },
  {
    // Not nested: municipalities do not follow delegation or sector borders. Built from their own
    // source (boundary=municipality in OSM); `base` draws the land underneath, so the few areas
    // outside any municipality stay visible instead of looking like sea.
    id: 'municipalities',
    key: 'municipality',
    singular: 'municipality',
    title: 'Municipalities',
    titleAr: 'البلديات',
    parents: [],
    source: 'municipalities',
    base: true,
    lods: ['full', 'high', 'medium', 'low'],
    labelSize: [1.1, 6],
  },
  {
    // An overlay, not a partition of the land: lakes, dams, sebkhas and chotts lie inside the governorates (which
    // keep them), the sea-side lagoons lie in the sea. Built from its own source (scripts/extract/water.py) and drawn
    // over the land; `landOutline` keeps the coastline to the land, so lagoons stay water in every mode.
    id: 'water',
    key: 'water',
    singular: 'water-body',
    title: 'Water bodies',
    titleAr: 'المسطحات المائية',
    parents: [],
    source: 'water',
    base: true,
    baseTitle: 'Land',
    landOutline: true,
    colourBy: 'type',
    lods: ['full', 'high', 'medium', 'low'],
    labelSize: [1.1, 6],
  },
  {
    // Points, not polygons: the national capital, the governorate capitals and the seats of the municipalities
    // (scripts/extract/cities.py), drawn over the land with the governorate borders for context. An overlay like water.
    id: 'cities',
    key: 'city',
    singular: 'city',
    title: 'Cities',
    titleAr: 'المدن',
    parents: [],
    source: 'cities',
    points: true,
    base: true,
    baseTitle: 'Land',
    colourBy: 'type',
    lods: ['full', 'high', 'medium', 'low'],
  },
];

/** Water body types, in palette order (`colourBy: 'type'`). */
export const WATER_TYPES = ['lake', 'reservoir', 'lagoon', 'sebkha', 'chott'];

/**
 * City types, in palette and drawing order. `r` is the dot radius and `label` the font size (km = SVG units);
 * `lods` lists the levels of detail whose labelled maps name this type (the low level names the capitals only).
 */
export const CITY_TYPES = ['national_capital', 'governorate_capital', 'city'];
export const CITY_STYLE = {
  national_capital: { r: 2.8, label: 9, lods: ['full', 'high', 'medium', 'low'] },
  governorate_capital: { r: 1.8, label: 6, lods: ['full', 'high', 'medium', 'low'] },
  city: { r: 0.9, label: 3.2, lods: ['full', 'high', 'medium'] },
};

/** Visual modes. `lods` restricts a mode to some levels of detail (default: all except full). */
export const MODES = [
  { id: 'plain', title: 'Plain', description: 'Neutral fills and white borders, with every id and data attribute. The best base for your own CSS.', lods: ['full', 'high', 'medium', 'low', 'tiny'] },
  { id: 'outline', title: 'Outline', description: 'Borders only, no fill. Line art for print, plotters, laser cutters and overlays.', lods: ['high', 'medium', 'low', 'tiny'] },
  { id: 'light', title: 'Light', description: 'Colourful map-coloured fills on a light background.' },
  { id: 'dark', title: 'Dark', description: 'Deep, map-coloured fills on a dark background. Made for dark UIs.' },
  { id: 'labeled', title: 'Labelled (Latin)', description: 'Plain map with names in Latin script (French spelling) placed at each unit’s visual centre.' },
  { id: 'labeled-ar', title: 'Labelled (Arabic)', description: 'Plain map with Arabic names, right-to-left.' },
  { id: 'nested', title: 'Nested borders', description: 'All higher-level borders drawn with increasing weight, e.g. delegations inside governorates.', lods: ['high', 'medium', 'low', 'tiny'] },
  { id: 'interactive', title: 'Interactive', description: 'Hover highlight and native bilingual tooltips. Pure SVG + CSS, no JavaScript.' },
];

export const DEFAULT_MODE_LODS = ['medium', 'low', 'tiny'];

export function modesFor(partition, lod) {
  return MODES.filter((m) => {
    const lods = m.lods || DEFAULT_MODE_LODS;
    if (!lods.includes(lod)) return false;
    if (m.id === 'nested' && partition.parents.length === 0 && partition.id !== 'governorates') return false;
    return true;
  });
}

/** Light and dark categorical palettes (adjacent units never share a colour). */
export const PALETTES = {
  light: ['#8ecae6', '#a8d5a2', '#f2cc8f', '#e9a28b', '#b8b3e9', '#f6e7a1', '#9fd8cb', '#f4b6c2'],
  dark: ['#2a5a8c', '#1f6e6e', '#46539a', '#64478a', '#2f6e4b', '#8a4466', '#7a6430', '#3c6585'],
};

/** City palettes, indexed like CITY_TYPES: red for the capital, deep blue for governorate capitals, slate for other cities. */
export const CITY_PALETTES = {
  light: ['#c0392b', '#1f4e79', '#52606d'],
  dark: ['#ff6b6b', '#8ecae6', '#cbd2d9'],
};

/** Water palettes, indexed like WATER_TYPES: blues for open water, salt-flat sand for sebkhas and chotts. */
export const WATER_PALETTES = {
  light: ['#6fa8dc', '#3d85c6', '#9fc5e8', '#e6d7b3', '#d9c393'],
  dark: ['#2f6fb0', '#1f4f8a', '#3f86c6', '#6b5d40', '#5c4d31'],
};

export const fileName = (partition, lod, mode) => `tunisia-${partition}-${lod}-${mode}.svg`;
