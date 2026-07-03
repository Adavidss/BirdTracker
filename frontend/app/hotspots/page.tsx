"use client";

// HOTSPOTS — nearby eBird hotspots ranked by recent activity: "where should I
// go this morning" as a list.

import { useEffect, useState } from "react";

import { getHotspots } from "@/lib/api";
import { appleMapsUrl, relativeObs } from "@/lib/format";
import type { HotspotList } from "@/lib/types";

export default function HotspotsPage() {
  const [data, setData] = useState<HotspotList | null>(null);

  useEffect(() => {
    let alive = true;
    getHotspots().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-strong">Hotspots</h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        Nearby eBird hotspots, most recently active first.
      </p>
      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : data.hotspots.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          No hotspot data yet — run the pipeline once (see README).
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {data.hotspots.map((h) => (
            <li key={h.loc_id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-strong">{h.name}</p>
                <p className="text-xs text-muted">
                  {h.latest_obs ? `active ${relativeObs(h.latest_obs)}` : "quiet lately"} ·{" "}
                  {h.num_species_all_time} species all-time
                </p>
              </div>
              <a
                href={`https://ebird.org/hotspot/${h.loc_id}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs text-leaf hover:underline"
              >
                eBird ↗
              </a>
              {h.lat !== null && h.lng !== null && (
                <a
                  href={appleMapsUrl(h.lat, h.lng)}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs text-leaf hover:underline"
                >
                  Directions ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
