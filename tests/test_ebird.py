from __future__ import annotations

import json
from datetime import date
from typing import Any

import httpx
import pytest

from pipeline.ebird import EBirdClient


class Recorder:
    """Captures requests and replays a queue of canned responses."""

    def __init__(self, responses: list[httpx.Response]) -> None:
        self.requests: list[httpx.Request] = []
        self._responses = responses

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self._responses[min(len(self.requests), len(self._responses)) - 1]

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)


def make_client(recorder: Recorder, **kwargs: Any) -> EBirdClient:
    sleeps: list[float] = kwargs.pop("sleeps", [])
    return EBirdClient(
        "test-key",
        throttle_seconds=kwargs.pop("throttle_seconds", 0.0),
        sleep=sleeps.append,
        clock=kwargs.pop("clock", lambda: 100.0),
        transport=recorder.transport(),
    )


def test_auth_header_and_params() -> None:
    rec = Recorder([httpx.Response(200, json=[])])
    with make_client(rec) as client:
        client.recent_observations(38.99, -76.94, 25, 14)
    req = rec.requests[0]
    assert req.headers["X-eBirdApiToken"] == "test-key"
    assert "BirdTracker" in req.headers["User-Agent"]
    assert req.url.path == "/v2/data/obs/geo/recent"
    assert req.url.params["dist"] == "25"
    assert req.url.params["back"] == "14"


def test_notable_and_hotspot_params() -> None:
    rec = Recorder([httpx.Response(200, json=[])])
    with make_client(rec) as client:
        client.notable_observations(38.99, -76.94, 25, 14)
        client.nearby_hotspots(38.99, -76.94, 25, 14)
    assert rec.requests[0].url.path == "/v2/data/obs/geo/recent/notable"
    assert rec.requests[0].url.params["detail"] == "simple"
    assert rec.requests[1].url.path == "/v2/ref/hotspot/geo"
    assert rec.requests[1].url.params["fmt"] == "json"


def test_429_honors_retry_after() -> None:
    rec = Recorder(
        [
            httpx.Response(429, headers={"Retry-After": "7"}),
            httpx.Response(200, json=[{"speciesCode": "carwre"}]),
        ]
    )
    sleeps: list[float] = []
    client = EBirdClient(
        "k", throttle_seconds=0.0, sleep=sleeps.append, clock=lambda: 0.0,
        transport=rec.transport(),
    )
    with client:
        result = client.recent_observations(1, 2, 3, 4)
    assert result == [{"speciesCode": "carwre"}]
    assert 7.0 in sleeps
    assert len(rec.requests) == 2


def test_5xx_retries_then_succeeds() -> None:
    rec = Recorder(
        [httpx.Response(500), httpx.Response(502), httpx.Response(200, json=[])]
    )
    sleeps: list[float] = []
    client = EBirdClient(
        "k", throttle_seconds=0.0, sleep=sleeps.append, clock=lambda: 0.0,
        transport=rec.transport(),
    )
    with client:
        assert client.recent_observations(1, 2, 3, 4) == []
    assert len(rec.requests) == 3
    assert sleeps == [2.0, 4.0]  # exponential backoff


def test_5xx_exhausts_and_raises() -> None:
    rec = Recorder([httpx.Response(500)])
    client = EBirdClient(
        "k", throttle_seconds=0.0, sleep=lambda _s: None, clock=lambda: 0.0,
        transport=rec.transport(),
    )
    with client, pytest.raises(httpx.HTTPStatusError):
        client.recent_observations(1, 2, 3, 4)
    assert len(rec.requests) == 4  # 1 + RETRIES


def test_403_raises_immediately() -> None:
    rec = Recorder([httpx.Response(403, json={"error": "no key"})])
    client = EBirdClient(
        "bad", throttle_seconds=0.0, sleep=lambda _s: None, clock=lambda: 0.0,
        transport=rec.transport(),
    )
    with client, pytest.raises(httpx.HTTPStatusError):
        client.recent_observations(1, 2, 3, 4)
    assert len(rec.requests) == 1  # 4xx (other than 429) never retries


def test_throttle_spacing() -> None:
    rec = Recorder([httpx.Response(200, json=[])])
    sleeps: list[float] = []
    client = EBirdClient(
        "k", throttle_seconds=1.5, sleep=sleeps.append, clock=lambda: 100.0,
        transport=rec.transport(),
    )
    with client:
        client.recent_observations(1, 2, 3, 4)  # first call: no wait
        client.recent_observations(1, 2, 3, 4)  # zero time "passed" -> full wait
    assert sleeps == [1.5]


def test_historic_species_dedups_and_sorts() -> None:
    records = [
        {"speciesCode": "norcar"},
        {"speciesCode": "carwre"},
        {"speciesCode": "norcar"},  # duplicate (multiple locations)
        {"comName": "mystery, no code"},
    ]
    rec = Recorder([httpx.Response(200, json=records)])
    with make_client(rec) as client:
        assert client.historic_species("US-DC", date(2026, 5, 10)) == ["carwre", "norcar"]
    req = rec.requests[0]
    assert req.url.path == "/v2/data/obs/US-DC/historic/2026/5/10"
    assert req.url.params["cat"] == "species"


def test_taxonomy_chunks_and_maps() -> None:
    codes = [f"sp{i:03d}" for i in range(200)]

    def handler(request: httpx.Request) -> httpx.Response:
        requested = request.url.params["species"].split(",")
        return httpx.Response(
            200,
            json=[
                {
                    "speciesCode": c,
                    "comName": f"Common {c}",
                    "sciName": f"Scientificus {c}",
                    "category": "species",
                    "taxonOrder": float(i),
                    "order": "Passeriformes",
                    "familyComName": "Testbirds",
                }
                for i, c in enumerate(requested)
            ],
        )

    requests: list[httpx.Request] = []

    def recording_handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return handler(request)

    client = EBirdClient(
        "k", throttle_seconds=0.0, sleep=lambda _s: None, clock=lambda: 0.0,
        transport=httpx.MockTransport(recording_handler),
    )
    with client:
        out = client.taxonomy(codes)
    assert len(requests) == 2  # 150 + 50
    assert len(requests[0].url.params["species"].split(",")) == 150
    assert len(out) == 200
    assert out["sp000"]["com_name"] == "Common sp000"
    assert out["sp000"]["family"] == "Testbirds"
    assert json.dumps(out["sp000"])  # JSON-serializable
