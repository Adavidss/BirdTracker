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
                code = record.get("speciesCode")
                if code:
                    seen.add(code)
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
    else:
        counts["now"] = export.export_birds_now(
            now_records, days, cfg.recent_window_days, out, today
        )
        counts["notable"] = export.export_notable(notable_records, cfg.recent_window_days, out)
        counts["hotspots"] = export.export_hotspots(hotspot_records, out)

    counts["seasonality"] = export.export_seasonality(seasonality, slice_, cfg.regions, out)
    export.export_species(slice_, out)
    export.export_meta(cfg, days, counts, out)

    mode = "offline" if offline else "online"
    print(
        f"update ({mode}): now={counts['now']} notable={counts['notable']} "
        f"hotspots={counts['hotspots']} seasonality={counts['seasonality']} "
        f"history_days={len(days)} -> {out}"
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
