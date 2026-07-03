"use client";

// Leaflet map of recent sighting reports with two views:
//  - "spots":     one clickable marker per location (popup: species/reports +
//                 Apple Maps directions)
//  - "intensity": a heat layer weighted by report density
// A species filter narrows both views to that bird's reports.
// Leaflet touches `window`, so it's imported dynamically inside the effect
// (same pattern as ConcertFinder's VenueMap).

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

import { appleMapsUrl, formatObs } from "@/lib/format";
import type { SightingsFile } from "@/lib/types";

// Popup links are raw HTML (not next/link), so they don't get the basePath
// automatically — prefix them by hand. Trailing slash matches trailingSlash:true.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Fallback view when there are no points yet (matches config.json's center).
const FALLBACK = { lat: 38.99, lng: -76.94 };

const LEAF = "#34d399";
const INK = "#0a0a0b";

interface LocAgg {
  lat: number;
  lng: number;
  locName: string;
  reports: number;
  /** code -> latest report info (first seen wins: points arrive newest-first). */
  species: Map<string, { obsDt: string; howMany: number | null; count: number }>;
  /** Individual reports, kept only when a species filter is active (popup detail). */
  detail: { obsDt: string; howMany: number | null }[];
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function spotIcon(label: number, size: number): string {
  const font = Math.max(9, Math.round(size * 0.48));
  return (
    `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${LEAF};` +
    `border:2px solid ${INK};box-shadow:0 0 0 1px ${LEAF};display:flex;align-items:center;` +
    `justify-content:center;color:${INK};font:700 ${font}px/1 system-ui,sans-serif">${label}</div>`
  );
}

export function BirdMap({
  sightings,
  namesByCode,
  filterCode,
  view,
  fitKey = "home",
}: {
  sightings: SightingsFile;
  namesByCode: Record<string, string>;
  filterCode: string | null;
  view: "spots" | "intensity";
  /** Changing this (e.g. a new area) drops the remembered pan/zoom and re-fits. */
  fitKey?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Preserve pan/zoom across rebuilds (view toggle, filter changes)…
  const viewRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  // …but re-fit when the map moves to a different area.
  const fitKeyRef = useRef(fitKey);
  if (fitKeyRef.current !== fitKey) {
    fitKeyRef.current = fitKey;
    viewRef.current = null;
  }

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    const effectFitKey = fitKey;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.heat");
      if (cancelled || !containerRef.current) return;

      const dark = document.documentElement.classList.contains("dark");
      map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(
        [FALLBACK.lat, FALLBACK.lng],
        11,
      );
      L.tileLayer(
        dark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 19,
        },
      ).addTo(map);

      // ---- collect the (possibly filtered) points --------------------------
      const codes = filterCode ? [filterCode] : Object.keys(sightings.species);
      const heatPts: [number, number, number][] = [];
      const locs = new Map<string, LocAgg>();
      for (const code of codes) {
        for (const p of sightings.species[code] ?? []) {
          heatPts.push([p.lat, p.lng, 0.7]);
          const key = p.loc_id || `${p.lat},${p.lng}`;
          let agg = locs.get(key);
          if (!agg) {
            agg = {
              lat: p.lat,
              lng: p.lng,
              locName: p.loc_name,
              reports: 0,
              species: new Map(),
              detail: [],
            };
            locs.set(key, agg);
          }
          agg.reports += 1;
          const sp = agg.species.get(code);
          if (sp) sp.count += 1;
          else agg.species.set(code, { obsDt: p.obs_dt, howMany: p.how_many, count: 1 });
          if (filterCode) agg.detail.push({ obsDt: p.obs_dt, howMany: p.how_many });
        }
      }

      if (view === "intensity") {
        L.heatLayer(heatPts, {
          radius: 24,
          blur: 18,
          maxZoom: 13,
          minOpacity: 0.25,
        }).addTo(map);
      } else {
        for (const agg of locs.values()) {
          const label = filterCode ? agg.reports : agg.species.size;
          const size = Math.min(34, 16 + label * (filterCode ? 2 : 0.6));
          const marker = L.marker([agg.lat, agg.lng], {
            icon: L.divIcon({ className: "", html: spotIcon(label, size), iconSize: [size, size] }),
          });

          const lines: string[] = [`<strong>${esc(agg.locName || "Unnamed location")}</strong>`];
          if (filterCode) {
            const name = namesByCode[filterCode] ?? filterCode;
            lines.push(
              `<span style="color:#888">${esc(name)} — ${agg.reports} report${agg.reports === 1 ? "" : "s"}</span>`,
            );
            for (const r of agg.detail.slice(0, 4)) {
              lines.push(
                `<span style="color:#888">${esc(formatObs(r.obsDt))}${r.howMany ? ` · ${r.howMany} seen` : ""}</span>`,
              );
            }
            if (agg.detail.length > 4) {
              lines.push(`<span style="color:#888">+${agg.detail.length - 4} more reports</span>`);
            }
            lines.push(
              `<a href="${BASE}/species/?code=${encodeURIComponent(filterCode)}" style="color:#059669;font-weight:600">About ${esc(name)} →</a>`,
            );
          } else {
            lines.push(
              `<span style="color:#888">${agg.species.size} species · ${agg.reports} reports</span>`,
            );
            const top = [...agg.species.entries()]
              .sort((a, b) => b[1].count - a[1].count)
              .slice(0, 5);
            for (const [code, info] of top) {
              const nm = esc(namesByCode[code] ?? code);
              lines.push(
                `<a href="${BASE}/species/?code=${encodeURIComponent(code)}" style="color:#059669">${nm}</a> <span style="color:#888">· ${esc(formatObs(info.obsDt))}</span>`,
              );
            }
            if (agg.species.size > top.length) {
              lines.push(`<span style="color:#888">+${agg.species.size - top.length} more species</span>`);
            }
          }
          lines.push(
            `<a href="${appleMapsUrl(agg.lat, agg.lng)}" target="_blank" rel="noreferrer" style="color:#059669;font-weight:600"> Directions (Apple Maps) ↗</a>`,
          );
          marker.bindPopup(`<div style="min-width:170px;display:grid;gap:2px">${lines.join("<br>")}</div>`);
          marker.addTo(map);
        }
      }

      // Restore the previous view if we have one; otherwise fit to the data.
      const all: [number, number][] = heatPts.map((p) => [p[0], p[1]]);
      if (viewRef.current) {
        map.setView(viewRef.current.center, viewRef.current.zoom, { animate: false });
      } else if (all.length > 0) {
        map.fitBounds(all, { padding: [30, 30], maxZoom: 12, animate: false });
      }
      map.on("moveend", () => {
        if (map) {
          viewRef.current = {
            center: [map.getCenter().lat, map.getCenter().lng],
            zoom: map.getZoom(),
          };
        }
      });
    })();

    return () => {
      cancelled = true;
      if (map) {
        // Cleanup runs AFTER the render that may have nulled viewRef for a new
        // area — only preserve the view if we're still on the same area.
        if (fitKeyRef.current === effectFitKey) {
          viewRef.current = {
            center: [map.getCenter().lat, map.getCenter().lng],
            zoom: map.getZoom(),
          };
        }
        map.remove();
      }
    };
  }, [sightings, namesByCode, filterCode, view, fitKey]);

  return (
    <div
      ref={containerRef}
      className="h-[62vh] min-h-[380px] w-full overflow-hidden rounded-xl border border-border"
      style={{ zIndex: 0 }}
      aria-label="Map of recent bird sightings"
    />
  );
}
