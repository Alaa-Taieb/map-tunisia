# Methodology

How raw OpenStreetMap data becomes exactly nested, multi-level maps. In short: one planar topology, documented rules for
every conflict, and topology-aware simplification.

```text
 Geofabrik OSM extract (.pbf)
        │  scripts/extract/fetch.py
        ▼
 pyosmium: governorates (admin_level 4), delegations (5), sectors / imadas (6), coastline islets; boundary=municipality;
          water areas; place nodes and admin_centre members (cities)
        │  scripts/extract/extract.py
        ▼
 planar overlay → labelled faces → conflict rules → gap allocation → post-2014 delegations
        ▼
 data/source/tunisia-sectors.geojson  +  data/attributes/*.csv  +  extract-report.json
        │  scripts/build/build.js (mapshaper)
        ▼
 dissolve per partition → UTM 32N → simplify per level of detail → labels, colours
        ▼
 dist/svg  ·  dist/geojson  ·  dist/topojson  ·  dist/data
```

## 1. Source

**OpenStreetMap** is the most detailed and most actively maintained open source of Tunisian boundaries.

- Coastline and boundaries are mapped at full precision (1e-7°, about 1 cm).
- All 24 governorates carry ISO 3166-2 codes; delegations and sectors carry INS geocodes (`ref:tn:codegeo`) and
  delegations carry HASC codes.
- The admin-boundary datasets distributed by humanitarian portals (OCHA COD-AB, 2022) and geoBoundaries (2017) describe
  the same INS 2014 structure (264 delegations, 2,084 imadas) and are older snapshots.

We read the [Geofabrik](https://download.geofabrik.de/africa/tunisia.html) extract. Its replication timestamp and SHA-256
are recorded in `data/source/extract-report.json`, so every build can be traced to an exact OSM state.

## 2. Reading OSM

[pyosmium](https://osmcode.org/pyosmium/) assembles relations into (multi)polygons. We keep:

- `boundary=administrative` + `admin_level=4` with an `ISO3166-2=TN-*` tag: the 24 governorates;
- `admin_level=5` relations inside Tunisia: delegations;
- `admin_level=6` relations inside Tunisia: sectors (imadas);
- `natural=coastline` closed rings inside Tunisia's maritime boundary that no governorate covers (63 islets, 0.2 km² in total).

OSM's national relation (`admin_level=2`) is **not** used for land: it includes the 12-nautical-mile territorial sea.
The governorates follow the coastline, so they define the land.

## 3. One planar topology

Different administrative levels in OSM are separate relations. They usually share ways, but not always. Clipping each level
independently would leave slivers and mismatched borders.

Instead, **every boundary of every level is noded together** (`shapely.union_all` over all rings) and polygonised into
about 2,300 elementary **faces**. Each face lies entirely inside at most one unit of each level, and adjacent faces share
exactly the same edge. Every final unit is a union of faces, so:

- there are no gaps and no overlaps, by construction;
- a delegation border is *the same line* as the matching parts of its sectors' borders and of its governorate's border.

## 4. Labelling faces, and the conflict rules

Each face is labelled with the governorate, delegation and sector that contain its representative point.
The rules for disagreements, in order:

1. **Superseded relations are dropped**, as listed in `corrections.json`. Example: OSM still holds the pre-2019 *Regueb*
   delegation alongside its two successors (*Regueb* and *Essaïda*).
2. **Delegations nest in governorates**: a delegation's governorate is the one containing most of its area. Only
   delegations of the face's governorate are candidates.
3. **When the governorate disagrees with both lower levels**, and a delegation *and* one of its sectors cover a face that
   the governorate relation puts elsewhere, the two lower levels win. Example: 5.2 km² around Yasmine Hammamet are moved
   from Sousse to Nabeul.
4. **Overlapping delegations** are resolved with sector evidence (the delegation whose INS code prefixes the sector's code),
   then by preferring the smaller delegation.
5. **A sector's delegation** is the one that contains it (≥ 90 % of its area). For partial overlaps, the delegation matching
   the sector's INS code wins.
6. **Overlapping sectors** prefer sectors with an INS code (uncoded duplicates are usually stale), then the smaller one.

## 5. Filling gaps: lakes, sebkhas and slivers

OSM governorates include inland water bodies such as Sebkhet Sidi El Hani, Sebkhet Kelbia, Lake Ichkeul, Sebkhet Ariana
and Sebkhet Séjoumi, but most delegations and sectors leave them out (≈ 690 km² in total). For a complete, nested map, each
uncovered area is **split between the neighbouring units of the same parent by nearest-boundary allocation**:

1. sample the neighbours' borders every 100 m (in UTM metres);
2. build the Voronoi diagram of the samples, so each point of the lake goes to the closest neighbour;
3. intersect the cells with the gap and attach each piece to its neighbour.

This happens first at the delegation level (inside each governorate), then at the sector level (inside each delegation).
The largest allocations are listed in the [accuracy report](accuracy.md#inland-water-allocated-to-delegations).

## 6. Delegations created after 2014

OSM (like the OCHA and geoBoundaries datasets) still follows the INS 2014 nomenclature of 264 delegations. Tunisia has
**279** today (RGPH 2024). New delegations are formed by regrouping existing imadas, so we **rebuild them from OSM
sectors**. Their composition comes from the official electoral authority (**ISIE**): its 2023 local-election and 2025
administrative circonscription lists name every imada of every delegation. Creation decrees (2015-240, 2016-1103,
2020-367…) and population checks confirm them. Each one is recorded in
[`corrections.json`](../scripts/extract/corrections.json) with its sources.

The result matches the INS 2024 nomenclature exactly. Every INS delegation code appears once, and delegation populations
add up to governorate totals.

## 7. Attributes

- **Names.** Arabic and French from OSM (`name:ar`, `name:fr`) with prefixes removed (`معتمدية`, `Délégation`…), invisible
  direction marks stripped, and Persian look-alike letters (`ی`, `ک`) normalised to Arabic. English uses `name:en` when it
  exists, otherwise the French spelling, as is customary for Tunisian place names. Governorate, region and district names
  are curated by hand.
- **Codes.** ISO 3166-2 (governorates), INS codes (governorates, delegations, sectors), HASC (delegations), Wikidata.
- **Population.** INS census figures (RGPH 2014 and 2024) on the 2024 delegation nomenclature, aggregated for governorates,
  regions, districts and the country.
- **Groupings.** Regions follow the INS economic regions (they match the ISO 3166-2 numbering: `TN-1x` Grand Tunis,
  `TN-2x` Nord-Est …). Districts follow Decree 2023-589.

## 8. From source data to maps

For each partition, [mapshaper](https://github.com/mbloch/mapshaper):

1. **dissolves** the sector master layer on the partition key (exact, because the faces share edges);
2. **re-imports** the result, so only the nodes where units of *this* partition meet stay fixed;
3. **projects** to UTM zone 32N;
4. derives the higher-level borders (for `nested`) and the country outline *before* simplifying, so they share one topology
   with the fills;
5. **simplifies** each level of detail with Visvalingam weighting at the given tolerance, with `keep-shapes` so no unit disappears.

Then the Node build:

- drops secondary islets below each level's threshold (never a unit's main part);
- computes **ellipsoidal areas** by integrating the UTM scale factor with Green's theorem (exactly additive across levels);
- colours the units with a greedy graph colouring on shared borders (8 colours, zero conflicts);
- places labels at the **pole of inaccessibility** ([polylabel](https://github.com/mapbox/polylabel)), sized to fit, with
  collision avoidance and sea callouts;
- writes compact, semantic SVG: relative path commands, minimal decimals, `id` and `data-*` attributes, `<title>` tooltips,
  accessible `role`/`aria` metadata;
- writes GeoJSON and TopoJSON by inverting the projection, so they match the SVGs exactly.

## 9. Municipalities

Municipalities (*baladiyat*) cover the country since the 2016 division, but their borders do not follow delegations or
sectors, so they cannot be faces of the planar overlay. `scripts/extract/municipalities.py` builds them as a separate layer:

1. reads every OSM relation tagged `boundary=municipality` (OSM maps Tunisian municipalities with this tag, not an `admin_level`);
2. clips each one to the land, the union of the sectors, so the layer shares the national coastline and borders;
3. gives any overlap between two relations to the smaller one, so every point belongs to at most one municipality;
4. attaches each municipality to the governorate that holds most of its area (all of them lie at least 95 % in one);
5. never invents geometry: land that no relation covers stays uncovered and is listed in `municipalities-report.json`.

The build simplifies the municipalities together with one land polygon, so the light base drawn under them shares their
topology at every level of detail.

## 10. Water layer

Lakes, dam reservoirs, sebkhas, chotts and sea-side lagoons ship as an optional overlay, `water`, built by
`scripts/extract/water.py`. It changes nothing in the partitions above: the inland water bodies already belong to the
governorates, delegations and sectors that contain them (section 5), and the lagoons lie outside the land.

1. reads the OSM water areas: `natural=water` with `water=lake`, `reservoir`, `salt_lake`, `lagoon` or no `water` tag,
   `water=salt_lake`, and salt wetlands (`wetland=saltmarsh`, `sabkha` or `tidalflat`, or `salt=yes`). Rivers, canals, ponds,
   basins, wastewater and salt pans (`saltern`, `landuse=salt_pond`) are left out, and so are polygons named *Oued*/*وادي*;
2. keeps the **named** areas only (948 unnamed ones, mostly hill lakes and salt marsh, are counted in the report) and clips
   them to the land, which also cuts off the parts of Chott el-Gharsa and the southern sebkhas that lie in Algeria or Libya;
3. keeps the sea-side lagoons that OSM draws as polygons (Ghar El Melh, and the two Lakes of Tunis, which OSM places
   inside the coastline) on their own side of the coastline;
4. builds the lagoons that OSM only draws with `natural=coastline` (Bizerte, El Bibane): the territorial sea (the country
   relation minus the land) is eroded by 300 m, the part still joined to the open sea is grown back, and what is left over
   are the pockets that reach the sea through a channel narrower than 600 m. The pocket that holds each lagoon's seed point
   becomes the lagoon, cut where its channel meets the open sea; the names come from a short table in the script (El
   Bibane's from an OSM `natural=bay` node). Other pockets are listed in the report and not published;
5. merges the same body mapped twice (one polygon at least half inside another, or touching polygons with the same name or
   Wikidata item, such as the two relations of Sebkhet Sidi El Hani) and gives any other overlap to the smaller body;
6. drops bodies under 1 km², then classifies the rest by name and tags: *Chott*/*شط* → `chott`; *Sebkha*/*سبخة* → `sebkha`;
   `water=reservoir` or *Barrage*/*سد* → `reservoir`; the lagoons above → `lagoon`; other salt water → `sebkha`; else `lake`;
7. records the governorate holding most of each body (the nearest shore for lagoons) and every governorate it touches.

The build draws the water bodies over one land polygon simplified in the same topology, takes the coastline from that land
polygon alone so lagoons are never mistaken for land, and colours the bodies by type rather than by graph colouring.

## 11. Cities layer

The capital, the governorate capitals and the municipal seats ship as a point layer, `cities`, built by
`scripts/extract/cities.py` from the OSM place nodes. Nothing is typed in by hand; every point is an OSM node.

1. reads every `place=*` node, and the `admin_centre` members of the country relation (admin_level 2), of the 24
   governorate relations (admin_level 4, `ISO3166-2=TN-*`) and of the `boundary=municipality` relations;
2. the national capital is the `admin_centre` of the country, and must be a node tagged `capital=yes` (Tunis); each
   governorate capital is the `admin_centre` of its governorate and must lie inside it. The script stops if either is
   missing, so a capital is never guessed;
3. finds the seat of each municipality, in this order: the governorate capital of the same name in or within 500 m of it
   (Jendouba's node lies 224 m outside its municipality, inside Ettataouer); the `admin_centre` of the municipality
   relation (6 have one); a settlement node (`city`, `town`, `village`, `suburb`, `quarter`, `neighbourhood`) within 500 m
   with the same Latin or Arabic name, ignoring accents, case and the article (*El*, *Al*, *ال*); else a `city` or `town`
   node inside it whose name is a whole-word part of the municipality's name (*Midoun* in *Djerba Midoun*). Several
   candidates of one rank: the more important `place`, then the one with a Wikidata item, then the one nearest the centre
   of the municipality (the report lists each such choice);
4. publishes the national capital, the governorate capitals and the seats found, each with the governorate, delegation and
   sector it lies in (point in polygon on the sectors) and the municipality it is the seat of; municipalities without a
   seat node, and OSM cities and towns that are no municipal seat, are listed in `cities-report.json` and not published.

There is no population threshold: OSM `population` tags exist for few nodes and come from different years. The build draws
the points over the land and the governorate borders of each level of detail, and places labels around the dots.

## 12. Validation

`npm test` checks, among other things:

- counts (24 / 279 / 2,083) and the exact match with the INS 2024 delegation list;
- unique, well-formed identifiers;
- names in the right script, with no stray direction marks;
- hierarchy consistency, the regions grouping and the 2023 districts decree;
- areas adding up exactly across levels, and land area within 0.5 % of the CIA World Factbook figure;
- populations adding up to the national census totals;
- municipalities: count, unique ids tied to their OSM relation, valid closed geometry in every GeoJSON and TopoJSON, no
  overlaps, nothing outside the land, coverage above 97 %, and no nesting assumed (no delegation or sector columns);
- water: counts per type, ids tied to their OSM way or relation, names, governorates, the landmark lakes, chotts and
  lagoons with plausible areas, no overlaps, nothing outside Tunisia, lagoons on the sea side, valid GeoJSON and TopoJSON at
  every level, and the land drawn under the bodies in every SVG, coloured by type;
- cities: counts per type, Tunis as the national capital, one capital per governorate lying inside it (point in polygon on
  the full-precision borders) and named as in `governorates.csv`, ids tied to their OSM node, one seat per municipality,
  `x`/`y` equal to `project()`, GeoJSON and TopoJSON points at every level, and every capital labelled in the labelled SVGs;
- every SVG of the matrix exists, is valid XML, shares the frame, credits OSM and the author, has one path (or dot) per unit and
  one label per polygon unit, contains no scripts or external references, and fits its size budget;
- the projection helper matches PROJ to 1 mm.

CI also rebuilds everything and fails if the committed files are out of date.
