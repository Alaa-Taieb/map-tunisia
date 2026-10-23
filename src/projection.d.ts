export type LonLat = [lon: number, lat: number];
export type XY = [x: number, y: number];

/** The shared SVG frame (origin and size in kilometres). */
export const FRAME: { x0: number; y0: number; width: number; height: number };

/** Longitude/latitude (degrees) → SVG user units [x, y] in every Map Tunisia SVG. */
export function project(lonlat: LonLat): XY;
/** SVG user units [x, y] → longitude/latitude (degrees). */
export function invert(xy: XY): LonLat;
/** Longitude/latitude → UTM zone 32N [easting, northing] in metres. */
export function toUTM(lonlat: LonLat): XY;
/** UTM zone 32N [easting, northing] in metres → longitude/latitude. */
export function fromUTM(en: XY): LonLat;
