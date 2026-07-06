"use client";

// SPECIES DETAIL — /species/?code=carwre
// A query param (not a dynamic segment) so the static export needs no
// generateStaticParams and builds green with zero data present.
// Follows the global area: home shows the baked history; a live area shows
// the sampled-year calendar plus that area's recent reports. Adds a Wikipedia
// photo and xeno-canto songs/calls for every bird.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { SeasonCalendar } from "@/components/SeasonCalendar";
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
  fetchWikiPhoto,
  xenoCantoSpeciesUrl,
  type CallsResult,
  type WikiPhoto,
} from "@/lib/media";
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

function SpeciesDetail() {
  const code = useSearchParams().get("code") ?? "";
  const { area, ready } = useArea();
  const [data, setData] = useState<Data | null>(null);
  const [liveSeason, setLiveSeason] = useState<LiveSeasonality | null>(null);
  const [liveSeasonBusy, setLiveSeasonBusy] = useState(false);
  const [liveSeasonError, setLiveSeasonError] = useState<string | null>(null);
  const [liveObs, setLiveObs] = useState<SightingPoint[] | null>(null);
  const [photo, setPhoto] = useState<WikiPhoto | null>(null);
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

  // Name resolution has to happen before the early returns so the media
  // effects below can run unconditionally (hooks rules).
  const info = data?.index.species[code];
  const liveName = liveSeason?.names[code];
  const homeNowRow = data?.now.species.find((sp) => sp.code === code);
  const name = liveName?.com_name ?? info?.com_name ?? homeNowRow?.com_name ?? "";
  const sciName = liveName?.sci_name ?? info?.sci_name ?? homeNowRow?.sci_name ?? "";

  // Wikipedia photo: common name first, scientific name fallback.
  useEffect(() => {
    setPhoto(null);
    if (!name && !sciName) return;
    let alive = true;
    fetchWikiPhoto(name || sciName, sciName || undefined).then((p) => {
      if (alive) setPhoto(p);
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

  if (!code) {
    return (
      <p className="text-sm text-muted">
        No species selected — pick one from{" "}
        <Link href="/" className="text-leaf">
          Explore
        </Link>
        .
      </p>
    );
  }
  if (!data || (area && !ready)) return <p className="text-sm text-muted">Loading…</p>;

  const { seasonality, notable } = data;
  const activeSeasonality = area ? liveSeason?.seasonality : seasonality;
  const season = activeSeasonality?.species.find((sp) => sp.code === code);
  const nowRow = area ? undefined : homeNowRow;
  const rareReports = area
    ? []
    : notable.sightings.filter((sighting) => sighting.code === code).slice(0, 5);
  const displayName = name || code;
  const region = area ? (liveSeason?.region ?? "US") : (seasonality.regions[0] ?? "US-DC");
  const peak =
    season && activeSeasonality ? peakWeek(season, activeSeasonality.weeks_covered) : -1;
  const newestLive = liveObs && liveObs.length > 0 ? liveObs[0] : null;
  // Home mode: coordinates of the newest report come from the sightings file
  // (birds-now.json has only the location name).
  const newestHome = !area ? (data.sightings.species[code]?.[0] ?? null) : null;

  if (!area && !info && !season && !nowRow) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-strong">{code}</h1>
        <p className="mt-3 text-sm text-muted">
          This species isn&apos;t in the current data. It may appear after the next pipeline run.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-strong">{displayName}</h1>
      <p className="mt-0.5 text-sm italic text-muted">{sciName}</p>
      {!area && info && (
        <p className="mt-0.5 text-xs text-muted">
          {info.family}
          {info.order ? ` · ${info.order}` : ""}
        </p>
      )}
      {area && <p className="mt-0.5 text-xs text-muted">around {area.label} · live from eBird</p>}

      {photo && (
        <figure className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- static export, remote image */}
          <img
            src={photo.image}
            alt={displayName}
            loading="lazy"
            className="max-h-80 w-full object-cover"
          />
          <figcaption className="px-3 py-1.5 text-[11px] text-muted">
            Photo:{" "}
            <a
              href={photo.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-fg hover:underline"
            >
              {photo.pageTitle} — Wikipedia ↗
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

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-strong">Season calendar</h2>
        {area && liveSeasonBusy ? (
          <p className="text-xs text-muted">
            Sampling a year of eBird history around {area.label} — the first look at a region
            takes a few seconds…
          </p>
        ) : area && liveSeasonError ? (
          <p className="text-xs text-muted">Seasonal lookup failed: {liveSeasonError}</p>
        ) : season && activeSeasonality ? (
          <>
            <SeasonCalendar
              sp={season}
              covered={activeSeasonality.weeks_covered}
              nowWeek={currentWeek()}
            />
            <p className="mt-2 text-xs text-muted">
              {area
                ? `Share of sampled days reported (${liveSeason?.regionName ?? region}, ${activeSeasonality.first_date} → ${activeSeasonality.last_date} — ${liveSeason?.sampleCount ?? 24} days sampled).`
                : `Share of days reported (${seasonality.regions.join(", ")}${
                    seasonality.first_date
                      ? `, ${seasonality.first_date} → ${seasonality.last_date}`
                      : ""
                  }).`}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">
            {area
              ? `Not seen on enough sampled days around ${area.label} for a calendar (needs 2+ of the sampled year).`
              : "Not enough history for a season calendar yet (a species needs at least a few recorded days). Run the backfill to load past years."}
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
                  {calls.total > 5 ? `All ${calls.total} recordings on xeno-canto ↗` : "More on xeno-canto ↗"}
                </a>
              </p>
            </>
          )}
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
          View on map →
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

export default function SpeciesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <SpeciesDetail />
    </Suspense>
  );
}
