export type Partition = 'country' | 'regions' | 'districts' | 'governorates' | 'delegations' | 'sectors' | 'municipalities';
export type Lod = 'full' | 'high' | 'medium' | 'low' | 'tiny';
export type Mode = 'plain' | 'outline' | 'light' | 'dark' | 'labeled' | 'labeled-ar' | 'nested' | 'interactive';
export type DataFormat = 'geojson' | 'topojson';
export type AttributeFormat = 'json' | 'csv';

/** One row of `dist/data/<partition>.json` (all values are strings, as in the CSV). */
export interface UnitAttributes {
  id: string;
  name_en?: string;
  name_fr?: string;
  name_ar?: string;
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
