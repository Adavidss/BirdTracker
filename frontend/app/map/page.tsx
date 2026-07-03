"use client";

// MAP — recent sighting reports as clickable spots or an intensity heat layer,
// filterable to a single species. /map/?code=X preselects the filter.
//
// Two data modes:
//  - Home (default): the baked static sightings.json for the configured area.
//  - Live "anywhere": pick any place (e.g. Chapel Hill, NC) — data comes from
//    the eBird proxy Worker. The live recent feed is deduped to one newest
//    report per species; choosing a species lazily fetches its full report set.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { BirdMap } from "@/components/BirdMap";
import { getBirdsNow, getSightings, getSpeciesIndex } from "@/lib/api";
import {
  fetchLiveArea,
  fetchLiveSpeciesObs,
  geoLabel,
  liveEnabled,
  readArea,
  searchPlaces,
  writeArea,
  type GeoResult,
  type LiveArea,
  type LiveSnapshot,
} from "@/lib/live";
import type { BirdsNow, SightingsFile, SpeciesIndex } from "@/lib/types";

interface HomeData {
  sightings: SightingsFile;
  index: SpeciesIndex;
  now: BirdsNow;
}

type View = "spots" | "intensity";

function AreaPicker({
  area,
  onPick,
  onHome,
}: {
  area: LiveArea | null;
  onPick: (a: LiveArea) => void;
  onHome: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced geocoding (Open-Meteo, keyless).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchPlaces(term));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setResults([]);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button
        onClick={onHome}
        className={`rounded-lg border px-3 py-2 text-sm ${
          area === null
            ? "border-transparent bg-leaf font-medium text-black"
            : "border-border bg-surface text-muted hover:text-fg"
        }`}
      >
        ⌂ Home area
      </button>
      <div ref={boxRef} className="relative min-w-0 flex-1 sm:max-w-sm">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={area ? area.label : "Anywhere in the US — try Chapel Hill"}
          aria-label="Search for a place"
          className={`w-full rounded-lg border px-3 py-2 text-sm placeholder:text-muted focus:border-leaf-dim ${
            area ? "border-leaf-dim bg-surface" : "border-border bg-surface"
          }`}
        />
        {(results.length > 0 || searching) && (
          <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
            {searching && <li className="px-3 py-2 text-xs text-muted">Searching…</li>}
            {results.map((g, i) => (
              <li key={`${g.latitude},${g.longitude},${i}`}>
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                  onClick={() => {
                    onPick({ lat: g.latitude, lng: g.longitude, label: geoLabel(g) });
                    setQ("");
                    setResults([]);
                  }}
                >
                  {geoLabel(g)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MapInner() {
  const params = useSearchParams();
  const [home, setHome] = useState<HomeData | null>(null);
  const [view, setView] = useState<View>("spots");
  const [filter, setFilter] = useState<string>(params.get("code") ?? "");
  const [area, setArea] = useState<LiveArea | null>(null);
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  // Full per-species report sets already fetched for the current area.
  const fetchedSpecies = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    Promise.all([getSightings(), getSpeciesIndex(), getBirdsNow()]).then(
      ([sightings, index, now]) => {
        if (alive) setHome({ sightings, index, now });
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  // Restore the last chosen area (live mode survives reloads).
  useEffect(() => {
    if (liveEnabled()) {
      const saved = readArea();
      if (saved) switchArea(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchArea(next: LiveArea | null) {
    setArea(next);
    setFilter("");
    setLive(null);
    setLiveError(null);
    fetchedSpecies.current = new Set();
    writeArea(next);
    if (!next) return;
    setLiveBusy(true);
    fetchLiveArea(next)
      .then((snapshot) => {
        setLive(snapshot);
        setLiveError(null);
      })
      .catch((e: Error) => setLiveError(e.message))
      .finally(() => setLiveBusy(false));
  }

  // Live mode + species filter: lazily pull that species' full report set.
  useEffect(() => {
    if (!area || !live || !filter || fetchedSpecies.current.has(filter)) return;
    fetchedSpecies.current.add(filter);
    fetchLiveSpeciesObs(filter, area)
      .then((points) => {
        if (points.length === 0) return;
        setLive((prev) =>
          prev
            ? {
                ...prev,
                sightings: {
                  ...prev.sightings,
                  species: { ...prev.sightings.species, [filter]: points },
                },
              }
            : prev,
        );
      })
      .catch(() => {
        fetchedSpecies.current.delete(filter); // retry on next selection
      });
  }, [filter, area, live]);

  const activeSightings = area ? live?.sightings : home?.sightings;

  const namesByCode = useMemo(() => {
    const names: Record<string, string> = {};
    if (home) {
      for (const [code, info] of Object.entries(home.index.species)) names[code] = info.com_name;
      for (const s of home.now.species) names[s.code] = s.com_name;
    }
    if (area && live) Object.assign(names, live.names);
    return names;
  }, [home, live, area]);

  const options = useMemo(() => {
    if (!activeSightings) return [];
    return Object.keys(activeSightings.species)
      .map((code) => ({ code, name: namesByCode[code] ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeSightings, namesByCode]);

  const stats = useMemo(() => {
    if (!activeSightings) return { reports: 0, locations: 0 };
    const codes = filter ? [filter] : Object.keys(activeSightings.species);
    const locs = new Set<string>();
    let reports = 0;
    for (const code of codes) {
      for (const p of activeSightings.species[code] ?? []) {
        reports += 1;
        locs.add(p.loc_id || `${p.lat},${p.lng}`);
      }
    }
    return { reports, locations: locs.size };
  }, [activeSightings, filter]);

  const loading = area ? liveBusy : !home;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-strong">Map</h1>
      <p className="mb-4 mt-1 text-sm text-muted">
        Where birds were reported in the last {activeSightings?.window_days ?? 14} days
        {area ? ` around ${area.label} (live from eBird)` : " in the home area"}. Tap a spot for
        details and Apple Maps directions.
      </p>

      {liveEnabled() && <AreaPicker area={area} onPick={switchArea} onHome={() => switchArea(null)} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-border" role="group">
          {(["spots", "intensity"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-2 text-sm capitalize ${
                view === v
                  ? "bg-leaf font-medium text-black"
                  : "bg-surface text-muted hover:text-fg"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter to one species"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm sm:max-w-xs"
        >
          <option value="">All species ({options.length})</option>
          {options.map(({ code, name }) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        {filter && (
          <button
            onClick={() => setFilter("")}
            className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-muted hover:text-fg"
            aria-label="Clear species filter"
          >
            ✕
          </button>
        )}
      </div>

      {liveError ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm">
          <p className="font-medium text-fg">Live lookup failed.</p>
          <p className="mt-1 text-muted">{liveError}</p>
        </div>
      ) : loading ? (
        <p className="text-sm text-muted">{area ? `Fetching birds around ${area.label}…` : "Loading…"}</p>
      ) : !activeSightings || (stats.reports === 0 && !filter) ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          {area
            ? "No recent reports found around this spot — try a nearby town."
            : (
              <>
                No sighting locations yet — run{" "}
                <code className="rounded bg-surface-2 px-1">python -m pipeline.update</code> (or
                wait for the nightly refresh).
              </>
            )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            {stats.reports} reports · {stats.locations} locations
            {filter ? ` · ${namesByCode[filter] ?? filter}` : ""}
            {area && !filter ? " · newest report per species — pick a species for all of its spots" : ""}
          </p>
          <BirdMap
            sightings={activeSightings}
            namesByCode={namesByCode}
            filterCode={filter || null}
            view={view}
            fitKey={area ? area.label : "home"}
          />
          <p className="mt-2 text-xs text-muted">
            {view === "intensity"
              ? "Intensity view isn't clickable — switch to Spots for details and directions."
              : "Spot size = " + (filter ? "reports of this species there." : "species seen there.")}
          </p>
        </>
      )}
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <MapInner />
    </Suspense>
  );
}
