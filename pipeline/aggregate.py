"""Pure seasonal aggregation over eBird's 48-week calendar.

Week convention (matches eBird bar charts): every month has exactly 4 pseudo-weeks
— days 1-7, 8-14, 15-21, 22-end — so a year is always 48 weeks and the week index
maps directly onto a month axis with no ISO week-53 edge cases.
Mirrored in frontend/lib/season.ts — keep the two in sync.
"""

from __future__ import annotations

from collections.abc import Mapping
from collections.abc import Set as AbstractSet
from dataclasses import dataclass
from datetime import date

WEEKS = 48


def week_of_year(day: date) -> int:
    """0..47."""
    return (day.month - 1) * 4 + min(3, (day.day - 1) // 7)


@dataclass(frozen=True)
class Seasonality:
    weeks_covered: list[int]  # 48 ints: covered days per week, summed across years
    species: dict[str, list[int]]  # code -> 48 ints: days the species was reported
    first_date: date | None
    last_date: date | None


def aggregate(days: Mapping[date, AbstractSet[str]]) -> Seasonality:
    """Fold per-day species sets into weekly counts. Frequency = species/covered,
    computed by the frontend so the sample size ships alongside the signal."""
    weeks_covered = [0] * WEEKS
    species: dict[str, list[int]] = {}
    for day, codes in days.items():
        week = week_of_year(day)
        weeks_covered[week] += 1
        for code in codes:
            row = species.get(code)
            if row is None:
                row = species[code] = [0] * WEEKS
            row[week] += 1
    ordered = sorted(days)
    return Seasonality(
        weeks_covered=weeks_covered,
        species=species,
        first_date=ordered[0] if ordered else None,
        last_date=ordered[-1] if ordered else None,
    )


def filter_min_days(seasonality: Seasonality, min_days: int) -> Seasonality:
    """Drop one-off vagrants (they belong on the Rare page, not the Timing charts)."""
    kept = {code: weeks for code, weeks in seasonality.species.items() if sum(weeks) >= min_days}
    return Seasonality(
        weeks_covered=seasonality.weeks_covered,
        species=kept,
        first_date=seasonality.first_date,
        last_date=seasonality.last_date,
    )
