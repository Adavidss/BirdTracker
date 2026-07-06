"use client";

// SPECIES DETAIL — /species/?code=carwre
// A query param (not a dynamic segment) so the static export needs no
// generateStaticParams and builds green with zero data present.
// Follows the global area: home shows the baked history; a live area shows
// the sampled-year chart plus that area's recent reports.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { SeasonalityChart } from "@/components/SeasonalityChart";
import { getBirdsNow, getNotable, getSeasonality, getSpeciesIndex } from "@/lib/api";
import { useArea } from "@/lib/area";
import {
  fetchLiveSeasonality,
  fetchLiveSpeciesObs,
  type LiveSeasonality,
} from "@/lib/live";
import { allAboutBirdsUrl, formatObs, relativeObs } from "@/lib/format";
import { currentWeek, peakWeek, weekLabel } from "@/lib/season";
import type { BirdsNow, NotableList, Seasonality, SightingPoint, SpeciesIndex } from "@/lib/types";

interface Data {
  seasonality: Seasonality;
  index: SpeciesIndex;
  now: BirdsNow;
  notable: NotableList;
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs">
      <span className="text-muted">{label} </span>
      <span className="font-medium text-fg">{value}</span>
    </span>
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

  useEffect(() => {
    let alive = true;
    Promise.all([getSeasonality(), getSpeciesIndex(), getBirdsNow(), getNotable()]).then(
      ([seasonality, index, now, notable]) => {
        if (alive) setData({ seasonality, index, now, notable });
      },
    );
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

  const { seasonality, index, now, notable } = data;
  const info = index.species[code];
  const liveName = liveSeason?.names[code];
  const activeSeasonality = area ? liveSeason?.seasonality : seasonality;
  const season = activeSeasonality?.species.find((sp) => sp.code === code);
  const nowRow = area ? undefined : now.species.find((sp) => sp.code === code);
  const rareReports = area
    ? []
    : notable.sightings.filter((sighting) => sighting.code === code).slice(0, 5);
  const name = liveName?.com_name ?? info?.com_name ?? nowRow?.com_name ?? code;
  const sciName = liveName?.sci_name ?? info?.sci_name ?? nowRow?.sci_name ?? "";
  const region = area ? (liveSeason?.region ?? "US") : (seasonality.regions[0] ?? "US-DC");
  const peak =
    season && activeSeasonality ? peakWeek(season, activeSeasonality.weeks_covered) : -1;
  const newestLive = liveObs && liveObs.length > 0 ? liveObs[0] : null;

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
      <h1 className="text-2xl font-semibold text-strong">{name}</h1>
      <p className="mt-0.5 text-sm italic text-muted">{sciName}</p>
      {!area && info && (
        <p className="mt-0.5 text-xs text-muted">
          {info.family}
          {info.order ? ` · ${info.order}` : ""}
        </p>
      )}
      {area && <p className="mt-0.5 text-xs text-muted">around {area.label} · live from eBird</p>}

      <div className="mt-4 flex flex-wrap gap-2">
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
        <h2 className="mb-1 text-sm font-semibold text-strong">Season</h2>
        {area && liveSeasonBusy ? (
          <p className="text-xs text-muted">
            Sampling a year of eBird history around {area.label} — the first look at a region
            takes a few seconds…
          </p>
        ) : area && liveSeasonError ? (
          <p className="text-xs text-muted">Seasonal lookup failed: {liveSeasonError}</p>
        ) : season && activeSeasonality ? (
          <>
            <SeasonalityChart
              sp={season}
              covered={activeSeasonality.weeks_covered}
              nowWeek={currentWeek()}
            />
            <p className="mt-1 text-xs text-muted">
              {area
                ? `Share of sampled days reported (${liveSeason?.regionName ?? region}, ${activeSeasonality.first_date} → ${activeSeasonality.last_date} — ${liveSeason?.sampleCount ?? 24} days sampled).`
                : `Share of days reported (${seasonality.regions.join(", ")}${
                    seasonality.first_date
                      ? `, ${seasonality.first_date} → ${seasonality.last_date}`
                      : ""
                  }).`}{" "}
              Dimmed bars = thin coverage; dashed line = this week.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">
            {area
              ? `Not seen on enough sampled days around ${area.label} for a chart (needs 2+ of the sampled year).`
              : "Not enough history for a seasonal chart yet (a species needs at least a few recorded days). Run the backfill to load past years."}
          </p>
        )}
      </section>

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
        {name !== code && (
          <a
            href={allAboutBirdsUrl(name)}
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
