"""Daily job: fetch the radius snapshots and any missing history days, refresh the
taxonomy slice, aggregate, and export the six frontend JSON files.

    python -m pipeline.update              # full run (needs EBIRD_API_KEY)
    python -m pipeline.update --offline    # no network: rebuild seasonality/species/meta
                                           # from committed state; leave the radius files
                                           # (birds-now/notable/hotspots) untouched

Steady state this makes ~5-6 API calls: 3 radius snapshots, 1 historic day per
region, and usually zero taxonomy calls.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from . import export, history
from .aggregate import aggregate, filter_min_days
from .config import Config, load_config, require_key
from .ebird import EBirdClient

# Safety cap on per-species map fetches (one API call each per day).
MAX_MAP_SPECIES = 250


def run(
    cfg: Config,
    *,
    offline: bool = False,
    out_dir: Path | None = None,
    history_base: Path | None = None,
    slice_path: Path | None = None,
) -> dict[str, int]:
    out = out_dir or export.DATA_OUT
    today = history.today_eastern()
    counts: dict[str, int] = {}

    now_records: list[dict[str, Any]] = []
    notable_records: list[dict[str, Any]] = []
    hotspot_records: list[dict[str, Any]] = []
    sightings_by_code: dict[str, list[dict[str, Any]]] = {}

    if not offline:
        with EBirdClient(require_key(cfg)) as client:
            now_records = client.recent_observations(
                cfg.center_lat, cfg.center_lng, cfg.radius_km, cfg.recent_window_days
            )
            notable_records = client.notable_observations(
                cfg.center_lat, cfg.center_lng, cfg.radius_km, cfg.recent_window_days
            )
            hotspot_records = client.nearby_hotspots(
                cfg.center_lat, cfg.center_lng, cfg.radius_km, cfg.recent_window_days
            )

            # Per-species report locations for the map. One call per species
            # currently around (~120/day, throttled) — the recent feed above is
            # deduped to one record per species, so it can't drive a map filter.
            map_codes = sorted(
                {str(r["speciesCode"]) for r in now_records if r.get("speciesCode")}
            )[:MAX_MAP_SPECIES]
            print(f"sightings: fetching report locations for {len(map_codes)} species")
            for code in map_codes:
                sightings_by_code[code] = client.species_recent_observations(
                    code, cfg.center_lat, cfg.center_lng, cfg.radius_km,
                    cfg.recent_window_days,
                )

            fetched_days = 0
            for region in cfg.regions:
                for day in history.missing_dates(
                    region, cfg.catchup_days, base=history_base, today=today
                ):
                    species = client.historic_species(region, day)
                    history.write_day(region, day, species, base=history_base, today=today)
                    fetched_days += 1
            print(f"history: fetched {fetched_days} missing day(s)")

            days = history.load_all(cfg.regions, base=history_base)
            slice_ = history.load_taxonomy_slice(slice_path)
            seen: set[str] = set()
            for day_codes in days.values():
                seen.update(day_codes)
            for record in [*now_records, *notable_records]:
                rec_code = record.get("speciesCode")
                if rec_code:
                    seen.add(rec_code)
            unknown = sorted(seen - set(slice_))
            if unknown:
                print(f"taxonomy: fetching {len(unknown)} new code(s)")
                slice_.update(client.taxonomy(unknown))
                history.save_taxonomy_slice(slice_, slice_path)
    else:
        days = history.load_all(cfg.regions, base=history_base)
        slice_ = history.load_taxonomy_slice(slice_path)

    seasonality = filter_min_days(aggregate(days), cfg.min_seasonality_days)

    if offline:
        counts["now"] = export.count_existing(out, "birds-now.json", "species")
        counts["notable"] = export.count_existing(out, "notable.json", "sightings")
        counts["hotspots"] = export.count_existing(out, "hotspots.json", "hotspots")
        counts["sightings"] = export.count_existing_sightings(out)
    else:
        counts["now"] = export.export_birds_now(
            now_records, days, cfg.recent_window_days, out, today
        )
        counts["notable"] = export.export_notable(notable_records, cfg.recent_window_days, out)
        counts["hotspots"] = export.export_hotspots(hotspot_records, out)
        counts["sightings"] = export.export_sightings(
            sightings_by_code, cfg.recent_window_days, out
        )

    counts["seasonality"] = export.export_seasonality(seasonality, slice_, cfg.regions, out)
    export.export_species(slice_, out)
    export.export_meta(cfg, days, counts, out)

    mode = "offline" if offline else "online"
    print(
        f"update ({mode}): now={counts['now']} notable={counts['notable']} "
        f"hotspots={counts['hotspots']} sightings={counts['sightings']} "
        f"seasonality={counts['seasonality']} history_days={len(days)} -> {out}"
    )
    return counts


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="no network; rebuild from state")
    parser.add_argument(
        "--out", type=Path, default=None, help="output dir (default frontend/public/data)"
    )
    args = parser.parse_args(argv)
    run(load_config(), offline=args.offline, out_dir=args.out)


if __name__ == "__main__":
    main()
