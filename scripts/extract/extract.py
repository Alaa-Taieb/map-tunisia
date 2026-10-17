#!/usr/bin/env python3
"""
Extract clean, exactly nested administrative boundaries of Tunisia from an
OpenStreetMap PBF extract.

Pipeline
--------
1. Read governorates (admin_level=4), delegations (5) and sectors / imadas (6)
   plus natural=coastline islets with pyosmium.
2. Node every boundary together into one planar set of faces, so that all
   levels share identical edges.
3. Label each face with its governorate, delegation and sector, applying the
   documented corrections in corrections.json.
4. Faces that a lower level leaves uncovered (inland lakes and sebkhas, slivers,
   islets) are split between neighbouring units of the same parent by
   nearest-boundary (Voronoi) allocation.
5. Dissolve faces into sectors and write data/source/tunisia-sectors.geojson
   together with attribute tables and an extraction report.

Usage
-----
    python scripts/extract/extract.py --pbf .cache/tunisia-latest.osm.pbf

Run ``python scripts/extract/fetch.py`` first to download the extract.
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

import numpy as np
import osmium
import shapely
import shapely.prepared
from pyproj import Transformer
from shapely import STRtree, wkb
from shapely.geometry import MultiPoint, Polygon

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent

TO_UTM = Transformer.from_crs(4326, 32632, always_xy=True)
TO_WGS = Transformer.from_crs(32632, 4326, always_xy=True)

GRID = 1e-7  # OSM coordinate precision (degrees), ~1 cm
SAMPLE_STEP_M = 100  # boundary sampling step for gap allocation (metres)

LOG: list[str] = []


def log(msg: str) -> None:
    print(msg, flush=True)
    LOG.append(msg)


# --------------------------------------------------------------------------- #
# Geometry helpers
# --------------------------------------------------------------------------- #
def _proj(fn):
    def apply(coords):
        x, y = fn(coords[:, 0], coords[:, 1])
        return np.column_stack([x, y])

    return apply


def to_utm(g):
    return shapely.transform(g, _proj(TO_UTM.transform))


def to_wgs(g):
    return shapely.transform(g, _proj(TO_WGS.transform))


def area_km2(g) -> float:
    return to_utm(g).area / 1e6


def polygons_only(g):
    """Keep only polygonal parts of a geometry, as a (Multi)Polygon."""
    parts = [p for p in shapely.get_parts(g) if p.geom_type in ("Polygon", "MultiPolygon") and not p.is_empty]
    flat = []
    for p in parts:
        flat.extend(shapely.get_parts(p) if p.geom_type == "MultiPolygon" else [p])
    if not flat:
        return Polygon()
    return shapely.union_all(flat) if len(flat) > 1 else flat[0]


# --------------------------------------------------------------------------- #
# Reading OSM
# --------------------------------------------------------------------------- #
class OsmReader(osmium.SimpleHandler):
    LEVELS = {"2", "4", "5", "6"}

    def __init__(self):
        super().__init__()
        self.factory = osmium.geom.WKBFactory()
        self.areas: list[dict] = []
        self.coast: list = []

    def area(self, a):
        tags = {t.k: t.v for t in a.tags}
        if tags.get("boundary") != "administrative" or tags.get("admin_level") not in self.LEVELS:
            return
        try:
            geom = wkb.loads(self.factory.create_multipolygon(a), hex=True)
        except Exception as exc:  # broken relation in OSM
            log(f"  ! could not assemble {'way' if a.from_way() else 'relation'} {a.orig_id()} ({tags.get('name')}): {exc}")
            return
        self.areas.append(
            dict(osm_type="way" if a.from_way() else "relation", osm_id=a.orig_id(), tags=tags, geom=geom)
        )

    def way(self, w):
        if w.tags.get("natural") == "coastline" and len(w.nodes) > 1:
            try:
                self.coast.append(wkb.loads(self.factory.create_linestring(w), hex=True))
            except Exception:
                pass


# --------------------------------------------------------------------------- #
# Names and codes
# --------------------------------------------------------------------------- #
PREFIXES_AR = ("معتمدية ", "عمادة ", "ولاية ")
PREFIXES_FR = ("Délégation de ", "Délégation d'", "Délégation ", "Imada de ", "Imada ", "Secteur ", "Gouvernorat de ", "Gouvernorat ")
SUFFIXES_EN = (" Delegation", " delegation", " District", " Sector", " Imada")


# Persian/Urdu look-alike letters sometimes typed in OSM Arabic names (ی ک ە) -> Arabic (ي ك ه).
PERSIAN_TO_ARABIC = str.maketrans({0x06CC: 0x064A, 0x06A9: 0x0643, 0x06D5: 0x0647})
BIDI = re.compile("[" + "".join(map(chr, [0x200E, 0x200F, *range(0x202A, 0x202F), *range(0x2066, 0x206A)])) + "]")  # invisible direction marks found in some OSM names
ARABIC = re.compile(f"[{chr(0x0600)}-{chr(0x06FF)}]")


def clean(name: str | None, prefixes=(), suffixes=()) -> str:
    if not name:
        return ""
    name = BIDI.sub("", name).strip()
    for p in prefixes:
        if name.startswith(p):
            name = name[len(p):]
            break
    for s in suffixes:
        if name.endswith(s):
            name = name[: -len(s)]
            break
    return re.sub(r"\s+", " ", name).strip()


def names_for(tags: dict) -> dict:
    ar = clean(tags.get("name:ar") or tags.get("name"), PREFIXES_AR)
    ar = ar.translate(PERSIAN_TO_ARABIC)
    if not ARABIC.search(ar):
        ar = ""  # no Arabic-script name in OSM; never put Latin text in the Arabic field
    fr = clean(tags.get("name:fr") or tags.get("alt_name:fr"), PREFIXES_FR)
    en = clean(tags.get("name:en"), PREFIXES_FR, SUFFIXES_EN)
    if not fr:
        n = tags.get("name", "")
        fr = clean(n, PREFIXES_FR) if re.search(r"[A-Za-z]", n) else ""
    return dict(name_ar=ar, name_fr=fr, name_en=en or fr)


def slug(s: str) -> str:
    import unicodedata

    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# --------------------------------------------------------------------------- #
# Gap allocation
# --------------------------------------------------------------------------- #
def allocate(component, neighbours: dict[str, object]) -> list[tuple[object, str]]:
    """Split ``component`` (lon/lat polygon) between ``neighbours`` (label -> geometry)
    by nearest-boundary allocation. Returns [(piece, label), ...] covering the
    component exactly."""
    labels = list(neighbours)
    if len(labels) == 1:
        return [(component, labels[0])]

    comp_u = to_utm(component)
    reach = comp_u.buffer(max(500.0, 0.02 * np.sqrt(comp_u.area)))
    pts, lab = [], []
    for label in labels:
        b = to_utm(neighbours[label]).boundary.intersection(reach)
        if b.is_empty:
            continue
        b = shapely.segmentize(b, SAMPLE_STEP_M)
        c = shapely.get_coordinates(b)
        pts.append(c)
        lab.extend([label] * len(c))
    if not pts:
        return [(component, labels[0])]
    pts = np.vstack(pts)
    lab = np.array(lab)
    _, keep = np.unique(np.round(pts, 1), axis=0, return_index=True)
    pts, lab = pts[keep], lab[keep]
    if len(set(lab)) == 1:
        return [(component, str(lab[0]))]

    cells = shapely.voronoi_polygons(MultiPoint(pts), extend_to=reach.envelope.buffer(5000), ordered=True)
    cells = list(shapely.get_parts(cells))
    by_label: dict[str, list] = collections.defaultdict(list)
    for cell, l in zip(cells, lab):
        by_label[str(l)].append(cell)

    pieces = []
    for l, cs in by_label.items():
        region = to_wgs(shapely.union_all(cs))
        piece = polygons_only(shapely.intersection(component, region))
        if not piece.is_empty:
            pieces.append([piece, l])
    if not pieces:
        return [(component, labels[0])]
    # Guarantee an exact cover: the largest piece becomes the remainder.
    pieces.sort(key=lambda p: -p[0].area)
    others = shapely.union_all([p[0] for p in pieces[1:]]) if len(pieces) > 1 else Polygon()
    pieces[0][0] = polygons_only(shapely.difference(component, others))
    return [(p, l) for p, l in pieces if not p.is_empty]


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pbf", default=str(ROOT / ".cache" / "tunisia-latest.osm.pbf"))
    ap.add_argument("--out", default=str(ROOT / "data"))
    ap.add_argument("--source-date", help="Date of the OSM extract (YYYY-MM-DD); read from .cache/source.json if omitted")
    args = ap.parse_args()

    t0 = time.time()
    out = Path(args.out)
    corrections = json.loads((HERE / "corrections.json").read_text(encoding="utf-8"))
    gov_attrs = {r["id"]: r for r in csv.DictReader(open(out / "attributes" / "governorates.csv", encoding="utf-8"))}

    source_meta = {}
    meta_file = Path(args.pbf).with_name("source.json")
    if meta_file.exists():
        source_meta = json.loads(meta_file.read_text(encoding="utf-8"))
    if args.source_date:
        source_meta["osm_date"] = args.source_date

    # ---------------------------------------------------------------- read
    log(f"Reading {args.pbf} ...")
    rd = OsmReader()
    rd.apply_file(args.pbf, locations=True)
    log(f"  {len(rd.areas)} administrative areas, {len(rd.coast)} coastline ways")

    dropped = {d["osm_id"]: d for d in corrections["drop_relations"]}
    report = dict(corrections=[], warnings=[])

    govs = [a for a in rd.areas if a["tags"].get("admin_level") == "4" and a["tags"].get("ISO3166-2", "").startswith("TN-")]
    assert len(govs) == 24, f"expected 24 governorates, found {len(govs)}"
    for g in govs:
        g["id"] = g["tags"]["ISO3166-2"]
        assert g["id"] in gov_attrs, g["id"]
    gov_union = shapely.union_all([g["geom"] for g in govs])
    country = [a for a in rd.areas if a["tags"].get("admin_level") == "2" and a["tags"].get("ISO3166-1") == "TN"][0]
    maritime = country["geom"]  # land + territorial sea
    land_test = shapely.prepared.prep(gov_union.buffer(0.001))

    def inside_tunisia(a):
        return land_test.contains(a["geom"].representative_point())

    dels = [a for a in rd.areas if a["tags"].get("admin_level") == "5" and inside_tunisia(a)]
    secs = [a for a in rd.areas if a["tags"].get("admin_level") == "6" and inside_tunisia(a)]
    for coll in (dels, secs):
        for a in list(coll):
            if a["osm_id"] in dropped:
                coll.remove(a)
                report["corrections"].append(dict(type="drop_relation", osm_id=a["osm_id"], name=a["tags"].get("name:fr") or a["tags"].get("name"), reason=dropped[a["osm_id"]]["reason"]))
                log(f"  - dropped relation {a['osm_id']} ({a['tags'].get('name:fr')}): superseded")
    log(f"  24 governorates, {len(dels)} delegations, {len(secs)} sectors")

    # ---------------------------------------------------------------- islets
    merged = shapely.line_merge(shapely.union_all(rd.coast))
    rings = [l for l in shapely.get_parts(merged) if l.is_closed and len(l.coords) >= 4]
    gov_prep = shapely.prepared.prep(gov_union)
    mar_prep = shapely.prepared.prep(maritime)
    islets = []
    for r in rings:
        p = shapely.make_valid(Polygon(r))
        p = polygons_only(p)
        if p.is_empty:
            continue
        rp = p.representative_point()
        if not gov_prep.contains(rp) and mar_prep.contains(rp):
            extra = polygons_only(p.difference(gov_union))
            if not extra.is_empty and area_km2(extra) > 1e-6:
                islets.append(extra)
    log(f"  {len(islets)} coastline islets outside the governorate relations ({sum(area_km2(i) for i in islets):.3f} km²) added")
    if islets:
        report["corrections"].append(dict(type="add_islets", count=len(islets), area_km2=round(sum(area_km2(i) for i in islets), 4),
                                          reason="Islets mapped with natural=coastline but not included in any governorate relation; assigned to the nearest unit."))

    # ---------------------------------------------------------------- codes / names
    for d in dels:
        code = d["tags"].get("ref:tn:codegeo")
        fix = corrections["delegation_codes"].get(str(d["osm_id"]))
        if not code and fix:
            code = fix["code"]
            report["corrections"].append(dict(type="delegation_code", osm_id=d["osm_id"], code=code, reason=fix["reason"]))
        d["code"] = code
        d["names"] = names_for(d["tags"])
    for s in secs:
        code = s["tags"].get("ref:tn:codegeo")
        fix = corrections["sector_codes"].get(str(s["osm_id"]))
        if not code and fix:
            code = fix["code"]
        s["code"] = code
        s["names"] = names_for(s["tags"])

    # ---------------------------------------------------------------- parent assignment
    gtree = STRtree([g["geom"] for g in govs])
    for d in dels:
        idx = gtree.query(d["geom"], predicate="intersects")
        best = max(idx, key=lambda i: shapely.intersection(d["geom"], govs[i]["geom"]).area)
        d["gov"] = govs[best]["id"]
        frac = shapely.intersection(d["geom"], govs[best]["geom"]).area / d["geom"].area
        ins = gov_attrs[d["gov"]]["ins_code"]
        if d["code"] and not d["code"].startswith(ins):
            report["warnings"].append(f"delegation {d['osm_id']} {d['names']['name_fr']} code {d['code']} does not start with INS governorate code {ins} of {d['gov']}")
        if frac < 0.98:
            report["warnings"].append(f"delegation {d['osm_id']} {d['names']['name_fr']} only {frac:.1%} inside {d['gov']}")

    # Delegation ids: delegation-<INS code>; fall back to a slug.
    seen = set()
    for d in sorted(dels, key=lambda d: (d["code"] or "~", d["osm_id"])):
        did = f"delegation-{d['code']}" if d["code"] else f"delegation-{d['gov'][3:]}-{slug(d['names']['name_fr'] or str(d['osm_id']))}"
        if did in seen:
            report["warnings"].append(f"duplicate delegation id {did} (osm {d['osm_id']}); using osm id suffix")
            did = f"{did}-{d['osm_id']}"
        seen.add(did)
        d["id"] = did
    dels_by_id = {d["id"]: d for d in dels}

    dtree = STRtree([d["geom"] for d in dels])
    code_to_del = {d["code"]: d for d in dels if d["code"]}
    for s in secs:
        idx = dtree.query(s["geom"], predicate="intersects")
        if len(idx) == 0:
            s["del"] = None
            continue
        ov = {i: shapely.intersection(s["geom"], dels[i]["geom"]).area / s["geom"].area for i in idx}
        best = max(ov, key=ov.get)
        chosen = dels[best]
        coded = code_to_del.get((s["code"] or "")[:4])
        if ov[best] < 0.9 and coded is not None:
            ci = dels.index(coded)
            if ov.get(ci, 0) >= 0.3:
                chosen = coded
        s["del"] = chosen["id"]

    seen = set()
    for s in sorted(secs, key=lambda s: (s["code"] or "~", s["osm_id"])):
        sid = f"sector-{s['code']}" if s["code"] else f"sector-x{s['osm_id']}"
        if sid in seen:
            report["warnings"].append(f"duplicate sector id {sid} (osm {s['osm_id']}); using osm id suffix")
            sid = f"{sid}-{s['osm_id']}"
        seen.add(sid)
        s["id"] = sid

    # ---------------------------------------------------------------- planar overlay
    log("Noding all boundaries into planar faces ...")
    lines = [g["geom"].boundary for g in govs] + [d["geom"].boundary for d in dels] + [s["geom"].boundary for s in secs] + [i.boundary for i in islets]
    noded = shapely.union_all(lines)
    faces = list(shapely.get_parts(shapely.polygonize(list(shapely.get_parts(noded)))))
    log(f"  {len(faces)} raw faces ({time.time() - t0:.0f}s)")

    land = shapely.union_all([gov_union] + islets)
    land_prep = shapely.prepared.prep(land)
    rep = [f.representative_point() for f in faces]
    keep = [i for i, p in enumerate(rep) if land_prep.contains(p)]
    faces = [faces[i] for i in keep]
    rep = [rep[i] for i in keep]
    log(f"  {len(faces)} land faces")

    stree = STRtree([s["geom"] for s in secs])
    secs_area = np.array([s["geom"].area for s in secs])
    dels_area = np.array([d["geom"].area for d in dels])
    face_gov, face_del, face_sec = [], [], []
    overlap_faces = collections.Counter()
    gov_conflicts = collections.Counter()
    for f, p in zip(faces, rep):
        gi = gtree.query(p, predicate="within")
        if len(gi):
            gov = govs[gi[0]]["id"]
        else:  # islet: nearest governorate
            gov = govs[gtree.nearest(p)]["id"]
        face_gov.append(gov)

        di_all = list(dtree.query(p, predicate="within"))
        di = [i for i in di_all if dels[i]["gov"] == gov]
        si_all = list(stree.query(p, predicate="within"))
        if not di and di_all:
            # The governorate relation and the delegation relation disagree. If a sector of
            # that same delegation also covers the face, two levels agree: follow them.
            cand = [i for i in di_all if any(secs[j]["del"] == dels[i]["id"] for j in si_all)]
            if cand:
                i = sorted(cand, key=lambda i: dels_area[i])[0]
                gov_conflicts[(gov, dels[i]["gov"], dels[i]["id"])] += area_km2(f)
                gov = dels[i]["gov"]
                face_gov[-1] = gov
                di = [i]
        if len(di) > 1:
            overlap_faces["delegation"] += 1
            # Evidence from the sector layer: the delegation whose code prefixes the sector code.
            hint = {(secs[i]["code"] or "")[:4] for i in si_all}
            pref = [i for i in di if dels[i]["code"] in hint]
            di = pref or sorted(di, key=lambda i: dels_area[i])
        face_del.append(dels[di[0]]["id"] if di else None)

        si = [i for i in si_all if secs[i]["del"] == face_del[-1]] if face_del[-1] else []
        if len(si) > 1:
            overlap_faces["sector"] += 1
            # Prefer sectors carrying an INS code (duplicates without code are usually stale), then the smallest.
            si = sorted(si, key=lambda i: (secs[i]["code"] is None, secs_area[i]))
        face_sec.append(secs[si[0]]["id"] if si else None)
    log(f"  overlap faces resolved: {dict(overlap_faces)}")
    for (g_from, g_to, did), a in sorted(gov_conflicts.items()):
        log(f"  governorate conflict: {a:.3f} km² moved from {g_from} to {g_to} (inside {did} and its sectors)")
        report["corrections"].append(dict(type="governorate_boundary_conflict", from_governorate=g_from, to_governorate=g_to, delegation=did, area_km2=round(a, 4),
                                          reason="Governorate relation disagrees with both the delegation and sector relations covering this area; the two lower levels are followed."))

    # ---------------------------------------------------------------- gap allocation
    pieces = [dict(geom=f, gov=g, dele=d, sec=s) for f, g, d, s in zip(faces, face_gov, face_del, face_sec)]
    stats = collections.Counter()

    def fill(level: str, parent_key: str, key: str, nearest_pool):
        """Allocate pieces whose `key` is None among units sharing the same parent."""
        nonlocal pieces
        by_parent = collections.defaultdict(list)
        for pc in pieces:
            by_parent[pc[parent_key]].append(pc)
        out_pieces = []
        for parent, group in by_parent.items():
            done = [pc for pc in group if pc[key] is not None]
            todo = [pc for pc in group if pc[key] is None]
            out_pieces.extend(done)
            if not todo:
                continue
            units = collections.defaultdict(list)
            for pc in done:
                units[pc[key]].append(pc["geom"])
            unit_geom = {k: shapely.union_all(v) for k, v in units.items()}
            if not unit_geom:  # parent has no unit at this level at all
                pool = nearest_pool(parent)
                unit_geom = pool
            ukeys = list(unit_geom)
            utree = STRtree([unit_geom[k] for k in ukeys])
            comps = shapely.get_parts(shapely.union_all([pc["geom"] for pc in todo]))
            for comp in comps:
                comp = polygons_only(comp)
                if comp.is_empty:
                    continue
                near = utree.query(comp, predicate="dwithin", distance=2e-6)
                if len(near) == 0:
                    near = [utree.nearest(comp)]
                nb = {ukeys[i]: unit_geom[ukeys[i]] for i in near}
                a = area_km2(comp)
                stats[f"{level}_gap_km2"] += a
                stats[f"{level}_gap_components"] += 1
                if a > 1:
                    report["corrections"].append(dict(type=f"{level}_gap_allocation", parent=parent, area_km2=round(a, 2),
                                                      at=[round(comp.representative_point().x, 4), round(comp.representative_point().y, 4)],
                                                      split_between=sorted(nb)))
                template = todo[0]
                for piece, label in allocate(comp, nb):
                    npc = dict(template)
                    npc["geom"] = piece
                    npc[key] = label
                    if key == "dele":
                        npc["sec"] = None
                    out_pieces.append(npc)
        pieces = out_pieces

    log("Allocating gaps (lakes, sebkhas, slivers) ...")
    fill("delegation", "gov", "dele", lambda parent: {d["id"]: d["geom"] for d in dels if d["gov"] == parent})
    fill("sector", "dele", "sec", lambda parent: {s["id"]: s["geom"] for s in secs if s["del"] == parent})
    log(f"  delegation gaps: {stats['delegation_gap_components']} components, {stats['delegation_gap_km2']:.1f} km²")
    log(f"  sector gaps:     {stats['sector_gap_components']} components, {stats['sector_gap_km2']:.1f} km²")

    # ---------------------------------------------------------------- dissolve
    log("Dissolving faces into sectors ...")
    sec_by_id = {s["id"]: s for s in secs}
    groups = collections.defaultdict(list)
    for pc in pieces:
        groups[pc["sec"]].append(pc)
    features = []
    missing = [s["id"] for s in secs if s["id"] not in groups]
    for sid in missing:
        report["warnings"].append(f"sector {sid} ({sec_by_id[sid]['names']['name_fr']}) received no area (fully covered by other sectors) and is omitted")
    for sid, pcs in groups.items():
        dels_of = {pc["dele"] for pc in pcs}
        assert len(dels_of) == 1, (sid, dels_of)
        geom = shapely.union_all([pc["geom"] for pc in pcs])
        geom = polygons_only(shapely.set_precision(geom, GRID))
        if geom.is_empty:
            continue
        s = sec_by_id[sid]
        d = dels_by_id[pcs[0]["dele"]]
        features.append(dict(sector=sid, delegation=d["id"], governorate=d["gov"], geom=geom))

    # ---------------------------------------------------------------- post-2014 delegations
    by_osm = {sec_by_id[f["sector"]]["osm_id"]: f for f in features}
    new_dels = {}
    for nd in corrections.get("new_delegations", {}).get("items", []):
        did = f"delegation-{nd['code']}"
        assert did not in dels_by_id, f"{did} already exists in OSM - remove it from corrections.json"
        new_dels[did] = nd
        for oid in nd["sectors"]:
            f = by_osm.get(oid)
            assert f is not None, f"sector osm {oid} of {did} not found"
            assert f["governorate"] == nd["governorate"], f"sector osm {oid} is in {f['governorate']}, not {nd['governorate']}"
            f["delegation"] = did
        report["corrections"].append(dict(type="new_delegation", id=did, name=nd["name_fr"], governorate=nd["governorate"],
                                          formed_from=nd["formed_from"], sectors=len(nd["sectors"]), confidence=nd["confidence"], sources=nd["sources"]))
    log(f"  rebuilt {len(new_dels)} post-2014 delegations from their imadas")
    for ra in corrections.get("sector_reassignments", {}).get("items", []):
        f = by_osm[ra["osm_id"]]
        to = f"delegation-{ra['to_delegation_code']}"
        assert to in dels_by_id or to in new_dels, to
        report["corrections"].append(dict(type="sector_reassignment", sector=f["sector"], name=ra["name_fr"], from_delegation=f["delegation"], to_delegation=to, reason=ra["reason"]))
        f["delegation"] = to

    for uid, fix in corrections["names"].items():
        if uid.startswith("$"):
            continue
        report["corrections"].append(dict(type="name_override", id=uid, **{k: v for k, v in fix.items() if k.startswith("name_")}, reason=fix.get("reason", "")))
    for gap in corrections.get("known_gaps", {}).get("items", []):
        report["warnings"].append(f"imada {gap['name_ar']} (delegation-{gap['delegation_code']}) is not mapped as a separate sector in OSM; its area is part of sector {gap['inside']}")

    # Sector codes whose delegation prefix differs from the final delegation (e.g. codes kept from before a split).
    del_code = {d["id"]: d["code"] for d in dels}
    del_code.update({did: nd["code"] for did, nd in new_dels.items()})
    for f in features:
        s = sec_by_id[f["sector"]]
        if s["code"] and del_code.get(f["delegation"]) and not s["code"].startswith(del_code[f["delegation"]]):
            report["warnings"].append(f"{f['sector']} ({s['names']['name_fr']}) belongs to {f['delegation']}, but its INS code starts with {s['code'][:4]} (code from before a delegation split)")

    # Every delegation should be one contiguous area (islands aside).
    deleg_geoms = collections.defaultdict(list)
    for f in features:
        deleg_geoms[f["delegation"]].append(f["geom"])
    for did, gs in sorted(deleg_geoms.items()):
        parts = [p for p in shapely.get_parts(shapely.union_all(gs)) if area_km2(p) > 0.5]
        if len(parts) > 1:
            report["warnings"].append(f"{did} has {len(parts)} parts larger than 0.5 km² (islands or exclaves): " + ", ".join(f"{area_km2(p):.1f}" for p in parts))

    # ---------------------------------------------------------------- checks
    log("Checking topology ...")
    geoms = [f["geom"] for f in features]
    total = sum(area_km2(g) for g in geoms)
    union_area = area_km2(shapely.union_all(geoms))
    land_area = area_km2(land)
    tree = STRtree(geoms)
    overlap = 0.0
    for i, j in zip(*tree.query(geoms, predicate="intersects")):
        if i < j:
            inter = shapely.intersection(geoms[i], geoms[j])
            if inter.area > 0:
                overlap += area_km2(inter)
    checks = dict(sum_of_sector_areas_km2=round(total, 3), union_area_km2=round(union_area, 3), land_area_km2=round(land_area, 3),
                  overlap_km2=round(overlap, 6), uncovered_km2=round(land_area - union_area, 6))
    log("  " + json.dumps(checks))

    # ---------------------------------------------------------------- write
    src = out / "source"
    src.mkdir(parents=True, exist_ok=True)
    features.sort(key=lambda f: f["sector"])
    fc = dict(type="FeatureCollection", features=[])
    for f in features:
        gj = shapely.geometry.mapping(f["geom"])
        fc["features"].append(dict(type="Feature", properties=dict(sector=f["sector"], delegation=f["delegation"], governorate=f["governorate"]), geometry=gj))
    text = json.dumps(fc, ensure_ascii=False, separators=(",", ":"))
    text = re.sub(r"(-?\d+\.\d{7})\d+", r"\1", text)  # 7 decimals = OSM precision
    (src / "tunisia-sectors.geojson").write_text(text, encoding="utf-8")
    log(f"  wrote {src / 'tunisia-sectors.geojson'} ({len(text) / 1e6:.1f} MB, {len(features)} sectors)")

    used_secs = {f["sector"] for f in features}
    used_dels = {f["delegation"] for f in features}
    attrs = out / "attributes"
    ins = {r["ins_code"]: r for r in csv.DictReader(open(out / "reference" / "ins-delegations-2024.csv", encoding="utf-8"))}
    used_dels = {f["delegation"] for f in features}
    rows = []
    for d in dels:
        if d["id"] not in used_dels:
            continue
        n = {**d["names"], **corrections["names"].get(d["id"], {})}
        rows.append(dict(id=d["id"], ins_code=d["code"] or "", governorate=d["gov"], name_en=n["name_en"], name_fr=n["name_fr"], name_ar=n["name_ar"],
                         hasc=d["tags"].get("ref:tn:hasc_2", ""), wikidata=d["tags"].get("wikidata", ""), osm_relation=d["osm_id"], source="osm"))
    for did, nd in new_dels.items():
        rows.append(dict(id=did, ins_code=nd["code"], governorate=nd["governorate"], name_en=nd["name_en"], name_fr=nd["name_fr"], name_ar=nd["name_ar"],
                         hasc="", wikidata="", osm_relation="", source="rebuilt from imadas (ISIE)"))
    for r in rows:
        ref = ins.get(r["ins_code"])
        if ref is None:
            report["warnings"].append(f"{r['id']} ({r['name_fr']}) has no INS 2024 code match")
        r["name_fr_ins"] = ref["name_fr"] if ref else ""
        r["population_2014"] = ref["population_2014"] if ref else ""
        r["population_2024"] = ref["population_2024"] if ref else ""
    missing_ins = sorted(set(ins) - {r["ins_code"] for r in rows})
    for code in missing_ins:
        report["warnings"].append(f"INS 2024 delegation {code} ({ins[code]['name_fr']}) is not mapped")
    cols = ["id", "ins_code", "governorate", "name_en", "name_fr", "name_ar", "name_fr_ins", "population_2014", "population_2024", "hasc", "wikidata", "osm_relation", "source"]
    with open(attrs / "delegations.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, cols, lineterminator="\n")
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r["id"]))
    for unit in [d for d in dels if d["id"] in used_dels] + [s for s in secs if s["id"] in used_secs]:
        n = {**unit["names"], **corrections["names"].get(unit["id"], {})}
        if not n["name_ar"]:
            report["warnings"].append(f"{unit['id']} ({n['name_fr']}) has no Arabic name in OSM")
        if not n["name_fr"]:
            report["warnings"].append(f"{unit['id']} ({n['name_ar']}) has no Latin name in OSM")
    with open(attrs / "sectors.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["id", "ins_code", "delegation", "governorate", "name_en", "name_fr", "name_ar", "wikidata", "osm_relation"])
        fmap = {f["sector"]: f for f in features}
        for s in sorted(secs, key=lambda s: s["id"]):
            if s["id"] not in used_secs:
                continue
            n = {**s["names"], **corrections["names"].get(s["id"], {})}
            f = fmap[s["id"]]
            w.writerow([s["id"], s["code"] or "", f["delegation"], f["governorate"], n["name_en"], n["name_fr"], n["name_ar"],
                        s["tags"].get("wikidata", ""), s["osm_id"]])

    gov_area = collections.defaultdict(float)
    for f in features:
        gov_area[f["governorate"]] += area_km2(f["geom"])
    report.update(
        generated=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        source=dict(name="OpenStreetMap", license="ODbL-1.0", attribution="© OpenStreetMap contributors", **source_meta),
        counts=dict(governorates=len({f["governorate"] for f in features}), delegations=len(used_dels), sectors=len(used_secs)),
        topology=checks,
        gaps=dict(delegation_level_km2=round(stats["delegation_gap_km2"], 2), sector_level_km2=round(stats["sector_gap_km2"], 2),
                  delegation_level_components=stats["delegation_gap_components"], sector_level_components=stats["sector_gap_components"]),
        overlap_faces=dict(overlap_faces),
        governorate_area_km2={k: round(v, 2) for k, v in sorted(gov_area.items())},
        log=LOG,
    )
    (src / "extract-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"Done in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
