"use client";

// Row list of eBird hotspots ranked by recent activity (the old Hotspots page,
// now a panel under the Explore map): "where should I go this morning".

import { appleMapsUrl, relativeObs } from "@/lib/format";
import type { Hotspot } from "@/lib/types";

export function HotspotRows({ hotspots }: { hotspots: Hotspot[] }) {
  if (hotspots.length === 0) {
    return <p className="text-sm text-muted">No hotspot data for this area yet.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {hotspots.map((h) => (
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
  );
}
