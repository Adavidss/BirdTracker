// Live "anywhere" mode for the map: geocode a US place with Open-Meteo's free
// keyless API, then fetch sightings through the birdtracker-birds Worker (which
// holds the eBird key server-side). The home area reads baked static JSON and
// never touches this module.

import type { SightingPoint, SightingsFile } from "./types";

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

// --- Worker fetches -----------------------------------------------------------

interface EBirdRecord {
  speciesCode?: string;
  comName?: string;
  lat?: number;
  lng?: number;
  locId?: string;
  locName?: string;
  obsDt?: string;
  howMany?: number;
  subId?: string;
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

async function workerJSON(path: string): Promise<EBirdRecord[]> {
  const r = await fetch(`${BIRDS_API.replace(/\/$/, "")}${path}`, { cache: "no-cache" });
  const data = (await r.json().catch(() => null)) as EBirdRecord[] | { error?: string } | null;
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
}

/** One newest report per species around the area (eBird dedups this feed). */
export async function fetchLiveArea(area: LiveArea, backDays = 14): Promise<LiveSnapshot> {
  const records = await workerJSON(
    `/obs?lat=${area.lat}&lng=${area.lng}&dist=25&back=${backDays}`,
  );
  const species: Record<string, SightingPoint[]> = {};
  const names: Record<string, string> = {};
  for (const r of records) {
    const code = r.speciesCode;
    const point = toPoint(r);
    if (!code || !point) continue;
    (species[code] ??= []).push(point);
    if (r.comName) names[code] = r.comName;
  }
  return {
    sightings: { generated_at: new Date().toISOString(), window_days: backDays, species },
    names,
  };
}

/** Every recent report of one species around the area (for the map filter). */
export async function fetchLiveSpeciesObs(
  code: string,
  area: LiveArea,
  backDays = 14,
): Promise<SightingPoint[]> {
  const records = await workerJSON(
    `/species-obs?code=${encodeURIComponent(code)}&lat=${area.lat}&lng=${area.lng}&dist=25&back=${backDays}`,
  );
  return records.map(toPoint).filter((p): p is SightingPoint => p !== null);
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
