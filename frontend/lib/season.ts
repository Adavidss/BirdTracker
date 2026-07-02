// Seasonality math over eBird's 48-week calendar (4 pseudo-weeks per month:
// days 1-7, 8-14, 15-21, 22-end). weekOfYear is a mirror of
// pipeline/aggregate.py week_of_year — keep the two in sync.

import type { SeasonSpecies } from "./types";

export const WEEKS = 48;

export function weekOfYear(d: Date): number {
  return d.getMonth() * 4 + Math.min(3, Math.floor((d.getDate() - 1) / 7));
}

export function currentWeek(): number {
  return weekOfYear(new Date());
}

const wrap = (w: number) => ((w % WEEKS) + WEEKS) % WEEKS;

/** Fraction of covered days in week `w` the species was reported (0 when uncovered). */
export function freqAt(sp: SeasonSpecies, covered: number[], w: number): number {
  const c = covered[w] ?? 0;
  return c > 0 ? (sp.weeks[w] ?? 0) / c : 0;
}

function meanFreq(sp: SeasonSpecies, covered: number[], ws: number[]): number {
  if (ws.length === 0) return 0;
  return ws.reduce((acc, w) => acc + freqAt(sp, covered, w), 0) / ws.length;
}

/** Mean frequency over the next 4 weeks minus the previous 4 (wraps Dec->Jan). */
export function trendAt(sp: SeasonSpecies, covered: number[], now: number): number {
  const next = [1, 2, 3, 4].map((i) => wrap(now + i));
  const prev = [1, 2, 3, 4].map((i) => wrap(now - i));
  return meanFreq(sp, covered, next) - meanFreq(sp, covered, prev);
}

export const TREND_THRESHOLD = 0.15;
export const PRESENCE_FLOOR = 0.2;

export interface Trended {
  sp: SeasonSpecies;
  trend: number;
}

/** Species whose presence is climbing into the next month — worth looking for soon. */
export function arrivals(species: SeasonSpecies[], covered: number[], now: number): Trended[] {
  return species
    .map((sp) => ({ sp, trend: trendAt(sp, covered, now) }))
    .filter(
      ({ sp, trend }) =>
        trend >= TREND_THRESHOLD &&
        meanFreq(sp, covered, [1, 2, 3, 4].map((i) => wrap(now + i))) >= PRESENCE_FLOOR,
    )
    .sort((a, b) => b.trend - a.trend);
}

/** Species fading out — see them before they leave. */
export function departures(species: SeasonSpecies[], covered: number[], now: number): Trended[] {
  return species
    .map((sp) => ({ sp, trend: trendAt(sp, covered, now) }))
    .filter(
      ({ sp, trend }) =>
        trend <= -TREND_THRESHOLD &&
        meanFreq(sp, covered, [1, 2, 3, 4].map((i) => wrap(now - i))) >= PRESENCE_FLOOR,
    )
    .sort((a, b) => a.trend - b.trend);
}

/** Mean frequency across a month's 4 weeks. */
export function monthMeanFreq(sp: SeasonSpecies, covered: number[], month: number): number {
  return meanFreq(sp, covered, [0, 1, 2, 3].map((i) => month * 4 + i));
}

export interface MonthEntry {
  sp: SeasonSpecies;
  freq: number;
}

/** Species reliably around in a month (mean freq >= minFreq), most frequent first. */
export function monthSpecies(
  species: SeasonSpecies[],
  covered: number[],
  month: number,
  minFreq: number = PRESENCE_FLOOR,
): MonthEntry[] {
  return species
    .map((sp) => ({ sp, freq: monthMeanFreq(sp, covered, month) }))
    .filter(({ freq }) => freq >= minFreq)
    .sort((a, b) => b.freq - a.freq);
}

const WEEK_ENDS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Week 25 -> "Jul 8–14"; the long week 4 runs to month-end (Feb: non-leap label). */
export function weekLabel(w: number): string {
  const month = Math.floor(w / 4);
  const sub = w % 4;
  const start = sub * 7 + 1;
  const end = sub === 3 ? WEEK_ENDS[month] : start + 6;
  return `${MONTH_NAMES[month]} ${start}–${end}`;
}

export function monthName(month: number): string {
  return MONTH_NAMES[month] ?? "";
}

/** Index of the species' best week, or -1 if it was never reported. */
export function peakWeek(sp: SeasonSpecies, covered: number[]): number {
  let best = -1;
  let bestFreq = 0;
  for (let w = 0; w < WEEKS; w++) {
    const f = freqAt(sp, covered, w);
    if (f > bestFreq) {
      bestFreq = f;
      best = w;
    }
  }
  return best;
}
