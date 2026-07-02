"use client";

// NOW — species reported nearby in the last ~14 days.

import { useEffect, useState } from "react";

import { SpeciesList } from "@/components/SpeciesList";
import { getBirdsNow, getSeasonality, getSpeciesIndex } from "@/lib/api";
import type { BirdsNow, Seasonality, SpeciesIndex } from "@/lib/types";

interface Data {
  now: BirdsNow;
  seasonality: Seasonality;
  index: SpeciesIndex;
}

export default function NowPage() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getBirdsNow(), getSeasonality(), getSpeciesIndex()]).then(
      ([now, seasonality, index]) => {
        if (alive) setData({ now, seasonality, index });
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-strong">Around now</h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        Species reported nearby in the last {data?.now.window_days ?? 14} days — the sparkline is
        each bird&apos;s season, so you can see who&apos;s about to leave.
      </p>
      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : data.now.species.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          <p className="font-medium text-fg">No sightings data yet.</p>
          <p className="mt-1">
            Run <code className="rounded bg-surface-2 px-1">python -m pipeline.update</code> with
            an eBird API key to fetch it (see the README).
          </p>
        </div>
      ) : (
        <SpeciesList
          species={data.now.species}
          seasonality={data.seasonality}
          index={data.index}
        />
      )}
    </div>
  );
}
