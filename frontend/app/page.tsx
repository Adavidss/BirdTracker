"use client";

// EXPLORE — the whole app on one map. Recent sightings, rare reports, and
// hotspots are toggleable layers with matching list panels below; the area
// comes from the global nav picker (home = baked JSON, anywhere = live eBird
// through the Worker). /?code=X preselects the species filter; /?layer=rare or
// /?layer=hotspots (old-page redirects) turn that layer on.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { BirdMap } from "@/components/BirdMap";
import { HotspotRows } from "@/components/HotspotRows";
import { RareCards } from "@/components/RareCards";
import { SpeciesList } from "@/components/SpeciesList";
import {
  getBirdsNow,
  getHotspots,
  getNotable,
  getSeasonality,
  getSightings,
  getSpeciesIndex,
} from "@/lib/api";
import { useArea } from "@/lib/area";
import {
  fetchLiveArea,
  fetchLiveHotspots,
  fetchLiveNotable,
  fetchLiveSpeciesObs,
  peekLiveSeasonality,
  type LiveSeasonality,
  type LiveSnapshot,
} from "@/lib/live";
import type {
  BirdsNow,
  Hotspot,
  HotspotList,
  NotableList,
  NotableSighting,
  Seasonality,
  SightingsFile,
  SpeciesIndex,
} from "@/lib/types";

interface HomeData {
  sightings: SightingsFile;
  index: SpeciesIndex;
  now: BirdsNow;
  seasonality: Seasonality;
  notable: NotableList;
  hotspots: HotspotList;
}

type View = "spots" | "intensity";

interface Layers {
  sightings: boolean;
  rare: boolean;
  hotspots: boolean;
}

const LAYERS_KEY = "bt_layers";
const DEFAULT_LAYERS: Layers = { sightings: true, rare: false, hotspots: false };

function readLayers(): Layers {
  try {
    const raw = localStorage.getItem(LAYERS_KEY);
    if (!raw) return DEFAULT_LAYERS;
    const l = JSON.parse(raw) as Partial<Layers>;
    return {
      sightings: l.sightings !== false,
      rare: l.rare === true,
      hotspots: l.hotspots === true,
    };
  } catch {
    return DEFAULT_LAYERS;
  }
}

const EMPTY_SEASONALITY: Seasonality = {
  generated_at: "",
  regions: [],
  first_date: null,
  last_date: null,
  weeks_covered: new Array(48).fill(0),
  species: [],
};
const EMPTY_INDEX: SpeciesIndex = { generated_at: "", species: {} };

const LAYER_META = [
  { key: "sightings", label: "Sightings", dot: "bg-leaf" },
  { key: "rare", label: "Rare", dot: "bg-amber-500" },
  { key: "hotspots", label: "Hotspots", dot: "bg-sky-400" },
] as const;

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count: number | null;
  children: React.ReactNode;
}) {
  return (
    <details open className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-strong">
        {title}
        {count !== null ? <span className="ml-1.5 font-normal text-muted">· {count}</span> : ""}
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

function ExploreInner() {
  const params = useSearchParams();
  const { area, ready } = useArea();

  const [home, setHome] = useState<HomeData | null>(null);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [view, setView] = useState<View>("spots");
  const [filter, setFilter] = useState<string>(params.get("code") ?? "");

  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveNotable, setLiveNotable] = useState<NotableSighting[] | null>(null);
  const [liveHotspots, setLiveHotspots] = useState<Hotspot[] | null>(null);
  const [auxError, setAuxError] = useState<string | null>(null);
  const [liveSeason, setLiveSeason] = useState<LiveSeasonality | null>(null);

  // Full per-species report sets already fetched for the current area.
  const fetchedSpecies = useRef(new Set<string>());
  // Identity of the area a live response belongs to (drops stale responses).
  const areaKeyRef = useRef<string | null>(null);
  const prevAreaKey = useRef<string | null | undefined>(undefined);

  // Saved layer prefs + URL intents, applied after hydration.
  useEffect(() => {
    const saved = readLayers();
    const fromUrl = params.get("layer");
    if (fromUrl === "rare") saved.rare = true;
    if (fromUrl === "hotspots") saved.hotspots = true;
    if (params.get("code")) saved.sightings = true;
    setLayers(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleLayer(key: keyof Layers) {
    setLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(LAYERS_KEY, JSON.stringify(next));
      } catch {
        // private mode — prefs just won't persist
      }
      return next;
    });
  }

  // Home data: cheap static JSON, also the name fallback in live mode.
  useEffect(() => {
    let alive = true;
    Promise.all([
      getSightings(),
      getSpeciesIndex(),
      getBirdsNow(),
      getSeasonality(),
      getNotable(),
      getHotspots(),
    ]).then(([sightings, index, now, seasonality, notable, hotspots]) => {
      if (alive) setHome({ sightings, index, now, seasonality, notable, hotspots });
    });
    return () => {
      alive = false;
    };
  }, []);

  // Area changes: reset live state and fetch the recent-obs snapshot.
  useEffect(() => {
    if (!ready) return;
    const key = area ? `${area.lat},${area.lng}` : null;
    const isSwitch = prevAreaKey.current !== undefined && prevAreaKey.current !== key;
    prevAreaKey.current = key;
    areaKeyRef.current = key;
    if (isSwitch) setFilter(""); // keep a ?code= deep link through the initial restore
    setLive(null);
    setLiveError(null);
    setLiveNotable(null);
    setLiveHotspots(null);
    setAuxError(null);
    fetchedSpecies.current = new Set();
    if (!area) return;
    setLiveBusy(true);
    fetchLiveArea(area)
      .then((snapshot) => {
        if (areaKeyRef.current !== key) return;
        setLive(snapshot);
        setLiveError(null);
      })
      .catch((e: Error) => {
        if (areaKeyRef.current === key) setLiveError(e.message);
      })
      .finally(() => {
        if (areaKeyRef.current === key) setLiveBusy(false);
      });
  }, [ready, area]);

  // Live rare layer, fetched lazily the first time it's toggled on.
  useEffect(() => {
    if (!ready || !area || !layers.rare || liveNotable) return;
    const key = areaKeyRef.current;
    fetchLiveNotable(area)
      .then((rows) => {
        if (areaKeyRef.current === key) setLiveNotable(rows);
      })
      .catch((e: Error) => {
        if (areaKeyRef.current === key) {
          setLiveNotable([]);
          setAuxError(`Rare lookup failed: ${e.message}`);
        }
      });
  }, [ready, area, layers.rare, liveNotable]);

  // Live hotspot layer, same deal.
  useEffect(() => {
    if (!ready || !area || !layers.hotspots || liveHotspots) return;
    const key = areaKeyRef.current;
    fetchLiveHotspots(area)
      .then((rows) => {
        if (areaKeyRef.current === key) setLiveHotspots(rows);
      })
      .catch((e: Error) => {
        if (areaKeyRef.current === key) {
          setLiveHotspots([]);
          setAuxError(`Hotspot lookup failed: ${e.message}`);
        }
      });
  }, [ready, area, layers.hotspots, liveHotspots]);

  // Sparklines for the live species panel — only if Timing already sampled
  // this area (never triggers the 24-call fetch itself).
  useEffect(() => {
    setLiveSeason(null);
    if (!area) return;
    const p = peekLiveSeasonality(area);
    if (!p) return;
    let alive = true;
    p.then((s) => {
      if (alive) setLiveSeason(s);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [area]);

  // Live mode + species filter: lazily pull that species' full report set.
  useEffect(() => {
    if (!area || !live || !filter || fetchedSpecies.current.has(filter)) return;
    fetchedSpecies.current.add(filter);
    const key = areaKeyRef.current;
    fetchLiveSpeciesObs(filter, area)
      .then((points) => {
        if (points.length === 0 || areaKeyRef.current !== key) return;
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

  // Per-layer data for map + panels (null = still loading / layer unavailable).
  const nowRows = area ? (live?.now ?? null) : (home?.now.species ?? null);
  const notableData = area ? liveNotable : (home?.notable.sightings ?? null);
  const hotspotData = area ? liveHotspots : (home?.hotspots.hotspots ?? null);
  const panelSeason = area
    ? (liveSeason?.seasonality ?? EMPTY_SEASONALITY)
    : (home?.seasonality ?? EMPTY_SEASONALITY);

  const layerCount = (key: keyof Layers): number | null => {
    if (key === "sightings") return activeSightings ? options.length : null;
    if (key === "rare") return notableData ? notableData.length : null;
    return hotspotData ? hotspotData.length : null;
  };

  const loading = area ? liveBusy : !home;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-strong">Explore</h1>
      <p className="mb-4 mt-1 text-sm text-muted">
        Bird activity from the last {activeSightings?.window_days ?? 14} days
        {area ? ` around ${area.label} (live from eBird)` : " in the home area"}. Toggle layers,
        tap a spot for details and directions — change the place from the 📍 picker above.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Map layers">
          {LAYER_META.map(({ key, label, dot }) => {
            const on = layers[key];
            const count = on ? layerCount(key) : null;
            return (
              <button
                key={key}
                onClick={() => toggleLayer(key)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                  on
                    ? "border-transparent bg-surface-2 font-medium text-strong"
                    : "border-border bg-surface text-muted hover:text-fg"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${on ? dot : "bg-border"}`}
                />
                {label}
                {count !== null && <span className="text-xs text-muted">{count}</span>}
              </button>
            );
          })}
        </div>
        {layers.sightings && (
          <>
            <div className="flex overflow-hidden rounded-lg border border-border" role="group">
              {(["spots", "intensity"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-sm capitalize ${
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
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm sm:max-w-xs"
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
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-muted hover:text-fg"
                aria-label="Clear species filter"
              >
                ✕
              </button>
            )}
          </>
        )}
      </div>

      {auxError && <p className="mb-2 text-xs text-amber-500">{auxError}</p>}

      {liveError ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm">
          <p className="font-medium text-fg">Live lookup failed.</p>
          <p className="mt-1 text-muted">{liveError}</p>
        </div>
      ) : loading ? (
        <p className="text-sm text-muted">
          {area ? `Fetching birds around ${area.label}…` : "Loading…"}
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            {layers.sightings
              ? `${stats.reports} reports · ${stats.locations} locations` +
                (filter ? ` · ${namesByCode[filter] ?? filter}` : "")
              : "Sightings layer off"}
            {area && layers.sightings && !filter
              ? " · newest report per species — pick a species for all of its spots"
              : ""}
          </p>
          {layers.sightings && stats.reports === 0 && !filter && (
            <p className="mb-2 text-xs text-muted">
              {area
                ? "No recent reports found around this spot — try a nearby town."
                : "No sighting data yet — run the pipeline once (see README)."}
            </p>
          )}
          <BirdMap
            sightings={layers.sightings ? (activeSightings ?? null) : null}
            namesByCode={namesByCode}
            filterCode={filter || null}
            view={view}
            notable={layers.rare ? notableData : null}
            hotspotSpots={layers.hotspots ? hotspotData : null}
            fitKey={area ? area.label : "home"}
          />
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {layers.sightings && (
              <span>
                <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-leaf" />
                {view === "intensity"
                  ? "intensity of reports (not clickable — switch to Spots)"
                  : "spot size = " + (filter ? "reports of this species" : "species seen there")}
              </span>
            )}
            {layers.rare && (
              <span>
                <span
                  aria-hidden
                  className="mr-1 inline-block h-2 w-2 rotate-45 bg-amber-500"
                />
                rare / notable reports
              </span>
            )}
            {layers.hotspots && (
              <span>
                <span
                  aria-hidden
                  className="mr-1 inline-block h-2 w-2 rounded-full border-2 border-sky-400"
                />
                eBird hotspots
              </span>
            )}
          </p>

          {layers.sightings && (
            <Panel title="Species around now" count={nowRows ? nowRows.length : null}>
              {!nowRows ? (
                <p className="text-sm text-muted">Loading…</p>
              ) : nowRows.length === 0 ? (
                <p className="text-sm text-muted">No species reported recently here.</p>
              ) : (
                <SpeciesList
                  species={nowRows}
                  seasonality={panelSeason}
                  index={home?.index ?? EMPTY_INDEX}
                  showDays14={!area}
                />
              )}
            </Panel>
          )}
          {layers.rare && (
            <Panel title="Rare nearby" count={notableData ? notableData.length : null}>
              {!notableData ? (
                <p className="text-sm text-muted">Loading…</p>
              ) : (
                <RareCards sightings={notableData} />
              )}
            </Panel>
          )}
          {layers.hotspots && (
            <Panel title="Hotspots" count={hotspotData ? hotspotData.length : null}>
              {!hotspotData ? (
                <p className="text-sm text-muted">Loading…</p>
              ) : (
                <HotspotRows hotspots={hotspotData} />
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <ExploreInner />
    </Suspense>
  );
}
