"use client";

// SPECIES — /species/ is a full-taxonomy search (any of eBird's ~11k species,
// by common name, scientific name, or banding code); /species/?code=X is the
// detail page: photo, About, eBird-style weekly bar chart, songs & calls,
// last-seen directions, and a recent-reports mini map. Follows the global
// area (home = baked history, live area = sampled + live lookups).
// A query param (not a dynamic segment) so the static export needs no
// generateStaticParams and builds green with zero data present.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { BirdMap } from "@/components/BirdMap";
import { SearchIcon } from "@/components/icons";
import { SeasonBars } from "@/components/SeasonBars";
import { getBirdsNow, getNotable, getSeasonality, getSightings, getSpeciesIndex } from "@/lib/api";
import { useArea } from "@/lib/area";
import { allAboutBirdsUrl, appleMapsUrl, formatObs, relativeObs } from "@/lib/format";
import {
  fetchLiveSeasonality,
  fetchLiveSpeciesObs,
  type LiveSeasonality,
} from "@/lib/live";
import {
  callsEnabled,
  fetchCalls,
  fetchWikiInfo,
  xenoCantoSpeciesUrl,
  type CallsResult,
  type WikiInfo,
} from "@/lib/media";
import { lookupSpecies, searchSpecies, taxonomyEnabled, type TaxonInfo } from "@/lib/taxa";
import { currentWeek, peakWeek, weekLabel } from "@/lib/season";
import type {
  BirdsNow,
  NotableList,
  Seasonality,
  SightingPoint,
  SightingsFile,
  SpeciesIndex,
} from "@/lib/types";

interface Data {
  seasonality: Seasonality;
  index: SpeciesIndex;
  now: BirdsNow;
  notable: NotableList;
  sightings: SightingsFile;
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs">
      <span className="text-muted">{label} </span>
      <span className="font-medium text-fg">{value}</span>
    </span>
  );
}

function DirectionsChip({ lat, lng }: { lat: number; lng: number }) {
  return (
    <a
      href={appleMapsUrl(lat, lng)}
      target="_blank"
      rel="noreferrer"
      title="Directions in Apple Maps"
      className="rounded-lg border border-leaf-dim bg-surface px-3 py-1.5 text-xs font-medium text-leaf hover:bg-surface-2"
    >
      Directions ↗
    </a>
  );
}

// ---- /species/ (no code): search any species ---------------------------------

function SpeciesSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TaxonInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localIndex, setLocalIndex] = useState<SpeciesIndex | null>(null);

  // Offline/keyless fallback: search the baked local index instead.
  useEffect(() => {
    if (!taxonomyEnabled()) getSpeciesIndex().then(setLocalIndex);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      setError(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    let alive = true;
    const t = setTimeout(() => {
      if (taxonomyEnabled()) {
        searchSpecies(term)
          .then((rows) => {
            if (!alive) return;
            setResults(rows);
            setError(null);
          })
          .catch((e: Error) => {
            if (alive) setError(e.message);
          })
          .finally(() => {
            if (alive) setBusy(false);
          });
      } else if (localIndex) {
        const ql = term.toLowerCase();
        const rows = Object.entries(localIndex.species)
          .filter(
            ([, i]) =>
              i.com_name.toLowerCase().includes(ql) || i.sci_name.toLowerCase().includes(ql),
          )
          .slice(0, 12)
          .map(([code, i]) => ({
            code,
            com_name: i.com_name,
            sci_name: i.sci_name,
            family: i.family,
            order: i.order,
            banding: "",
          }));
        if (alive) {
          setResults(rows);
          setBusy(false);
        }
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, localIndex]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-strong">Species</h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        Search any of eBird&apos;s ~11,000 species — by common name, scientific name, or 4-letter
        banding code — and open its page: photo, songs, seasonality, and recent reports for your
        area.
      </p>
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          if (results && results.length > 0) router.push(`/species/?code=${results[0].code}`);
        }}
      >
        <SearchIcon
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Try “redstart”, “Setophaga”, or “AMRE”…"
          aria-label="Search species"
          autoFocus
          className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-3 text-sm placeholder:text-muted focus:border-leaf-dim"
        />
      </form>

      <div className="mt-3">
        {error ? (
          <p className="text-sm text-muted">Search failed: {error}</p>
        ) : busy && !results ? (
          <p className="text-sm text-muted">Searching…</p>
        ) : results && results.length === 0 ? (
          <p className="text-sm text-muted">No species match “{q.trim()}”.</p>
        ) : results ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {results.map((r) => (
              <li key={r.code}>
                <Link
                  href={`/species/?code=${r.code}`}
                  className="flex items-baseline gap-3 px-4 py-3 hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-strong">{r.com_name}</span>{" "}
                    <span className="text-xs italic text-muted">{r.sci_name}</span>
                  </span>
                  {r.family && (
                    <span className="hidden shrink-0 text-xs text-muted sm:block">{r.family}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">Type at least 2 characters.</p>
        )}
      </div>
    </div>
  );
}

// ---- /species/?code=X: the detail page ----------------------------------------

function SpeciesDetail({ code }: { code: string }) {
  const { area, ready } = useArea();
  const [data, setData] = useState<Data | null>(null);
  const [taxon, setTaxon] = useState<TaxonInfo | null | undefined>(undefined);
  const [liveSeason, setLiveSeason] = useState<LiveSeasonality | null>(null);
  const [liveSeasonBusy, setLiveSeasonBusy] = useState(false);
  const [liveSeasonError, setLiveSeasonError] = useState<string | null>(null);
  const [liveObs, setLiveObs] = useState<SightingPoint[] | null>(null);
  const [wiki, setWiki] = useState<WikiInfo | null>(null);
  const [calls, setCalls] = useState<CallsResult | null>(null);
  const [callsError, setCallsError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getSeasonality(),
      getSpeciesIndex(),
      getBirdsNow(),
      getNotable(),
      getSightings(),
    ]).then(([seasonality, index, now, notable, sightings]) => {
      if (alive) setData({ seasonality, index, now, notable, sightings });
    });
    return () => {
      alive = false;
    };
  }, []);

  // Taxonomy record — lets a searched species render even when it's absent
  // from the local data (and fills family/order in live mode).
  useEffect(() => {
    setTaxon(undefined);
    if (!code || !taxonomyEnabled()) {
      setTaxon(null);
      return;
    }
    let alive = true;
    lookupSpecies(code)
      .then((t) => {
        if (alive) setTaxon(t);
      })
      .catch(() => {
        if (alive) setTaxon(null);
      });
    return () => {
      alive = false;
    };
  }, [code]);

  // Live area: the sampled-year profile for its region (session + KV cached).
  useEffect(() => {
    setLiveSeason(null);
    setLiveSeasonError(null);
    if (!ready || !area) return;
    setLiveSeasonBusy(true);
    let alive = true;
    fetchLiveSeasonality(area)
      .then((s) => {
        if (alive) setLiveSeason(s);
      })
      .catch((e: Error) => {
        if (alive) setLiveSeasonError(e.message);
      })
      .finally(() => {
        if (alive) setLiveSeasonBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [ready, area]);

  // Live area: this species' recent reports around the picked spot.
  useEffect(() => {
    setLiveObs(null);
    if (!ready || !area || !code) return;
    let alive = true;
    fetchLiveSpeciesObs(code, area)
      .then((points) => {
        if (alive) setLiveObs(points);
      })
      .catch(() => {
        if (alive) setLiveObs([]);
      });
    return () => {
      alive = false;
    };
  }, [ready, area, code]);

  // Name resolution happens before the early returns so the media effects
  // below can run unconditionally (hooks rules).
  const info = data?.index.species[code];
  const liveName = liveSeason?.names[code];
  const homeNowRow = data?.now.species.find((sp) => sp.code === code);
  const name =
    liveName?.com_name ?? info?.com_name ?? homeNowRow?.com_name ?? taxon?.com_name ?? "";
  const sciName =
    liveName?.sci_name ?? info?.sci_name ?? homeNowRow?.sci_name ?? taxon?.sci_name ?? "";
  const family = info?.family || taxon?.family || "";
  const order = info?.order || taxon?.order || "";
  const displayName = name || code;

  // Wikipedia photo + About: common name first, scientific name fallback.
  useEffect(() => {
    setWiki(null);
    if (!name && !sciName) return;
    let alive = true;
    fetchWikiInfo(name || sciName, sciName || undefined).then((w) => {
      if (alive) setWiki(w);
    });
    return () => {
      alive = false;
    };
  }, [name, sciName]);

  // xeno-canto songs & calls (via the Worker proxy; needs the scientific name).
  useEffect(() => {
    setCalls(null);
    setCallsError(null);
    if (!sciName || !callsEnabled()) return;
    let alive = true;
    fetchCalls(sciName)
      .then((d) => {
        if (alive) setCalls(d);
      })
      .catch((e: Error) => {
        if (alive) setCallsError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [sciName]);

  // Recent-reports mini map (home: baked sightings; live: /species-obs).
  const mapPoints = useMemo(
    () => (area ? (liveObs ?? []) : (data?.sightings.species[code] ?? [])),
    [area, liveObs, data, code],
  );
  const mapSightings = useMemo(
    () => ({ generated_at: "", window_days: 14, species: { [code]: mapPoints } }),
    [code, mapPoints],
  );
  const mapNames = useMemo(() => ({ [code]: displayName }), [code, displayName]);

  const stillResolving =
    !info && !homeNowRow && !liveName && taxon === undefined && taxonomyEnabled();
  if (!data || (area && !ready) || stillResolving) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const { seasonality, notable } = data;
  const activeSeasonality = area ? liveSeason?.seasonality : seasonality;
  const season = activeSeasonality?.species.find((sp) => sp.code === code);
  const nowRow = area ? undefined : homeNowRow;
  const rareReports = area
    ? []
    : notable.sightings.filter((sighting) => sighting.code === code).slice(0, 5);
  const region = area ? (liveSeason?.region ?? "US") : (seasonality.regions[0] ?? "US-DC");
  const peak =
    season && activeSeasonality ? peakWeek(season, activeSeasonality.weeks_covered) : -1;
  const newestLive = liveObs && liveObs.length > 0 ? liveObs[0] : null;
  // Home mode: coordinates of the newest report come from the sightings file
  // (birds-now.json has only the location name).
  const newestHome = !area ? (data.sightings.species[code]?.[0] ?? null) : null;
  const unknownEverywhere = !info && !season && !nowRow && !liveName && taxon === null;

  if (unknownEverywhere && !area) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-strong">{code}</h1>
        <p className="mt-3 text-sm text-muted">
          Unknown species code — try the{" "}
          <Link href="/species/" className="text-leaf">
            species search
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-strong">{displayName}</h1>
      <p className="mt-0.5 text-sm italic text-muted">{sciName}</p>
      {(family || order) && (
        <p className="mt-0.5 text-xs text-muted">
          {family}
          {family && order ? " · " : ""}
          {order}
        </p>
      )}
      {area && <p className="mt-0.5 text-xs text-muted">around {area.label} · live from eBird</p>}

      {wiki?.image && (
        <figure className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- static export, remote image */}
          <img
            src={wiki.image}
            alt={displayName}
            loading="lazy"
            className="max-h-80 w-full object-cover"
          />
          <figcaption className="px-3 py-1.5 text-[11px] text-muted">
            Photo:{" "}
            <a
              href={wiki.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-fg hover:underline"
            >
              {wiki.pageTitle} — Wikipedia ↗
            </a>
          </figcaption>
        </figure>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {area ? (
          <>
            {liveObs === null ? (
              <Chip label="nearby" value="checking recent reports…" />
            ) : newestLive ? (
              <>
                <Chip
                  label="last seen"
                  value={`${relativeObs(newestLive.obs_dt)} · ${newestLive.loc_name}`}
                />
                <DirectionsChip lat={newestLive.lat} lng={newestLive.lng} />
                <Chip label="reports (14d)" value={String(liveObs.length)} />
              </>
            ) : (
              <Chip label="nearby" value="not reported in the last 14 days" />
            )}
            {season && (
              <Chip
                label="sampled year"
                value={`seen ${season.total_days} of ${liveSeason?.sampleCount ?? 24} days`}
              />
            )}
          </>
        ) : (
          <>
            {nowRow ? (
              <>
                <Chip
                  label="last seen"
                  value={`${relativeObs(nowRow.last_seen)} · ${nowRow.last_loc_name}`}
                />
                {newestHome && <DirectionsChip lat={newestHome.lat} lng={newestHome.lng} />}
                <Chip label="reported" value={`${nowRow.days_reported_14}/14 days`} />
              </>
            ) : (
              <Chip label="nearby" value="not reported in the last 14 days" />
            )}
            {season && <Chip label="in history" value={`${season.total_days} days`} />}
          </>
        )}
        {peak >= 0 && <Chip label="peak" value={weekLabel(peak)} />}
      </div>

      {wiki?.extract && (
        <section className="mt-6 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-strong">About</h2>
          <p className="text-sm leading-relaxed text-fg/90">{wiki.extract}</p>
          <p className="mt-2 text-xs">
            <a
              href={wiki.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-leaf hover:underline"
            >
              Read more on Wikipedia ↗
            </a>
          </p>
        </section>
      )}

      <section className="mt-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-strong">Season</h2>
        {area && liveSeasonBusy ? (
          <p className="text-xs text-muted">
            Sampling a year of eBird history around {area.label} — the first look at a region
            takes a few seconds…
          </p>
        ) : area && liveSeasonError ? (
          <p className="text-xs text-muted">Seasonal lookup failed: {liveSeasonError}</p>
        ) : season && activeSeasonality ? (
          <>
            <SeasonBars
              sp={season}
              covered={activeSeasonality.weeks_covered}
              nowWeek={currentWeek()}
            />
            <p className="mt-2 text-xs text-muted">
              {area
                ? `Sampled ${liveSeason?.sampleCount ?? 24} days across the past year (${liveSeason?.regionName ?? region}, ${activeSeasonality.first_date} → ${activeSeasonality.last_date}).`
                : `From daily region records (${seasonality.regions.join(", ")}${
                    seasonality.first_date
                      ? `, ${seasonality.first_date} → ${seasonality.last_date}`
                      : ""
                  }).`}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">
            {area
              ? `Not seen on enough sampled days around ${area.label} for a chart (needs 2+ of the sampled year).`
              : "No recent local reports of this species — the chart appears once it shows up in the region history."}
          </p>
        )}
      </section>

      {callsEnabled() && sciName && (
        <section className="mt-4 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-strong">Songs &amp; calls</h2>
          {callsError ? (
            <p className="text-xs text-muted">Recording lookup failed: {callsError}</p>
          ) : !calls ? (
            <p className="text-xs text-muted">Loading recordings…</p>
          ) : calls.recordings.length === 0 ? (
            <p className="text-xs text-muted">No recordings on xeno-canto for this species.</p>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {calls.recordings.slice(0, 5).map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <audio
                      controls
                      preload="none"
                      src={r.file}
                      className="h-9 w-full sm:w-72 sm:shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium capitalize text-strong">
                        {r.type || "recording"}
                        {r.length ? ` · ${r.length}` : ""}
                        {r.q ? ` · quality ${r.q}` : ""}
                      </p>
                      <p className="truncate text-[11px] text-muted">
                        © {r.rec}
                        {r.cnt ? ` · ${r.cnt}` : ""} ·{" "}
                        <a
                          href={`https://xeno-canto.org/${r.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-fg hover:underline"
                        >
                          XC{r.id} ↗
                        </a>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                <a
                  href={xenoCantoSpeciesUrl(sciName)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-leaf hover:underline"
                >
                  {calls.total > 5
                    ? `All ${calls.total} recordings on xeno-canto ↗`
                    : "More on xeno-canto ↗"}
                </a>
              </p>
            </>
          )}
        </section>
      )}

      {mapPoints.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-strong">
            Recent reports {area ? `around ${area.label}` : "nearby"}
          </h2>
          <BirdMap
            compact
            sightings={mapSightings}
            namesByCode={mapNames}
            filterCode={code}
            view="spots"
            fitKey={`sp:${code}:${area ? area.label : "home"}`}
          />
          <p className="mt-1 text-xs text-muted">
            Every located report from the last 14 days — tap a spot for dates and directions.
          </p>
        </section>
      )}

      {rareReports.length > 0 && (
        <section className="mt-4 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-strong">Recent notable reports</h2>
          <ul className="space-y-1 text-xs text-muted">
            {rareReports.map((r, i) => (
              <li key={`${r.checklist_id}-${i}`}>
                {formatObs(r.obs_date)} · {r.loc_name}
                {r.checklist_id && (
                  <>
                    {" · "}
                    <a
                      href={`https://ebird.org/checklist/${r.checklist_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-leaf hover:underline"
                    >
                      checklist ↗
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 flex flex-wrap gap-3 text-xs">
        <Link href={`/?code=${code}`} className="text-leaf hover:underline">
          View on the full map →
        </Link>
        <Link href="/species/" className="text-leaf hover:underline">
          Search another species →
        </Link>
        <a
          href={`https://ebird.org/species/${code}`}
          target="_blank"
          rel="noreferrer"
          className="text-leaf hover:underline"
        >
          eBird species page ↗
        </a>
        <a
          href={`https://ebird.org/species/${code}/${region}`}
          target="_blank"
          rel="noreferrer"
          className="text-leaf hover:underline"
        >
          eBird in {region} ↗
        </a>
        {displayName !== code && (
          <a
            href={allAboutBirdsUrl(displayName)}
            target="_blank"
            rel="noreferrer"
            className="text-leaf hover:underline"
          >
            All About Birds ↗
          </a>
        )}
      </p>
    </div>
  );
}

function SpeciesRouter() {
  const code = useSearchParams().get("code") ?? "";
  if (!code) return <SpeciesSearch />;
  return <SpeciesDetail code={code} />;
}

export default function SpeciesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <SpeciesRouter />
    </Suspense>
  );
}
