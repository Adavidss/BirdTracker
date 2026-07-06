"use client";

// Searchable, sortable list of currently-around species (the Now page), each
// row showing a mini seasonality sparkline so "about to leave?" is one glance.

import Link from "next/link";
import { useMemo, useState } from "react";

import { SeasonalityChart } from "@/components/SeasonalityChart";
import { relativeObs } from "@/lib/format";
import { currentWeek } from "@/lib/season";
import type { NowSpecies, Seasonality, SpeciesIndex } from "@/lib/types";

type Sort = "recent" | "reported" | "taxonomic" | "name";

interface Props {
  species: NowSpecies[];
  seasonality: Seasonality;
  index: SpeciesIndex;
  /** False in live "anywhere" mode: days_reported_14 needs region history the
   *  live feed can't know, so the badge and its sort are hidden. */
  showDays14?: boolean;
}

export function SpeciesList({ species, seasonality, index, showDays14 = true }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const nowWeek = currentWeek();

  const seasonByCode = useMemo(
    () => new Map(seasonality.species.map((sp) => [sp.code, sp])),
    [seasonality],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? species.filter(
          (s) =>
            s.com_name.toLowerCase().includes(q) || s.sci_name.toLowerCase().includes(q),
        )
      : [...species];
    switch (sort) {
      case "reported":
        filtered.sort(
          (a, b) => b.days_reported_14 - a.days_reported_14 || (a.last_seen < b.last_seen ? 1 : -1),
        );
        break;
      case "taxonomic":
        filtered.sort(
          (a, b) =>
            (index.species[a.code]?.taxon_order ?? Infinity) -
            (index.species[b.code]?.taxon_order ?? Infinity),
        );
        break;
      case "name":
        filtered.sort((a, b) => a.com_name.localeCompare(b.com_name));
        break;
      default:
        // birds-now.json is already newest-first
        break;
    }
    return filtered;
  }, [species, query, sort, index]);

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search species…"
          aria-label="Search species"
          className="w-full flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-leaf-dim"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort species"
          className="rounded-lg border border-border bg-surface px-2 py-2 text-sm"
        >
          <option value="recent">Most recent</option>
          {showDays14 && <option value="reported">Most reported</option>}
          <option value="taxonomic">Taxonomic</option>
          <option value="name">A–Z</option>
        </select>
      </div>
      <p className="mb-1 text-xs text-muted">
        {rows.length} species{query ? " matching" : ""}
      </p>
      <ul className="divide-y divide-border">
        {rows.map((s) => {
          const season = seasonByCode.get(s.code);
          return (
            <li key={s.code}>
              <Link
                href={`/species/?code=${s.code}`}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span className="font-medium text-strong">{s.com_name}</span>{" "}
                    <span className="text-xs italic text-muted">{s.sci_name}</span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {relativeObs(s.last_seen)} · {s.last_loc_name}
                    {s.how_many !== null ? ` · ${s.how_many} seen` : ""}
                  </p>
                </div>
                {showDays14 && (
                  <span
                    className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-fg"
                    title={`Reported ${s.days_reported_14} of the last 14 days in the region history`}
                  >
                    {s.days_reported_14}/14d
                  </span>
                )}
                {season && (
                  <span className="hidden sm:block">
                    <SeasonalityChart
                      sp={season}
                      covered={seasonality.weeks_covered}
                      nowWeek={nowWeek}
                      mini
                    />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
