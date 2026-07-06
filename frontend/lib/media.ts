// Species media: photos from Wikipedia's REST summary API (keyless, sends
// CORS) and songs/calls from xeno-canto via the Worker's /calls proxy (the XC
// API needs a key and has no CORS; the audio files themselves stream straight
// from xeno-canto — media elements don't need CORS). Patterns lifted from the
// archived Bird-App experiment.

const BIRDS_API = process.env.NEXT_PUBLIC_BIRDS_API ?? "";

// --- photos ---------------------------------------------------------------------

export interface WikiPhoto {
  /** ~320px thumbnail — fine for list rows. */
  thumb: string;
  /** Large image for the species hero. */
  image: string;
  /** Wikipedia article to credit/link. */
  pageUrl: string;
  pageTitle: string;
}

const _photoCache = new Map<string, Promise<WikiPhoto | null>>();

interface WikiSummary {
  title?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
  type?: string;
}

// Wikimedia thumbnail URLs embed their pixel width (".../320px-File.jpg") and
// rescale on demand — ask for a hero-sized thumb instead of the multi-MB
// original.
function scaleThumb(thumbUrl: string, px: number): string {
  return /\/\d+px-/.test(thumbUrl) ? thumbUrl.replace(/\/\d+px-/, `/${px}px-`) : thumbUrl;
}

async function wikiSummary(name: string): Promise<WikiPhoto | null> {
  const r = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, "_"))}`,
  );
  if (!r.ok) return null;
  const d = (await r.json().catch(() => null)) as WikiSummary | null;
  const thumb = d?.thumbnail?.source;
  if (!d || !thumb || d.type === "disambiguation") return null;
  return {
    thumb,
    image: scaleThumb(thumb, 960),
    pageUrl:
      d.content_urls?.desktop?.page ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`,
    pageTitle: d.title ?? name,
  };
}

/** Photo for a species: common name first, scientific name as fallback.
 *  Resolves null when Wikipedia has neither (never throws). */
export function fetchWikiPhoto(comName: string, sciName?: string): Promise<WikiPhoto | null> {
  const key = `${comName}|${sciName ?? ""}`;
  let p = _photoCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        return (
          (comName ? await wikiSummary(comName) : null) ??
          (sciName ? await wikiSummary(sciName) : null)
        );
      } catch {
        return null;
      }
    })();
    _photoCache.set(key, p);
  }
  return p;
}

// --- songs & calls ----------------------------------------------------------------

export interface CallRecording {
  id: string;
  /** "song", "call", "alarm call", … (xeno-canto free text). */
  type: string;
  /** Quality grade A–E. */
  q: string;
  length: string;
  /** Recordist — credit them next to the player. */
  rec: string;
  cnt: string;
  loc: string;
  date: string;
  /** Direct audio URL (https://xeno-canto.org/{id}/download). */
  file: string;
}

export interface CallsResult {
  total: number;
  recordings: CallRecording[];
}

export function callsEnabled(): boolean {
  return Boolean(BIRDS_API);
}

const _callsCache = new Map<string, Promise<CallsResult>>();

/** Best recordings for a species (by scientific name), quality-ranked. */
export function fetchCalls(sciName: string): Promise<CallsResult> {
  let p = _callsCache.get(sciName);
  if (!p) {
    p = (async (): Promise<CallsResult> => {
      const r = await fetch(
        `${BIRDS_API.replace(/\/$/, "")}/calls?sp=${encodeURIComponent(sciName)}`,
        { cache: "force-cache" },
      );
      const data = (await r.json().catch(() => null)) as
        | (CallsResult & { error?: string })
        | null;
      if (!r.ok || !data || !Array.isArray(data.recordings)) {
        throw new Error(data?.error || `Recording lookup failed (${r.status}).`);
      }
      return { total: data.total ?? data.recordings.length, recordings: data.recordings };
    })();
    p.catch(() => _callsCache.delete(sciName)); // failed lookups may be retried
    _callsCache.set(sciName, p);
  }
  return p;
}

/** xeno-canto's own species page, for the "more recordings" link. */
export function xenoCantoSpeciesUrl(sciName: string): string {
  return `https://xeno-canto.org/explore?query=${encodeURIComponent(`sp:"${sciName}"`)}`;
}
