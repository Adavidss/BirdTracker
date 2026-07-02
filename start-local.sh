#!/usr/bin/env bash
#
# start-local.sh — run the BirdTracker webapp on localhost.
#
# BirdTracker is a STATIC site: the Next.js frontend reads pre-built JSON from
# frontend/public/data/*.json. There is no runtime server — the Python pipeline
# only (re)generates that JSON. So "the webapp" = the frontend.
#
# Usage:
#   ./start-local.sh                 # dev server, hot reload   -> http://localhost:3000/BirdTracker/
#   ./start-local.sh prod            # production static export -> http://localhost:3000/BirdTracker/
#   ./start-local.sh --data          # refresh data JSON first (needs EBIRD_API_KEY in .env), then dev
#   ./start-local.sh --offline-data  # rebuild seasonality/species/meta from committed history (no key)
#
# The app is hosted under the /BirdTracker base path, so you MUST open the URL
# WITH that path — http://localhost:3000/ alone will 404 (that's expected).
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$ROOT/frontend"
BASE="/BirdTracker"
PORT=3000

# ---- parse args (order-independent) ----------------------------------------
MODE="dev"
REFRESH_DATA=""
for arg in "$@"; do
  case "$arg" in
    dev|prod)         MODE="$arg" ;;
    --data|--refresh) REFRESH_DATA="online" ;;
    --offline-data)   REFRESH_DATA="offline" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg  (try --help)" >&2; exit 1 ;;
  esac
done

URL="http://localhost:$PORT$BASE/"
PY="$ROOT/.venv/bin/python"
[ -x "$PY" ] || PY="python3"

# ---- 1. free the port if something is already listening --------------------
if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "→ port $PORT is busy; stopping the existing listener"
  lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs kill 2>/dev/null || true
  sleep 1
fi

# ---- 2. (optional) refresh the static data JSON ----------------------------
if [ "$REFRESH_DATA" = "online" ]; then
  echo "→ refreshing data via the eBird API (needs EBIRD_API_KEY in .env)…"
  ( cd "$ROOT" && "$PY" -m pipeline.update )
elif [ "$REFRESH_DATA" = "offline" ]; then
  echo "→ rebuilding seasonality/species/meta from committed history (no API calls)…"
  ( cd "$ROOT" && "$PY" -m pipeline.update --offline )
fi

# ---- 3. sanity-check that data exists --------------------------------------
if [ ! -f "$FRONTEND/public/data/meta.json" ]; then
  echo "⚠  No data found in frontend/public/data/."
  echo "   The pages will load but show empty states. Generate data with:"
  echo "       ./start-local.sh $MODE --data"
fi

# ---- 4. install frontend deps if missing -----------------------------------
cd "$FRONTEND"
if [ ! -d node_modules ]; then
  echo "→ installing frontend dependencies…"
  npm install
fi

# ---- 5. start --------------------------------------------------------------
echo
echo "────────────────────────────────────────────────────────────"
echo "  Mode:  $MODE"
echo "  Open:  $URL"
echo "  (the /BirdTracker path is required — / will 404)"
echo "────────────────────────────────────────────────────────────"
echo

if [ "$MODE" = "dev" ]; then
  exec npm run dev
else
  echo "→ building static export to ./out …"
  npm run build
  echo "→ serving the static export under $BASE …"
  exec npm run preview
fi
