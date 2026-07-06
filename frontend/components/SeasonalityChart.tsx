// Zero-dependency inline-SVG bar chart over the 48-week eBird calendar.
// Bar height = share of covered days the species was reported that week.
// Weeks with thin coverage (< LOW_CONFIDENCE_DAYS recorded days) render dimmed.

import { WEEKS, freqAt, weekLabel } from "@/lib/season";
import type { SeasonSpecies } from "@/lib/types";

const LOW_CONFIDENCE_DAYS = 5;
const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

interface Props {
  sp: SeasonSpecies;
  covered: number[];
  /** Draw a "you are here" marker at this week index. */
  nowWeek?: number;
  /** Compact sparkline for list rows: no axis, no tooltips. */
  mini?: boolean;
}

export function SeasonalityChart({ sp, covered, nowWeek, mini = false }: Props) {
  // "Thin coverage" is relative to the chart's own best week: the sampled live
  // profiles cover every week exactly once, which shouldn't dim everything.
  const lowBar = Math.min(LOW_CONFIDENCE_DAYS, Math.max(0, ...covered));

  if (mini) {
    return (
      <svg
        viewBox={`0 0 ${WEEKS * 2} 24`}
        className="h-6 w-24 shrink-0 text-leaf"
        aria-hidden
        preserveAspectRatio="none"
      >
        {Array.from({ length: WEEKS }, (_, w) => {
          const h = Math.round(freqAt(sp, covered, w) * 20);
          return h > 0 ? (
            <rect key={w} x={w * 2} y={22 - h} width={1.6} height={h} fill="currentColor" />
          ) : null;
        })}
        <line x1={0} y1={22.5} x2={WEEKS * 2} y2={22.5} stroke="rgb(var(--c-border))" />
        {nowWeek !== undefined && (
          <rect
            x={nowWeek * 2}
            y={0}
            width={1.6}
            height={22}
            fill="rgb(var(--c-muted))"
            opacity={0.6}
          />
        )}
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 480 130"
      className="w-full text-leaf"
      role="img"
      aria-label="Weekly presence across the year"
    >
      {Array.from({ length: WEEKS }, (_, w) => {
        const c = covered[w] ?? 0;
        const n = sp.weeks[w] ?? 0;
        const freq = freqAt(sp, covered, w);
        const h = Math.round(freq * 100);
        const pct = Math.round(freq * 100);
        return (
          <g key={w}>
            <title>
              {c > 0
                ? `${weekLabel(w)}: ${pct}% of days (${n}/${c})`
                : `${weekLabel(w)}: no data`}
            </title>
            {/* invisible full-height hit area so the tooltip works on empty weeks */}
            <rect x={w * 10} y={0} width={10} height={104} fill="transparent" />
            {h > 0 && (
              <rect
                x={w * 10 + 1}
                y={104 - h}
                width={8}
                height={h}
                rx={1}
                fill="currentColor"
                fillOpacity={c < lowBar ? 0.35 : 0.9}
              />
            )}
          </g>
        );
      })}
      <line x1={0} y1={104.5} x2={480} y2={104.5} stroke="rgb(var(--c-border))" />
      {nowWeek !== undefined && (
        <line
          x1={nowWeek * 10 + 5}
          y1={0}
          x2={nowWeek * 10 + 5}
          y2={104}
          stroke="rgb(var(--c-muted))"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      )}
      {MONTH_LETTERS.map((letter, m) => (
        <text
          key={m}
          x={m * 40 + 20}
          y={122}
          textAnchor="middle"
          fontSize={10}
          fill="rgb(var(--c-muted))"
        >
          {letter}
        </text>
      ))}
    </svg>
  );
}
