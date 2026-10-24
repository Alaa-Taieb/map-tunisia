# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).
Data releases also state the date of the OpenStreetMap extract they were built from.

## [Unreleased]

## [1.2.0] — 2026-10-24

Built from the same OpenStreetMap extract of **2026-10-16**. The geometry and attributes of the six nested partitions and
of the municipalities are unchanged; only the version stamp in their SVG metadata moves to 1.2.0.

### Added
- **Water layer**, `water`: an overlay of the 67 named water bodies of at least 1 km² — 6 lakes, 18 dam reservoirs,
  35 sebkhas, 3 chotts and 5 sea-side lagoons (Bizerte, Ghar El Melh, the two Lakes of Tunis, El Bibane), 7,016 km² in
  total. It leaves the nested partitions untouched: inland water stays inside the governorates, delegations and sectors.
  Each body carries its `type`, names (ar/fr/en), main governorate and every governorate it touches, region, district,
  area, `salt` and `intermittent` flags, OSM element and Wikidata item. Ids are `water-w<way>` / `water-r<relation>`, and
  `water-bizerte` / `water-el-bibane` for the two lagoons OSM only draws with its coastline.
- SVG (`full`, `high`, `medium`, `low` × 7 modes; no `nested`), GeoJSON, TopoJSON, CSV and JSON in the existing naming
  scheme and subpath exports, and in the release ZIPs. 174 SVG files in total. The land is drawn as a base under the
  water; `light`, `dark` and `interactive` colour the bodies by type (blue water, sand-coloured salt flats).
- `scripts/extract/water.py` (`npm run extract:water`), a `WaterAttributes` TypeScript type, the layer in the explorer,
  a water section in the accuracy report (merges, clips, left-out areas) and in the reference tables, and tests.

### Fixed
- The docs said the Lake of Tunis lies outside the land like the other lagoons; OSM keeps both Lakes of Tunis inside its
  coastline, so they are part of the Tunis and Ben Arous units. The FAQ and accuracy report now say so.

## [1.1.0] — 2026-10-24

Built from the same OpenStreetMap extract of **2026-10-16**. The geometry and attributes of the six nested partitions are
unchanged; only the version stamp in their SVG metadata moves to 1.1.0.

### Added
- **Municipalities (baladiyat)** as a seventh partition, `municipalities`, that does not nest in delegations or sectors:
  338 municipalities from the OpenStreetMap relations tagged `boundary=municipality`, in all 24 governorates, covering
  97.9 % of the land. Ids are `municipality-<OSM relation>`; each row carries its names (ar/fr/en), governorate, region,
  district, area and label point.
- SVG (`full`, `high`, `medium`, `low` × 7 modes; no `nested`), GeoJSON, TopoJSON, CSV and JSON, in the existing naming
  scheme and subpath exports, and in the release ZIPs. 157 SVG files in total.
- The land outside every municipality is drawn as a light base under the units, so it never looks like sea.
- `scripts/extract/municipalities.py` (`npm run extract:municipalities`) and an accuracy section with coverage, gaps,
  the resolved overlap and the OSM relations whose names look wrong.

## [1.0.0] — 2026-10-17

First public release, built from the OpenStreetMap extract of **2026-10-16**.

### Packaging (published to npm on 2026-10-23)
- npm packaging: TypeScript declarations, `attributesPath()`, subpath exports for the JSON/GeoJSON/TopoJSON/SVG files.
- `npm run release:zip`: reproducible per-format release ZIPs and a SHA-256 checksum file in `release/`.

### Added
- **Six nested partitions:** country, 7 economic regions, 5 districts (Decree 2023-589), 24 governorates,
  279 delegations (INS 2024 nomenclature) and 2,083 sectors (imadas).
- **Five levels of detail** (`full`, `high`, `medium`, `low`, `tiny`) with topology-preserving simplification.
- **Eight modes:** `plain`, `outline`, `light`, `dark`, `labeled`, `labeled-ar`, `nested` and `interactive`. 140 SVG files in total.
- GeoJSON and TopoJSON (WGS84) for every partition and level of detail; CSV and JSON attribute tables.
- Names in Arabic, French and English; ISO 3166-2, INS and HASC codes; 2014 and 2024 census populations; ellipsoidal areas;
  label points.
- A shared SVG frame (UTM 32N, 1 unit = 1 km) and the `project()` / `invert()` helpers.
- Extraction pipeline (pyosmium + Shapely) built on a planar face overlay: zero gaps and zero overlaps between units.
- 14 post-2014 delegations rebuilt from their imadas (ISIE circonscription lists).
- Corrections to OSM: 11 sector reassignments (Kébili, Jendouba, Mahdia), 24 name fixes, a superseded relation removed,
  a governorate border conflict at Yasmine Hammamet, and 63 coastline islets added.
- Interactive explorer (GitHub Pages), README illustrations, accuracy report, file catalog and reference tables.
- Test suite (161 checks) and CI, which also verifies that the committed files are reproducible.

[1.0.0]: https://github.com/Alaa-Taieb/map-tunisia/releases/tag/v1.0.0
