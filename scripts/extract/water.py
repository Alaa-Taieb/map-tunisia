#!/usr/bin/env python3
"""
Extract the water layer of Tunisia (lakes, dams, sebkhas, chotts and sea-side
lagoons) from an OpenStreetMap PBF extract. It is an overlay: it does not
change the nested administrative partitions, which already include the inland
water bodies.

Pipeline
--------
1. Read the water areas of OSM with pyosmium: ``natural=water`` (lakes,
   reservoirs, salt lakes, lagoons; rivers, canals, ponds and basins are left
   out), ``water=salt_lake``, and salt wetlands (``wetland=saltmarsh``,
   ``sabkha`` or ``tidalflat``, or ``salt=yes``). Salt pans (``saltern``,
   ``landuse=salt_pond``) are industrial and left out.
2. Keep the named ones. Inland bodies are clipped to the land of Tunisia (the
   union of the sectors written by extract.py); the sea-side lagoons listed in
   LAGOONS are kept on the water side of the coastline.
3. Lagoons that OSM has no polygon for (Bizerte, El Bibane) are cut out of the
   territorial sea where they meet it through a channel narrower than
   2 x CHANNEL_M: they are exactly the sea pockets that a morphological opening
   of that radius separates from the open sea. Only the coastline comes from
   OSM; their names come from LAGOONS.
4. The same body mapped twice (one polygon mostly inside another) is merged;
   other overlaps go to the smaller body, so no two bodies overlap.
5. Classify each body (lake, reservoir, sebkha, chott, lagoon), attach the
   governorates it touches, and write data/source/tunisia-water.geojson,
   data/attributes/water.csv and data/source/water-report.json.

Usage
-----
    python scripts/extract/water.py --pbf .cache/tunisia-latest.osm.pbf

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
import unicodedata
from pathlib import Path

import osmium
import shapely
from shapely import STRtree, wkb
from shapely.geometry import Point, shape

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import ROOT, GRID, area_km2, names_for, polygons_only, to_utm, to_wgs  # noqa: E402

MIN_AREA_KM2 = 1.0  # water bodies smaller than this (hill lakes, ponds) are left out
MIN_PART_M2 = 100  # parts smaller than this left over by clipping are slivers
DUPLICATE = 0.5  # a body with at least this share of its area inside a larger one is the same body mapped twice
TOUCH_DEG = 0.002  # polygons of one name closer than this (~200 m) are parts of the same body
CHANNEL_M = 300  # sea pockets joined to the open sea by a channel narrower than 2 x this are lagoons
TYPES = ("lake", "reservoir", "lagoon", "sebkha", "chott")

# Sea-side lagoons. `osm` names an OSM polygon to use as the lagoon; `seed` (lon, lat) picks the coastline pocket
# when OSM has no polygon for it, and the names then come from here (El Bibane's from OSM node 3079853217).
LAGOONS = [
    dict(osm="relation/8031768"),  # Lake of Tunis (north), inside the OSM coastline
    dict(osm="way/93265507"),  # Lake of Tunis (south), inside the OSM coastline
    dict(osm="relation/18438466"),  # Ghar El Melh, on the sea side of the OSM coastline
    dict(key="bizerte", seed=(9.862, 37.208), name_ar="بحيرة بنزرت", name_fr="Lac de Bizerte", name_en="Lake Bizerte", wikidata=""),
    dict(key="el-bibane", seed=(11.261, 33.249), name_ar="بحيرة البيبان", name_fr="Bahiret el Bibane", name_en="Bahiret el Bibane", wikidata=""),
]
LAGOON_OSM = {l["osm"] for l in LAGOONS if "osm" in l}

WATER_IN = {None, "lake", "reservoir", "salt_lake", "lagoon", "oxbow"}
SALT_WETLANDS = {"saltmarsh", "sabkha", "tidalflat"}
RIVER_NAME = re.compile(r"^(وادي|واد|Oued|Wadi|Ouadi)\b", re.I)
CHOTT_NAME = re.compile(r"^(شط|Chott|Shatt)\b", re.I)
SEBKHA_NAME = re.compile(r"(سبخة|Sebkh|Sabkh|Sebha|Garaet|Garâat)", re.I)
DAM_NAME = re.compile(r"^(سد|Barrage|Dam)\b", re.I)


class WaterReader(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.factory = osmium.geom.WKBFactory()
        self.areas: list[dict] = []
        self.country = None
        self.failed: list[str] = []
        self.skipped = collections.Counter()

    def area(self, a):
        tags = {t.k: t.v for t in a.tags}
        if tags.get("boundary") == "administrative" and tags.get("admin_level") == "2" and tags.get("ISO3166-1") == "TN":
            self.country = wkb.loads(self.factory.create_multipolygon(a), hex=True)
            return
        ref = f"{'way' if a.from_way() else 'relation'}/{a.orig_id()}"
        kind = selected(tags)
        if not kind and ref not in LAGOON_OSM:
            return
        try:
            geom = wkb.loads(self.factory.create_multipolygon(a), hex=True)
        except Exception as exc:  # broken multipolygon in OSM
            self.failed.append(f"{ref} ({tags.get('name:fr') or tags.get('name')}) could not be assembled: {exc}")
            return
        self.areas.append(dict(osm=ref, tags=tags, geom=shapely.make_valid(geom)))


def selected(tags: dict) -> bool:
    """Is this OSM area a lake, reservoir, sebkha, chott or lagoon (not a river, pond, basin or salt pan)?"""
    if tags.get("landuse") == "salt_pond" or tags.get("wetland") == "saltern":
        return False
    if tags.get("water") == "salt_lake":
        return True
    if tags.get("natural") == "water":
        return tags.get("water") in WATER_IN
    if tags.get("natural") == "wetland":
        return tags.get("wetland") in SALT_WETLANDS or tags.get("salt") == "yes"
    return False


def classify(tags: dict, names: dict) -> str:
    text = " ".join(v for v in (names["name_ar"], names["name_fr"], names["name_en"]) if v)
    if any(CHOTT_NAME.match(v) for v in names.values() if v):
        return "chott"
    if SEBKHA_NAME.search(text):
        return "sebkha"
    if tags.get("water") == "reservoir" or any(DAM_NAME.match(v) for v in names.values() if v):
        return "reservoir"
    if tags.get("water") == "lagoon":
        return "lagoon"
    if tags.get("salt") == "yes" or tags.get("water") == "salt_lake" or tags.get("natural") == "wetland":
        return "sebkha"
    return "lake"


def latin_fallback(names: dict) -> dict:
    """name_fr is the Latin-script name: French where OSM has it, otherwise English."""
    return dict(names, name_fr=names["name_fr"] or names["name_en"])


def same_name(a: dict, b: dict) -> bool:
    """Same Wikidata item, or the same Latin or Arabic name once accents, case and punctuation are ignored."""
    if a["tags"].get("wikidata") and a["tags"].get("wikidata") == b["tags"].get("wikidata"):
        return True
    def norm(s):
        s = unicodedata.normalize("NFKD", s or "")
        return re.sub(r"[\W_]+", "", "".join(c for c in s if not unicodedata.combining(c)).casefold())
    return any(norm(a["names"][f]) and norm(a["names"][f]) == norm(b["names"][f]) for f in ("name_fr", "name_ar"))


def clean_parts(g):
    parts = [p for p in shapely.get_parts(polygons_only(g)) if area_km2(p) * 1e6 >= MIN_PART_M2]
    if not parts:
        return None
    return shapely.set_precision(shapely.union_all(parts) if len(parts) > 1 else parts[0], GRID)


def sea_pockets(land, maritime):
    """Parts of the territorial sea cut off from the open sea by channels narrower than 2 x CHANNEL_M (lon/lat)."""
    sea = to_utm(polygons_only(maritime.difference(land)))
    eroded = sea.buffer(-CHANNEL_M, quad_segs=4)
    open_sea = max(shapely.get_parts(eroded), key=lambda p: p.area)
    reach = open_sea.buffer(CHANNEL_M * 1.05, quad_segs=4).intersection(sea)
    return [to_wgs(p) for p in shapely.get_parts(polygons_only(sea.difference(reach))) if p.area > 1e6]


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
    report = dict(corrections=[], warnings=[], excluded=[])

    print("Loading the land mask (sectors) ...")
    sectors = json.loads((out / "source" / "tunisia-sectors.geojson").read_text(encoding="utf-8"))["features"]
    by_gov = collections.defaultdict(list)
    for f in sectors:
        by_gov[f["properties"]["governorate"]].append(shape(f["geometry"]))
    govs = {k: shapely.union_all(v) for k, v in by_gov.items()}
    land = shapely.union_all(list(govs.values()))
    shapely.prepare(land)

    print(f"Reading {args.pbf} ...")
    rd = WaterReader()
    rd.apply_file(args.pbf, locations=True)
    report["warnings"].extend(rd.failed)
    if rd.country is None:
        print("! the country relation of Tunisia (admin_level=2) is missing from the extract")
        return 1
    print(f"  {len(rd.areas)} water areas")

    # ------------------------------------------------------------ select, clip and name
    bodies, unnamed = [], collections.Counter()
    for a in rd.areas:
        names = latin_fallback(names_for(a["tags"]))
        lagoon = a["osm"] in LAGOON_OSM
        if not lagoon and not land.intersects(a["geom"]):
            continue  # on the sea side of the coastline or in a neighbouring country
        if not lagoon and RIVER_NAME.match(names["name_fr"] or names["name_ar"] or ""):
            continue  # a wadi bed tagged as water
        before = area_km2(a["geom"])
        if lagoon:
            # A lagoon stays on the side of the coastline where OSM draws it.
            inside = area_km2(a["geom"].intersection(land))
            g = clean_parts(a["geom"].intersection(land) if inside > before / 2 else a["geom"].difference(land))
        else:
            g = clean_parts(a["geom"].intersection(land))
        if g is None:
            continue
        if not (names["name_fr"] or names["name_ar"]):
            unnamed["count"] += 1
            unnamed["area"] += area_km2(g)
            continue
        if not lagoon and before - area_km2(g) > 0.01:
            report["corrections"].append(dict(type="clip_to_land", osm=a["osm"], name=names["name_fr"] or names["name_ar"], area_km2=round(before - area_km2(g), 3)))
        bodies.append(dict(osm=a["osm"], tags=a["tags"], names=names, geom=g, lagoon=lagoon, source="osm_polygon"))

    # ------------------------------------------------------------ lagoons from the coastline
    print("Finding the lagoons on the coastline ...")
    pockets = sea_pockets(land, rd.country)
    used = set()
    for spec in LAGOONS:
        if "seed" not in spec:
            continue
        hit = [i for i, p in enumerate(pockets) if p.contains(Point(spec["seed"]))]
        if not hit:
            report["warnings"].append(f"no coastline pocket at {spec['seed']} for {spec['name_fr']}")
            continue
        used.add(hit[0])
        names = dict(name_ar=spec["name_ar"], name_fr=spec["name_fr"], name_en=spec["name_en"])
        bodies.append(dict(osm="", key=spec["key"], tags=dict(wikidata=spec["wikidata"]), names=names, geom=clean_parts(pockets[hit[0]]),
                           lagoon=True, source="osm_coastline"))
    osm_lagoons = [b["geom"] for b in bodies if b["lagoon"] and b["osm"]]
    for i, p in enumerate(pockets):
        if any(p.intersection(g).area > 0.5 * p.area for g in osm_lagoons):
            continue  # a lagoon OSM has a polygon for (Ghar El Melh)
        if i not in used and area_km2(p) >= MIN_AREA_KM2:
            pt = p.representative_point()
            report["excluded"].append(dict(reason="coastline pocket that is not a known lagoon", area_km2=round(area_km2(p), 1),
                                           at=[round(pt.x, 3), round(pt.y, 3)]))

    # ------------------------------------------------------------ duplicates and overlaps
    bodies.sort(key=lambda b: (-area_km2(b["geom"]), b["osm"]))
    kept: list[dict] = []
    for b in bodies:
        tree = STRtree([k["geom"] for k in kept]) if kept else None
        hits = [kept[j] for j in tree.query(b["geom"], predicate="intersects")] if tree is not None else []
        near = [kept[j] for j in tree.query(b["geom"], predicate="dwithin", distance=TOUCH_DEG)] if tree is not None else []
        own = area_km2(b["geom"])
        dup = None
        for k in hits:
            ov = area_km2(k["geom"].intersection(b["geom"]))
            if ov >= DUPLICATE * own:
                dup = k
                break
        # The same body split into touching polygons (along a governorate border, or mapped twice with one name).
        dup = dup or next((k for k in near if same_name(k, b)), None)
        if dup is not None:
            dup["geom"] = clean_parts(dup["geom"].union(b["geom"]))
            for f in ("name_ar", "name_fr", "name_en"):
                dup["names"][f] = dup["names"][f] or b["names"][f]
            if not dup["tags"].get("wikidata") and b["tags"].get("wikidata"):
                dup["tags"]["wikidata"] = b["tags"]["wikidata"]
            dup.setdefault("merged", []).append(b["osm"])
            report["corrections"].append(dict(type="merge_duplicate", osm=b["osm"], name=b["names"]["name_fr"] or b["names"]["name_ar"],
                                              into=dup["osm"] or dup["key"], area_km2=round(own, 3)))
            continue
        for k in hits:
            ov = area_km2(k["geom"].intersection(b["geom"]))
            if ov > 1e-4:
                g = clean_parts(k["geom"].difference(b["geom"]))
                report["corrections"].append(dict(type="overlap_to_smaller", osm=k["osm"] or k["key"], name=k["names"]["name_fr"] or k["names"]["name_ar"],
                                                  area_km2=round(ov, 3), given_to=b["osm"] or b["key"]))
                k["geom"] = g
        kept.append(b)
    kept = [k for k in kept if k["geom"] is not None]
    small = [k for k in kept if area_km2(k["geom"]) < MIN_AREA_KM2]
    kept = [k for k in kept if area_km2(k["geom"]) >= MIN_AREA_KM2]
    published = {k["osm"] or k["key"] for k in kept}
    report["corrections"] = [c for c in report["corrections"] if c.get("into", c["osm"]) in published]

    # ------------------------------------------------------------ attributes
    rows, features = [], []
    gov_near = {k: g.buffer(0.01) for k, g in govs.items()}
    for b in kept:
        n = b["names"]
        if b["osm"]:
            osm_type, osm_id = b["osm"].split("/")
            uid = f"water-{osm_type[0]}{osm_id}"
        else:
            uid = f"water-{b['key']}"
        kind = "lagoon" if b["lagoon"] else classify(b["tags"], n)
        on_land = area_km2(b["geom"].intersection(land)) > area_km2(b["geom"]) / 2
        zones = govs if on_land else gov_near
        share = {k: g.intersection(b["geom"]).area for k, g in zones.items() if g.intersects(b["geom"])}
        if not share:
            report["warnings"].append(f"{uid} ({n['name_fr']}) touches no governorate")
            continue
        total = sum(share.values())
        gov = max(share, key=share.get)
        touched = sorted(k for k, v in share.items() if v >= 0.01 * total)
        if not n["name_ar"]:
            report["warnings"].append(f"{uid} ({n['name_fr']}) has no Arabic name in OSM")
        if not n["name_fr"]:
            report["warnings"].append(f"{uid} ({n['name_ar']}) has no Latin name in OSM")
        tags = b["tags"]
        rows.append(dict(id=uid, type=kind, governorate=gov, governorates=" ".join(touched), name_en=n["name_en"], name_fr=n["name_fr"], name_ar=n["name_ar"],
                         label_latin=n["name_fr"] or n["name_en"] or n["name_ar"], salt="yes" if kind in ("sebkha", "chott") or tags.get("salt") == "yes" else "",
                         intermittent=tags.get("intermittent", "") if tags.get("intermittent") in ("yes", "no") else "",
                         wikidata=tags.get("wikidata", ""), osm=b["osm"], geometry_source=b["source"]))
        features.append(dict(id=uid, type=kind, governorate=gov, geom=b["geom"]))
    names_seen = collections.defaultdict(list)
    for r in rows:
        names_seen[(r["name_fr"] or r["name_ar"], r["governorate"])].append(r["id"])
    for (name, gov), ids in names_seen.items():
        if len(ids) > 1:
            report["warnings"].append(f"{len(ids)} water bodies are named {name} in {gov}: {', '.join(ids)}")

    # ------------------------------------------------------------ checks
    print("Checking ...")
    geoms = [f["geom"] for f in features]
    tree = STRtree(geoms)
    overlap = 0.0
    for i, j in zip(*tree.query(geoms, predicate="intersects")):
        if i < j:
            inter = shapely.intersection(geoms[i], geoms[j])
            if inter.area > 0:
                overlap += area_km2(inter)
    by_type = collections.defaultdict(lambda: dict(count=0, area_km2=0.0))
    for f in features:
        by_type[f["type"]]["count"] += 1
        by_type[f["type"]]["area_km2"] += area_km2(f["geom"])
    union = shapely.union_all(geoms)
    checks = dict(overlap_km2=round(overlap, 6), invalid_geometries=sum(1 for g in geoms if not g.is_valid),
                  total_km2=round(area_km2(union), 3), on_land_km2=round(area_km2(union.intersection(land)), 3),
                  in_sea_km2=round(area_km2(union.difference(land)), 3),
                  outside_tunisia_km2=round(area_km2(union.difference(rd.country)), 6))
    print("  " + json.dumps(checks))

    # ------------------------------------------------------------ write
    features.sort(key=lambda f: f["id"])
    fc = dict(type="FeatureCollection", features=[
        dict(type="Feature", properties=dict(water=f["id"], type=f["type"], governorate=f["governorate"]), geometry=shapely.geometry.mapping(f["geom"]))
        for f in features])
    text = json.dumps(fc, ensure_ascii=False, separators=(",", ":"))
    text = re.sub(r"(-?\d+\.\d{7})\d+", r"\1", text)  # 7 decimals = OSM precision
    (out / "source" / "tunisia-water.geojson").write_text(text, encoding="utf-8")
    print(f"  wrote tunisia-water.geojson ({len(text) / 1e6:.1f} MB, {len(features)} water bodies)")

    cols = ["id", "type", "governorate", "governorates", "name_en", "name_fr", "name_ar", "label_latin", "salt", "intermittent", "wikidata", "osm", "geometry_source"]
    with open(out / "attributes" / "water.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, cols, lineterminator="\n")
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r["id"]))

    report.update(
        generated=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        source=dict(name="OpenStreetMap", license="ODbL-1.0", attribution="© OpenStreetMap contributors",
                    selector="natural=water (lake, reservoir, salt_lake, lagoon), water=salt_lake, salt wetlands; lagoons without a polygon from natural=coastline",
                    **source_meta),
        rules=dict(min_area_km2=MIN_AREA_KM2, duplicate_share=DUPLICATE, lagoon_channel_m=2 * CHANNEL_M),
        counts=dict(water=len(features), areas_read=len(rd.areas), governorates=len({g for r in rows for g in r["governorates"].split()})),
        per_type={t: dict(count=by_type[t]["count"], area_km2=round(by_type[t]["area_km2"], 1)) for t in TYPES},
        per_governorate=dict(sorted(collections.Counter(f["governorate"] for f in features).items())),
        topology=checks,
        left_out=dict(unnamed=unnamed["count"], unnamed_km2=round(unnamed["area"], 1), smaller_than_min=len(small),
                      smaller_than_min_km2=round(sum(area_km2(k["geom"]) for k in small), 1)),
    )
    (out / "source" / "water-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(dict(per_type=report["per_type"], left_out=report["left_out"]), ensure_ascii=False))
    print(f"Done in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
