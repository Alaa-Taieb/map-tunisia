# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).
Data releases also state the date of the OpenStreetMap extract they were built from.

## [Unreleased]

## [1.4.0] — 2026-10-24

Built from the same OpenStreetMap extract of **2026-10-16**. Geometry, ids and the existing attributes of every layer are
unchanged; the existing SVGs only move to the 1.4.0 version stamp.

### Added
- **Two label modes**, `labeled-tfng` (names in Tifinagh) and `labeled-en` (English names in plain ASCII), wherever the
  `labeled` and `labeled-ar` modes exist: `medium`, `low` and `tiny` for the country, regions, districts and governorates,
  `medium` and `low` for delegations, sectors, municipalities, water and cities. 44 new SVG files, 235 in total; 10 modes.
- Three name columns in every attribute table, GeoJSON and TopoJSON, next to `name_ar`:
  - `name_tfng`: the Tamazight name OpenStreetMap holds in Tifinagh (`name:zgh`, then `name:ber`, …) where there is one —
    11 units: the country (ⵜⵓⵏⵙ) and 10 cities, e.g. Kairouan ⵜⴰⴽⴻⵔⵡⴰⵏⵜ and Tataouine ⵜⵉⵟⵟⴰⵡⵉⵏ — else the Arabic name
    transliterated letter by letter into Neo-Tifinagh (IRCAM letters; تونس → ⵜⵓⵏⵙ, القيروان → ⵍⵇⵉⵔⵡⴰⵏ). Tunisia has no
    official Tifinagh names, so no Tamazight name is invented or translated;
  - `name_tfng_source`: `osm` or `transliterated`;
  - `name_translit`: the English transliteration — the curated English name for the country, regions, districts and
    governorates (*Greater Tunis*, *Kef*), else the Latin name with English generic terms for water bodies (*Lake Bizerte*,
    *Sidi Salem Dam*, *Ghar El Melh Lagoon*), in plain ASCII (*Gabès* → *Gabes*).
- `scripts/extract/tifinagh.py` (`npm run extract:tifinagh`) and `data/source/tifinagh-names.json`, the transliteration
  rules in `scripts/build/names.js`, the label modes in one table (`LABEL_MODES` in `scripts/build/config.js`), a Tifinagh
  font stack (Noto Sans Tifinagh, Ebrima, Segoe UI Historic) and `xml:lang` (`und-Tfng`, `en`) on the new maps, the new
  modes and names in the explorer and the TypeScript types, docs (methodology section 12, modes, data dictionary) and
  tests (`test/labels.test.js`).

### Fixed
- In `labeled-ar`, a unit without an Arabic name (5 water bodies) now has its label sized for the Latin name it actually
  shows (the two `water-*-labeled-ar` files move by a hundredth of a kilometre).
- `CITATION.cff` gave 1.3.0 as its `cff-version` (the format version, 1.2.0) and kept 1.2.0 as the dataset version; it now
  reads `cff-version: 1.2.0` and `version: 1.4.0`.

## [1.3.0] — 2026-10-24

Built from the same OpenStreetMap extract of **2026-10-16**. The geometry and attributes of the six nested partitions, the
municipalities and the water layer are unchanged; only the version stamp in their SVG metadata moves to 1.3.0.

### Added
- **Cities layer**, `cities`: a point layer of 284 OpenStreetMap place nodes — the national capital (Tunis), the other
  23 governorate capitals and 260 seats of OSM municipalities. Each point carries its `type` (`national_capital`,
  `governorate_capital` or `city`), `capital_of`, names (ar/fr/en), governorate, region, district, delegation, sector,
  the municipality it is the seat of, `lon`/`lat`, its `x`/`y` in the shared SVG frame, the OSM `place` type, how it was
  found (`seat_source`), Wikidata item and OSM node. Ids are `city-n<OSM node>`.
- Capitals come from the `admin_centre` members of the country and governorate relations; a municipal seat is the
  municipality's `admin_centre` or the settlement node of the same name in it. Nothing is typed in by hand: 56 of the 338
  OSM municipalities have no such node and get no point, and the 12 municipalities missing from OSM (Sfax and Sidi Bouzid
  among them) have none either. Both lists are in the accuracy report.
- SVG (`full`, `high`, `medium`, `low` × 7 modes; no `nested`): dots sized and coloured by type over the land and the
  governorate borders, labels placed without overlaps (every capital, with leader lines in Grand Tunis; capitals only at
  `low`). Point GeoJSON and TopoJSON per level of detail, CSV and JSON, in the existing naming scheme, subpath exports and
  release ZIPs. 191 SVG files in total.
- `scripts/extract/cities.py` (`npm run extract:cities`), `CityAttributes` and `CityType` TypeScript types, the layer in
  the explorer, a cities section in the accuracy report and the reference tables, usage examples with `project()`, and tests
  (one capital per governorate lying inside it, every point in its governorate, `x`/`y` equal to `project()`).

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
