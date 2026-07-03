// Static data client — there is no live backend. The app reads pre-built JSON
// from <basePath>/data/*.json (produced by pipeline.update in CI) and does all
// filtering/sorting in the browser. Every loader falls back to a typed empty
// default so a data-less checkout renders friendly empty states, not crashes.

import type {
  BirdsNow,
  HotspotList,
  Meta,
  NotableList,
  Seasonality,
  SightingsFile,
  SpeciesIndex,
} from "./types";

// Project sites live under /<repo>; next.config.mjs sets this. Empty locally
// only if the config changes — the fetch path always goes through it.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const _cache = new Map<string, Promise<unknown>>();

function loadJSON<T>(name: string, fallback: T): Promise<T> {
  let p = _cache.get(name);
  if (!p) {
    // "no-cache" revalidates (cheap 304s) so the daily-rebuilt data never goes
    // stale for returning visitors; the in-memory cache dedupes per session.
    p = fetch(`${BASE}/data/${name}`, { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${name}: ${r.status}`);
        return r.json() as Promise<T>;
      })
      .catch(() => fallback);
    _cache.set(name, p);
  }
  return p as Promise<T>;
}

export function getBirdsNow(): Promise<BirdsNow> {
  return loadJSON<BirdsNow>("birds-now.json", {
    generated_at: "",
    window_days: 14,
    species: [],
  });
}

export function getSeasonality(): Promise<Seasonality> {
  return loadJSON<Seasonality>("seasonality.json", {
    generated_at: "",
    regions: [],
    first_date: null,
    last_date: null,
    weeks_covered: new Array(48).fill(0),
    species: [],
  });
}

export function getNotable(): Promise<NotableList> {
  return loadJSON<NotableList>("notable.json", {
    generated_at: "",
    window_days: 14,
    sightings: [],
  });
}

export function getHotspots(): Promise<HotspotList> {
  return loadJSON<HotspotList>("hotspots.json", { generated_at: "", hotspots: [] });
}

export function getSightings(): Promise<SightingsFile> {
  return loadJSON<SightingsFile>("sightings.json", {
    generated_at: "",
    window_days: 14,
    species: {},
  });
}

export function getSpeciesIndex(): Promise<SpeciesIndex> {
  return loadJSON<SpeciesIndex>("species.json", { generated_at: "", species: {} });
}

export function getMeta(): Promise<Meta | null> {
  return loadJSON<Meta | null>("meta.json", null);
}
