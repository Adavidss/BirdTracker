"use client";

// Compact global place picker (lives in the nav): shows the current area —
// "Home" or the picked place — and opens a small search panel. Geocoding is
// Open-Meteo's free keyless API; picking a place switches the whole app to
// live eBird lookups for it.

import { useEffect, useRef, useState } from "react";

import { ChevronDownIcon, HomeIcon, PinIcon } from "@/components/icons";
import { useArea } from "@/lib/area";
import { areaFromGeo, geoLabel, liveEnabled, searchPlaces, type GeoResult } from "@/lib/live";

export function AreaPicker() {
  const { area, setArea } = useArea();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced geocoding.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchPlaces(term));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!liveEnabled()) return null;

  return (
    <div ref={boxRef} className="relative ml-auto min-w-0">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setQ("");
          setResults([]);
        }}
        aria-label="Change location"
        aria-expanded={open}
        className={`flex max-w-full items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm ${
          area
            ? "border-leaf-dim bg-surface text-fg"
            : "border-border bg-surface text-muted hover:text-fg"
        }`}
      >
        {area ? (
          <PinIcon size={14} className="shrink-0 text-leaf" />
        ) : (
          <HomeIcon size={14} className="shrink-0" />
        )}
        <span className="max-w-[6.5rem] truncate sm:max-w-[11rem]">
          {area ? area.label : "Home"}
        </span>
        <ChevronDownIcon size={12} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-2 shadow-lg">
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search any place — try Chapel Hill"
            aria-label="Search for a place"
            className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm placeholder:text-muted focus:border-leaf-dim"
          />
          {(results.length > 0 || searching) && (
            <ul className="mt-1 overflow-hidden rounded-lg border border-border">
              {searching && <li className="px-3 py-2 text-xs text-muted">Searching…</li>}
              {results.map((g, i) => (
                <li key={`${g.latitude},${g.longitude},${i}`}>
                  <button
                    className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                    onClick={() => {
                      setArea(areaFromGeo(g));
                      setOpen(false);
                    }}
                  >
                    {geoLabel(g)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => {
              setArea(null);
              setOpen(false);
            }}
            className={`mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
              area ? "text-fg hover:bg-surface-2" : "bg-surface-2 font-medium text-strong"
            }`}
          >
            <HomeIcon size={14} className="shrink-0" />
            Home area (DC / College Park)
          </button>
        </div>
      )}
    </div>
  );
}
