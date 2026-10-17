# Projection & coordinates

## One frame for every SVG

Every SVG in Map Tunisia, whatever its partition, level of detail or mode, uses **the same coordinate frame**:

| Property | Value |
| --- | --- |
| Projection | **WGS 84 / UTM zone 32N** — [EPSG:32632](https://epsg.io/32632) |
| Unit | **1 SVG unit = 1 kilometre** on the ground (UTM scale factor 0.9996 – 1.0008 across Tunisia) |
| `viewBox` | `0 0 406 838` |
| x | `easting / 1000 − 351` |
| y | `4170 − northing / 1000` (SVG y grows downward) |

The origin (`x0 = 351`, `y0 = 4170`) and size are stored in [`src/frame.js`](../src/frame.js), on each SVG's root
(`data-x0`, `data-y0`) and in its `<metadata>`.

### Why UTM 32N?

Tunisia spans 7.5°E to 11.6°E, entirely inside UTM zone 32 (6°E – 12°E). The projection is **conformal** (shapes and angles
are preserved locally), scale distortion stays below 0.08 %, and it is a standard any GIS can reproduce. It gives a
natural-looking Tunisia: not stretched like Web Mercator, not squashed like plain longitude/latitude. Because 1 unit = 1 km,
you can measure distances directly on the SVG.

## Placing your own points

```js
import { project, invert } from 'map-tunisia/projection';           // or the CDN URL of src/projection.js

const [x, y] = project([10.1815, 36.8065]);  // Tunis → [254.39, 95.94]
const [lon, lat] = invert([x, y]);          // back to degrees
```

`project()` uses Krüger's series to the 6th order (the algorithm behind PROJ's `tmerc`). It is tested against PROJ to
better than **1 mm**. It has no dependencies and is about 100 lines, so copy it into any project.

Other languages:

```python
from pyproj import Transformer
t = Transformer.from_crs(4326, 32632, always_xy=True)
E, N = t.transform(10.1815, 36.8065)
x, y = E / 1000 - 351, 4170 - N / 1000
```

```text
QGIS / PostGIS:  ST_Transform(geom, 32632), then x = E/1000 − 351, y = 4170 − N/1000
```

## Distances and areas

- On the SVG, distances in units are kilometres (scale error < 0.08 %).
- `area_km2` in the attribute tables is **ellipsoidal**: the UTM scale factor is integrated exactly over each polygon, so the
  areas of child units always add up to their parent's.

## GeoJSON and TopoJSON

Data files are **not** projected: they are WGS84 longitude/latitude (EPSG:4326), as web maps and GIS tools expect.
