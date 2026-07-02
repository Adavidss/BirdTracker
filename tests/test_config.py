from __future__ import annotations

import dataclasses
import json
from pathlib import Path

import pytest

from pipeline.config import Config, ConfigError, load_config, require_key

VALID = {
    "center": {"lat": 38.99, "lng": -76.94},
    "radius_km": 25,
    "regions": ["US-DC", "US-MD-033"],
    "recent_window_days": 14,
    "catchup_days": 8,
    "min_seasonality_days": 3,
}


def write_config(root: Path, **overrides: object) -> None:
    (root / "config.json").write_text(json.dumps({**VALID, **overrides}))


def test_load_valid(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EBIRD_API_KEY", raising=False)
    write_config(tmp_path)
    cfg = load_config(tmp_path)
    assert cfg.center_lat == 38.99
    assert cfg.regions == ("US-DC", "US-MD-033")
    assert cfg.radius_km == 25
    assert cfg.api_key is None


def test_key_from_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EBIRD_API_KEY", "abc123")
    write_config(tmp_path)
    assert load_config(tmp_path).api_key == "abc123"


def test_radius_boundary(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EBIRD_API_KEY", raising=False)
    write_config(tmp_path, radius_km=50)
    assert load_config(tmp_path).radius_km == 50
    write_config(tmp_path, radius_km=60)
    with pytest.raises(ConfigError, match="radius_km"):
        load_config(tmp_path)


def test_window_over_ebird_limit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EBIRD_API_KEY", raising=False)
    write_config(tmp_path, recent_window_days=31)
    with pytest.raises(ConfigError, match="recent_window_days"):
        load_config(tmp_path)


def test_empty_regions(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EBIRD_API_KEY", raising=False)
    write_config(tmp_path, regions=[])
    with pytest.raises(ConfigError, match="regions"):
        load_config(tmp_path)


def test_missing_file(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="not found"):
        load_config(tmp_path)


def test_require_key_message() -> None:
    cfg = Config(
        center_lat=0,
        center_lng=0,
        radius_km=25,
        regions=("US-DC",),
        recent_window_days=14,
        catchup_days=8,
        min_seasonality_days=3,
        api_key=None,
    )
    with pytest.raises(ConfigError, match="ebird.org/api/keygen"):
        require_key(cfg)
    assert require_key(dataclasses.replace(cfg, api_key="k")) == "k"
