"""BirdTracker data pipeline.

Plain Python, no framework: fetch eBird data (pipeline.update / pipeline.backfill),
accumulate per-day region species lists under data/history/, and export the static
JSON the frontend reads from frontend/public/data/.
"""
