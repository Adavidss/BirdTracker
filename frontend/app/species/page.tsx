"use client";

// SPECIES DETAIL — /species/?code=carwre
// A query param (not a dynamic segment) so the static export needs no
// generateStaticParams and builds green with zero data present.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { SeasonalityChart } from "@/components/SeasonalityChart";
import { getBirdsNow, getNotable, getSeasonality, getSpeciesIndex } from "@/lib/api";
import { allAboutBirdsUrl, formatObs, relativeObs } from "@/lib/format";
import { currentWeek, peakWeek, weekLabel } from "@/lib/season";
import type { BirdsNow, NotableList, Seasonality, SpeciesIndex } from "@/lib/types";

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
  const [data, setData] = useState<Data | null>(null);

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

  if (!code) {
    return (
      <p className="text-sm text-muted">
        No species selected — pick one from the <Link href="/" className="text-leaf">Now</Link>{" "}
        list.
      </p>
    );
  }
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  const { seasonality, index, now, notable } = data;
  const info = index.species[code];
  const season = seasonality.species.find((sp) => sp.code === code);
  const nowRow = now.species.find((sp) => sp.code === code);
  const rareReports = notable.sightings.filter((sighting) => sighting.code === code).slice(0, 5);
  const name = info?.com_name ?? nowRow?.com_name ?? code;
  const sciName = info?.sci_name ?? nowRow?.sci_name ?? "";
  const region = seasonality.regions[0] ?? "US-DC";
  const peak = season ? peakWeek(season, seasonality.weeks_covered) : -1;

  if (!info && !season && !nowRow) {
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
      {info && (
        <p className="mt-0.5 text-xs text-muted">
          {info.family}
          {info.order ? ` · ${info.order}` : ""}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
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
        {peak >= 0 && <Chip label="peak" value={weekLabel(peak)} />}
      </div>

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-strong">Season</h2>
        {season ? (
          <>
            <SeasonalityChart
              sp={season}
              covered={seasonality.weeks_covered}
              nowWeek={currentWeek()}
            />
            <p className="mt-1 text-xs text-muted">
              Share of days reported ({seasonality.regions.join(", ")}
              {seasonality.first_date
                ? `, ${seasonality.first_date} → ${seasonality.last_date}`
                : ""}
              ). Dimmed bars = thin coverage; dashed line = this week.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">
            Not enough history for a seasonal chart yet (a species needs at least a few recorded
            days). Run the backfill to load past years.
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
