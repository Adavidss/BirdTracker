"use client";

// RARE — recent notable/rare reports nearby. eBird's notable feed is largely
// provisional records, so unconfirmed ones get a badge rather than a filter.

import Link from "next/link";
import { useEffect, useState } from "react";

import { getNotable } from "@/lib/api";
import { formatObs } from "@/lib/format";
import type { NotableList } from "@/lib/types";

export default function RarePage() {
  const [data, setData] = useState<NotableList | null>(null);

  useEffect(() => {
    let alive = true;
    getNotable().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-strong">Rare nearby</h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        Notable reports within range in the last {data?.window_days ?? 14} days. Every report is
        listed — a rarity&apos;s exact spot matters.
      </p>
      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : data.sightings.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          No rare-bird reports in the current data.
        </div>
      ) : (
        <div className="grid gap-3">
          {data.sightings.map((s, i) => (
            <article
              key={`${s.checklist_id}-${s.code}-${i}`}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-strong">{s.com_name}</span>
                <span className="text-xs italic text-muted">{s.sci_name}</span>
                {!s.obs_valid && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-500">
                    unconfirmed
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted">
                {formatObs(s.obs_date)} · {s.loc_name}
                {s.how_many !== null ? ` · ${s.how_many} seen` : ""}
                {s.location_private ? " · private location" : ""}
              </p>
              <p className="mt-2 flex flex-wrap gap-3 text-xs">
                {s.checklist_id && (
                  <a
                    href={`https://ebird.org/checklist/${s.checklist_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-leaf hover:underline"
                  >
                    eBird checklist ↗
                  </a>
                )}
                {s.lat !== null && s.lng !== null && (
                  <a
                    href={`https://maps.google.com/?q=${s.lat},${s.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-leaf hover:underline"
                  >
                    Map ↗
                  </a>
                )}
                <Link href={`/species/?code=${s.code}`} className="text-muted hover:text-fg">
                  Seasonal timing →
                </Link>
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
