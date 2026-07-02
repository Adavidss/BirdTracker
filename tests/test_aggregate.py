from __future__ import annotations

from datetime import date

from pipeline.aggregate import WEEKS, Seasonality, aggregate, filter_min_days, week_of_year


def test_week_of_year_edges() -> None:
    cases = [
        (date(2026, 1, 1), 0),
        (date(2026, 1, 7), 0),
        (date(2026, 1, 8), 1),
        (date(2026, 1, 14), 1),
        (date(2026, 1, 15), 2),
        (date(2026, 1, 21), 2),
        (date(2026, 1, 22), 3),
        (date(2026, 1, 31), 3),  # long "week 4" absorbs days 22-31
        (date(2024, 2, 29), 7),  # leap day lands in February's week 4
        (date(2026, 7, 2), 24),
        (date(2026, 12, 22), 47),
        (date(2026, 12, 31), 47),
    ]
    for day, expected in cases:
        assert week_of_year(day) == expected, day


def test_aggregate_counts() -> None:
    days = {
        date(2026, 7, 1): {"carwre", "norcar"},
        date(2026, 7, 2): {"carwre"},
        date(2026, 1, 5): {"daejun"},
    }
    result = aggregate(days)
    july_week = week_of_year(date(2026, 7, 1))
    assert result.weeks_covered[july_week] == 2
    assert result.weeks_covered[0] == 1
    assert sum(result.weeks_covered) == 3
    assert result.species["carwre"][july_week] == 2
    assert result.species["norcar"][july_week] == 1
    assert result.species["daejun"][0] == 1
    assert len(result.species["carwre"]) == WEEKS
    assert result.first_date == date(2026, 1, 5)
    assert result.last_date == date(2026, 7, 2)


def test_aggregate_empty() -> None:
    result = aggregate({})
    assert result.weeks_covered == [0] * WEEKS
    assert result.species == {}
    assert result.first_date is None and result.last_date is None


def test_filter_min_days() -> None:
    days = {
        date(2026, 7, 1): {"common", "vagrant"},
        date(2026, 7, 2): {"common"},
    }
    filtered = filter_min_days(aggregate(days), min_days=2)
    assert "common" in filtered.species
    assert "vagrant" not in filtered.species
    assert isinstance(filtered, Seasonality)
