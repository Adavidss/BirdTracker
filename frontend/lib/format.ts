// Formatting helpers.
//
// eBird observation datetimes are "YYYY-MM-DD HH:MM" in the OBSERVER'S local
// time with no zone info. `new Date(thatString)` would shift them for non-ET
// viewers (and parses inconsistently across engines), so those are formatted by
// string parsing only. Pipeline-generated timestamps (meta.last_updated) are
// real ISO-8601 UTC and use normal Date math.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const OBS_RE = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/;

/** "2026-07-01 09:15" -> "Jul 1, 9:15 AM" (year appended when not the current one). */
export function formatObs(s: string): string {
  const m = OBS_RE.exec(s);
  if (!m) return s;
  const [, y, mo, d, hh, mm] = m;
  const month = MONTHS[Number(mo) - 1] ?? mo;
  const yearPart = Number(y) === new Date().getFullYear() ? "" : `, ${y}`;
  const datePart = `${month} ${Number(d)}${yearPart}`;
  if (!hh) return datePart;
  const h = Number(hh);
  const h12 = h % 12 || 12;
  return `${datePart}, ${h12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
}

/** Whole days between the observation DATE and today (local). Null if unparseable. */
export function daysAgo(s: string): number | null {
  const m = OBS_RE.exec(s);
  if (!m) return null;
  // Constructed from numbers, never parsed from the string — no zone ambiguity.
  const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}

/** "today" / "yesterday" / "3d ago", falling back to the formatted date. */
export function relativeObs(s: string): string {
  const d = daysAgo(s);
  if (d === null) return s;
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return formatObs(s.slice(0, 10));
}

/** For meta.last_updated (real ISO UTC): "42m ago" / "6h ago" / "3d ago". */
export function formatUpdated(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "recently";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Apple Maps directions to a coordinate (works on iOS/macOS and the web). */
export function appleMapsUrl(lat: number, lng: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lng}`;
}

/** Best-effort All About Birds guide URL from a common name (convenience link). */
export function allAboutBirdsUrl(comName: string): string {
  const slug = comName.replace(/['’.]/g, "").trim().replace(/\s+/g, "_");
  return `https://www.allaboutbirds.org/guide/${slug}/`;
}
