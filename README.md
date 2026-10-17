<div align="center">

<img src="docs/assets/hero.svg" alt="Map Tunisia — accurate open-source SVG maps of Tunisia, from the country outline down to 2,083 imadas" width="100%">

<h3>The most accurate open-source SVG maps of Tunisia</h3>

<p>
Country · 7 economic regions · 5 districts · 24 governorates · 279 delegations · 2,083 imadas<br>
5 levels of detail · 8 visual modes · SVG · GeoJSON · TopoJSON · العربية · Français · English
</p>

[![CI](https://github.com/Alaa-Taieb/map-tunisia/actions/workflows/ci.yml/badge.svg)](https://github.com/Alaa-Taieb/map-tunisia/actions/workflows/ci.yml)
[![OpenStreetMap data](https://img.shields.io/badge/OpenStreetMap-2026--10--16-7ebc6f?logo=openstreetmap&logoColor=white)](docs/accuracy.md)
[![Delegations](https://img.shields.io/badge/delegations-279%20%2F%20279-0e7490)](docs/reference.md#delegations)
[![Gaps & overlaps](https://img.shields.io/badge/gaps%20%26%20overlaps-0-2e7d32)](docs/accuracy.md)
[![Code: MIT](https://img.shields.io/badge/code-MIT-blue)](LICENSE)
[![Data: ODbL](https://img.shields.io/badge/data-ODbL%201.0-orange)](LICENSE-DATA.md)

**[🧭 Live explorer](https://alaa-taieb.github.io/map-tunisia/)** ·
**[⬇️ Download](#-download)** ·
**[⚡ Quick start](#-quick-start)** ·
**[📚 Docs](docs/README.md)** ·
**[✅ Accuracy report](docs/accuracy.md)**

</div>

---

## Why Map Tunisia?

Most Tunisia SVGs online are hand-traced, outdated, missing islands, or stop at the 24 governorates. Map Tunisia is built
from **OpenStreetMap**, the most precise open source of Tunisian boundaries, and cross-checked against official INS and ISIE
lists. The result is a complete, exactly nested set of maps that you can drop into any project.

<table>
<tr>
<td width="33%" valign="top">

### 🎯 Accurate
- Real coastline at full precision, with **every island**: Djerba, Kerkennah, La Galite, Zembra, Kuriat…
- **0 km² of gaps or overlaps**: every level is cut from one planar topology
- Land area within **0.08 %** of the CIA World Factbook
- **[Every correction](docs/accuracy.md)** to the raw data is documented with its source

</td>
<td width="33%" valign="top">

### 🧩 Complete
- **6 nested partitions**, down to the 2,083 *imadas*
- **All 279 delegations** of the 2024 census, including the 14 created since 2014, which no other open dataset has
- The **2023 districts** (Decree 2023-589) and the **7 economic regions**
- **2014 & 2024 census population** built in

</td>
<td width="33%" valign="top">

### 🛠️ Ready to use
- **8 modes**: plain, outline, light, dark, Latin labels, Arabic labels, nested borders, interactive
- **5 levels of detail**, from 1 m precision to 17 KB icons
- Semantic ids (**ISO 3166-2**, **INS codes**) and `data-*` attributes in 3 languages
- GeoJSON + TopoJSON + CSV, a **lon/lat → SVG** helper, and an explorer

</td>
</tr>
</table>

## 🖼️ Gallery

**Six partitions, exactly nested**

<img src="docs/assets/partitions.svg" alt="The six partitions: country, regions, districts, governorates, delegations and sectors" width="100%">

**Eight modes**

<img src="docs/assets/modes.svg" alt="The eight modes: plain, outline, light, dark, labeled, labeled-ar, nested, interactive" width="100%">

**Five levels of detail** (Djerba, at the same zoom)

<img src="docs/assets/lod-comparison.svg" alt="Djerba at the full, high, medium, low and tiny levels of detail" width="100%">

<details>
<summary><b>More examples</b>: labelled maps in both scripts, dark delegations, nested sectors</summary>
<br>
<table>
<tr>
<td align="center"><img src="dist/svg/governorates/tunisia-governorates-medium-labeled.svg" alt="Governorates labelled in Latin script" height="520"><br><sub><code>governorates · medium · labeled</code></sub></td>
<td align="center"><img src="dist/svg/governorates/tunisia-governorates-medium-labeled-ar.svg" alt="Governorates labelled in Arabic" height="520"><br><sub><code>governorates · medium · labeled-ar</code></sub></td>
<td align="center"><img src="dist/svg/delegations/tunisia-delegations-low-dark.svg" alt="Delegations, dark mode" height="520"><br><sub><code>delegations · low · dark</code></sub></td>
<td align="center"><img src="dist/svg/delegations/tunisia-delegations-medium-nested.svg" alt="Delegations with governorate borders" height="520"><br><sub><code>delegations · medium · nested</code></sub></td>
</tr>
</table>
</details>

## ⚡ Quick start

**1. Use a file directly.** Every SVG scales to any size:

```html
<img src="https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@main/dist/svg/governorates/tunisia-governorates-medium-light.svg"
     alt="Map of the governorates of Tunisia" width="420">
```

**2. Inline it and style it with CSS.** Every shape has an `id` and `data-*` attributes:

```css
#TN-61 { fill: #ffb703; }                            /* Sfax, by ISO 3166-2 code */
.unit[data-region="sud-ouest"] { fill: #8ecae6; }    /* a whole economic region */
.unit:hover { fill: #e63946; }
```

**3. Add behaviour with a few lines of JavaScript:**

```js
document.querySelectorAll('.map-tunisia .unit').forEach((el) =>
  el.addEventListener('click', () =>
    alert(`${el.dataset.nameFr} · ${el.dataset.nameAr} — ${Number(el.dataset.population2024).toLocaleString()} inhabitants`)));
```

**4. Place your own points.** All SVGs share one frame (UTM 32N, 1 unit = 1 km):

```js
import { project } from 'https://cdn.jsdelivr.net/gh/Alaa-Taieb/map-tunisia@main/src/projection.js';
const [x, y] = project([10.7600, 34.7406]); // Sfax → SVG coordinates
svg.insertAdjacentHTML('beforeend', `<circle cx="${x}" cy="${y}" r="3" fill="crimson"/>`);
```

**More recipes** for React, D3 + TopoJSON, Leaflet, MapLibre, Python (GeoPandas, Plotly), R, QGIS, Figma, print and laser cutting are in the **[usage guide](docs/usage.md)**.

## ⬇️ Download

Every file lives in [`dist/`](dist/) and follows one naming scheme:

```text
dist/svg/<partition>/tunisia-<partition>-<lod>-<mode>.svg     140 SVG maps
dist/geojson/tunisia-<partition>-<lod>.geojson                WGS84, with all attributes
dist/topojson/tunisia-<partition>-<lod>.topojson              WGS84, shared borders
dist/data/<partition>.csv | .json                             names, codes, populations, areas, label points
```

| Popular file | Size |
| --- | ---: |
| [Governorates, labelled](dist/svg/governorates/tunisia-governorates-medium-labeled.svg) · [Arabic](dist/svg/governorates/tunisia-governorates-medium-labeled-ar.svg) | 135 KB |
| [Governorates, interactive](dist/svg/governorates/tunisia-governorates-medium-interactive.svg) | 135 KB |
| [Delegations, light](dist/svg/delegations/tunisia-delegations-medium-light.svg) | 446 KB |
| [Sectors (imadas), nested](dist/svg/sectors/tunisia-sectors-medium-nested.svg) | 1.8 MB |
| [Country outline, for icons](dist/svg/country/tunisia-country-tiny-plain.svg) | 4 KB |
| [Governorates TopoJSON](dist/topojson/tunisia-governorates-medium.topojson) · [GeoJSON](dist/geojson/tunisia-governorates-medium.geojson) | 105 KB · 306 KB |

Browse every combination in the **[file catalog](docs/catalog.md)** or the **[live explorer](https://alaa-taieb.github.io/map-tunisia/)**,
or grab everything with **[Download ZIP](https://github.com/Alaa-Taieb/map-tunisia/archive/refs/heads/main.zip)**.

For JavaScript projects: `npm install github:Alaa-Taieb/map-tunisia`, then `import { svgPath, project } from 'map-tunisia'` ([API](docs/usage.md#13-the-npm-helper)).

## 📦 What's inside

### Partitions

| Partition | Units | | Description |
| --- | ---: | --- | --- |
| `country` | 1 | تونس | National outline with every island |
| `regions` | 7 | الأقاليم الاقتصادية | INS economic regions: Grand Tunis, Nord-Est, Nord-Ouest, Centre-Est, Centre-Ouest, Sud-Est, Sud-Ouest |
| `districts` | 5 | الأقاليم | The *aqalim* of Decree 2023-589 (National Council of Regions and Districts) |
| `governorates` | 24 | الولايات | The *wilayas*, with ids `TN-11` … `TN-83` (ISO 3166-2) |
| `delegations` | 279 | المعتمديات | The *mutamadiyat*, INS 2024 nomenclature |
| `sectors` | 2,083 | العمادات | The *imadas*, the finest administrative level |

### Levels of detail

| Level | Tolerance | Use it for | Governorates file |
| --- | ---: | --- | ---: |
| `full` | none (OSM precision) | GIS, print, deep zoom | 1.3 MB |
| `high` | ≈ 20 m | posters, zoomable maps | 390 KB |
| `medium` | ≈ 100 m | **websites, dashboards, slides** | 135 KB |
| `low` | ≈ 500 m | small embeds, mobile | 37 KB |
| `tiny` | ≈ 2.5 km | icons, thumbnails | 17 KB |

### Modes

| Mode | | Mode | |
| --- | --- | --- | --- |
| `plain` | neutral, ready for your CSS | `labeled` | names in Latin script, callouts where crowded |
| `outline` | strokes only: print, laser, overlays | `labeled-ar` | names in Arabic, right-to-left |
| `light` | colourful, neighbours never share a colour | `nested` | higher-level borders drawn heavier |
| `dark` | for dark UIs | `interactive` | hover + tooltips, no JavaScript |

Details and guidance: **[partitions, levels & modes](docs/partitions-levels-modes.md)** · every id and attribute: **[data dictionary](docs/data-dictionary.md)**.

## ✅ Accuracy

Map Tunisia starts from OpenStreetMap and fixes what raw OSM gets wrong. Everything is reproducible and documented in the
**[accuracy report](docs/accuracy.md)**, regenerated with every build.

| | Raw OpenStreetMap | Map Tunisia |
| --- | --- | --- |
| Delegations | 264 + a stale duplicate (2014 nomenclature) | **279**, matching the INS 2024 list code by code |
| Nesting | levels drawn independently; lakes missing from delegations | **one planar topology**: 0 gaps, 0 overlaps |
| Kébili and Jendouba | 10 sectors in the wrong delegation | reassigned, checked against INS codes and ISIE maps |
| Names | rotated or duplicated names, typos, invisible characters | 24 names corrected; Unicode normalised |
| Country polygon | includes the 12-NM territorial sea | land only, following the coastline |
| Islets | 63 mapped only as coastline | included |

How it works: all boundaries are noded into one set of faces, conflicts are resolved by documented rules, inland lakes are
split by nearest-boundary allocation, and post-2014 delegations are rebuilt from their imadas using the electoral authority's
(ISIE) official lists. Then mapshaper simplifies with topology preserved. Read the **[methodology](docs/methodology.md)**.

## 🧭 One frame, real kilometres

Every SVG uses the same `viewBox="0 0 406 838"` in **WGS 84 / UTM zone 32N** with **1 unit = 1 km**. Files of different
partitions overlay perfectly, distances can be read straight off the map, and the dependency-free
[`project()`](src/projection.js) helper (tested to < 1 mm against PROJ) places any longitude/latitude.
See **[projection & coordinates](docs/projection.md)**.

## 🛠️ Build from source

```bash
npm install
npm run build        # dist/ from data/ in ~30 s
npm test             # 160+ checks: counts, ids, nesting, areas, populations, XML validity, sizes, projection

# refresh from the latest OpenStreetMap data (Python 3.10+)
pip install -r scripts/extract/requirements.txt
npm run fetch && npm run extract && npm run build
```

The pipeline: **pyosmium + Shapely** (extraction and topology) → **mapshaper** (dissolve, projection, simplification) →
a custom SVG writer (labels with polylabel, map colouring, accessible markup). See [CONTRIBUTING.md](CONTRIBUTING.md#project-layout).

## 🗺️ Roadmap

- [x] 6 nested partitions, 5 levels of detail, 8 modes
- [x] All 279 delegations of the 2024 nomenclature
- [x] GeoJSON / TopoJSON / CSV, projection helper, live explorer
- [ ] Municipalities (*baladiyat*) as a separate, non-nested partition
- [ ] Optional water layer: lagoons, sebkhas, chotts and dams
- [ ] Cities and capitals as point layers
- [ ] Tamazight (Tifinagh) and English-transliteration label modes
- [ ] Published npm package and versioned release ZIPs

Ideas and votes are welcome in the [issues](https://github.com/Alaa-Taieb/map-tunisia/issues).

## 🤝 Contributing

Spotted a wrong border, name or code? **[Report a data error](https://github.com/Alaa-Taieb/map-tunisia/issues/new?template=data-error.yml)**.
It's the most valuable contribution you can make. Code, docs and new modes are welcome too: see [CONTRIBUTING.md](CONTRIBUTING.md) and
the [Code of Conduct](CODE_OF_CONDUCT.md).

## 📜 License & attribution

- **Code** (scripts, `src/`, explorer, tests): [MIT](LICENSE)
- **Maps and data** (`dist/`, `data/`, illustrations): [ODbL 1.0](LICENSE-DATA.md), derived from OpenStreetMap

When you use the maps, please credit:

> Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) · [Map Tunisia](https://github.com/Alaa-Taieb/map-tunisia) by Alaa Taieb

Using Map Tunisia in research? See [CITATION.cff](CITATION.cff) (GitHub's *Cite this repository* button).

## 👤 Author

<table>
<tr>
<td align="center" width="140">
<a href="https://github.com/Alaa-Taieb"><img src="https://github.com/Alaa-Taieb.png" width="100" alt="Alaa Taieb"><br><b>Alaa Taieb</b></a><br>
<sub>Creator & maintainer</sub>
</td>
<td>

**Map Tunisia** is created and maintained by **[Alaa Taieb](https://github.com/Alaa-Taieb)**.

If this project helps you, please ⭐ **star the repository**, share it, and credit it when you publish a map.
It helps others find it.

</td>
</tr>
</table>

### Acknowledgements

- The thousands of **[OpenStreetMap](https://www.openstreetmap.org) contributors** who mapped Tunisia's boundaries and coastline
- **Institut National de la Statistique** (INS) for the geocodes and census figures, and the **ISIE** for its public circonscription maps
- [Geofabrik](https://download.geofabrik.de) for the daily extracts
- [mapshaper](https://github.com/mbloch/mapshaper), [pyosmium](https://osmcode.org/pyosmium/), [Shapely](https://shapely.readthedocs.io),
  [pyproj](https://pyproj4.github.io/pyproj/) and [polylabel](https://github.com/mapbox/polylabel), the open-source tools this project stands on

<div align="center">
<br>
<sub>Made with ❤️ for Tunisia 🇹🇳 · صُنع بحبّ لتونس</sub>
</div>
