"""Shared fixture payloads shaped like real eBird API responses (no network anywhere)."""

from __future__ import annotations

from typing import Any

import pytest


@pytest.fixture
def recent_records() -> list[dict[str, Any]]:
    return [
        {
            "speciesCode": "carwre",
            "comName": "Carolina Wren",
            "sciName": "Thryothorus ludovicianus",
            "locId": "L123456",
            "locName": "Lake Artemesia",
            "obsDt": "2026-07-01 09:15",
            "howMany": 3,
            "lat": 38.978,
            "lng": -76.927,
            "obsValid": True,
            "obsReviewed": False,
            "locationPrivate": False,
            "subId": "S111111111",
        },
        {
            "speciesCode": "osprey",
            "comName": "Osprey",
            "sciName": "Pandion haliaetus",
            "locId": "L222",
            "locName": "Bladensburg Waterfront Park",
            "obsDt": "2026-07-01 06:05",
            "howMany": 1,
            "lat": 38.93,
            "lng": -76.93,
            "obsValid": True,
            "obsReviewed": False,
            "locationPrivate": False,
            "subId": "S222222222",
        },
        {
            # howMany intentionally absent (eBird omits it for "X" counts)
            "speciesCode": "norcar",
            "comName": "Northern Cardinal",
            "sciName": "Cardinalis cardinalis",
            "locId": "L333",
            "locName": "Rock Creek Park",
            "obsDt": "2026-06-30 17:40",
            "lat": 38.97,
            "lng": -77.05,
            "obsValid": True,
            "obsReviewed": False,
            "locationPrivate": False,
            "subId": "S333333333",
        },
    ]


@pytest.fixture
def notable_records() -> list[dict[str, Any]]:
    # Two reports of the SAME rarity at different spots — both must survive export.
    return [
        {
            "speciesCode": "kirwar",
            "comName": "Kirtland's Warbler",
            "sciName": "Setophaga kirtlandii",
            "locId": "L987",
            "locName": "Rock Creek Park",
            "obsDt": "2026-06-28 07:15",
            "howMany": 1,
            "lat": 38.97,
            "lng": -77.05,
            "obsValid": False,
            "obsReviewed": False,
            "locationPrivate": False,
            "subId": "S444444444",
        },
        {
            "speciesCode": "kirwar",
            "comName": "Kirtland's Warbler",
            "sciName": "Setophaga kirtlandii",
            "locId": "L654",
            "locName": "Kenilworth Aquatic Gardens",
            "obsDt": "2026-06-29 08:02",
            "howMany": 1,
            "lat": 38.912,
            "lng": -76.94,
            "obsValid": True,
            "obsReviewed": True,
            "locationPrivate": False,
            "subId": "S555555555",
        },
    ]


@pytest.fixture
def hotspot_records() -> list[dict[str, Any]]:
    return [
        {
            "locId": "L777",
            "locName": "Quiet Marsh",  # busier but stale — must sort AFTER the active one
            "countryCode": "US",
            "lat": 38.95,
            "lng": -76.9,
            "numSpeciesAllTime": 300,
        },
        {
            "locId": "L123456",
            "locName": "Lake Artemesia",
            "countryCode": "US",
            "lat": 38.978,
            "lng": -76.927,
            "latestObsDt": "2026-07-01 09:12",
            "numSpeciesAllTime": 214,
        },
    ]


@pytest.fixture
def taxonomy_records() -> list[dict[str, Any]]:
    return [
        {
            "sciName": "Thryothorus ludovicianus",
            "comName": "Carolina Wren",
            "speciesCode": "carwre",
            "category": "species",
            "taxonOrder": 21789.0,
            "order": "Passeriformes",
            "familyComName": "Wrens",
        },
        {
            "sciName": "Cardinalis cardinalis",
            "comName": "Northern Cardinal",
            "speciesCode": "norcar",
            "category": "species",
            "taxonOrder": 30246.0,
            "order": "Passeriformes",
            "familyComName": "Cardinals and Allies",
        },
    ]
