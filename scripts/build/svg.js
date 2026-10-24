/** SVG writer: semantic, accessible, compact markup for every mode. */
import { escapeXML, polygonsOf } from './lib.js';
import { PALETTES, WATER_PALETTES, PROJECT, CRS, PROJ4 } from './config.js';

const STROKE = { country: 1.2, regions: 1, districts: 1, governorates: 0.8, delegations: 0.5, sectors: 0.3, municipalities: 0.5, water: 0.5 };

/** Format an integer number of 10^-p units as the shortest decimal string. */
function fmt(k, p) {
  if (k === 0) return '0';
  let s = (k / 10 ** p).toFixed(p);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace(/^(-?)0\./, '$1.');
}

/**
 * Build SVG path data from a (Multi)Polygon whose coordinates are already in
 * frame units (km). Absolute M per ring, relative l segments, z to close.
 */
export function pathData(geometry, precision) {
  const m = 10 ** precision;
  let out = '';
  for (const rings of polygonsOf(geometry)) {
    for (const ring of rings) {
      const pts = [];
      for (const [x, y] of ring) {
        const q = [Math.round(x * m), Math.round(y * m)];
        const last = pts[pts.length - 1];
        if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q);
      }
      if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      if (pts.length < 3) continue;
      let s = `M${fmt(pts[0][0], precision)} ${fmt(pts[0][1], precision)}l`;
      let first = true;
      for (let i = 1; i < pts.length; i++) {
        for (const v of [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]) {
          const t = fmt(v, precision);
          s += first || t[0] === '-' ? t : ' ' + t;
          first = false;
        }
      }
      out += s + 'z';
    }
  }
  return out;
}

/** Path data for line geometries (inner borders). */
export function linePathData(geometry, precision) {
  const m = 10 ** precision;
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
  let out = '';
  for (const line of lines) {
    const pts = [];
    for (const [x, y] of line) {
      const q = [Math.round(x * m), Math.round(y * m)];
      const last = pts[pts.length - 1];
      if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q);
    }
    if (pts.length < 2) continue;
    let s = `M${fmt(pts[0][0], precision)} ${fmt(pts[0][1], precision)}l`;
    let first = true;
    for (let i = 1; i < pts.length; i++) {
      for (const v of [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]) {
        const t = fmt(v, precision);
        s += first || t[0] === '-' ? t : ' ' + t;
        first = false;
      }
    }
    out += s;
  }
  return out;
}

const FONT_LATIN = "'Inter','Segoe UI','Helvetica Neue',Arial,sans-serif";
const FONT_ARABIC = "'Noto Naskh Arabic','Noto Sans Arabic','Segoe UI','Tahoma','Arial',sans-serif";

/** Land outside every unit (partitions with `base`, e.g. municipalities): lighter than the units, never mistaken for sea. */
const BASE_FILL = { plain: '#f1f3f6', outline: 'none', light: '#f1f3f6', dark: '#1a2433', labeled: '#f6f7f9', 'labeled-ar': '#f6f7f9', nested: '#f8f9fb', interactive: '#f1f3f6' };

const LEADER = '.leader{fill:none;stroke:#52606d;stroke-width:.6px;vector-effect:non-scaling-stroke}.anchor{fill:#52606d}';

function css(mode, partition) {
  const w = STROKE[partition.id];
  const base =
    `svg{shape-rendering:geometricPrecision}.unit{stroke-linejoin:round;vector-effect:non-scaling-stroke;stroke-width:${w}px}` +
    (partition.base ? `.base{fill:${BASE_FILL[mode]};stroke:none}` : '');
  const palettes = partition.colourBy === 'type' ? WATER_PALETTES : PALETTES;
  const palette = (p) => p.map((c, i) => `.c${i}{fill:${c}}`).join('');
  const label = (fill, halo, family) =>
    `.label{font-family:${family};font-weight:600;fill:${fill};stroke:${halo};stroke-width:.24em;stroke-linejoin:round;paint-order:stroke fill;text-anchor:middle}`;
  switch (mode) {
    case 'plain':
      return `${base}.unit{fill:#d9dee5;stroke:#fff}`;
    case 'outline':
      return `${base}.unit{fill:none;stroke:#1f2933}.outline{fill:none;stroke:#1f2933;stroke-width:${(w * 1.6).toFixed(2)}px;vector-effect:non-scaling-stroke;stroke-linejoin:round}`;
    case 'light':
      return `${base}.unit{stroke:#fff}${palette(palettes.light)}`;
    case 'dark':
      return `${base}.bg{fill:#0b1220}.unit{stroke:#0b1220}${palette(palettes.dark)}`;
    case 'labeled':
      return `${base}.unit{fill:#e3e7ec;stroke:#fff}${label('#1f2933', '#fff', FONT_LATIN)}${LEADER}`;
    case 'labeled-ar':
      return `${base}.unit{fill:#e3e7ec;stroke:#fff}${label('#1f2933', '#fff', FONT_ARABIC)}.label{direction:rtl;unicode-bidi:embed}${LEADER}`;
    case 'nested':
      return (
        `${base}.unit{fill:#eef1f5;stroke:#fff}` +
        `.border{fill:none;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}` +
        `.b-delegation{stroke:#a3adb8;stroke-width:${Math.max(w * 1.8, 0.6).toFixed(2)}px}` +
        `.b-governorate{stroke:#5f6b7a;stroke-width:${Math.max(w * 3, 0.9).toFixed(2)}px}` +
        `.b-region{stroke:#3e4c59;stroke-width:${Math.max(w * 3.2, 1.6).toFixed(2)}px}` +
        `.outline{fill:none;stroke:#323f4b;stroke-width:${Math.max(w * 3.5, 1.4).toFixed(2)}px;vector-effect:non-scaling-stroke;stroke-linejoin:round}`
      );
    case 'interactive':
      return (
        `${base}.unit{stroke:#fff;cursor:pointer;transition:fill .15s ease,opacity .15s ease}${palette(palettes.light)}` +
        `.units:hover .unit{opacity:.55}.units .unit:hover{fill:#e63946;opacity:1}`
      );
    default:
      throw new Error(`unknown mode ${mode}`);
  }
}

const POP = [['population-2014', 'population_2014'], ['population-2024', 'population_2024']];
const DATA_FIELDS = {
  country: [['iso', 'iso_3166_1'], ...POP],
  regions: [['code', 'code'], ['governorates', 'governorates'], ...POP],
  districts: [['number', 'number'], ['governorates', 'governorates'], ...POP],
  governorates: [['iso', 'iso_3166_2'], ['ins', 'ins_code'], ['region', 'region'], ['district', 'district'], ['capital', 'capital_fr'], ...POP],
  delegations: [['ins', 'ins_code'], ['hasc', 'hasc'], ['governorate', 'governorate'], ['region', 'region'], ['district', 'district'], ...POP],
  sectors: [['ins', 'ins_code'], ['delegation', 'delegation'], ['governorate', 'governorate'], ['region', 'region'], ['district', 'district']],
  municipalities: [['governorate', 'governorate'], ['region', 'region'], ['district', 'district'], ['osm', 'osm_relation'], ['wikidata', 'wikidata']],
  water: [['type', 'type'], ['governorate', 'governorate'], ['governorates', 'governorates'], ['region', 'region'], ['district', 'district'],
    ['salt', 'salt'], ['intermittent', 'intermittent'], ['osm', 'osm'], ['wikidata', 'wikidata']],
};

/**
 * Render one SVG document.
 * @param {object} o
 * @param {object} o.partition   partition config
 * @param {object} o.lod         LOD config
 * @param {string} o.mode        mode id
 * @param {object} o.frame       {x0,y0,width,height}
 * @param {Array}  o.units       [{id, attrs, geometry(frame km), color, label:{x,y,size}}]
 * @param {Array}  o.borders     [{level, geometry}] (nested mode)
 * @param {object} o.outline     country geometry (frame km) for outline/nested
 * @param {object} [o.base]      land geometry (frame km) drawn under the units (municipalities, water)
 * @param {object} o.source      {osm_date}
 */
export function renderSVG({ partition, lod, mode, frame, units, borders = [], outline, base, source }) {
  const p = lod.precision;
  const W = frame.width, H = frame.height;
  const count = units.length;
  const title = `Map of Tunisia — ${partition.title}${count > 1 ? ` (${count})` : ''}`;
  const desc =
    `${partition.title} of Tunisia, ${lod.id} level of detail, ${mode} mode. ` +
    `Projection ${CRS} (UTM zone 32N), 1 unit = 1 km. Data ${PROJECT.attribution} (ODbL), OSM extract ${source.osm_date}. ` +
    `Created by ${PROJECT.author} — ${PROJECT.repo}`;
  const meta = {
    generator: `${PROJECT.name} ${source.version}`,
    creator: PROJECT.author,
    source: PROJECT.repo,
    license: PROJECT.license,
    attribution: PROJECT.attribution,
    osm_date: source.osm_date,
    partition: partition.id,
    lod: lod.id,
    mode,
    crs: CRS,
    proj4: PROJ4,
    unit: 'km',
    transform: { x: `easting/1000 - ${frame.x0}`, y: `${frame.y0} - northing/1000` },
    frame,
  };

  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<!-- ${PROJECT.name} · ${PROJECT.repo} · Created by ${PROJECT.author} · Map data ${PROJECT.attribution}, ODbL 1.0 -->`);
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ` +
      `role="img" aria-labelledby="map-title map-desc" class="map-tunisia ${partition.id} ${lod.id} ${mode}" ` +
      `data-partition="${partition.id}" data-lod="${lod.id}" data-mode="${mode}" data-crs="${CRS}" data-unit="km" ` +
      `data-x0="${frame.x0}" data-y0="${frame.y0}"${mode === 'labeled-ar' ? ' xml:lang="ar"' : ''}>`,
  );
  out.push(`<title id="map-title">${escapeXML(title)}</title>`);
  out.push(`<desc id="map-desc">${escapeXML(desc)}</desc>`);
  out.push(`<metadata id="map-tunisia-metadata">${escapeXML(JSON.stringify(meta))}</metadata>`);
  out.push(`<style>${css(mode, partition)}</style>`);
  if (mode === 'dark') out.push(`<rect class="bg" x="0" y="0" width="${W}" height="${H}"/>`);

  if (base) {
    const title = partition.baseTitle || `Not part of any ${partition.singular} in OpenStreetMap`;
    out.push(`<path id="${partition.id}-base" class="base" fill-rule="evenodd" d="${pathData(base, p)}"><title>${escapeXML(title)}</title></path>`);
  }

  const colored = mode === 'light' || mode === 'dark' || mode === 'interactive';
  out.push(`<g id="${partition.id}" class="units" fill-rule="evenodd">`);
  for (const u of units) {
    const d = pathData(u.geometry, p) || pathData(u.geometry, p + 2);
    const attrs = [`id="${escapeXML(u.id)}"`, `class="unit ${partition.singular}${colored ? ` c${u.color}` : ''}"`];
    attrs.push(`data-name="${escapeXML(u.attrs.name_fr)}"`, `data-name-ar="${escapeXML(u.attrs.name_ar)}"`);
    attrs.push(`data-name-fr="${escapeXML(u.attrs.name_fr)}"`, `data-name-en="${escapeXML(u.attrs.name_en)}"`);
    for (const [k, f] of DATA_FIELDS[partition.id]) if (u.attrs[f] !== undefined && u.attrs[f] !== '') attrs.push(`data-${k}="${escapeXML(u.attrs[f])}"`);
    const tip = u.attrs.name_ar && u.attrs.name_ar !== u.attrs.name_fr ? `${u.attrs.name_fr} · ${u.attrs.name_ar}` : u.attrs.name_fr;
    out.push(`<path ${attrs.join(' ')} d="${d}"><title>${escapeXML(tip)}</title></path>`);
  }
  out.push('</g>');

  if (mode === 'nested' && borders.length) {
    out.push('<g id="borders" aria-hidden="true">');
    for (const b of borders) {
      const d = linePathData(b.geometry, p);
      if (d) out.push(`<path class="border b-${b.level}" d="${d}"/>`);
    }
    out.push('</g>');
  }
  if ((mode === 'nested' || mode === 'outline') && outline) {
    out.push(`<path class="outline" aria-hidden="true" fill-rule="evenodd" d="${pathData(outline, p)}"/>`);
  }

  if (mode === 'labeled' || mode === 'labeled-ar') {
    const ar = mode === 'labeled-ar';
    out.push(`<g id="labels" class="labels" aria-hidden="true">`);
    const leaders = [];
    const texts = [];
    for (const u of units) {
      const l = ar ? u.labelAr : u.label;
      if (!l) continue;
      const text = ar ? u.attrs.name_ar || u.attrs.name_fr : u.attrs.label_latin || u.attrs.name_fr;
      if (!text) continue;
      if (l.leader) {
        // Leader from the anchor to the nearest edge of the label box.
        const w = (l.size * (ar ? 0.5 : 0.58) * [...text].length) / 2;
        const ex = Math.max(l.x - w, Math.min(l.ax, l.x + w));
        const ey = Math.max(l.y - l.size * 0.55, Math.min(l.ay, l.y + l.size * 0.55));
        leaders.push(`<path class="leader" d="M${l.ax.toFixed(2)} ${l.ay.toFixed(2)}L${ex.toFixed(2)} ${ey.toFixed(2)}"/><circle class="anchor" cx="${l.ax.toFixed(2)}" cy="${l.ay.toFixed(2)}" r="${(l.size * 0.12).toFixed(2)}"/>`);
      }
      texts.push(
        `<text class="label" x="${l.x.toFixed(2)}" y="${(l.y + l.size * 0.35).toFixed(2)}" font-size="${l.size.toFixed(2)}" data-for="${escapeXML(u.id)}">${escapeXML(text)}</text>`,
      );
    }
    out.push(...leaders, ...texts);
    out.push('</g>');
  }
  out.push('</svg>');
  return out.join('\n') + '\n';
}
