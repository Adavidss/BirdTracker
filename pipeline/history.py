"""Committed pipeline state: per-day region species lists and the taxonomy slice.

data/history/<REGION>/<YYYY-MM-DD>.json — one file per region per COMPLETE day.
Day files are write-once: if one exists it is never re-fetched, which is both the
idempotence rule and the eBird-restraint rule. Today (ET) is never written — a
partial day frozen by skip-if-exists would stay wrong forever.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .config import ROOT

EASTERN = ZoneInfo("America/New_York")

HISTORY_DIR = ROOT / "data" / "history"
TAXONOMY_SLICE = ROOT / "data" / "reference" / "taxonomy_slice.json"


def today_eastern() -> date:
    return datetime.now(EASTERN).date()


def day_path(region: str, day: date, base: Path | None = None) -> Path:
    return (base or HISTORY_DIR) / region / f"{day.isoformat()}.json"


def write_day(
    region: str,
    day: date,
    species: Iterable[str],
    base: Path | None = None,
    today: date | None = None,
) -> Path:
    today = today or today_eastern()
    if day >= today:
        raise ValueError(
            f"refusing to write history for {day}: only days before {today} (ET) are complete"
        )
    codes = sorted(set(species))
    path = day_path(region, day, base)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "date": day.isoformat(),
        "region": region,
        "species": codes,
        "n": len(codes),
        "fetched_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    path.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    return path


def load_all(regions: Iterable[str], base: Path | None = None) -> dict[date, set[str]]:
    """Union species across regions per day. A day is covered if ANY region has a file."""
    days: dict[date, set[str]] = {}
    root = base or HISTORY_DIR
    for region in regions:
        region_dir = root / region
        if not region_dir.is_dir():
            continue
        for path in region_dir.glob("*.json"):
            payload = json.loads(path.read_text())
            day = date.fromisoformat(payload["date"])
            days.setdefault(day, set()).update(payload["species"])
    return days


def missing_dates(
    region: str,
    window_days: int,
    base: Path | None = None,
    today: date | None = None,
) -> list[date]:
    """The complete days within the last `window_days` that have no file yet, oldest first."""
    today = today or today_eastern()
    candidates = (today - timedelta(days=offset) for offset in range(window_days, 0, -1))
    return [day for day in candidates if not day_path(region, day, base).exists()]


# --- taxonomy slice (data/reference/) ----------------------------------------
# Only species we have actually recorded — the ~4 MB full eBird taxonomy is
# never downloaded. Keys are speciesCodes; values are name/sort metadata.


def load_taxonomy_slice(path: Path | None = None) -> dict[str, dict[str, Any]]:
    path = path or TAXONOMY_SLICE
    if not path.exists():
        return {}
    payload = json.loads(path.read_text())
    species: dict[str, dict[str, Any]] = payload.get("species", {})
    return species


def save_taxonomy_slice(species: Mapping[str, Mapping[str, Any]], path: Path | None = None) -> None:
    path = path or TAXONOMY_SLICE
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "species": {code: dict(info) for code, info in sorted(species.items())},
    }
    # sort_keys keeps the committed file diff-stable as codes are added.
    path.write_text(json.dumps(payload, separators=(",", ":"), sort_keys=True) + "\n")
