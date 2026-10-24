#!/usr/bin/env python3
"""
Extract the municipalities (baladiyat) of Tunisia from an OpenStreetMap PBF
extract, as a partition of their own that does not nest in delegations.

Pipeline
--------
1. Read every ``boundary=municipality`` relation with pyosmium (OSM maps the
   municipalities of the 2016 division this way, not with an admin_level).
2. Clip each one to the land of Tunisia, i.e. the union of the sectors written
   by extract.py, so the layer shares the national coastline and borders.
3. Where two relations overlap, the overlap goes to the smaller one (the more
   specific mapping); the larger keeps the rest. Every point of land then
   belongs to at most one municipality. No geometry is added: land that no
   OSM municipality covers stays uncovered and is reported.
4. Attach each municipality to the governorate that holds most of its area.
5. Write data/source/tunisia-municipalities.geojson,
   data/attributes/municipalities.csv and data/source/municipalities-report.json.

Usage
-----
    python scripts/extract/municipalities.py --pbf .cache/tunisia-latest.osm.pbf

Run ``python scripts/extract/extract.py`` first: the land mask comes from its output.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path

import osmium
import shapely
from shapely import STRtree, wkb
from shapely.geometry import shape

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import ROOT, GRID, area_km2, names_for, polygons_only  # noqa: E402

MIN_PART_M2 = 100  # parts smaller than this left over by clipping are slivers, not land
GAP_LIST_KM2 = 5  # uncovered pieces at least this large are listed one by one in the report
PREFIXES = {"name": ("بلدية ", "Municipalité de ", "Municipalité d'", "Commune de "), "name:ar": ("بلدية ",),
            "name:fr": ("Municipalité de ", "Municipalité d'", "Commune de ")}


class MunicipalityReader(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.factory = osmium.geom.WKBFactory()
        self.areas: list[dict] = []
        self.failed: list[str] = []

    def area(self, a):
        if a.tags.get("boundary") != "municipality" or a.from_way():
            return
        tags = {t.k: t.v for t in a.tags}
        try:
            geom = wkb.loads(self.factory.create_multipolygon(a), hex=True)
        except Exception as exc:  # broken relation in OSM
            self.failed.append(f"relation {a.orig_id()} ({tags.get('name:fr') or tags.get('name')}) could not be assembled: {exc}")
            return
        self.areas.append(dict(osm_id=a.orig_id(), tags=tags, geom=shapely.make_valid(geom)))


def strip_prefixes(tags: dict) -> dict:
    out = dict(tags)
    for key, prefixes in PREFIXES.items():
        v = out.get(key)
        if v:
            for p in prefixes:
                if v.startswith(p):
                    out[key] = v[len(p):]
                    break
    return out


def clean_parts(g):
    parts = [p for p in shapely.get_parts(polygons_only(g)) if area_km2(p) * 1e6 >= MIN_PART_M2]
    if not parts:
        return None
    return shapely.set_precision(shapely.union_all(parts) if len(parts) > 1 else parts[0], GRID)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pbf", default=str(ROOT / ".cache" / "tunisia-latest.osm.pbf"))
    ap.add_argument("--out", default=str(ROOT / "data"))
    args = ap.parse_args()

    t0 = time.time()
    out = Path(args.out)
    source_meta = {}
    meta_file = Path(args.pbf).with_name("source.json")
    if meta_file.exists():
        source_meta = json.loads(meta_file.read_text(encoding="utf-8"))
    sectors_report = json.loads((out / "source" / "extract-report.json").read_text(encoding="utf-8"))
    if source_meta.get("osm_date") and source_meta["osm_date"] != sectors_report["source"]["osm_date"]:
        print(f"! {args.pbf} is from {source_meta['osm_date']} but the sectors come from {sectors_report['source']['osm_date']}; run extract.py first")
        return 1
    report = dict(corrections=[], warnings=[])

    print("Loading the land mask (sectors) ...")
    sectors = json.loads((out / "source" / "tunisia-sectors.geojson").read_text(encoding="utf-8"))["features"]
    by_gov, by_del = collections.defaultdict(list), collections.defaultdict(list)
    for f in sectors:
        g = shape(f["geometry"])
        by_gov[f["properties"]["governorate"]].append(g)
        by_del[f["properties"]["delegation"]].append(g)
    govs = {k: shapely.union_all(v) for k, v in by_gov.items()}
    dels = {k: shapely.union_all(v) for k, v in by_del.items()}
    land = shapely.union_all(list(govs.values()))
    shapely.prepare(land)

    print(f"Reading {args.pbf} ...")
    rd = MunicipalityReader()
    rd.apply_file(args.pbf, locations=True)
    report["warnings"].extend(rd.failed)
    print(f"  {len(rd.areas)} municipality relations")

    # ------------------------------------------------------------ clip to land
    units = []
    for a in rd.areas:
        if not land.intersects(a["geom"]):
            continue  # a municipality of a neighbouring country
        before = area_km2(a["geom"])
        g = clean_parts(a["geom"].intersection(land))
        if g is None:
            continue
        clipped = before - area_km2(g)
        if clipped > 0.01:
            report["corrections"].append(dict(type="clip_to_land", osm_id=a["osm_id"], name=a["tags"].get("name:fr"), area_km2=round(clipped, 3)))
        units.append(dict(osm_id=a["osm_id"], tags=a["tags"], geom=g, osm_area_km2=before))
    print(f"  {len(units)} inside Tunisia")

    # ------------------------------------------------------------ resolve overlaps: the smaller unit wins
    units.sort(key=lambda u: (area_km2(u["geom"]), u["osm_id"]))
    tree = STRtree([u["geom"] for u in units])
    for i, u in enumerate(units):
        smaller = [j for j in tree.query(u["geom"], predicate="intersects") if j < i]
        if not smaller:
            continue
        taken = shapely.union_all([units[j]["geom"] for j in smaller])
        lost = area_km2(u["geom"].intersection(taken))
        if lost <= 1e-4:
            continue
        g = clean_parts(u["geom"].difference(taken))
        if g is None:
            report["warnings"].append(f"relation {u['osm_id']} ({u['tags'].get('name:fr')}) lies entirely inside smaller municipalities and is omitted")
            u["geom"] = None
            continue
        winners = [units[j] for j in smaller if area_km2(units[j]["geom"].intersection(u["geom"])) > 1e-4]
        report["corrections"].append(dict(type="overlap_to_smaller", osm_id=u["osm_id"], name=u["tags"].get("name:fr"), area_km2=round(lost, 3),
                                          given_to=[dict(osm_id=w["osm_id"], name=w["tags"].get("name:fr")) for w in winners]))
        u["geom"] = g
    units = [u for u in units if u["geom"] is not None]

    # ------------------------------------------------------------ attributes
    rows, features = [], []
    names_seen = collections.defaultdict(list)
    for u in units:
        n = names_for(strip_prefixes(u["tags"]))
        uid = f"municipality-{u['osm_id']}"
        share = {k: g.intersection(u["geom"]).area for k, g in govs.items() if g.intersects(u["geom"])}
        gov = max(share, key=share.get)
        frac = share[gov] / sum(share.values())
        if frac < 0.95:
            report["warnings"].append(f"{uid} ({n['name_fr']}) is only {frac:.1%} inside {gov}")
        if not n["name_ar"]:
            report["warnings"].append(f"{uid} ({n['name_fr']}) has no Arabic name in OSM")
        if not n["name_fr"]:
            report["warnings"].append(f"{uid} ({n['name_ar']}) has no Latin name in OSM")
        names_seen[(n["name_fr"], gov)].append(uid)
        rows.append(dict(id=uid, governorate=gov, name_en=n["name_en"], name_fr=n["name_fr"], name_ar=n["name_ar"],
                         wikidata=u["tags"].get("wikidata", ""), osm_relation=u["osm_id"]))
        features.append(dict(id=uid, governorate=gov, geom=u["geom"]))
    for (name, gov), ids in names_seen.items():
        if len(ids) > 1:
            report["warnings"].append(f"{len(ids)} OSM relations are named {name} in {gov}: {', '.join(ids)}")

    # ------------------------------------------------------------ checks
    print("Checking coverage ...")
    geoms = [f["geom"] for f in features]
    union = shapely.union_all(geoms)
    tree = STRtree(geoms)
    overlap = 0.0
    for i, j in zip(*tree.query(geoms, predicate="intersects")):
        if i < j:
            inter = shapely.intersection(geoms[i], geoms[j])
            if inter.area > 0:
                overlap += area_km2(inter)
    land_area = area_km2(land)
    covered = area_km2(union)
    uncovered = [p for p in shapely.get_parts(polygons_only(land.difference(union)))]
    pieces = []
    for p in sorted(uncovered, key=lambda p: -p.area):
        a = area_km2(p)
        if a < GAP_LIST_KM2:
            break
        gov = max(govs, key=lambda k: govs[k].intersection(p).area)
        d = [k for k, g in dels.items() if g.intersects(p) and g.intersection(p).area > 0.2 * p.area]
        pt = p.representative_point()
        pieces.append(dict(area_km2=round(a, 1), at=[round(pt.x, 3), round(pt.y, 3)], governorate=gov, delegations=sorted(d)))
    # Municipalities do not nest: count those that spread over several delegations (>= 1 % of their area in each).
    across = 0
    for g in geoms:
        parts = [d.intersection(g).area for d in dels.values() if d.intersects(g)]
        across += sum(1 for a in parts if a >= 0.01 * g.area) > 1
    checks = dict(land_area_km2=round(land_area, 3), covered_km2=round(covered, 3), uncovered_km2=round(land_area - covered, 3),
                  coverage=round(covered / land_area, 5), overlap_km2=round(overlap, 6), outside_land_km2=round(area_km2(union.difference(land)), 6),
                  uncovered_pieces=len(uncovered), invalid_geometries=sum(1 for g in geoms if not g.is_valid),
                  across_delegations=int(across))
    print("  " + json.dumps(checks))

    # ------------------------------------------------------------ write
    features.sort(key=lambda f: f["id"])
    fc = dict(type="FeatureCollection", features=[
        dict(type="Feature", properties=dict(municipality=f["id"], governorate=f["governorate"]), geometry=shapely.geometry.mapping(f["geom"]))
        for f in features])
    text = json.dumps(fc, ensure_ascii=False, separators=(",", ":"))
    text = re.sub(r"(-?\d+\.\d{7})\d+", r"\1", text)  # 7 decimals = OSM precision
    (out / "source" / "tunisia-municipalities.geojson").write_text(text, encoding="utf-8")
    print(f"  wrote tunisia-municipalities.geojson ({len(text) / 1e6:.1f} MB, {len(features)} municipalities)")

    cols = ["id", "governorate", "name_en", "name_fr", "name_ar", "wikidata", "osm_relation"]
    with open(out / "attributes" / "municipalities.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, cols, lineterminator="\n")
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r["id"]))

    report.update(
        generated=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        source=dict(name="OpenStreetMap", license="ODbL-1.0", attribution="© OpenStreetMap contributors",
                    selector="relations tagged boundary=municipality", **source_meta),
        counts=dict(municipalities=len(features), relations_read=len(rd.areas),
                    governorates=len({f["governorate"] for f in features})),
        per_governorate=dict(sorted(collections.Counter(f["governorate"] for f in features).items())),
        topology=checks,
        uncovered=pieces,
    )
    (out / "source" / "municipalities-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Done in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
