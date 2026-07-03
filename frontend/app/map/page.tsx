"use client";

// MAP — recent sighting reports as clickable spots or an intensity heat layer,
// filterable to a single species. /map/?code=X preselects the filter.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { BirdMap } from "@/components/BirdMap";
import { getBirdsNow, getSightings, getSpeciesIndex } from "@/lib/api";
import type { BirdsNow, SightingsFile, SpeciesIndex } from "@/lib/types";

interface Data {
  sightings: SightingsFile;
  index: SpeciesIndex;
  now: BirdsNow;
}

type View = "spots" | "intensity";

function MapInner() {
  const params = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [view, setView] = useState<View>("spots");
  const [filter, setFilter] = useState<string>(params.get("code") ?? "");

  useEffect(() => {
    let alive = true;
    Promise.all([getSightings(), getSpeciesIndex(), getBirdsNow()]).then(
      ([sightings, index, now]) => {
        if (alive) setData({ sightings, index, now });
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const namesByCode = useMemo(() => {
    if (!data) return {};
    const names: Record<string, string> = {};
    for (const s of data.now.species) names[s.code] = s.com_name;
    for (const [code, info] of Object.entries(data.index.species)) names[code] = info.com_name;
    return names;
  }, [data]);

  const options = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.sightings.species)
      .map((code) => ({ code, name: namesByCode[code] ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, namesByCode]);

  const stats = useMemo(() => {
    if (!data) return { reports: 0, locations: 0 };
    const codes = filter ? [filter] : Object.keys(data.sightings.species);
    const locs = new Set<string>();
    let reports = 0;
    for (const code of codes) {
      for (const p of data.sightings.species[code] ?? []) {
        reports += 1;
        locs.add(p.loc_id || `${p.lat},${p.lng}`);
      }
    }
    return { reports, locations: locs.size };
  }, [data, filter]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-strong">Map</h1>
      <p className="mb-4 mt-1 text-sm text-muted">
        Where birds were reported in the last {data?.sightings.window_days ?? 14} days. Tap a spot
        for details and Apple Maps directions; Intensity shows report density.
      </p>

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

      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : stats.reports === 0 && !filter ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          No sighting locations yet — run <code className="rounded bg-surface-2 px-1">python -m
          pipeline.update</code> (or wait for the nightly refresh).
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            {stats.reports} reports · {stats.locations} locations
            {filter ? ` · ${namesByCode[filter] ?? filter}` : ""}
          </p>
          <BirdMap
            sightings={data.sightings}
            namesByCode={namesByCode}
            filterCode={filter || null}
            view={view}
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
