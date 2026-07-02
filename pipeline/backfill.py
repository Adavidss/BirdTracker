"""History loader: fetch daily region species lists for a date range, throttled.

    python -m pipeline.backfill --start 2024-07-01 --end 2026-07-01 [--sleep 1.5]

Resumable by design: existing day files are skipped, so rerunning after a crash,
or splitting a large range into chunks, never re-fetches a day (eBird restraint).
Does not export — the nightly update (or `python -m pipeline.update --offline`)
re-aggregates from the committed history.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

import httpx

from . import history
from .config import Config, load_config, require_key
from .ebird import EBirdClient


def run(
    cfg: Config,
    start: date,
    end: date,
    *,
    sleep_seconds: float = 1.5,
    regions: tuple[str, ...] | None = None,
    history_base: Path | None = None,
) -> tuple[int, int, int]:
    """Returns (fetched, skipped, failed)."""
    regions = regions or cfg.regions
    today = history.today_eastern()
    if start > end:
        raise SystemExit(f"--start {start} is after --end {end}")
    if end >= today:
        raise SystemExit(
            f"--end must be before {today} (ET): only complete days are recorded"
        )

    total = ((end - start).days + 1) * len(regions)
    fetched = skipped = failed = 0
    print(f"backfill: {start}..{end} x {list(regions)} = {total} day-files max")

    with EBirdClient(require_key(cfg), throttle_seconds=sleep_seconds) as client:
        day = start
        while day <= end:
            for region in regions:
                if history.day_path(region, day, history_base).exists():
                    skipped += 1
                    continue
                try:
                    species = client.historic_species(region, day)
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code in (401, 403):
                        raise SystemExit(
                            "eBird rejected the API key (HTTP "
                            f"{exc.response.status_code}) — check EBIRD_API_KEY."
                        ) from exc
                    failed += 1
                    print(f"  FAIL {region} {day}: {exc}", file=sys.stderr)
                    continue
                except httpx.HTTPError as exc:
                    failed += 1
                    print(f"  FAIL {region} {day}: {exc}", file=sys.stderr)
                    continue
                history.write_day(region, day, species, base=history_base, today=today)
                fetched += 1
                if fetched % 50 == 0:
                    print(f"  ...{fetched} fetched, {skipped} skipped, {failed} failed")
            day += timedelta(days=1)

    print(f"backfill done: {fetched} fetched, {skipped} skipped, {failed} failed")
    if failed:
        print("rerun the same command to retry the failed days (existing files are skipped)")
    print("rebuild site JSON with: python -m pipeline.update --offline  (or the nightly run)")
    return fetched, skipped, failed


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, type=date.fromisoformat, metavar="YYYY-MM-DD")
    parser.add_argument("--end", required=True, type=date.fromisoformat, metavar="YYYY-MM-DD")
    parser.add_argument("--sleep", type=float, default=1.5, help="seconds between API calls")
    parser.add_argument(
        "--regions", default=None, help="comma-separated region codes (default: config.json)"
    )
    args = parser.parse_args(argv)
    regions = (
        tuple(r.strip() for r in args.regions.split(",") if r.strip()) if args.regions else None
    )
    run(load_config(), args.start, args.end, sleep_seconds=args.sleep, regions=regions)


if __name__ == "__main__":
    main()
