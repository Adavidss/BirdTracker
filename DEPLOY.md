# Deploying BirdTracker

One-time setup, then it runs itself.

## 1. One-time setup

1. **eBird API key** — instant + free at <https://ebird.org/api/keygen>
   (needs an eBird account).
2. **Repo secret** — GitHub → Settings → Secrets and variables → Actions →
   *New repository secret*: name `EBIRD_API_KEY`, value = your key.
3. **Pages** — Settings → Pages → *Build and deployment* → Source:
   **GitHub Actions**.
4. **First deploy** — Actions → *Build & Deploy (static site)* → *Run
   workflow*. The site appears at `https://<user>.github.io/BirdTracker/`.

## 2. Load the seasonal history (the Timing page needs this)

Actions → *Backfill history* → *Run workflow* with e.g.

- start_date: `2024-07-01`
- end_date: *yesterday*
- sleep: `1.5`

Two regions × two years ≈ 1,460 API calls ≈ 45 minutes. The run commits the
fetched day-files even if it fails midway (`if: always()`), and **rerunning the
same range resumes** — existing files are never re-fetched.

Then dispatch *Build & Deploy* once more: the backfill's bot commit does **not**
auto-trigger other workflows (GitHub's `GITHUB_TOKEN` rule), so the site won't
pick up the history until the next deploy (manual or the nightly cron).

## 3. Steady state (nothing to do)

- **Daily at 10:00 UTC** (~5–6 am ET) the deploy workflow: fetches the three
  radius snapshots plus per-species report locations for the map (one call per
  species currently around, ~120–130), fills any missing history days
  (self-heals up to `catchup_days` = 8 missed runs), commits new day-files,
  rebuilds, deploys. Steady-state usage: ~130 throttled eBird calls per day.
- Deploy and backfill share the `data-and-pages` concurrency group with
  `cancel-in-progress: false`, so two writers of `data/` never race and a
  half-done backfill is never killed.
- GitHub disables cron workflows after 60 days without repo activity — the
  daily bot commit itself counts as activity, so the system self-sustains.

## Live anywhere-mode (Cloudflare Worker)

The map's "anywhere in the US" lookups go through a tiny Worker that holds the
eBird key server-side (the browser never sees it):

```bash
cd worker
npx wrangler deploy                      # -> https://birdtracker-birds.<acct>.workers.dev
npx wrangler secret put EBIRD_API_KEY    # paste the same key
```

The frontend finds it via `NEXT_PUBLIC_BIRDS_API` (defaults to the deployed
Worker URL in next.config.mjs; the repo Variable overrides it in CI — set it to
an empty string to hide the feature). Lookups are edge-cached 10 min and
self-capped at 900/day via the BIRDTRACKER_COUNTER KV namespace.

## Changing the area

Edit `config.json` (center, radius_km ≤ 50, regions). Region codes: state like
`US-DC`, or county like `US-MD-033` (find codes in eBird region URLs, e.g.
`ebird.org/region/US-MD-033`). Seasonal history is per-region — if you change
regions, delete the old folders under `data/history/` to keep charts honest.

## Local development

See the README quickstart. `./start-local.sh --data` refreshes data first
(needs `.env` with the key); `--offline-data` rebuilds the seasonality files
from committed history with zero API calls; `prod` serves the real static
export instead of the dev server.
