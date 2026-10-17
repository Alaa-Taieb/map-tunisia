/**
 * Map Tunisia — projection helpers.
 *
 * Every SVG in this project uses the same frame:
 *   - projection: WGS 84 / UTM zone 32N (EPSG:32632)
 *   - 1 SVG user unit = 1 kilometre
 *   - x = easting / 1000 - FRAME.x0
 *   - y = FRAME.y0 - northing / 1000
 *
 * `project([lon, lat])` returns SVG [x, y]; `invert([x, y])` returns [lon, lat].
 * The transverse Mercator maths uses Krüger's series to 6th order (Karney 2011),
 * which is accurate to well under a millimetre inside the zone.
 *
 * @module map-tunisia/projection
 */

import FRAME_JSON from './frame.js';
import { toUTM, fromUTM } from './utm.js';

export { toUTM, fromUTM };

/** The shared SVG frame (origin and size in kilometres). */
export const FRAME = FRAME_JSON;

/**
 * Longitude/latitude (degrees) → SVG user units [x, y] in every Map Tunisia SVG.
 * @param {[number, number]} lonlat
 * @returns {[number, number]}
 */
export function project(lonlat) {
  const [E, N] = toUTM(lonlat);
  return [E / 1000 - FRAME.x0, FRAME.y0 - N / 1000];
}

/**
 * SVG user units [x, y] → longitude/latitude (degrees).
 * @param {[number, number]} xy
 * @returns {[number, number]}
 */
export function invert([x, y]) {
  return fromUTM([(x + FRAME.x0) * 1000, (FRAME.y0 - y) * 1000]);
}
