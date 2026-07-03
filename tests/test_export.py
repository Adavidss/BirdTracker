from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from pipeline import export, history, update
from pipeline.aggregate import WEEKS, aggregate
from pipeline.config import Config

TODAY = date(2026, 7, 2)

DAYS = {
    date(2026, 7, 1): {"carwre", "norcar"},
    date(2026, 6, 30): {"carwre"},
}


def read(out: Path, name: str) -> dict[str, Any]:
    payload: dict[str, Any] = json.loads((out / name).read_text())
    return payload


def test_birds_now_schema_and_sort(
    tmp_path: Path, recent_records: list[dict[str, Any]]
) -> None:
    count = export.export_birds_now(recent_records, DAYS, 14, tmp_path, TODAY)
    assert count == 3
    payload = read(tmp_path, "birds-now.json")
    assert payload["window_days"] == 14
    assert payload["generated_at"]
    first = payload["species"][0]
    assert set(first) == {
        "code", "com_name", "sci_name", "last_seen", "last_loc_name",
        "last_loc_id", "how_many", "days_reported_14", "obs_valid",
    }
    # Newest first: carwre 09:15 > osprey 06:05 > norcar (Jun 30).
    assert [s["code"] for s in payload["species"]] == ["carwre", "osprey", "norcar"]
    by_code = {s["code"]: s for s in payload["species"]}
    assert by_code["carwre"]["days_reported_14"] == 2
    assert by_code["norcar"]["days_reported_14"] == 1
    assert by_code["osprey"]["days_reported_14"] == 0
    assert by_code["norcar"]["how_many"] is None  # absent howMany -> null
    assert by_code["carwre"]["last_seen"] == "2026-07-01 09:15"  # verbatim eBird string


def test_notable_keeps_every_report(
    tmp_path: Path, notable_records: list[dict[str, Any]]
) -> None:
    count = export.export_notable(notable_records, 14, tmp_path)
    assert count == 2  # same species, two reports — both kept
    payload = read(tmp_path, "notable.json")
    first = payload["sightings"][0]
    assert set(first) == {
        "code", "com_name", "sci_name", "obs_date", "loc_id", "loc_name", "lat", "lng",
        "how_many", "obs_valid", "obs_reviewed", "location_private", "checklist_id",
    }
    assert first["obs_date"] == "2026-06-29 08:02"  # newest first
    assert first["checklist_id"] == "S555555555"
    assert payload["sightings"][1]["obs_valid"] is False


def test_hotspots_active_first(tmp_path: Path, hotspot_records: list[dict[str, Any]]) -> None:
    export.export_hotspots(hotspot_records, tmp_path)
    payload = read(tmp_path, "hotspots.json")
    # Lake Artemesia has a latest_obs; the busier-but-stale marsh sorts after it.
    assert [h["loc_id"] for h in payload["hotspots"]] == ["L123456", "L777"]
    first = payload["hotspots"][0]
    assert set(first) == {"loc_id", "name", "lat", "lng", "latest_obs", "num_species_all_time"}
    assert payload["hotspots"][1]["latest_obs"] == ""


def test_sightings_schema_cap_and_coords(tmp_path: Path) -> None:
    per_species = {
        "woothr": [
            {
                "speciesCode": "woothr", "lat": 38.96, "lng": -77.04,
                "locId": "L1", "locName": "Rock Creek Park",
                "obsDt": "2026-06-30 07:10", "howMany": 2, "subId": "S1",
            },
            {
                "speciesCode": "woothr", "lat": 38.98, "lng": -76.93,
                "locId": "L2", "locName": "Lake Artemesia",
                "obsDt": "2026-07-01 09:15", "subId": "S2",  # no howMany
            },
            {"speciesCode": "woothr", "locId": "L3", "obsDt": "2026-07-01 10:00"},  # no coords
        ],
        "nocoords": [{"speciesCode": "nocoords", "obsDt": "2026-07-01 08:00"}],
        "manypts": [
            {"speciesCode": "manypts", "lat": 38.9, "lng": -76.9,
             "obsDt": f"2026-06-{10 + i // 10:02d} {i % 10:02d}:00", "subId": f"S{i}"}
            for i in range(80)
        ],
    }
    total = export.export_sightings(per_species, 14, tmp_path)
    payload = read(tmp_path, "sightings.json")
    assert payload["window_days"] == 14
    woothr = payload["species"]["woothr"]
    assert len(woothr) == 2  # coordinate-less record dropped
    assert woothr[0]["obs_dt"] == "2026-07-01 09:15"  # newest first
    assert woothr[0]["how_many"] is None
    assert set(woothr[0]) == {
        "lat", "lng", "loc_id", "loc_name", "obs_dt", "how_many", "checklist_id",
    }
    assert "nocoords" not in payload["species"]  # nothing located -> omitted
    assert len(payload["species"]["manypts"]) == export.MAX_SIGHTINGS_PER_SPECIES
    assert total == 2 + export.MAX_SIGHTINGS_PER_SPECIES
    assert export.count_existing_sightings(tmp_path) == total


SLICE = {
    "carwre": {
        "com_name": "Carolina Wren", "sci_name": "Thryothorus ludovicianus",
        "family": "Wrens", "order": "Passeriformes",
        "taxon_order": 21789.0, "category": "species",
    },
    "norcar": {
        "com_name": "Northern Cardinal", "sci_name": "Cardinalis cardinalis",
        "family": "Cardinals and Allies", "order": "Passeriformes",
        "taxon_order": 30246.0, "category": "species",
    },
    "x-slash": {
        "com_name": "Some/Slash", "sci_name": "", "family": "", "order": "",
        "taxon_order": 1.0, "category": "slash",
    },
}


def test_seasonality_sorts_and_filters(tmp_path: Path) -> None:
    days = {
        date(2026, 7, 1): {"norcar", "carwre", "x-slash", "unknwn1"},
        date(2026, 6, 30): {"norcar"},
    }
    export.export_seasonality(aggregate(days), SLICE, ["US-DC"], tmp_path)
    payload = read(tmp_path, "seasonality.json")
    assert len(payload["weeks_covered"]) == WEEKS
    codes = [s["code"] for s in payload["species"]]
    assert "x-slash" not in codes  # known non-species dropped
    assert "unknwn1" in codes  # unknown code kept (slice just hasn't seen it yet)
    assert codes.index("carwre") < codes.index("norcar")  # taxon_order sort
    row = next(s for s in payload["species"] if s["code"] == "norcar")
    assert len(row["weeks"]) == WEEKS
    assert row["total_days"] == 2
    assert payload["first_date"] == "2026-06-30"
    assert payload["last_date"] == "2026-07-01"


def test_species_export_drops_category(tmp_path: Path) -> None:
    export.export_species(SLICE, tmp_path)
    payload = read(tmp_path, "species.json")
    assert set(payload["species"]) == {"carwre", "norcar"}  # slash dropped
    info = payload["species"]["carwre"]
    assert set(info) == {"com_name", "sci_name", "family", "order", "taxon_order"}


def make_config(**overrides: Any) -> Config:
    base: dict[str, Any] = {
        "center_lat": 38.99, "center_lng": -76.94, "radius_km": 25,
        "regions": ("US-DC", "US-MD-033"), "recent_window_days": 14,
        "catchup_days": 8, "min_seasonality_days": 1, "api_key": None,
    }
    base.update(overrides)
    return Config(**base)


def test_meta(tmp_path: Path) -> None:
    export.export_meta(make_config(), DAYS, {"now": 3, "seasonality": 2}, tmp_path)
    payload = read(tmp_path, "meta.json")
    assert payload["center"] == {"lat": 38.99, "lng": -76.94}
    assert payload["radius_km"] == 25
    assert payload["history"] == {
        "first_date": "2026-06-30", "last_date": "2026-07-01", "days_covered": 2,
    }
    assert payload["counts"]["now"] == 3


def test_update_offline_leaves_radius_files_untouched(tmp_path: Path) -> None:
    history_base = tmp_path / "history"
    slice_path = tmp_path / "slice.json"
    out = tmp_path / "out"
    out.mkdir()

    today = history.today_eastern()
    history.write_day("US-DC", today - timedelta(days=1), ["carwre", "norcar"], history_base)
    history.write_day("US-DC", today - timedelta(days=2), ["carwre"], history_base)
    history.save_taxonomy_slice(
        {k: v for k, v in SLICE.items() if v["category"] == "species"}, slice_path
    )

    sentinel = '{"species":[1,2]}'
    (out / "birds-now.json").write_text(sentinel)

    counts = update.run(
        make_config(), offline=True, out_dir=out,
        history_base=history_base, slice_path=slice_path,
    )

    assert (out / "birds-now.json").read_text() == sentinel  # untouched
    assert counts["now"] == 2  # counted from the existing file
    assert counts["seasonality"] == 2
    seasonality = read(out, "seasonality.json")
    assert {s["code"] for s in seasonality["species"]} == {"carwre", "norcar"}
    assert read(out, "species.json")["species"]
    assert read(out, "meta.json")["history"]["days_covered"] == 2
