#!/usr/bin/env python3
"""
Extract the cities layer of Tunisia (the national capital, the 24 governorate
capitals and the seats of the municipalities) from an OpenStreetMap PBF extract,
as points. It is an overlay: it does not change any partition.

Pipeline
--------
1. Read with pyosmium every ``place=*`` node, the ``admin_centre`` members of
   the country relation (admin_level=2), of the 24 governorates
   (admin_level=4, ``ISO3166-2=TN-*``) and of the ``boundary=municipality``
   relations.
2. The national capital is the admin_centre of the country (Tunis, also
   tagged ``capital=yes``); each governorate capital is the admin_centre of its
   governorate. No capital is typed in by hand.
3. The seat of a municipality is, in order: the governorate capital of the
   same name in or near it; the admin_centre of its relation; a settlement node (city, town,
   village, suburb, quarter, neighbourhood) inside it (within NEAR_DEG) with the
   same name in Latin or Arabic script, accents, case and the article (El, Al,
   ال) ignored; failing that, a city or town node inside it whose name is a
   whole-word part of the municipality's name ("Midoun" in "Djerba Midoun").
   Several candidates of the same rank: the one with a Wikidata item, then the
   one nearest the centre of the municipality. A municipality with no such node
   gets no point and is listed in the report: nothing is invented.
4. Attach each point to its governorate, delegation and sector (point in
   polygon on the sectors written by extract.py; a coastal node that OSM puts
   in the sea goes to the nearest sector within COAST_M) and to the
   municipality it is the seat of (empty for a capital that is the seat of
   none in OSM).
5. Write data/source/tunisia-cities.geojson, data/attributes/cities.csv and
   data/source/cities-report.json.

Usage
-----
    python scripts/extract/cities.py --pbf .cache/tunisia-latest.osm.pbf

Run ``python scripts/extract/extract.py`` and ``municipalities.py`` first: the
land mask and the municipalities come from their output.
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
from shapely import STRtree
from shapely.geometry import Point, shape

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import ROOT, names_for, to_utm  # noqa: E402

TYPES = ("national_capital", "governorate_capital", "city")
SETTLEMENTS = ("city", "town", "village", "suburb", "quarter", "neighbourhood")  # in order of preference
PARTIAL = ("city", "town")  # place types accepted for a whole-word part of the municipality's name
NEAR_DEG = 0.005  # ~500 m: a seat node may sit just outside its municipality as clipped to the coastline
COAST_M = 1000  # a node in the sea this close to the land goes to the nearest sector
ARTICLE = re.compile(r"^(el|al|le|la|les|ال)[\s\-']+")


class PlaceReader(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.places: dict[int, dict] = {}
        self.country_centre: list[int] = []
        self.gov_centre: dict[str, list[int]] = collections.defaultdict(list)
        self.mun_centre: dict[int, list[int]] = {}

    def node(self, n):
        tags = {t.k: t.v for t in n.tags}
        if "place" in tags:
            self.places[n.id] = dict(id=n.id, tags=tags, lon=n.location.lon, lat=n.location.lat)

    def relation(self, r):
        tags = {t.k: t.v for t in r.tags}
        centres = [m.ref for m in r.members if m.type == "n" and m.role == "admin_centre"]
        if tags.get("boundary") == "administrative" and tags.get("admin_level") == "2" and tags.get("ISO3166-1") == "TN":
            self.country_centre = centres
        elif tags.get("boundary") == "administrative" and tags.get("admin_level") == "4" and tags.get("ISO3166-2", "").startswith("TN-"):
            self.gov_centre[tags["ISO3166-2"]] = centres
        elif tags.get("boundary") == "municipality":
            self.mun_centre[r.id] = centres


def norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).casefold().strip()
    return re.sub(r"[\W_]+", "", ARTICLE.sub("", s))


def words(s: str | None) -> list[str]:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).casefold()
    return [w for w in re.split(r"[\W_]+", s) if w]


NAME_KEYS = ("name", "name:fr", "name:en", "name:ar", "alt_name", "alt_name:fr", "official_name")


def node_names(tags: dict) -> set[str]:
    return {norm(tags.get(k)) for k in NAME_KEYS if tags.get(k)} - {""}


def part_of(place: dict, mun: dict) -> bool:
    """Is a name of the place a whole-word run of a name of the municipality (and not the whole of it)?"""
    for k in ("name", "name:fr", "name:en", "name:ar"):
        p = words(place["tags"].get(k))
        if not p:
            continue
        for full in (mun["name_fr"], mun["name_en"], mun["name_ar"]):
            m = words(full)
            if len(m) > len(p) and any(m[i:i + len(p)] == p for i in range(len(m) - len(p) + 1)):
                return True
    return False


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
    report = dict(warnings=[], no_seat=[], other_cities=[])

    print("Loading the sectors and the municipalities ...")
    sectors = json.loads((out / "source" / "tunisia-sectors.geojson").read_text(encoding="utf-8"))["features"]
    sec_geoms = [shape(f["geometry"]) for f in sectors]
    sec_props = [f["properties"] for f in sectors]
    sec_tree = STRtree(sec_geoms)
    land = shapely.union_all(sec_geoms)
    mun_rows = {r["id"]: r for r in csv.DictReader(open(out / "attributes" / "municipalities.csv", encoding="utf-8"))}
    mun_fc = json.loads((out / "source" / "tunisia-municipalities.geojson").read_text(encoding="utf-8"))["features"]
    mun_geom = {f["properties"]["municipality"]: shape(f["geometry"]) for f in mun_fc}
    mun_ids = sorted(mun_geom)

    print(f"Reading {args.pbf} ...")
    rd = PlaceReader()
    rd.apply_file(args.pbf)
    print(f"  {len(rd.places)} place nodes, {len(rd.gov_centre)} governorates, {len(rd.mun_centre)} municipalities")

    def locate(lon: float, lat: float, warn: bool = False) -> dict | None:
        """Governorate, delegation and sector of a point; a node just off the coast goes to the nearest sector."""
        p = Point(lon, lat)
        hit = [i for i in sec_tree.query(p, predicate="intersects")]
        if not hit:
            i = int(sec_tree.nearest(p))
            gap = to_utm(shapely.shortest_line(p, sec_geoms[i])).length
            if gap > COAST_M:
                return None
            hit = [i]
            if warn:
                report["warnings"].append(f"node at {lon:.5f},{lat:.5f} lies {gap:.0f} m off the land; given to sector {sec_props[i]['sector']}")
        s = sec_props[min(hit)]
        return dict(governorate=s["governorate"], delegation=s["delegation"], sector=s["sector"])

    def node(ref: int, what: str) -> dict | None:
        n = rd.places.get(ref)
        if n is None:
            report["warnings"].append(f"{what}: admin_centre node {ref} is not a place node in the extract")
        return n

    points: dict[int, dict] = {}  # node id -> {type, seat_source, municipality}

    # ------------------------------------------------------------ capitals
    if len(rd.country_centre) != 1:
        print(f"! the country relation of Tunisia has {len(rd.country_centre)} admin_centre nodes, expected 1")
        return 1
    capital = node(rd.country_centre[0], "TN")
    if capital is None or capital["tags"].get("capital") != "yes":
        print("! the admin_centre of the country is not a place node tagged capital=yes")
        return 1
    points[capital["id"]] = dict(type="national_capital", seat_source="country_admin_centre")
    gov_ids = sorted({p["governorate"] for p in sec_props})
    capital_of = {}
    for g in gov_ids:
        refs = rd.gov_centre.get(g, [])
        if len(refs) != 1 or node(refs[0], g) is None:
            print(f"! governorate {g} has no single admin_centre place node in OSM ({refs})")
            return 1
        loc = locate(rd.places[refs[0]]["lon"], rd.places[refs[0]]["lat"])
        if loc is None or loc["governorate"] != g:
            print(f"! the admin_centre of {g} (node {refs[0]}) lies outside the governorate ({loc})")
            return 1
        capital_of[refs[0]] = g
        points.setdefault(refs[0], dict(type="governorate_capital", seat_source="governorate_admin_centre"))

    # ------------------------------------------------------------ municipal seats
    settlements = [n for n in rd.places.values() if n["tags"].get("place") in SETTLEMENTS]
    set_tree = STRtree([Point(n["lon"], n["lat"]) for n in settlements])
    rank = {p: i for i, p in enumerate(SETTLEMENTS)}
    seat_of: dict[int, str] = {}  # node id -> municipality id
    for mid in mun_ids:
        g = mun_geom[mid]
        m = mun_rows[mid]
        inside = [n for n in (settlements[i] for i in set_tree.query(g, predicate="intersects")) if n["id"] not in seat_of]
        relation = [rd.places[r] for r in rd.mun_centre.get(int(m["osm_relation"]), []) if r in rd.places and r not in seat_of]
        near = [settlements[i] for i in set_tree.query(g.buffer(NEAR_DEG), predicate="intersects")]
        near = [n for n in near if n["id"] not in seat_of]
        names = {norm(m["name_fr"]), norm(m["name_en"]), norm(m["name_ar"])} - {""}
        same = [n for n in near if names & node_names(n["tags"])]
        caps = [n for n in same if n["id"] in capital_of]  # Jendouba's node lies just outside its municipality, in Ettataouer
        partial = [n for n in inside if n["tags"]["place"] in PARTIAL and part_of(n, m)]
        for source, found in (("governorate_admin_centre", caps), ("municipality_admin_centre", relation), ("name", same), ("partial_name", partial)):
            if not found:
                continue
            centre = g.representative_point()
            found.sort(key=lambda n: (rank.get(n["tags"]["place"], 99), not n["tags"].get("wikidata"), Point(n["lon"], n["lat"]).distance(centre), n["id"]))
            best = found[0]
            if len(found) > 1 and source != "governorate_admin_centre":
                report["warnings"].append(f"{mid} ({m['name_fr']}): {len(found)} candidate seats by {source}, kept node {best['id']} "
                                          f"({best['tags'].get('name')}) over {', '.join(str(n['id']) for n in found[1:])}")
            seat_of[best["id"]] = mid
            if best["id"] not in points:
                points[best["id"]] = dict(type="city", seat_source=source)
            break
        else:
            report["no_seat"].append(dict(municipality=mid, governorate=m["governorate"], name_fr=m["name_fr"], name_ar=m["name_ar"]))

    # Cities and towns of OSM that are no municipal seat: reported, not published.
    for n in rd.places.values():
        if n["tags"].get("place") in PARTIAL and n["id"] not in points:
            loc = locate(n["lon"], n["lat"])
            if loc:
                report["other_cities"].append(dict(osm=f"node/{n['id']}", place=n["tags"]["place"], name=n["tags"].get("name:fr") or n["tags"].get("name"),
                                                   governorate=loc["governorate"]))

    # ------------------------------------------------------------ attributes
    rows, features = [], []
    for nid, pt in points.items():
        n = rd.places[nid]
        loc = locate(n["lon"], n["lat"], warn=True)
        if loc is None:
            report["warnings"].append(f"node {nid} ({n['tags'].get('name')}) lies outside Tunisia; left out")
            continue
        names = names_for(n["tags"])
        uid = f"city-n{nid}"
        if not names["name_ar"]:
            report["warnings"].append(f"{uid} ({names['name_fr']}) has no Arabic name in OSM")
        if not names["name_fr"]:
            report["warnings"].append(f"{uid} ({names['name_ar']}) has no Latin name in OSM")
        mun = seat_of.get(nid, "")
        rows.append(dict(id=uid, type=pt["type"], governorate=loc["governorate"], delegation=loc["delegation"], sector=loc["sector"], municipality=mun,
                         capital_of=" ".join((["TN"] if pt["type"] == "national_capital" else []) + ([capital_of[nid]] if nid in capital_of else [])),
                         name_en=names["name_en"], name_fr=names["name_fr"], name_ar=names["name_ar"],
                         lon=f"{n['lon']:.7f}", lat=f"{n['lat']:.7f}", place=n["tags"]["place"], seat_source=pt["seat_source"],
                         wikidata=n["tags"].get("wikidata", ""), osm=f"node/{nid}"))
        features.append(dict(id=uid, type=pt["type"], governorate=loc["governorate"], lon=n["lon"], lat=n["lat"]))
    if sum(r["type"] == "national_capital" for r in rows) != 1:
        print("! expected exactly one national capital")
        return 1
    rows.sort(key=lambda r: r["id"])
    features.sort(key=lambda f: f["id"])
    names_seen = collections.defaultdict(list)
    for r in rows:
        names_seen[(r["name_fr"] or r["name_ar"], r["governorate"])].append(r["id"])
    for (name, gov), ids in names_seen.items():
        if len(ids) > 1:
            report["warnings"].append(f"{len(ids)} cities are named {name} in {gov}: {', '.join(ids)}")

    # ------------------------------------------------------------ write
    fc = dict(type="FeatureCollection", features=[
        dict(type="Feature", properties=dict(city=f["id"], type=f["type"], governorate=f["governorate"]),
             geometry=dict(type="Point", coordinates=[round(f["lon"], 7), round(f["lat"], 7)])) for f in features])
    (out / "source" / "tunisia-cities.geojson").write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    cols = ["id", "type", "governorate", "delegation", "sector", "municipality", "capital_of", "name_en", "name_fr", "name_ar", "lon", "lat",
            "place", "seat_source", "wikidata", "osm"]
    with open(out / "attributes" / "cities.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, cols, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)

    per_type = collections.Counter(r["type"] for r in rows)
    report.update(
        generated=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        source=dict(name="OpenStreetMap", license="ODbL-1.0", attribution="© OpenStreetMap contributors",
                    selector="place=* nodes; admin_centre members of the country, governorate (admin_level=4) and boundary=municipality relations",
                    **source_meta),
        rules=dict(settlements=list(SETTLEMENTS), partial_name_places=list(PARTIAL), near_m=round(NEAR_DEG * 111_000), coast_m=COAST_M),
        counts=dict(cities=len(rows), municipalities=len(mun_ids), municipalities_with_seat=len(set(seat_of.values())),
                    municipalities_without_seat=len(report["no_seat"]), place_nodes_read=len(rd.places)),
        per_type={t: per_type[t] for t in TYPES},
        per_seat_source=dict(sorted(collections.Counter(r["seat_source"] for r in rows).items())),
        per_place=dict(sorted(collections.Counter(r["place"] for r in rows).items())),
        per_governorate=dict(sorted(collections.Counter(r["governorate"] for r in rows).items())),
    )
    report["other_cities"].sort(key=lambda c: (c["governorate"], c["name"] or ""))
    report = {k: report[k] for k in ("generated", "source", "rules", "counts", "per_type", "per_seat_source", "per_place", "per_governorate",
                                     "warnings", "no_seat", "other_cities")}
    (out / "source" / "cities-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(dict(counts=report["counts"], per_type=report["per_type"], per_seat_source=report["per_seat_source"]), ensure_ascii=False))
    print(f"  {len(report['warnings'])} warnings, {len(report['other_cities'])} OSM cities/towns that are no municipal seat")
    print(f"Done in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
