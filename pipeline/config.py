"""Configuration: config.json holds every non-secret knob; the API key is env-only.

Changing the tracked area is a one-file edit (config.json). The eBird key is the
single secret: locally from .env (gitignored), in CI from the EBIRD_API_KEY secret.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

# Hard eBird API limits for the geo endpoints.
MAX_RADIUS_KM = 50
MAX_BACK_DAYS = 30


class ConfigError(ValueError):
    """config.json or the environment is unusable — message says how to fix it."""


@dataclass(frozen=True)
class Config:
    center_lat: float
    center_lng: float
    radius_km: int
    regions: tuple[str, ...]
    recent_window_days: int
    catchup_days: int
    min_seasonality_days: int
    api_key: str | None


def load_config(root: Path | None = None) -> Config:
    root = root or ROOT
    path = root / "config.json"
    try:
        raw = json.loads(path.read_text())
    except FileNotFoundError:
        raise ConfigError(f"config.json not found at {path}") from None
    except json.JSONDecodeError as exc:
        raise ConfigError(f"config.json is not valid JSON: {exc}") from None

    try:
        center = raw["center"]
        cfg = Config(
            center_lat=float(center["lat"]),
            center_lng=float(center["lng"]),
            radius_km=int(raw["radius_km"]),
            regions=tuple(str(r) for r in raw["regions"]),
            recent_window_days=int(raw["recent_window_days"]),
            catchup_days=int(raw["catchup_days"]),
            min_seasonality_days=int(raw["min_seasonality_days"]),
            api_key=_load_key(root),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ConfigError(f"config.json is missing or has a malformed field: {exc}") from None

    if not 1 <= cfg.radius_km <= MAX_RADIUS_KM:
        raise ConfigError(
            f"radius_km must be 1..{MAX_RADIUS_KM} (eBird limit), got {cfg.radius_km}"
        )
    if not 1 <= cfg.recent_window_days <= MAX_BACK_DAYS:
        raise ConfigError(
            f"recent_window_days must be 1..{MAX_BACK_DAYS} (eBird limit), "
            f"got {cfg.recent_window_days}"
        )
    if not cfg.regions:
        raise ConfigError("regions must list at least one eBird region code (e.g. US-DC)")
    if cfg.catchup_days < 1:
        raise ConfigError("catchup_days must be >= 1")
    if cfg.min_seasonality_days < 1:
        raise ConfigError("min_seasonality_days must be >= 1")
    return cfg


def _load_key(root: Path) -> str | None:
    load_dotenv(root / ".env")
    return os.environ.get("EBIRD_API_KEY") or None


def require_key(cfg: Config) -> str:
    if not cfg.api_key:
        raise ConfigError(
            "EBIRD_API_KEY is not set. Get a free key at https://ebird.org/api/keygen, "
            "then put it in .env locally or in the repo's Actions secrets for CI."
        )
    return cfg.api_key
