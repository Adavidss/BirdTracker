"""Thin eBird API 2.0 client: throttled, retrying, typed helpers.

eBird asks users to fetch with restraint, so every call waits out a minimum
interval, 429s honor Retry-After, and 5xx get exponential backoff. The sleep and
clock are injectable for tests. Docs: https://documenter.getpostman.com/view/664302/S1ENwy59
"""

from __future__ import annotations

import time
from collections.abc import Callable, Iterable
from datetime import date
from types import TracebackType
from typing import Any

import httpx

BASE_URL = "https://api.ebird.org/v2"
RETRIES = 3  # extra attempts after the first
BACKOFF_SECONDS = 2.0  # base for exponential backoff
TAXONOMY_CHUNK = 150  # species codes per taxonomy request (keeps URLs short)


class EBirdClient:
    def __init__(
        self,
        api_key: str,
        *,
        throttle_seconds: float = 1.0,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._throttle = throttle_seconds
        self._sleep = sleep
        self._clock = clock
        self._last_call: float | None = None
        self._client = httpx.Client(
            base_url=BASE_URL,
            headers={
                "X-eBirdApiToken": api_key,
                "User-Agent": "BirdTracker (personal project)",
            },
            timeout=30.0,
            transport=transport,
        )

    def __enter__(self) -> EBirdClient:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _wait_turn(self) -> None:
        now = self._clock()
        if self._last_call is not None:
            remaining = self._throttle - (now - self._last_call)
            if remaining > 0:
                self._sleep(remaining)
        self._last_call = self._clock()

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        for attempt in range(RETRIES + 1):
            self._wait_turn()
            response = self._client.get(path, params=params)
            if response.status_code == 429 and attempt < RETRIES:
                retry_after = response.headers.get("Retry-After")
                self._sleep(
                    float(retry_after) if retry_after else BACKOFF_SECONDS * 2**attempt
                )
                continue
            if response.status_code >= 500 and attempt < RETRIES:
                self._sleep(BACKOFF_SECONDS * 2**attempt)
                continue
            response.raise_for_status()
            return response.json()
        raise AssertionError("unreachable: loop always returns or raises")

    # --- endpoints ------------------------------------------------------------

    def recent_observations(
        self, lat: float, lng: float, dist_km: int, back_days: int
    ) -> list[dict[str, Any]]:
        """Most recent record per species within the radius (eBird dedups per species)."""
        result: list[dict[str, Any]] = self._get(
            "/data/obs/geo/recent",
            {"lat": lat, "lng": lng, "dist": dist_km, "back": back_days},
        )
        return result

    def notable_observations(
        self, lat: float, lng: float, dist_km: int, back_days: int
    ) -> list[dict[str, Any]]:
        """Rare/notable reports within the radius — NOT deduped; every report comes through."""
        result: list[dict[str, Any]] = self._get(
            "/data/obs/geo/recent/notable",
            {"lat": lat, "lng": lng, "dist": dist_km, "back": back_days, "detail": "simple"},
        )
        return result

    def species_recent_observations(
        self, code: str, lat: float, lng: float, dist_km: int, back_days: int
    ) -> list[dict[str, Any]]:
        """Every recent report of ONE species within the radius (not deduped) — the
        per-species map data. One call per current species keeps daily usage modest."""
        result: list[dict[str, Any]] = self._get(
            f"/data/obs/geo/recent/{code}",
            {"lat": lat, "lng": lng, "dist": dist_km, "back": back_days},
        )
        return result

    def nearby_hotspots(
        self, lat: float, lng: float, dist_km: int, back_days: int
    ) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = self._get(
            "/ref/hotspot/geo",
            {"lat": lat, "lng": lng, "dist": dist_km, "back": back_days, "fmt": "json"},
        )
        return result

    def historic_species(self, region: str, day: date) -> list[str]:
        """Sorted, deduped species codes reported in the region on that day."""
        records = self._get(
            f"/data/obs/{region}/historic/{day.year}/{day.month}/{day.day}",
            {"cat": "species"},
        )
        return sorted({r["speciesCode"] for r in records if r.get("speciesCode")})

    def taxonomy(self, codes: Iterable[str]) -> dict[str, dict[str, Any]]:
        """Name/sort metadata for the given codes only — never the full 4 MB taxonomy."""
        wanted = sorted(set(codes))
        out: dict[str, dict[str, Any]] = {}
        for start in range(0, len(wanted), TAXONOMY_CHUNK):
            chunk = wanted[start : start + TAXONOMY_CHUNK]
            records = self._get(
                "/ref/taxonomy/ebird",
                {"fmt": "json", "locale": "en", "species": ",".join(chunk)},
            )
            for r in records:
                code = r.get("speciesCode")
                if not code:
                    continue
                out[code] = {
                    "com_name": r.get("comName", code),
                    "sci_name": r.get("sciName", ""),
                    "family": r.get("familyComName", ""),
                    "order": r.get("order", ""),
                    "taxon_order": r.get("taxonOrder", 0),
                    "category": r.get("category", "species"),
                }
        return out
