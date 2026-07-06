// eBird-style weekly bar chart: the year as 12 bounded month cells (initials
// on top, separator gridlines between), each holding its 4 pseudo-week bars
// rising from a shared baseline — bar height = share of covered days the
// species was reported that week. This is the same presentation eBird uses on
// its species/bar-chart pages, so birders can read it at a glance.

import { WEEKS, freqAt, weekLabel } from "@/lib/season";
import type { SeasonSpecies } from "@/lib/types";

const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const LOW_CONFIDENCE_DAYS = 5;

// Geometry (SVG user units): 48 weeks × 10 wide, months every 40.
const X0 = 3;
const TOP = 18;
const BASE = 116;
const COL = 10;

export function SeasonBars({
  sp,
  covered,
  nowWeek,
}: {
  sp: SeasonSpecies;
  covered: number[];
  /** Dashed "you are here" line at this week. */
  nowWeek?: number;
}) {
  // "Thin coverage" is relative to the densest week, so uniformly-sampled live
  // profiles (1 day per week) don't render everything dimmed.
  const lowBar = Math.min(LOW_CONFIDENCE_DAYS, Math.max(0, ...covered));

  return (
    <div>
      <svg
        viewBox="0 0 486 128"
        className="w-full text-leaf"
        role="img"
        aria-label="Weekly presence across the year, eBird-style bar chart"
      >
        {/* month cells: initials + separator gridlines (13 lines bound 12 cells) */}
        {MONTH_LETTERS.map((letter, m) => (
          <text
            key={`t${m}`}
            x={X0 + m * 40 + 20}
            y={12}
            textAnchor="middle"
            fontSize={10}
            fill="rgb(var(--c-muted))"
          >
            {letter}
          </text>
        ))}
        {Array.from({ length: 13 }, (_, m) => (
          <line
            key={`s${m}`}
            x1={X0 + m * 40}
            y1={TOP}
            x2={X0 + m * 40}
            y2={BASE}
            stroke="rgb(var(--c-border))"
            strokeWidth={1}
          />
        ))}

        {/* weekly bars on the baseline */}
        {Array.from({ length: WEEKS }, (_, w) => {
          const c = covered[w] ?? 0;
          const n = sp.weeks[w] ?? 0;
          const freq = freqAt(sp, covered, w);
          const h = freq > 0 ? Math.max(3, Math.round(freq * (BASE - TOP - 4))) : 0;
          return (
            <g key={w}>
              <title>
                {c > 0
                  ? `${weekLabel(w)} — reported ${Math.round(freq * 100)}% of days (${n}/${c})`
                  : `${weekLabel(w)} — no data`}
              </title>
              {/* invisible full-height hit area so the tooltip works on empty weeks */}
              <rect x={X0 + w * COL} y={TOP} width={COL} height={BASE - TOP} fill="transparent" />
              {h > 0 && (
                <rect
                  x={X0 + w * COL + 1.5}
                  y={BASE - h}
                  width={7}
                  height={h}
                  rx={1}
                  fill="currentColor"
                  fillOpacity={c < lowBar ? 0.35 : 0.9}
                />
              )}
              {c === 0 && (
                <rect
                  x={X0 + w * COL + 1.5}
                  y={BASE - 2}
                  width={7}
                  height={2}
                  fill="rgb(var(--c-border))"
                />
              )}
            </g>
          );
        })}

        {/* baseline */}
        <line
          x1={X0}
          y1={BASE + 0.5}
          x2={X0 + WEEKS * COL}
          y2={BASE + 0.5}
          stroke="rgb(var(--c-muted))"
          strokeWidth={1}
        />

        {/* current week */}
        {nowWeek !== undefined && (
          <line
            x1={X0 + nowWeek * COL + 5}
            y1={TOP}
            x2={X0 + nowWeek * COL + 5}
            y2={BASE}
            stroke="rgb(var(--c-fg))"
            strokeWidth={1.25}
            strokeDasharray="3 3"
            opacity={0.7}
          />
        )}
      </svg>
      <p className="mt-1 text-[10px] text-muted">
        Bar height = share of days reported that week · dimmed = thin data · flat gray = no data
        {nowWeek !== undefined ? " · dashed line = this week" : ""}. Hover any week for details.
      </p>
    </div>
  );
}
