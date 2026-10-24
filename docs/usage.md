# Usage guide

Every recipe below works with files straight from this repository: download them, install the package, or link them
through the jsDelivr CDN. For production, **pin a release tag** (`@v1.1.0`) instead of `@main`.

```text
https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist/svg/<partition>/tunisia-<partition>-<lod>-<mode>.svg
https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist/topojson/tunisia-<partition>-<lod>.topojson
https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist/geojson/tunisia-<partition>-<lod>.geojson
https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist/data/<partition>.csv
```

- [1. As an image](#1-as-an-image)
- [2. Inline SVG styled with CSS](#2-inline-svg-styled-with-css)
- [3. Interactivity with vanilla JavaScript](#3-interactivity-with-vanilla-javascript)
- [4. Choropleth from your own data](#4-choropleth-from-your-own-data)
- [5. Placing points (cities, stores, events)](#5-placing-points-cities-stores-events)
- [6. React](#6-react)
- [7. D3 + TopoJSON](#7-d3--topojson)
- [8. Leaflet / MapLibre + GeoJSON](#8-leaflet--maplibre--geojson)
- [9. Python](#9-python)
- [10. R](#10-r)
- [11. QGIS and desktop GIS](#11-qgis-and-desktop-gis)
- [12. Figma, Illustrator, Inkscape, print and laser cutting](#12-figma-illustrator-inkscape-print-and-laser-cutting)
- [13. The npm helper](#13-the-npm-helper)
- [14. Municipalities](#14-municipalities)

---

## 1. As an image

The simplest option. Every file has a `viewBox`, so it scales to any size without losing quality.

```html
<img src="https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist/svg/governorates/tunisia-governorates-medium-light.svg"
     alt="Map of the 24 governorates of Tunisia" width="400">
```

In Markdown: `![Tunisia](https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist/svg/country/tunisia-country-low-plain.svg)`.

> The `interactive` mode's hover effects and tooltips only work when the SVG is **inlined** or opened directly, not inside `<img>`.

## 2. Inline SVG styled with CSS

Paste the file content into your HTML (or include it with your templating or bundler), then restyle it. Every shape is a
`<path class="unit …">` with an `id` and `data-*` attributes, so you can target anything:

```css
/* all governorates */
.map-tunisia .unit { fill: #e8eef5; stroke: #fff; }

/* one governorate, by ISO code */
#TN-61 { fill: #ffb703; }

/* every unit of a region (governorates, delegations and sectors all carry data-region) */
.unit[data-region="sud-est"] { fill: #8ecae6; }

/* delegations of Sfax */
.unit[data-governorate="TN-61"] { fill: #219ebc; }

/* hover */
.unit:hover { fill: #e63946; cursor: pointer; }
```

Start from the `plain` mode when you plan to restyle: it has the lightest built-in CSS.

## 3. Interactivity with vanilla JavaScript

```html
<div id="map"></div>
<p id="info">Hover a governorate</p>
<script type="module">
  const url = 'https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist/svg/governorates/tunisia-governorates-medium-plain.svg';
  document.getElementById('map').innerHTML = await (await fetch(url)).text();

  document.querySelectorAll('#map .unit').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      const d = el.dataset; // nameFr, nameAr, nameEn, iso, ins, region, district, population2024 …
      info.textContent = `${d.nameFr} · ${d.nameAr} — ${Number(d.population2024).toLocaleString()} inhabitants`;
    });
    el.addEventListener('click', () => location.hash = el.id); // e.g. #TN-61
  });
</script>
```

`data-name-ar` becomes `dataset.nameAr`, `data-population-2024` becomes `dataset.population2024`, and so on.

## 4. Choropleth from your own data

Join your numbers to the shapes by `id`:

```js
const rates = { 'TN-11': 12.1, 'TN-12': 13.4, /* … */ 'TN-83': 26.9 };
const max = Math.max(...Object.values(rates));

for (const el of document.querySelectorAll('#map .unit')) {
  const v = rates[el.id];
  el.style.fill = v == null ? '#eee' : `color-mix(in oklab, #023047 ${(v / max) * 100}%, #e0f2fe)`;
  el.querySelector('title').textContent += ` — ${v ?? 'no data'} %`;
}
```

Population is already built in: `data-population-2014` and `data-population-2024` are on every country, region, district,
governorate and delegation. Need population density? Divide by `area_km2` from [`dist/data/governorates.csv`](../dist/data/governorates.csv).

**Joining by other keys:** use `data-ins` (INS codes, as found in INS spreadsheets), `data-hasc` (delegations), or the names.

## 5. Placing points (cities, stores, events)

All SVGs share **one coordinate frame** (UTM zone 32N, 1 unit = 1 km). Convert longitude/latitude with the
dependency-free helper (see [projection.md](projection.md)):

```js
import { project } from 'https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/src/projection.js';

const svg = document.querySelector('#map svg');
for (const [name, lon, lat] of [['Tunis', 10.1815, 36.8065], ['Sfax', 10.7600, 34.7406], ['Tozeur', 8.1335, 33.9197]]) {
  const [x, y] = project([lon, lat]);
  svg.insertAdjacentHTML('beforeend',
    `<circle cx="${x}" cy="${y}" r="3" fill="#e63946" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke"><title>${name}</title></circle>`);
}
```

The frame is identical in every partition, level of detail and mode, so points line up whichever file you use.

## 6. React

```jsx
import { useEffect, useState } from 'react';

const SRC = 'https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist/svg/governorates/tunisia-governorates-medium-plain.svg';

export function TunisiaMap({ values = {}, onSelect }) {
  const [svg, setSvg] = useState('');
  useEffect(() => { fetch(SRC).then((r) => r.text()).then(setSvg); }, []);
  return (
    <div
      className="tunisia-map"
      dangerouslySetInnerHTML={{ __html: svg }}
      onClick={(e) => e.target.classList?.contains('unit') && onSelect?.(e.target.id)}
      ref={(node) => node?.querySelectorAll('.unit').forEach((el) => (el.style.fill = values[el.id] ?? ''))}
    />
  );
}
```

With Vite or webpack you can also import the file as a component (`vite-plugin-svgr`, `@svgr/webpack`) or as a URL
(`import url from 'map-tunisia/dist/svg/…svg?url'`).

## 7. D3 + TopoJSON

TopoJSON files share borders between neighbours, so they are smaller and you can draw inner borders only once.

```js
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

const topo = await d3.json('https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist/topojson/tunisia-delegations-medium.topojson');
const delegations = topojson.feature(topo, topo.objects.delegations);
const borders = topojson.mesh(topo, topo.objects.delegations, (a, b) => a !== b);

const width = 500, height = 1000;
const projection = d3.geoTransverseMercator().rotate([-9, 0]).fitSize([width, height], delegations); // UTM-32-like
const path = d3.geoPath(projection);

const svg = d3.select('#map').append('svg').attr('viewBox', [0, 0, width, height]);
svg.selectAll('path').data(delegations.features).join('path')
  .attr('d', path).attr('fill', (d) => d3.interpolateYlGnBu(d.properties.population_2024 / 200000))
  .append('title').text((d) => `${d.properties.name_fr} — ${d.properties.name_ar}`);
svg.append('path').datum(borders).attr('d', path).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 0.5);
```

Object names inside each TopoJSON equal the partition id (`country`, `regions`, `districts`, `governorates`, `delegations`, `sectors`, `municipalities`).

## 8. Leaflet / MapLibre + GeoJSON

GeoJSON and TopoJSON files are in **WGS84 longitude/latitude**, ready for web maps.

```js
// Leaflet
const map = L.map('map').setView([34, 9.5], 6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
const data = await (await fetch('https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist/geojson/tunisia-governorates-high.geojson')).json();
L.geoJSON(data, {
  style: { color: '#0e7490', weight: 1, fillOpacity: 0.15 },
  onEachFeature: (f, layer) => layer.bindTooltip(`${f.properties.name_fr} · ${f.properties.name_ar}`),
}).addTo(map);
```

```js
// MapLibre GL
map.addSource('gov', { type: 'geojson', data: 'https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist/geojson/tunisia-governorates-high.geojson' });
map.addLayer({ id: 'gov-fill', type: 'fill', source: 'gov', paint: { 'fill-color': '#8ecae6', 'fill-opacity': 0.4 } });
map.addLayer({ id: 'gov-line', type: 'line', source: 'gov', paint: { 'line-color': '#023047', 'line-width': 1 } });
```

Use `high` or `full` for zoomable web maps, and `medium` for overview maps.

## 9. Python

```python
import geopandas as gpd

base = "https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist"
gov = gpd.read_file(f"{base}/geojson/tunisia-governorates-medium.geojson")   # EPSG:4326
gov["density"] = gov["population_2024"] / gov["area_km2"]
gov.to_crs(32632).plot(column="density", cmap="YlOrRd", legend=True, edgecolor="white", linewidth=0.4)
```

Plotly: `px.choropleth(df, geojson=geo, locations="id", featureidkey="properties.id", color="value")`, then `fig.update_geos(fitbounds="locations", visible=False)`.

## 10. R

```r
library(sf)
base <- "https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist"
del <- st_read(file.path(base, "geojson/tunisia-delegations-medium.geojson"))
plot(st_transform(del["population_2024"], 32632), border = "white")
```

## 11. QGIS and desktop GIS

Drag any GeoJSON from `dist/geojson/` into QGIS. For analysis, use `full` (original OpenStreetMap precision) and reproject
to **EPSG:32632** (WGS 84 / UTM 32N) for metric measurements. `data/source/tunisia-sectors.geojson` is the master layer;
dissolve it on `delegation`, `governorate`, `region` or `district` to rebuild any coarser level exactly.

## 12. Figma, Illustrator, Inkscape, print and laser cutting

- **Figma / Illustrator / Inkscape:** open or drag any SVG. Each unit is a separate, named path (the `id`), which makes recolouring easy.
  Strokes use `vector-effect: non-scaling-stroke`, so they stay thin when you zoom. Some editors ignore it; if strokes look heavy, set a
  stroke width on `.unit` yourself.
- **Print:** use `high` or `full`. At A3 size (420 mm tall), `high` keeps detail finer than 0.1 mm.
- **Laser cutters and plotters:** the `outline` mode contains strokes only. For a single cut line, use `tunisia-country-high-outline.svg`.

## 13. The npm helper

```bash
npm install map-tunisia            # or: npm install github:Alaa-Taieb/map-tunisia
```

```js
import { svgPath, dataPath, attributesPath, cdnURL, fileURL, project, invert, catalog } from 'map-tunisia';

svgPath('delegations', 'low', 'dark');   // 'dist/svg/delegations/tunisia-delegations-low-dark.svg'
dataPath('sectors', 'high', 'geojson');  // 'dist/geojson/tunisia-sectors-high.geojson'
attributesPath('delegations', 'csv');    // 'dist/data/delegations.csv'
cdnURL(svgPath('country'), 'v1.1.0');    // jsDelivr URL
fileURL(svgPath('country'));             // file:// URL inside node_modules (Node, bundlers)
project([10.18, 36.80]);                 // → [x, y] in SVG units
catalog.files.sectors;                   // { full: ['plain'], high: [...], ... } — what exists
```

`svgPath()` throws a helpful error for combinations that don't exist (for example `sectors` at `tiny`).

The attribute tables can be imported directly, no file reading needed:

```js
import delegations from 'map-tunisia/data/delegations.json' with { type: 'json' };
```

Subpath exports: `map-tunisia/data/*`, `/geojson/*`, `/topojson/*`, `/svg/*` and `/projection`. TypeScript declarations ship with the package.

## 14. Municipalities

The 338 municipalities (*baladiyat*) mapped in OpenStreetMap form their own layer. They do **not** nest in delegations, so
join your data on the municipality `id` (`municipality-<OSM relation>`) or on `governorate`, never on a delegation code.

```js
import municipalities from 'map-tunisia/data/municipalities.json' with { type: 'json' };
import { svgPath } from 'map-tunisia';

const djerba = municipalities.filter((m) => m.name_fr.startsWith('Djerba'));   // Houmet Souk, Midoun, Ajim
svgPath('municipalities', 'medium', 'interactive');  // 'dist/svg/municipalities/tunisia-municipalities-medium-interactive.svg'
```

```css
/* Colour one governorate's municipalities; the land outside every municipality stays light grey. */
.municipality[data-governorate="TN-82"] { fill: #219ebc; }
#municipalities-base { fill: #eceff3; }
```

```python
import geopandas as gpd
m = gpd.read_file("https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@v1.1.0/dist/geojson/tunisia-municipalities-medium.geojson")
m.groupby("governorate").size()   # municipalities per governorate
```

About 2 % of the land is not inside any mapped municipality (some sebkhas and areas OSM has not mapped yet), so municipal
areas do not add up to the country. See the [accuracy report](accuracy.md#municipalities-baladiyat).
