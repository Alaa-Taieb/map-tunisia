#!/usr/bin/env python3
"""
Download the latest OpenStreetMap extract of Tunisia from Geofabrik and record
its replication timestamp in .cache/source.json.

    python scripts/extract/fetch.py [--url URL]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_URL = "https://download.geofabrik.de/africa/tunisia-latest.osm.pbf"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--out", default=str(ROOT / ".cache" / "tunisia-latest.osm.pbf"))
    args = ap.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part")
    print(f"Downloading {args.url} ...")
    req = urllib.request.Request(args.url, headers={"User-Agent": "map-tunisia (https://github.com/Alaa-Taieb/map-tunisia)"})
    with urllib.request.urlopen(req) as resp, open(tmp, "wb") as fh:
        shutil.copyfileobj(resp, fh)
    tmp.replace(out)

    header = osmium.io.Reader(str(out), osmium.osm.osm_entity_bits.NOTHING).header()
    stamp = header.get("osmosis_replication_timestamp", "")
    sha = hashlib.sha256(out.read_bytes()).hexdigest()
    meta = dict(url=args.url, osm_timestamp=stamp, osm_date=stamp[:10], sha256=sha, bytes=out.stat().st_size)
    out.with_name("source.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
