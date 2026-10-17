/**
 * Map Tunisia — tiny helpers to locate the maps and place points on them.
 *
 *   import { svgPath, cdnURL, project, catalog } from 'map-tunisia';
 *
 * @module map-tunisia
 */
import catalog from './catalog.js';

export { project, invert, toUTM, fromUTM, FRAME } from './projection.js';
export { catalog };

/** Public CDN base (jsDelivr serves files straight from the GitHub repository). */
export const CDN_BASE = 'https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia';

function check(partition, lod, mode) {
  const lods = catalog.files[partition];
  if (!lods) throw new Error(`Unknown partition "${partition}". Use one of: ${Object.keys(catalog.files).join(', ')}`);
  const modes = lods[lod];
  if (!modes) throw new Error(`"${partition}" has no "${lod}" level of detail. Use one of: ${Object.keys(lods).join(', ')}`);
  if (!modes.includes(mode)) throw new Error(`"${partition}/${lod}" has no "${mode}" mode. Use one of: ${modes.join(', ')}`);
}

/**
 * Repository-relative path of an SVG, e.g. `dist/svg/governorates/tunisia-governorates-medium-light.svg`.
 * @param {string} partition  country | regions | districts | governorates | delegations | sectors
 * @param {string} [lod]      full | high | medium | low | tiny
 * @param {string} [mode]     plain | outline | light | dark | labeled | labeled-ar | nested | interactive
 */
export function svgPath(partition, lod = 'medium', mode = 'plain') {
  check(partition, lod, mode);
  return `dist/svg/${partition}/tunisia-${partition}-${lod}-${mode}.svg`;
}

/** Repository-relative path of a GeoJSON or TopoJSON file (WGS84). */
export function dataPath(partition, lod = 'medium', format = 'topojson') {
  if (!catalog.files[partition]?.[lod]) throw new Error(`Unknown partition/lod ${partition}/${lod}`);
  if (format !== 'geojson' && format !== 'topojson') throw new Error('format must be "geojson" or "topojson"');
  return `dist/${format}/tunisia-${partition}-${lod}.${format}`;
}

/** jsDelivr URL of any file returned by svgPath() or dataPath(). Pin `ref` to a tag (e.g. "v1.0.0") in production. */
export function cdnURL(relativePath, ref = 'main') {
  return `${CDN_BASE}@${ref}/${relativePath}`;
}

/** Absolute file URL of a dist file when the package is installed locally (Node, bundlers). */
export function fileURL(relativePath) {
  return new URL(`../${relativePath}`, import.meta.url);
}
