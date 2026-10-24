#!/usr/bin/env python3
"""
Read the Tamazight names in Tifinagh script that OpenStreetMap holds for the
units Map Tunisia publishes. They feed the ``labeled-tfng`` mode; every other
unit gets its Arabic name written in Tifinagh letters by the build
(scripts/build/names.js). Nothing is typed in by hand.

Pipeline
--------
1. Collect the OSM object of every published unit: the country relation
   (``ISO3166-1=TN``), the governorates (``ISO3166-2=TN-*``), and the
   relations, ways and nodes named in the attribute tables of the delegations,
   sectors, municipalities, water bodies and cities.
2. Read those objects with pyosmium and keep the first of TAGS whose value is
   written in Tifinagh only (letters U+2D30–U+2D7F, spaces, hyphens and
   apostrophes): Standard Moroccan Tamazight first, then the generic Berber
   code, then the Tifinagh variants of other Tamazight languages.
3. Write data/source/tifinagh-names.json: ``{unit id: {name, tag, osm}}`` and a
   summary, with the source of the extract.

Usage
-----
    python scripts/extract/tifinagh.py --pbf .cache/tunisia-latest.osm.pbf

Run ``extract.py``, ``municipalities.py``, ``water.py`` and ``cities.py`` first:
the units come from their attribute tables.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[2]

TAGS = ("name:zgh", "name:zgh-Tfng", "name:ber", "name:ber-Tfng", "name:tzm", "name:tzm-Tfng", "name:shi-Tfng", "name:kab-Tfng")
TIFINAGH = re.compile(r"^[ⴰ-⵿]+(?:[ '’-][ⴰ-⵿]+)*$")


class Reader(osmium.SimpleHandler):
    """Tags of the wanted objects, plus the country and governorate relations found by their ISO codes."""

    def __init__(self, wanted: dict[str, str]):
        super().__init__()
        self.wanted = wanted
        self.found: dict[str, tuple[str, dict]] = {}

    def keep(self, key: str, uid: str, tags) -> None:
        self.found[uid] = (key, {t.k: t.v for t in tags})

    def node(self, n):
        key = f"node/{n.id}"
        if key in self.wanted:
            self.keep(key, self.wanted[key], n.tags)

    def way(self, w):
        key = f"way/{w.id}"
        if key in self.wanted:
            self.keep(key, self.wanted[key], w.tags)

    def relation(self, r):
        key = f"relation/{r.id}"
        tags = r.tags
        if tags.get("boundary") == "administrative":
            if tags.get("admin_level") == "2" and tags.get("ISO3166-1") == "TN":
                self.keep(key, "TN", tags)
                return
            iso = tags.get("ISO3166-2", "")
            if tags.get("admin_level") == "4" and re.fullmatch(r"TN-\d\d", iso):
                self.keep(key, iso, tags)
                return
        if key in self.wanted:
            self.keep(key, self.wanted[key], tags)


def wanted_objects(attributes: Path) -> dict[str, str]:
    """OSM object (``node/1``, ``way/2``, ``relation/3``) → unit id, from the attribute tables."""
    def rows(name):
        with open(attributes / name, encoding="utf-8") as fh:
            return list(csv.DictReader(fh))

    out: dict[str, str] = {}
    for table in ("delegations.csv", "sectors.csv", "municipalities.csv"):
        for r in rows(table):
            if r.get("osm_relation"):
                out[f"relation/{r['osm_relation']}"] = r["id"]
    for table in ("water.csv", "cities.csv"):
        for r in rows(table):
            if r.get("osm"):
                out[r["osm"]] = r["id"]
    return out


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
        print(f"! {args.pbf} is from {source_meta['osm_date']} but the units come from {sectors_report['source']['osm_date']}; run extract.py first")
        return 1

    wanted = wanted_objects(out / "attributes")
    print(f"Reading the tags of {len(wanted)} OSM objects plus the country and governorates ...")
    rd = Reader(wanted)
    rd.apply_file(args.pbf)

    names, mixed = {}, []
    for uid, (osm, tags) in sorted(rd.found.items()):
        for tag in TAGS:
            value = (tags.get(tag) or "").strip()
            if not value:
                continue
            if TIFINAGH.match(value):
                names[uid] = dict(name=value, tag=tag, osm=osm)
                break
            mixed.append(dict(id=uid, osm=osm, tag=tag, value=value))

    per_tag: dict[str, int] = {}
    for n in names.values():
        per_tag[n["tag"]] = per_tag.get(n["tag"], 0) + 1
    result = dict(
        generated=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        source=dict(name="OpenStreetMap", license="ODbL-1.0", attribution="© OpenStreetMap contributors",
                    selector="Tifinagh-only values of " + ", ".join(TAGS) + " on the objects of the published units", **source_meta),
        tags=list(TAGS),
        counts=dict(objects_read=len(rd.found), names=len(names)),
        per_tag=dict(sorted(per_tag.items())),
        not_tifinagh=mixed,
        names=names,
    )
    (out / "source" / "tifinagh-names.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(dict(counts=result["counts"], per_tag=result["per_tag"]), ensure_ascii=False))
    for uid, n in names.items():
        print(f"  {uid:<22} {n['name']:<20} {n['tag']}")
    print(f"Done in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
