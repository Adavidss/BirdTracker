// Types mirroring the pipeline's exported JSON (pipeline/export.py) — the
// frontend contract. Keep in sync with the export schemas.

export interface NowSpecies {
  code: string;
  com_name: string;
  sci_name: string;
  /** eBird obsDt, verbatim: "YYYY-MM-DD HH:MM" local time, NO zone. Never Date-parse. */
  last_seen: string;
  last_loc_name: string;
  last_loc_id: string;
  how_many: number | null;
  /** Days (of the last 14 complete days) the species appeared in the region history. */
  days_reported_14: number;
  obs_valid: boolean;
}

export interface BirdsNow {
  generated_at: string;
  window_days: number;
  species: NowSpecies[];
}

export interface SeasonSpecies {
  code: string;
  /** 48 ints: days reported per eBird pseudo-week, summed across years. */
  weeks: number[];
  total_days: number;
}

export interface Seasonality {
  generated_at: string;
  regions: string[];
  first_date: string | null;
  last_date: string | null;
  /** 48 ints: covered days per week — the denominator for frequencies. */
  weeks_covered: number[];
  species: SeasonSpecies[];
}

export interface NotableSighting {
  code: string;
  com_name: string;
  sci_name: string;
  obs_date: string;
  loc_id: string;
  loc_name: string;
  lat: number | null;
  lng: number | null;
  how_many: number | null;
  obs_valid: boolean;
  obs_reviewed: boolean;
  location_private: boolean;
  /** eBird subId -> https://ebird.org/checklist/{id} */
  checklist_id: string;
}

export interface NotableList {
  generated_at: string;
  window_days: number;
  sightings: NotableSighting[];
}

export interface Hotspot {
  loc_id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  latest_obs: string;
  num_species_all_time: number;
}

export interface HotspotList {
  generated_at: string;
  hotspots: Hotspot[];
}

export interface SightingPoint {
  lat: number;
  lng: number;
  loc_id: string;
  loc_name: string;
  /** eBird obsDt, verbatim zone-less local time — never Date-parse. */
  obs_dt: string;
  how_many: number | null;
  checklist_id: string;
}

export interface SightingsFile {
  generated_at: string;
  window_days: number;
  /** Every located recent report, keyed by species code, newest first. */
  species: Record<string, SightingPoint[]>;
}

export interface SpeciesInfo {
  com_name: string;
  sci_name: string;
  family: string;
  order: string;
  taxon_order: number;
}

export interface SpeciesIndex {
  generated_at: string;
  species: Record<string, SpeciesInfo>;
}

export interface Meta {
  last_updated: string;
  center: { lat: number; lng: number };
  radius_km: number;
  regions: string[];
  history: {
    first_date: string | null;
    last_date: string | null;
    days_covered: number;
  };
  counts: { now: number; seasonality: number; notable: number; hotspots: number };
}
