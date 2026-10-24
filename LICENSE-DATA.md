# Data licence — Open Database License (ODbL) 1.0

The geometry and attributes in this repository are derived from
**[OpenStreetMap](https://www.openstreetmap.org)**, © OpenStreetMap contributors,
which is available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

This applies to:

- `data/source/` and `data/attributes/` — the cleaned, nested boundary database, the municipalities
  (OpenStreetMap relations tagged `boundary=municipality`) the water bodies (OpenStreetMap water areas and coastline) and the cities (OpenStreetMap place nodes);
- `dist/` — every SVG, GeoJSON, TopoJSON, CSV and JSON file;
- `docs/assets/` — the illustrations composed from the maps.

Census figures in `data/attributes/governorates.csv` and `data/reference/` come from the
Institut National de la Statistique (INS) of Tunisia (RGPH 2014 and 2024 censuses). The
composition of delegations created after 2014 comes from the public circonscription lists
of the Instance Supérieure Indépendante pour les Élections (ISIE). Facts are not subject to
copyright; we cite these institutions as sources.

## What you need to do

You are free to **use, share and adapt** the maps — including in commercial products — as long as you:

1. **Attribute.** Show this credit wherever the map is displayed or distributed:

   > Map data © OpenStreetMap contributors · [Map Tunisia](https://github.com/Alaa-Taieb/map-tunisia) by Alaa Taieb

   A short form works for small screens: `© OpenStreetMap contributors`.
   Every SVG already carries the attribution in its `<desc>` and `<metadata>`; please keep it.

2. **Share alike (databases only).** If you publish a modified *database* derived from these
   files (for example an edited GeoJSON), publish it under the ODbL too. A picture, web page
   or printed map that merely *uses* the maps is a "Produced Work" — it only needs attribution.

3. **Keep it open.** Do not apply technical restrictions that prevent others from using the data under the ODbL.

See the [OSM copyright page](https://www.openstreetmap.org/copyright) and the
[ODbL summary](https://opendatacommons.org/licenses/odbl/summary/) for details. This page is a
summary and not legal advice; the licence text is authoritative.
