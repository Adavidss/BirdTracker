"""Build the six JSON files the frontend reads (frontend/public/data/).

The schemas here are the frontend contract — frontend/lib/types.ts mirrors them.
Weekly numbers ship as integer counts (frontend divides): lossless, smaller, and
the sample size doubles as the low-confidence signal. eBird observation datetimes
("YYYY-MM-DD HH:MM", zone-less local time) pass through VERBATIM — the frontend
string-formats them and must never Date-parse them.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from collections.abc import Set as AbstractSet
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from .aggregate import Seasonality
from .config import ROOT, Config

DATA_OUT = ROOT / "frontend" / "public" / "data"

# Ubiquity window for the Now page's "reported N of last 14 days" signal.
REPORTED_WINDOW_DAYS = 14


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _write(out_dir: Path, name: str, payload: Any) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    (out_dir / name).write_text(text + "\n")


def _days_reported(
    code: str, days: Mapping[date, AbstractSet[str]], window: int, today: date
) -> int:
    recent = (today - timedelta(days=offset) for offset in range(1, window + 1))
    return sum(1 for day in recent if code in days.get(day, frozenset()))


def export_birds_now(
    records: list[dict[str, Any]],
    days: Mapping[date, AbstractSet[str]],
    window_days: int,
    out_dir: Path,
    today: date,
) -> int:
    species = []
    for r in records:
        code = r.get("speciesCode")
        if not code:
            continue
        species.append(
            {
                "code": code,
                "com_name": r.get("comName", code),
                "sci_name": r.get("sciName", ""),
                "last_seen": r.get("obsDt", ""),
                "last_loc_name": r.get("locName", ""),
                "last_loc_id": r.get("locId", ""),
                "how_many": r.get("howMany"),
                "days_reported_14": _days_reported(code, days, REPORTED_WINDOW_DAYS, today),
                "obs_valid": bool(r.get("obsValid", True)),
            }
        )
    # "YYYY-MM-DD HH:MM" sorts correctly as a string.
    species.sort(key=lambda s: str(s["last_seen"]), reverse=True)
    payload = {"generated_at": _now_iso(), "window_days": window_days, "species": species}
    _write(out_dir, "birds-now.json", payload)
    return len(species)


def export_seasonality(
    seasonality: Seasonality,
    slice_: Mapping[str, Mapping[str, Any]],
    regions: Iterable[str],
    out_dir: Path,
) -> int:
    def is_species(code: str) -> bool:
        info = slice_.get(code)
        # Unknown codes stay (not yet in the slice ≠ junk); known non-species drop.
        return info is None or info.get("category", "species") == "species"

    def sort_key(code: str) -> tuple[float, str]:
        info = slice_.get(code)
        order = float(info["taxon_order"]) if info and "taxon_order" in info else float("inf")
        return (order, code)

    items = [
        {"code": code, "weeks": weeks, "total_days": sum(weeks)}
        for code, weeks in seasonality.species.items()
        if is_species(code)
    ]
    items.sort(key=lambda item: sort_key(str(item["code"])))
    payload = {
        "generated_at": _now_iso(),
        "regions": list(regions),
        "first_date": seasonality.first_date.isoformat() if seasonality.first_date else None,
        "last_date": seasonality.last_date.isoformat() if seasonality.last_date else None,
        "weeks_covered": seasonality.weeks_covered,
        "species": items,
    }
    _write(out_dir, "seasonality.json", payload)
    return len(items)


def export_notable(records: list[dict[str, Any]], window_days: int, out_dir: Path) -> int:
    sightings = []
    for r in records:
        code = r.get("speciesCode")
        if not code:
            continue
        sightings.append(
            {
                "code": code,
                "com_name": r.get("comName", code),
                "sci_name": r.get("sciName", ""),
                "obs_date": r.get("obsDt", ""),
                "loc_id": r.get("locId", ""),
                "loc_name": r.get("locName", ""),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "how_many": r.get("howMany"),
                "obs_valid": bool(r.get("obsValid", False)),
                "obs_reviewed": bool(r.get("obsReviewed", False)),
                "location_private": bool(r.get("locationPrivate", False)),
                "checklist_id": r.get("subId", ""),
            }
        )
    sightings.sort(key=lambda s: str(s["obs_date"]), reverse=True)
    payload = {"generated_at": _now_iso(), "window_days": window_days, "sightings": sightings}
    _write(out_dir, "notable.json", payload)
    return len(sightings)


def export_hotspots(records: list[dict[str, Any]], out_dir: Path) -> int:
    hotspots = [
        {
            "loc_id": r.get("locId", ""),
            "name": r.get("locName", ""),
            "lat": r.get("lat"),
            "lng": r.get("lng"),
            "latest_obs": r.get("latestObsDt", ""),
            "num_species_all_time": r.get("numSpeciesAllTime", 0),
        }
        for r in records
        if r.get("locId")
    ]
    # Most recently active first (blank latest_obs sorts last), busiest as tiebreak.
    hotspots.sort(key=lambda h: int(h["num_species_all_time"] or 0), reverse=True)
    hotspots.sort(key=lambda h: str(h["latest_obs"]), reverse=True)
    payload = {"generated_at": _now_iso(), "hotspots": hotspots}
    _write(out_dir, "hotspots.json", payload)
    return len(hotspots)


def export_species(slice_: Mapping[str, Mapping[str, Any]], out_dir: Path) -> int:
    species = {
        code: {
            "com_name": info.get("com_name", code),
            "sci_name": info.get("sci_name", ""),
            "family": info.get("family", ""),
            "order": info.get("order", ""),
            "taxon_order": info.get("taxon_order", 0),
        }
        for code, info in sorted(slice_.items())
        if info.get("category", "species") == "species"
    }
    _write(out_dir, "species.json", {"generated_at": _now_iso(), "species": species})
    return len(species)


def export_meta(
    cfg: Config,
    days: Mapping[date, AbstractSet[str]],
    counts: Mapping[str, int],
    out_dir: Path,
) -> None:
    ordered = sorted(days)
    payload = {
        "last_updated": _now_iso(),
        "center": {"lat": cfg.center_lat, "lng": cfg.center_lng},
        "radius_km": cfg.radius_km,
        "regions": list(cfg.regions),
        "history": {
            "first_date": ordered[0].isoformat() if ordered else None,
            "last_date": ordered[-1].isoformat() if ordered else None,
            "days_covered": len(ordered),
        },
        "counts": dict(counts),
    }
    _write(out_dir, "meta.json", payload)


def count_existing(out_dir: Path, name: str, key: str) -> int:
    """Length of a list field in an already-exported file (offline meta counts)."""
    path = out_dir / name
    if not path.exists():
        return 0
    try:
        payload = json.loads(path.read_text())
    except json.JSONDecodeError:
        return 0
    value = payload.get(key)
    return len(value) if isinstance(value, list) else 0
