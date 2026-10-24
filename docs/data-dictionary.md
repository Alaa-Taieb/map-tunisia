# Data dictionary

## Identifiers

| Partition | `id` format | Example | Notes |
| --- | --- | --- | --- |
| country | `TN` | `TN` | ISO 3166-1 alpha-2 |
| regions | slug | `centre-est` | `grand-tunis`, `nord-est`, `nord-ouest`, `centre-est`, `centre-ouest`, `sud-est`, `sud-ouest` |
| districts | `district-<n>` | `district-3` | numbering of Decree 2023-589 |
| governorates | ISO 3166-2 | `TN-61` | the international standard; INS uses different numbers (`ins_code`) |
| delegations | `delegation-<INS code>` | `delegation-3458` | 4-digit INS code: 2-digit INS governorate + 2-digit delegation |
| sectors | `sector-<INS code>` | `sector-345851` | 6-digit INS geocode from OSM (`ref:tn:codegeo`); `sector-x<osm id>` when OSM has no code |
| municipalities | `municipality-<OSM relation>` | `municipality-7286094` | the OSM relation of the `boundary=municipality` (Zarzis); INS has no public municipality code in OSM |
| water | `water-w<OSM way>`, `water-r<OSM relation>` or `water-<name>` | `water-r3969167` | the OSM element of the water body (Chott el-Jérid); `water-bizerte` and `water-el-bibane` for the two lagoons cut from the coastline |
| cities | `city-n<OSM node>` | `city-n27564968` | the OSM place node of the city (Tunis) |

IDs are stable across levels of detail and modes, and across data refreshes unless the administrative unit itself changes.

> **ISO vs INS codes.** ISO 3166-2 numbers governorates by region (`TN-61` Sfax), while the INS uses its own sequence
> (Sfax is `34`, so its delegations are `34xx`). Both are provided.

## SVG structure

```xml
<svg viewBox="0 0 406 838" class="map-tunisia governorates medium light" data-partition="governorates"
     data-lod="medium" data-mode="light" data-crs="EPSG:32632" data-unit="km" data-x0="351" data-y0="4170" role="img" …>
  <title id="map-title">Map of Tunisia — Governorates (24)</title>
  <desc id="map-desc">… projection, attribution, source date, author …</desc>
  <metadata id="map-tunisia-metadata">{ "crs": "EPSG:32632", "frame": {…}, "osm_date": "…", … }</metadata>
  <style>…the mode's CSS…</style>
  <g id="governorates" class="units" fill-rule="evenodd">
    <path id="TN-61" class="unit governorate c3"
          data-name="Sfax" data-name-ar="صفاقس" data-name-fr="Sfax" data-name-en="Sfax"
          data-iso="TN-61" data-ins="34" data-region="centre-est" data-district="district-4" data-capital="Sfax"
          data-population-2014="955421" data-population-2024="1047468" d="M…z">
      <title>Sfax · صفاقس</title>
    </path>
    …
  </g>
  <g id="borders">…</g>   <!-- nested mode -->
  <!-- municipalities and water: <path id="<partition>-base" class="base"/> before the units, the land under them -->
  <!-- cities: <circle id="city-n…" class="unit city governorate_capital c1" cx cy r …> instead of paths, over the land and <g id="borders"> -->
  <path class="outline"/>  <!-- outline and nested modes -->
  <g id="labels">…</g>     <!-- labeled modes: <text class="label" data-for="TN-61"> -->
</svg>
```

### `data-*` attributes by partition

| Attribute | country | regions | districts | governorates | delegations | sectors | municipalities | water | cities |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `data-name`, `data-name-fr`, `data-name-en`, `data-name-ar` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `data-iso` (ISO 3166) | ✓ | | | ✓ | | | | | |
| `data-ins` (INS code) | | | | ✓ | ✓ | ✓ | | | |
| `data-hasc` (HASC code) | | | | | ✓ | | | | |
| `data-code` (region abbreviation) | | ✓ | | | | | | | |
| `data-number` (district number) | | | ✓ | | | | | | |
| `data-governorates` (space-separated ISO codes) | | ✓ | ✓ | | | | | ✓ | |
| `data-capital` | | | | ✓ | | | | | |
| `data-delegation` | | | | | | ✓ | | | ✓ |
| `data-governorate` | | | | | ✓ | ✓ | ✓ | ✓ | ✓ |
| `data-region`, `data-district` | | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `data-population-2014`, `data-population-2024` | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| `data-osm` (OSM relation), `data-wikidata` | | | | | | | ✓ | | |
| `data-type`, `data-salt`, `data-intermittent`, `data-osm` (`way/…` or `relation/…`), `data-wikidata` | | | | | | | | ✓ | |
| `data-type`, `data-municipality`, `data-capital-of`, `data-lon`, `data-lat`, `data-place`, `data-osm` (`node/…`), `data-wikidata` | | | | | | | | | ✓ |

`class` always contains `unit` and the singular partition name (`governorate`, `delegation`…, `water-body` for water).
Coloured modes add a colour class `c0`…`c7` from a graph colouring, so neighbours never share a colour. Water bodies are
coloured by type instead: `c0` lake, `c1` reservoir, `c2` lagoon (blues), `c3` sebkha, `c4` chott (sand).
Cities are `<circle>` elements with `class="unit city <type>"`, coloured by type in the `light`, `dark`, `interactive` and
labelled modes: `c0` national capital (red), `c1` governorate capital (blue), `c2` other city (slate). Labels carry the
same index (`<text class="label l1">`), and leader lines (`.leader`) join a capital to a label moved away from it.

## Attribute tables — `dist/data/<partition>.csv|json`

One row per unit, sorted by `id`. Common columns:

| Column | Description |
| --- | --- |
| `id` | identifier (see above) |
| `name_en`, `name_fr`, `name_ar` | names in English, French (official Latin spelling) and Arabic |
| `area_km2` | ellipsoidal area in km², from the full-precision geometry; children always sum to their parent |
| `label_lon`, `label_lat` | the label point (pole of inaccessibility), WGS84 |
| `label_x`, `label_y` | the same point in SVG units |
| `population_2014`, `population_2024` | INS census population (RGPH 2014 and RGPH 2024), on the 2024 boundaries |

Partition-specific columns:

| Partition | Columns |
| --- | --- |
| governorates | `iso_3166_2`, `ins_code`, `capital_en`, `capital_fr`, `capital_ar`, `region`, `district` |
| regions | `code`, `governorates` |
| districts | `number`, `governorates` |
| delegations | `ins_code`, `governorate`, `region`, `district`, `name_fr_ins` (INS spelling), `hasc`, `wikidata`, `osm_relation`, `source` (`osm` or `rebuilt from imadas (ISIE)`) |
| sectors | `ins_code`, `delegation`, `governorate`, `region`, `district`, `wikidata`, `osm_relation` |
| municipalities | `governorate` (the one holding most of its area), `region`, `district`, `wikidata`, `osm_relation`. No `delegation` or `sector`: municipalities do not nest, and their areas do not add up to the country (2.1 % of the land is outside any municipality in OSM) |
| water | `type` (`lake`, `reservoir`, `lagoon`, `sebkha`, `chott`), `governorate` (the one holding most of it; the nearest shore for lagoons), `governorates` (every governorate it touches, space-separated), `region`, `district`, `salt` (`yes` or empty), `intermittent` (`yes`, `no` or empty, from OSM), `wikidata`, `osm` (`way/<id>` or `relation/<id>`, empty for the two lagoons cut from the coastline), `geometry_source` (`osm_polygon` or `osm_coastline`). No population. An overlay: inland water is also inside the governorates, so water areas are not subtracted from them. `name_fr` is the Latin-script name, French where OSM has one, otherwise English; one body (`water-w22741868`) has only an Arabic name |
| cities | Points, so no `area_km2` and no label columns: `type` (`national_capital`, `governorate_capital`, `city`), `capital_of` (`TN` and/or the ISO code of the governorate it is the capital of: `TN TN-11` for Tunis, empty for other cities), `governorate`, `region`, `district`, `delegation`, `sector` (where the point lies), `municipality` (the one it is the seat of; empty for the Sfax and Sidi Bouzid capitals, whose municipalities are not in OSM), `lon`, `lat` (the OSM node, 7 decimals), `x`, `y` (the same point in SVG units), `place` (the OSM `place` tag: `city`, `town`, `village`, `suburb`, `quarter`, `neighbourhood`), `seat_source` (`country_admin_centre`, `governorate_admin_centre`, `municipality_admin_centre`, `name` or `partial_name`: how the point was chosen), `wikidata`, `osm` (`node/<id>`). No population. One city (`city-n12635329133`) has only an Arabic name in OSM |

## GeoJSON — `dist/geojson/tunisia-<partition>-<lod>.geojson`

- CRS: **WGS84** longitude/latitude (EPSG:4326), RFC 7946 winding.
- Coordinates rounded to 7 decimals (`full`), 6 (`high`) or 5 (other levels).
- `feature.id` = `properties.id`; properties = the attribute table columns (without the label columns).
- `cities` holds `Point` features; their properties leave out `lon`, `lat`, `x` and `y`.

## TopoJSON — `dist/topojson/tunisia-<partition>-<lod>.topojson`

- Same features and properties as the GeoJSON, with shared arcs.
- The object name equals the partition id: `topo.objects.governorates`.
- Quantisation: 10⁶ (`full`) or 10⁵ (other levels).

## Source data — `data/`

| File | Description |
| --- | --- |
| `data/source/tunisia-sectors.geojson` | Master layer: one feature per sector with `sector`, `delegation`, `governorate`; WGS84, 7 decimals. Every other partition is a dissolve of this layer. |
| `data/source/extract-report.json` | Extraction statistics, topology checks, every correction and warning, source extract date and hash. |
| `data/source/tunisia-municipalities.geojson` | Municipalities layer: one feature per municipality with `municipality`, `governorate`; WGS84, 7 decimals. Not nested in the sectors. |
| `data/source/municipalities-report.json` | Municipality coverage, overlap and validity checks, the uncovered areas, corrections and warnings. |
| `data/source/tunisia-water.geojson` | Water layer: one feature per water body with `water`, `type`, `governorate`; WGS84, 7 decimals. An overlay, not part of the nesting. |
| `data/source/water-report.json` | Water counts and areas per type, overlap and validity checks, merges, clips, left-out areas and coastline pockets, warnings. |
| `data/source/tunisia-cities.geojson` | Cities layer: one `Point` per city with `city`, `type`, `governorate`; WGS84, 7 decimals. |
| `data/source/cities-report.json` | City counts per type, seat source and governorate, the municipalities without a seat node, the OSM cities and towns that are no municipal seat, warnings. |
| `data/attributes/governorates.csv` | Hand-curated: names, ISO and INS codes, capitals, region, district, census populations. |
| `data/attributes/regions.csv`, `districts.csv` | Hand-curated groupings. |
| `data/attributes/delegations.csv`, `sectors.csv` | Generated by the extractor from OSM and `corrections.json`. |
| `data/attributes/municipalities.csv` | Generated by `scripts/extract/municipalities.py` from OSM. |
| `data/attributes/water.csv` | Generated by `scripts/extract/water.py` from OSM. |
| `data/attributes/cities.csv` | Generated by `scripts/extract/cities.py` from OSM. |
| `data/reference/ins-delegations-2024.csv` | INS 2024 delegation nomenclature with census populations (2004, 2014, 2024). |
| `data/reference/governorate-areas.csv` | Published governorate areas, used only for checks. |
