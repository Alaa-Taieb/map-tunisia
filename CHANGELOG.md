# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).
Data releases also state the date of the OpenStreetMap extract they were built from.

## [1.0.0] — 2026-10-17

First public release, built from the OpenStreetMap extract of **2026-10-16**.

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
