"use client";

// Leaflet map of recent bird activity, drawn as independent layers:
//  - sightings: clickable green spots ("spots") or a heat layer ("intensity"),
//    optionally filtered to one species
//  - rare:      amber diamonds — notable/rare reports (aggregated per location)
//  - hotspots:  sky-blue rings — eBird hotspots, sized by all-time species count
// A layer is drawn when its data prop is non-null; the parent owns toggling.
// Leaflet touches `window`, so it's imported dynamically inside the effect
// (same pattern as ConcertFinder's VenueMap).

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

import { appleMapsUrl, formatObs, relativeObs } from "@/lib/format";
import type { Hotspot, NotableSighting, SightingsFile } from "@/lib/types";

// Popup links are raw HTML (not next/link), so they don't get the basePath
// automatically — prefix them by hand. Trailing slash matches trailingSlash:true.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Fallback view when there are no points yet (matches config.json's center).
const FALLBACK = { lat: 38.99, lng: -76.94 };

const LEAF = "#34d399";
const AMBER = "#f59e0b";
const SKY = "#38bdf8";
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

function rareIcon(size: number): string {
  const inner = Math.round(size * 0.66);
  return (
    `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">` +
    `<div style="width:${inner}px;height:${inner}px;background:${AMBER};border:2px solid ${INK};` +
    `box-shadow:0 0 0 1px ${AMBER};transform:rotate(45deg)"></div></div>`
  );
}

function hotspotIcon(size: number): string {
  return (
    `<div style="width:${size}px;height:${size}px;border-radius:9999px;border:2.5px solid ${SKY};` +
    `background:rgba(56,189,248,.18);box-shadow:0 0 0 1px ${INK}"></div>`
  );
}

export function BirdMap({
  sightings,
  namesByCode,
  filterCode,
  view,
  notable = null,
  hotspotSpots = null,
  fitKey = "home",
}: {
  /** null = sightings layer off. */
  sightings: SightingsFile | null;
  namesByCode: Record<string, string>;
  filterCode: string | null;
  view: "spots" | "intensity";
  /** null = rare layer off. */
  notable?: NotableSighting[] | null;
  /** null = hotspot layer off. */
  hotspotSpots?: Hotspot[] | null;
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

      const fitPts: [number, number][] = [];

      // ---- hotspots layer (drawn first: lowest z) ---------------------------
      for (const h of hotspotSpots ?? []) {
        if (h.lat === null || h.lng === null) continue;
        fitPts.push([h.lat, h.lng]);
        const size = 13 + Math.min(7, Math.round(h.num_species_all_time / 60));
        const marker = L.marker([h.lat, h.lng], {
          icon: L.divIcon({ className: "", html: hotspotIcon(size), iconSize: [size, size] }),
          zIndexOffset: -1000,
        });
        const lines = [
          `<strong>${esc(h.name)}</strong>`,
          `<span style="color:#888">${
            h.latest_obs ? `active ${esc(relativeObs(h.latest_obs))}` : "quiet lately"
          } · ${h.num_species_all_time} species all-time</span>`,
          `<a href="https://ebird.org/hotspot/${encodeURIComponent(h.loc_id)}" target="_blank" rel="noreferrer" style="color:${SKY};font-weight:600">eBird hotspot ↗</a>`,
          `<a href="${appleMapsUrl(h.lat, h.lng)}" target="_blank" rel="noreferrer" style="color:#059669;font-weight:600"> Directions (Apple Maps) ↗</a>`,
        ];
        marker.bindPopup(`<div style="min-width:170px;display:grid;gap:2px">${lines.join("<br>")}</div>`);
        marker.addTo(map);
      }

      // ---- sightings layer --------------------------------------------------
      const heatPts: [number, number, number][] = [];
      if (sightings) {
        const codes = filterCode ? [filterCode] : Object.keys(sightings.species);
        const locs = new Map<string, LocAgg>();
        for (const code of codes) {
          for (const p of sightings.species[code] ?? []) {
            heatPts.push([p.lat, p.lng, 0.7]);
            fitPts.push([p.lat, p.lng]);
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
      }

      // ---- rare layer (topmost: a rarity's exact spot matters) --------------
      if (notable) {
        interface RareAgg {
          lat: number;
          lng: number;
          locName: string;
          reports: NotableSighting[];
        }
        const rareLocs = new Map<string, RareAgg>();
        for (const s of notable) {
          if (s.lat === null || s.lng === null) continue;
          fitPts.push([s.lat, s.lng]);
          const key = s.loc_id || `${s.lat},${s.lng}`;
          let agg = rareLocs.get(key);
          if (!agg) {
            agg = { lat: s.lat, lng: s.lng, locName: s.loc_name, reports: [] };
            rareLocs.set(key, agg);
          }
          agg.reports.push(s);
        }
        for (const agg of rareLocs.values()) {
          const size = Math.min(24, 15 + agg.reports.length * 1.5);
          const marker = L.marker([agg.lat, agg.lng], {
            icon: L.divIcon({ className: "", html: rareIcon(size), iconSize: [size, size] }),
            zIndexOffset: 1000,
          });
          const lines = [`<strong>${esc(agg.locName || "Unnamed location")}</strong>`];
          for (const r of agg.reports.slice(0, 5)) {
            const badge = r.obs_valid
              ? ""
              : ` <span style="color:${AMBER};font-size:10px;text-transform:uppercase">unconfirmed</span>`;
            const checklist = r.checklist_id
              ? ` · <a href="https://ebird.org/checklist/${encodeURIComponent(r.checklist_id)}" target="_blank" rel="noreferrer" style="color:${AMBER}">checklist ↗</a>`
              : "";
            lines.push(
              `<a href="${BASE}/species/?code=${encodeURIComponent(r.code)}" style="color:${AMBER};font-weight:600">${esc(r.com_name)}</a>${badge}<br>` +
                `<span style="color:#888">${esc(formatObs(r.obs_date))}${r.how_many ? ` · ${r.how_many} seen` : ""}${checklist}</span>`,
            );
          }
          if (agg.reports.length > 5) {
            lines.push(`<span style="color:#888">+${agg.reports.length - 5} more reports</span>`);
          }
          lines.push(
            `<a href="${appleMapsUrl(agg.lat, agg.lng)}" target="_blank" rel="noreferrer" style="color:#059669;font-weight:600"> Directions (Apple Maps) ↗</a>`,
          );
          marker.bindPopup(`<div style="min-width:180px;display:grid;gap:2px">${lines.join("<br>")}</div>`);
          marker.addTo(map);
        }
      }

      // Restore the previous view if we have one; otherwise fit to the data.
      if (viewRef.current) {
        map.setView(viewRef.current.center, viewRef.current.zoom, { animate: false });
      } else if (fitPts.length > 0) {
        map.fitBounds(fitPts, { padding: [30, 30], maxZoom: 12, animate: false });
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
  }, [sightings, namesByCode, filterCode, view, notable, hotspotSpots, fitKey]);

  return (
    <div
      ref={containerRef}
      className="h-[62vh] min-h-[380px] w-full overflow-hidden rounded-xl border border-border"
      style={{ zIndex: 0 }}
      aria-label="Map of recent bird activity"
    />
  );
}
