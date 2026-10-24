export type Partition = 'country' | 'regions' | 'districts' | 'governorates' | 'delegations' | 'sectors' | 'municipalities' | 'water' | 'cities';
export type Lod = 'full' | 'high' | 'medium' | 'low' | 'tiny';
export type Mode = 'plain' | 'outline' | 'light' | 'dark' | 'labeled' | 'labeled-ar' | 'labeled-tfng' | 'labeled-en' | 'nested' | 'interactive';
export type DataFormat = 'geojson' | 'topojson';
export type AttributeFormat = 'json' | 'csv';

/** One row of `dist/data/<partition>.json` (all values are strings, as in the CSV). */
export interface UnitAttributes {
  id: string;
  name_en?: string;
  name_fr?: string;
  name_ar?: string;
  /** Name in Tifinagh script: the Tamazight name from OSM, else the Arabic name transliterated letter by letter. */
  name_tfng?: string;
  /** Where `name_tfng` comes from; empty when the unit has no Arabic name to transliterate. */
  name_tfng_source?: 'osm' | 'transliterated' | '';
  /** English transliteration: the Latin name in plain ASCII with English generic terms (Lake, Dam, Greater Tunis). */
  name_translit?: string;
  population_2014?: string;
  population_2024?: string;
  area_km2?: string;
  label_lon?: string;
  label_lat?: string;
  label_x?: string;
  label_y?: string;
  [column: string]: string | undefined;
}

/**
 * One row of `dist/data/municipalities.json`. Municipalities do not nest in delegations or sectors,
 * so a row has no `delegation` or `sector`; `id` is `municipality-<osm_relation>`.
 */
export interface MunicipalityAttributes extends UnitAttributes {
  governorate: string;
  region: string;
  district: string;
  osm_relation: string;
  wikidata?: string;
}

export type WaterType = 'lake' | 'reservoir' | 'lagoon' | 'sebkha' | 'chott';

/**
 * One row of `dist/data/water.json`. The water layer is an overlay: inland water also belongs to the units of the
 * other partitions. `id` is `water-w<OSM way>`, `water-r<OSM relation>`, or `water-bizerte` / `water-el-bibane` for
 * the two lagoons cut from the coastline.
 */
export interface WaterAttributes extends UnitAttributes {
  type: WaterType;
  /** The governorate holding most of the body (the nearest shore for lagoons). */
  governorate: string;
  /** Every governorate the body touches, space-separated ISO 3166-2 codes. */
  governorates: string;
  region: string;
  district: string;
  salt: '' | 'yes';
  intermittent: '' | 'yes' | 'no';
  wikidata?: string;
  /** `way/<id>` or `relation/<id>`; empty for the lagoons cut from the coastline. */
  osm: string;
  geometry_source: 'osm_polygon' | 'osm_coastline';
}

export type CityType = 'national_capital' | 'governorate_capital' | 'city';

/**
 * One row of `dist/data/cities.json`: a point, not a polygon. The national capital (Tunis), the 24 governorate capitals
 * and the seats of the OSM municipalities. `id` is `city-n<OSM node>`. Place it on any SVG with `project([lon, lat])`,
 * or read `x` / `y`, already in the shared SVG frame.
 */
export interface CityAttributes {
  id: string;
  type: CityType;
  /** `TN` for the national capital, the ISO 3166-2 code for a governorate capital (`TN TN-11` for Tunis), else empty. */
  capital_of: string;
  governorate: string;
  region: string;
  district: string;
  delegation: string;
  sector: string;
  /** The municipality this city is the seat of (`municipality-<OSM relation>`); empty when OSM maps none for it. */
  municipality: string;
  name_en: string;
  name_fr: string;
  name_ar: string;
  name_tfng: string;
  name_tfng_source: 'osm' | 'transliterated' | '';
  name_translit: string;
  lon: string;
  lat: string;
  /** Position in the shared SVG frame (km). */
  x: string;
  y: string;
  /** The OSM `place` tag of the node: city, town, village, suburb, quarter or neighbourhood. */
  place: string;
  /** How the point was chosen: the admin_centre of the country, governorate or municipality, or a name match in the municipality. */
  seat_source: 'country_admin_centre' | 'governorate_admin_centre' | 'municipality_admin_centre' | 'name' | 'partial_name';
  wikidata: string;
  /** `node/<id>` */
  osm: string;
}

export interface CatalogPartition {
  id: Partition;
  title: string;
  titleAr: string;
  count: number;
  lods: Lod[];
}

export interface Catalog {
  osmDate: string;
  partitions: CatalogPartition[];
  /** `files[partition][lod]` lists the SVG modes that exist. */
  files: Record<string, Record<string, Mode[]>>;
  [key: string]: unknown;
}

export const catalog: Catalog;
export const CDN_BASE: string;

export { project, invert, toUTM, fromUTM, FRAME } from './projection.js';

/** Repository-relative path of an SVG, e.g. `dist/svg/governorates/tunisia-governorates-medium-light.svg`. */
export function svgPath(partition: Partition, lod?: Lod, mode?: Mode): string;
/** Repository-relative path of a GeoJSON or TopoJSON file (WGS84). */
export function dataPath(partition: Partition, lod?: Lod, format?: DataFormat): string;
/** Repository-relative path of the attribute table (names, codes, populations, areas, label points). */
export function attributesPath(partition: Partition, format?: AttributeFormat): string;
/** jsDelivr URL of any file returned by svgPath(), dataPath() or attributesPath(). */
export function cdnURL(relativePath: string, ref?: string): string;
/** Absolute file URL of a dist file when the package is installed locally. */
export function fileURL(relativePath: string): URL;
