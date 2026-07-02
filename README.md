# 🪶 BirdTracker

**What birds are around College Park / DC — and when.** A birdwatching planner
built on eBird data: see what's being reported nearby right now, what's rare,
where the active hotspots are, and (the star feature) *when* each species is
actually around, week by week, so you can time outings around arrivals,
departures, and migration windows.

Fully static site on GitHub Pages, in the same architecture as ConcertFinder:
a Python pipeline runs in GitHub Actions on a daily cron, calls the eBird API
with a CI-secret key, writes JSON that the Next.js frontend reads, and commits
the accumulating seasonal history back to the repo. No servers, no database —
the browser only ever fetches static JSON.

## The two data geometries

| Pages | Source | Geometry |
|---|---|---|
| **Now / Rare / Hotspots** | eBird "recent nearby" endpoints, refetched daily | circle: 25 km around 38.99, -76.94 |
| **Timing / species charts** | daily species lists per region, accumulated in `data/history/` | regions: `US-DC` + `US-MD-033` (Prince George's) |

A radius circle is not the union of the region polygons, so the UI labels them
differently ("nearby" vs. the region list in the footer). Both are set in
[config.json](config.json) — changing the area is a one-file edit (plus,
ideally, wiping `data/history/` so old-region history doesn't mix in).

## How seasonality works

- The eBird API has no public bar-chart endpoint, but it does have *historic
  observations by date*. `pipeline.backfill` fetches each past day once and
  stores a tiny write-once file per region per day:
  `data/history/US-DC/2026-07-01.json` (`{"species": ["amecro", ...]}`).
- Days aggregate onto **eBird's 48-week calendar** (4 pseudo-weeks per month:
  days 1–7, 8–14, 15–21, 22–end) — the same axis as eBird's own bar charts.
- A species' bar height = share of covered days it was reported that week,
  computed in the browser from integer counts (the sample size doubles as the
  low-confidence signal — thin weeks render dimmed).
- The nightly job appends yesterday and re-exports; the charts sharpen forever.

## Quickstart

```bash
# 1. Pipeline (Python 3.12+)
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
cp .env.example .env            # then paste your key from https://ebird.org/api/keygen

# 2. Data — a couple of weeks to try it out (~30 API calls)
.venv/bin/python -m pipeline.backfill --start 2026-06-18 --end 2026-07-01
.venv/bin/python -m pipeline.update

# 3. Site
./start-local.sh                # -> http://localhost:3000/BirdTracker/  (the subpath is required)
```

Everything except live fetching works without a key:
`pytest -q` (all offline), `python -m pipeline.update --offline`, and the
frontend builds/renders with empty data.

## Repo map

```
config.json          area + windows (the only knobs; API key is env-only)
pipeline/            plain-Python pipeline: ebird client, history store,
                     48-week aggregation, JSON export, update/backfill CLIs
tests/               offline unit tests (fixtures + httpx.MockTransport)
data/history/        committed per-day region species lists (CI appends daily)
data/reference/      taxonomy slice — names for species we've seen (never the 4MB full file)
frontend/            Next.js 15 static export under /BirdTracker; reads public/data/*.json
.github/workflows/   ci (lint+test), deploy (daily cron), backfill (manual, resumable)
```

Deployment, secrets, and the backfill runbook: [DEPLOY.md](DEPLOY.md).

Sightings data © [eBird](https://ebird.org) / Cornell Lab of Ornithology, used
via the public API with throttling and no re-fetching. Not affiliated with eBird.
