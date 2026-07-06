// Calendar-year heatmap of when a species is around: 12 month columns × the 4
// eBird pseudo-weeks of each month, cell intensity = share of covered days the
// species was reported that week. Replaces the bar chart on the species page —
// same data, read like a calendar. Hover any cell for the exact week + share.

import { freqAt, weekLabel } from "@/lib/season";
import type { SeasonSpecies } from "@/lib/types";

const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const LOW_CONFIDENCE_DAYS = 5;
const LEAF = "52, 211, 153"; // leaf accent as an RGB triplet for alpha ramps

export function SeasonCalendar({
  sp,
  covered,
  nowWeek,
}: {
  sp: SeasonSpecies;
  covered: number[];
  /** Outline the "you are here" week. */
  nowWeek?: number;
}) {
  // "Thin coverage" is relative to the densest week, so uniformly-sampled live
  // profiles (1 day per week) don't render everything dimmed.
  const lowBar = Math.min(LOW_CONFIDENCE_DAYS, Math.max(0, ...covered));

  return (
    <div>
      <div className="grid grid-cols-12 gap-1">
        {MONTH_LETTERS.map((letter, m) => (
          <div key={m} className="grid content-start gap-1">
            <div className="text-center text-[10px] leading-4 text-muted" aria-hidden>
              {letter}
            </div>
            {[0, 1, 2, 3].map((row) => {
              const w = m * 4 + row;
              const c = covered[w] ?? 0;
              const n = sp.weeks[w] ?? 0;
              const freq = freqAt(sp, covered, w);
              const isNow = w === nowWeek;
              const title =
                c > 0
                  ? `${weekLabel(w)} — reported ${Math.round(freq * 100)}% of days (${n}/${c})`
                  : `${weekLabel(w)} — no data`;
              const dim = c > 0 && c < lowBar;
              return (
                <div
                  key={row}
                  title={title}
                  aria-label={title}
                  className={`h-4 rounded-[3px] sm:h-5 ${
                    c === 0
                      ? "border border-dashed border-border"
                      : freq === 0
                        ? "bg-surface-2"
                        : ""
                  } ${dim ? "opacity-50" : ""} ${
                    isNow ? "outline outline-2 -outline-offset-1 outline-fg/80" : ""
                  }`}
                  style={
                    freq > 0
                      ? { backgroundColor: `rgba(${LEAF}, ${0.18 + freq * 0.82})` }
                      : undefined
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-[3px] bg-surface-2" />
          not reported
        </span>
        <span className="flex items-center gap-1">
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <span
              key={f}
              className="h-3 w-3 rounded-[3px]"
              style={{ backgroundColor: `rgba(${LEAF}, ${0.18 + f * 0.82})` }}
            />
          ))}
          share of days seen
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-[3px] border border-dashed border-border" />
          no data
        </span>
        {nowWeek !== undefined && (
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[3px] bg-surface-2 outline outline-2 -outline-offset-1 outline-fg/80" />
            this week
          </span>
        )}
      </div>
    </div>
  );
}
