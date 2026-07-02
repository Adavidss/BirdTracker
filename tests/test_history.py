from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from pipeline import history

TODAY = date(2026, 7, 10)  # fixed "today (ET)" so tests are deterministic


def test_write_and_load_roundtrip(tmp_path: Path) -> None:
    day = TODAY - timedelta(days=1)
    path = history.write_day("US-DC", day, ["norcar", "carwre", "norcar"], tmp_path, TODAY)
    payload = json.loads(path.read_text())
    assert payload["species"] == ["carwre", "norcar"]  # deduped + sorted
    assert payload["n"] == 2
    assert payload["region"] == "US-DC"
    assert payload["date"] == day.isoformat()

    days = history.load_all(["US-DC"], tmp_path)
    assert days == {day: {"carwre", "norcar"}}


def test_union_across_regions(tmp_path: Path) -> None:
    day = TODAY - timedelta(days=1)
    history.write_day("US-DC", day, ["carwre"], tmp_path, TODAY)
    history.write_day("US-MD-033", day, ["osprey"], tmp_path, TODAY)
    days = history.load_all(["US-DC", "US-MD-033"], tmp_path)
    assert days == {day: {"carwre", "osprey"}}
    # A region with no directory yet is fine.
    assert history.load_all(["US-VA"], tmp_path) == {}


def test_refuses_incomplete_days(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="complete"):
        history.write_day("US-DC", TODAY, ["carwre"], tmp_path, TODAY)
    with pytest.raises(ValueError, match="complete"):
        history.write_day("US-DC", TODAY + timedelta(days=1), ["carwre"], tmp_path, TODAY)


def test_missing_dates(tmp_path: Path) -> None:
    history.write_day("US-DC", date(2026, 7, 6), ["a"], tmp_path, TODAY)
    history.write_day("US-DC", date(2026, 7, 8), ["a"], tmp_path, TODAY)
    missing = history.missing_dates("US-DC", 5, tmp_path, TODAY)
    assert missing == [date(2026, 7, 5), date(2026, 7, 7), date(2026, 7, 9)]  # oldest first
    # Nothing written for another region -> the whole window is missing.
    assert len(history.missing_dates("US-MD-033", 5, tmp_path, TODAY)) == 5


def test_taxonomy_slice_roundtrip(tmp_path: Path) -> None:
    path = tmp_path / "taxonomy_slice.json"
    assert history.load_taxonomy_slice(path) == {}
    species = {
        "norcar": {"com_name": "Northern Cardinal", "taxon_order": 30246.0},
        "carwre": {"com_name": "Carolina Wren", "taxon_order": 21789.0},
    }
    history.save_taxonomy_slice(species, path)
    loaded = history.load_taxonomy_slice(path)
    assert loaded == species
    assert list(loaded) == ["carwre", "norcar"]  # stored sorted for stable diffs
