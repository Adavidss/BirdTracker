"use client";

// TIMING — the star feature: who's arriving, who's leaving, and what to expect
// in any month. Home area: the accumulated daily region history (rich). Any
// other area: a 24-day sampled year for its eBird region via the Worker —
// coarser, but honest seasonal timing anywhere.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SeasonalityChart } from "@/components/SeasonalityChart";
import { getSeasonality, getSpeciesIndex } from "@/lib/api";
import { useArea } from "@/lib/area";
import { fetchLiveSeasonality, indexFromNames, type LiveSeasonality } from "@/lib/live";
import {
  arrivals,
  currentWeek,
  departures,
  monthName,
  monthSpecies,
} from "@/lib/season";
import type { SeasonSpecies, Seasonality, SpeciesIndex } from "@/lib/types";

const RAIL_LIMIT = 12;

interface HomeData {
  seasonality: Seasonality;
  index: SpeciesIndex;
}

function SpeciesRow({
  sp,
  covered,
  index,
  detail,
  nowWeek,
}: {
  sp: SeasonSpecies;
  covered: number[];
  index: SpeciesIndex;
  detail: string;
  nowWeek?: number;
}) {
  const name = index.species[sp.code]?.com_name ?? sp.code;
  return (
    <li>
      <Link
        href={`/species/?code=${sp.code}`}
        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-strong">{name}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted">{detail}</span>
        <SeasonalityChart sp={sp} covered={covered} nowWeek={nowWeek} mini />
      </Link>
    </li>
  );
}

export default function TimingPage() {
  const { area, ready } = useArea();
  const [home, setHome] = useState<HomeData | null>(null);
  const [liveData, setLiveData] = useState<LiveSeasonality | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([getSeasonality(), getSpeciesIndex()]).then(([seasonality, index]) => {
      if (alive) setHome({ seasonality, index });
    });
    return () => {
      alive = false;
    };
  }, []);

  // Live area: sampled seasonality for its nearest county (cached per session +
  // KV-cached in the Worker, so only the first look at a region is slow).
  useEffect(() => {
    setLiveData(null);
    setLiveError(null);
    if (!ready || !area) return;
    setLiveBusy(true);
    let alive = true;
    fetchLiveSeasonality(area)
      .then((s) => {
        if (alive) setLiveData(s);
      })
      .catch((e: Error) => {
        if (alive) setLiveError(e.message);
      })
      .finally(() => {
        if (alive) setLiveBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [ready, area]);

  const seasonality = area ? liveData?.seasonality : home?.seasonality;
  const index = useMemo(
    () => (area ? (liveData ? indexFromNames(liveData.names) : null) : (home?.index ?? null)),
    [area, liveData, home],
  );

  const nowWeek = currentWeek();
  const thisMonth = new Date().getMonth();

  const matches = useMemo(() => {
    if (!index) return () => true;
    const q = query.trim().toLowerCase();
    if (!q) return () => true;
    return (sp: SeasonSpecies) => {
      const info = index.species[sp.code];
      return (
        sp.code.includes(q) ||
        (info?.com_name.toLowerCase().includes(q) ?? false) ||
        (info?.sci_name.toLowerCase().includes(q) ?? false)
      );
    };
  }, [index, query]);

  const heading = (
    <h1 className="text-2xl font-semibold text-strong">
      Timing{area ? ` · ${area.label}` : ""}
    </h1>
  );

  if (area && liveError) {
    return (
      <div>
        {heading}
        <div className="mt-4 rounded-xl border border-border bg-surface p-6 text-sm">
          <p className="font-medium text-fg">Seasonal lookup failed.</p>
          <p className="mt-1 text-muted">{liveError}</p>
        </div>
      </div>
    );
  }

  if (!seasonality || !index) {
    return (
      <div>
        {heading}
        <p className="mt-4 text-sm text-muted">
          {area && (liveBusy || !ready)
            ? `Sampling a year of eBird history around ${area.label} — the first look at a region takes a few seconds…`
            : "Loading…"}
        </p>
      </div>
    );
  }

  const covered = seasonality.weeks_covered;
  const species = seasonality.species.filter(matches);
  const daysWord = area ? "sampled days" : "days";

  const arriving = arrivals(species, covered, nowWeek).slice(0, RAIL_LIMIT);
  const departing = departures(species, covered, nowWeek).slice(0, RAIL_LIMIT);
  const inMonth = monthSpecies(species, covered, month);

  return (
    <div>
      {heading}
      <p className="mb-5 mt-1 text-sm text-muted">
        {area ? (
          <>
            When each species is around {area.label} — presence sampled on{" "}
            {liveData?.sampleCount ?? 24} days across the past year
            {seasonality.first_date
              ? ` (${seasonality.first_date} → ${seasonality.last_date})`
              : ""}{" "}
            for {liveData?.regionName ?? "the nearest county"}, live from eBird.
            {liveData && liveData.failedSamples > 0
              ? ` ${liveData.failedSamples} samples unavailable — those weeks are dimmed.`
              : ""}
          </>
        ) : (
          <>
            When each species is actually around, from daily region records
            {seasonality.first_date
              ? ` (${seasonality.first_date} → ${seasonality.last_date})`
              : ""}
            .
          </>
        )}
      </p>

      {seasonality.species.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          {area ? (
            <p>
              eBird has no sampled records for {liveData?.regionName ?? "this region"} — try a
              different place.
            </p>
          ) : (
            <>
              <p className="font-medium text-fg">No seasonal history yet.</p>
              <p className="mt-1">
                Run the backfill to load 1–2 years of daily records (see the README) — this page
                gets good exactly then.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search species…"
            aria-label="Search species"
            className="mb-5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-leaf-dim"
          />

          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-semibold text-strong">
                Arriving now <span aria-hidden>↗</span>
              </h2>
              {arriving.length === 0 ? (
                <p className="text-xs text-muted">No strong arrivals around this week.</p>
              ) : (
                <ul>
                  {arriving.map(({ sp, trend }) => (
                    <SpeciesRow
                      key={sp.code}
                      sp={sp}
                      covered={covered}
                      index={index}
                      nowWeek={nowWeek}
                      detail={`+${Math.round(trend * 100)}%`}
                    />
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-semibold text-strong">
                Departing soon <span aria-hidden>↘</span>
              </h2>
              {departing.length === 0 ? (
                <p className="text-xs text-muted">No strong departures around this week.</p>
              ) : (
                <ul>
                  {departing.map(({ sp, trend }) => (
                    <SpeciesRow
                      key={sp.code}
                      sp={sp}
                      covered={covered}
                      index={index}
                      nowWeek={nowWeek}
                      detail={`${Math.round(trend * 100)}%`}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-strong">
              What to expect in {monthName(month)}
            </h2>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Array.from({ length: 12 }, (_, m) => (
                <button
                  key={m}
                  onClick={() => setMonth(m)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    m === month
                      ? "border-transparent bg-leaf font-medium text-black"
                      : "border-border bg-surface text-muted hover:text-fg"
                  }`}
                >
                  {monthName(m)}
                </button>
              ))}
            </div>
            {inMonth.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing crosses the 20%-of-{daysWord} bar for {monthName(month)} yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {inMonth.map(({ sp, freq }) => (
                  <SpeciesRow
                    key={sp.code}
                    sp={sp}
                    covered={covered}
                    index={index}
                    nowWeek={month === thisMonth ? nowWeek : undefined}
                    detail={`${Math.round(freq * 100)}% of ${daysWord}`}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
