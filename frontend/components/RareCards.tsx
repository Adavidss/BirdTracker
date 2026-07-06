"use client";

// Card list of notable/rare reports (the old Rare page, now a panel under the
// Explore map). eBird's notable feed is largely provisional records, so
// unconfirmed ones get a badge rather than a filter.

import Link from "next/link";

import { appleMapsUrl, formatObs } from "@/lib/format";
import type { NotableSighting } from "@/lib/types";

export function RareCards({ sightings }: { sightings: NotableSighting[] }) {
  if (sightings.length === 0) {
    return <p className="text-sm text-muted">No rare-bird reports in the current data.</p>;
  }
  return (
    <div className="grid gap-3">
      {sightings.map((s, i) => (
        <article
          key={`${s.checklist_id}-${s.code}-${i}`}
          className="rounded-xl border border-border bg-canvas p-4"
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
                href={appleMapsUrl(s.lat, s.lng)}
                target="_blank"
                rel="noreferrer"
                className="text-leaf hover:underline"
              >
                Directions ↗
              </a>
            )}
            <Link href={`/species/?code=${s.code}`} className="text-muted hover:text-fg">
              Seasonal timing →
            </Link>
          </p>
        </article>
      ))}
    </div>
  );
}
