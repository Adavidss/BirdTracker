"use client";

import { useEffect, useState } from "react";

import { getMeta } from "@/lib/api";
import { formatUpdated } from "@/lib/format";
import type { Meta } from "@/lib/types";

export function LastUpdated() {
  const [meta, setMeta] = useState<Meta | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getMeta().then((m) => {
      if (alive) setMeta(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (meta === undefined) return <p>&nbsp;</p>;
  if (meta === null) {
    return <p>No data yet — run the pipeline once (see README).</p>;
  }
  const history =
    meta.history.days_covered > 0
      ? ` · seasonal history ${meta.history.days_covered} days (${meta.regions.join(", ")})`
      : " · no seasonal history yet (run the backfill)";
  return (
    <p>
      Data updated {formatUpdated(meta.last_updated)} · sightings within {meta.radius_km} km
      {history}
    </p>
  );
}
