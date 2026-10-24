# FAQ

### Can I use the maps in a commercial product?
Yes. The maps are under the ODbL 1.0 (data) and the code under MIT. You only need to **credit OpenStreetMap contributors**,
and if you publish a modified *database* (such as an edited GeoJSON), share it under the ODbL too. See
[LICENSE-DATA.md](../LICENSE-DATA.md).

### How do I attribute?
> Map data © OpenStreetMap contributors · Map Tunisia by Alaa Taieb

Put it under the map, in the credits of your app, or in the caption. Every SVG already carries this attribution in its metadata.

### How accurate are the borders?
As accurate as OpenStreetMap, which maps Tunisian boundaries at full precision, plus the documented corrections. The
[accuracy report](accuracy.md) compares areas with published figures (median difference ≈ 2 %; national land area within
0.1 % of the CIA World Factbook) and lists every correction. Administrative borders in OSM were largely traced from official
INS / CNCT documents; local errors are possible. If you spot one, please [report it](https://github.com/Alaa-Taieb/map-tunisia/issues/new?template=data-error.yml).

### Why are there 279 delegations and not 264?
264 was the count of the INS 2014 nomenclature, which most datasets still use. Fourteen delegations were created since
(2015–2020); the 2024 census uses 279. Map Tunisia rebuilds the new ones from their imadas. See [methodology](methodology.md#6-delegations-created-after-2014).

### What are "sectors" / imadas?
The *imada* (عمادة, often translated "sector") is the smallest administrative division of Tunisia. Each delegation has a few to
about twenty of them. There are ~2,100.

### What are the "districts"?
The five *aqalim* (أقاليم) created by Decree 2023-589. They group governorates and elect the National Council of Regions and
Districts (the upper chamber). Don't confuse them with the seven *economic regions* used for statistics and planning.

### Where are the lakes?
In the administrative maps, lagoons open to the sea (Bizerte, Ghar El Melh, El Bibane) are water, as in OSM's coastline.
Inland lakes and salt flats (Ichkeul, Sidi El Hani, the chotts), and the two Lakes of Tunis, which OSM keeps inside the
coastline, belong to the governorates that contain them, so they are part of the units. To show them, use the
[water layer](partitions-levels-modes.md#water-is-an-overlay): 67 lakes, dams, sebkhas, chotts and lagoons, drawn on top.

### Why UTM and not Web Mercator?
UTM zone 32N shows Tunisia without distortion and in real kilometres. See [projection](projection.md). For web maps
(Leaflet, MapLibre), use the GeoJSON / TopoJSON files: they are plain longitude/latitude.

### The labels use a different font on my machine.
SVGs reference common fonts (Inter, Segoe UI, Helvetica, Arial; Noto Naskh Arabic, Tahoma) and fall back to your system font.
Set your own with CSS: `.map-tunisia .label { font-family: "Your Font" }`.

### The `interactive` mode doesn't react in my `<img>` tag.
Browsers render `<img>` SVGs as static pictures. Inline the SVG in your HTML, or embed it with `<object>`.

### How often is the data updated?
Run `npm run fetch && npm run extract && npm run build` at any time to rebuild from the latest OpenStreetMap data. Releases
are tagged with the OSM extract date.

### Can I get other projections, sizes or colours?
Restyle with CSS; scale with `width`/`height`. For other projections, use the GeoJSON/TopoJSON with your tool (D3, QGIS,
mapshaper). New modes are welcome as pull requests: see `scripts/build/svg.js`.

### Who made this?
**Map Tunisia** was created by [Alaa Taieb](https://github.com/Alaa-Taieb). The data comes from the thousands of
[OpenStreetMap](https://www.openstreetmap.org) contributors who mapped Tunisia.
