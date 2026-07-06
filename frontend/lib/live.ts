// Live "anywhere" mode: geocode a place with Open-Meteo's free keyless API,
// then fetch bird data through the birdtracker-birds Worker (which holds the
// eBird key server-side). The home area reads baked static JSON and never
// touches this module.

import type {
  Hotspot,
  NotableSighting,
  NowSpecies,
  Seasonality,
  SightingPoint,
  SightingsFile,
  SpeciesIndex,
} from "./types";

const BIRDS_API = process.env.NEXT_PUBLIC_BIRDS_API ?? "";

export function liveEnabled(): boolean {
  return Boolean(BIRDS_API);
}

export interface LiveArea {
  lat: number;
  lng: number;
  label: string;
}

// --- place search (same source as ConcertFinder's LocationPicker) -----------

export interface GeoResult {
  name: string;
  admin1?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
}

export async function searchPlaces(q: string): Promise<GeoResult[]> {
  const r = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`,
  );
  if (!r.ok) return [];
  const data = (await r.json().catch(() => null)) as { results?: GeoResult[] } | null;
  return Array.isArray(data?.results) ? data.results : [];
}

export function geoLabel(g: GeoResult): string {
  return [g.name, g.admin1, g.country_code === "US" ? null : g.country_code]
    .filter(Boolean)
    .join(", ");
}

export function areaFromGeo(g: GeoResult): LiveArea {
  return { lat: g.latitude, lng: g.longitude, label: geoLabel(g) };
}

// --- Worker fetches -----------------------------------------------------------

interface EBirdRecord {
  speciesCode?: string;
  comName?: string;
  sciName?: string;
  lat?: number;
  lng?: number;
  locId?: string;
  locName?: string;
  obsDt?: string;
  howMany?: number;
  subId?: string;
  obsValid?: boolean;
  obsReviewed?: boolean;
  locationPrivate?: boolean;
}

interface EBirdHotspot {
  locId?: string;
  locName?: string;
  lat?: number;
  lng?: number;
  latestObsDt?: string;
  numSpeciesAllTime?: number;
}

function toPoint(r: EBirdRecord): SightingPoint | null {
  if (r.lat == null || r.lng == null) return null;
  return {
    lat: r.lat,
    lng: r.lng,
    loc_id: r.locId ?? "",
    loc_name: r.locName ?? "",
    obs_dt: r.obsDt ?? "",
    how_many: r.howMany ?? null,
    checklist_id: r.subId ?? "",
  };
}

async function workerJSON<T>(path: string): Promise<T[]> {
  const r = await fetch(`${BIRDS_API.replace(/\/$/, "")}${path}`, { cache: "no-cache" });
  const data = (await r.json().catch(() => null)) as T[] | { error?: string } | null;
  if (!r.ok) {
    const message = data && !Array.isArray(data) ? data.error : null;
    throw new Error(message || `Live lookup failed (${r.status}).`);
  }
  return Array.isArray(data) ? data : [];
}

export interface LiveSnapshot {
  sightings: SightingsFile;
  /** speciesCode -> common name, from the live records themselves. */
  names: Record<string, string>;
  /** One newest report per species, shaped like the baked birds-now rows.
   *  days_reported_14 is unknowable live and set to 0 — hide it in the UI. */
  now: NowSpecies[];
}

/** One newest report per species around the area (eBird dedups this feed). */
export async function fetchLiveArea(area: LiveArea, backDays = 14): Promise<LiveSnapshot> {
  const records = await workerJSON<EBirdRecord>(
    `/obs?lat=${area.lat}&lng=${area.lng}&dist=25&back=${backDays}`,
  );
  const species: Record<string, SightingPoint[]> = {};
  const names: Record<string, string> = {};
  const now: NowSpecies[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    const code = r.speciesCode;
    const point = toPoint(r);
    if (!code || !point) continue;
    (species[code] ??= []).push(point);
    if (r.comName) names[code] = r.comName;
    if (!seen.has(code)) {
      seen.add(code);
      now.push({
        code,
        com_name: r.comName ?? code,
        sci_name: r.sciName ?? "",
        last_seen: r.obsDt ?? "",
        last_loc_name: r.locName ?? "",
        last_loc_id: r.locId ?? "",
        how_many: r.howMany ?? null,
        days_reported_14: 0,
        obs_valid: r.obsValid ?? true,
      });
    }
  }
  // Zone-less "YYYY-MM-DD HH:MM" strings sort correctly as strings.
  now.sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1));
  return {
    sightings: { generated_at: new Date().toISOString(), window_days: backDays, species },
    names,
    now,
  };
}

/** Every recent report of one species around the area (for the map filter). */
export async function fetchLiveSpeciesObs(
  code: string,
  area: LiveArea,
  backDays = 14,
): Promise<SightingPoint[]> {
  const records = await workerJSON<EBirdRecord>(
    `/species-obs?code=${encodeURIComponent(code)}&lat=${area.lat}&lng=${area.lng}&dist=25&back=${backDays}`,
  );
  return records.map(toPoint).filter((p): p is SightingPoint => p !== null);
}

/** Recent notable/rare reports around the area, newest first. */
export async function fetchLiveNotable(area: LiveArea, backDays = 14): Promise<NotableSighting[]> {
  const records = await workerJSON<EBirdRecord>(
    `/notable?lat=${area.lat}&lng=${area.lng}&dist=25&back=${backDays}`,
  );
  return records
    .filter((r) => r.speciesCode)
    .map((r) => ({
      code: r.speciesCode ?? "",
      com_name: r.comName ?? r.speciesCode ?? "",
      sci_name: r.sciName ?? "",
      obs_date: r.obsDt ?? "",
      loc_id: r.locId ?? "",
      loc_name: r.locName ?? "",
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      how_many: r.howMany ?? null,
      obs_valid: r.obsValid === true,
      obs_reviewed: r.obsReviewed === true,
      location_private: r.locationPrivate === true,
      checklist_id: r.subId ?? "",
    }))
    .sort((a, b) => (a.obs_date < b.obs_date ? 1 : -1));
}

/** Nearby hotspots with recent activity, most recently active first. */
export async function fetchLiveHotspots(area: LiveArea, backDays = 14): Promise<Hotspot[]> {
  const records = await workerJSON<EBirdHotspot>(
    `/hotspots?lat=${area.lat}&lng=${area.lng}&dist=25&back=${backDays}`,
  );
  return records
    .filter((h) => h.locId)
    .map((h) => ({
      loc_id: h.locId ?? "",
      name: h.locName ?? h.locId ?? "",
      lat: h.lat ?? null,
      lng: h.lng ?? null,
      latest_obs: h.latestObsDt ?? "",
      num_species_all_time: h.numSpeciesAllTime ?? 0,
    }))
    .sort((a, b) => (a.latest_obs < b.latest_obs ? 1 : -1));
}

// --- sampled seasonality (the Worker's /seasonality endpoint) -----------------

export interface LiveSeasonality {
  seasonality: Seasonality;
  names: Record<string, { com_name: string; sci_name: string }>;
  /** eBird region code actually sampled (nearest county), e.g. "US-NC-135". */
  region: string;
  /** Its display name, e.g. "Orange, North Carolina, United States". */
  regionName: string;
  sampleCount: number;
  failedSamples: number;
}

interface SeasonalityResponse extends Seasonality {
  region: string;
  region_name?: string;
  sample_count?: number;
  failed_samples?: number;
  names?: Record<string, { com_name: string; sci_name: string }>;
}

const _seasonCache = new Map<string, Promise<LiveSeasonality>>();

const seasonKey = (area: LiveArea) => `${area.lat.toFixed(2)},${area.lng.toFixed(2)}`;

/** Sampled 48-week presence profile around a point — the Worker resolves the
 *  point to its nearest county and samples that. Cached per point for the
 *  session (the Worker also KV-caches per region, so repeats are cheap). */
export function fetchLiveSeasonality(area: LiveArea): Promise<LiveSeasonality> {
  const key = seasonKey(area);
  let p = _seasonCache.get(key);
  if (!p) {
    p = (async (): Promise<LiveSeasonality> => {
      const r = await fetch(
        `${BIRDS_API.replace(/\/$/, "")}/seasonality?lat=${area.lat}&lng=${area.lng}`,
        { cache: "no-cache" },
      );
      const data = (await r.json().catch(() => null)) as
        | SeasonalityResponse
        | { error?: string }
        | null;
      if (!r.ok || !data || !("species" in data)) {
        const message = data && "error" in data ? data.error : null;
        throw new Error(message || `Seasonality lookup failed (${r.status}).`);
      }
      return {
        seasonality: {
          generated_at: data.generated_at,
          regions: data.regions,
          first_date: data.first_date,
          last_date: data.last_date,
          weeks_covered: data.weeks_covered,
          species: data.species,
        },
        names: data.names ?? {},
        region: data.region,
        regionName: data.region_name ?? data.region,
        sampleCount: data.sample_count ?? 24,
        failedSamples: data.failed_samples ?? 0,
      };
    })();
    p.catch(() => _seasonCache.delete(key)); // failed lookups may be retried
    _seasonCache.set(key, p);
  }
  return p;
}

/** The already-loaded seasonality for an area, if any — never triggers a fetch. */
export function peekLiveSeasonality(area: LiveArea): Promise<LiveSeasonality> | null {
  return _seasonCache.get(seasonKey(area)) ?? null;
}

/** SpeciesIndex look-alike from live names, for components that expect one. */
export function indexFromNames(
  names: Record<string, { com_name: string; sci_name: string }>,
): SpeciesIndex {
  const species: SpeciesIndex["species"] = {};
  for (const [code, n] of Object.entries(names)) {
    species[code] = {
      com_name: n.com_name,
      sci_name: n.sci_name,
      family: "",
      order: "",
      taxon_order: Number.MAX_SAFE_INTEGER,
    };
  }
  return { generated_at: "", species };
}

// --- persistence ----------------------------------------------------------------

const AREA_KEY = "bt_area";

export function readArea(): LiveArea | null {
  try {
    const raw = localStorage.getItem(AREA_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as LiveArea;
    return typeof a?.lat === "number" && typeof a?.lng === "number" && typeof a?.label === "string"
      ? a
      : null;
  } catch {
    return null;
  }
}

export function writeArea(area: LiveArea | null): void {
  try {
    if (area) localStorage.setItem(AREA_KEY, JSON.stringify(area));
    else localStorage.removeItem(AREA_KEY);
  } catch {
    // private mode — the choice just won't persist
  }
}
