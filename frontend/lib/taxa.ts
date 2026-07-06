// Full eBird taxonomy search/lookup through the Worker's /species-search
// endpoint (KV-cached server-side, ~11k species) — this is what lets the user
// find ANY exact species, not just ones already in the local data.

const BIRDS_API = process.env.NEXT_PUBLIC_BIRDS_API ?? "";

export function taxonomyEnabled(): boolean {
  return Boolean(BIRDS_API);
}

export interface TaxonInfo {
  code: string;
  com_name: string;
  sci_name: string;
  family: string;
  order: string;
  /** 4-letter banding code (e.g. AMRE), when eBird has one. */
  banding: string;
}

async function search(params: string): Promise<TaxonInfo[]> {
  const r = await fetch(`${BIRDS_API.replace(/\/$/, "")}/species-search?${params}`, {
    cache: "force-cache",
  });
  const data = (await r.json().catch(() => null)) as
    | { results?: TaxonInfo[]; error?: string }
    | null;
  if (!r.ok || !data || !Array.isArray(data.results)) {
    throw new Error(data?.error || `Species search failed (${r.status}).`);
  }
  return data.results;
}

const _searchCache = new Map<string, Promise<TaxonInfo[]>>();

/** Ranked matches for a query (common name, scientific name, banding code). */
export function searchSpecies(q: string): Promise<TaxonInfo[]> {
  const key = q.toLowerCase();
  let p = _searchCache.get(key);
  if (!p) {
    p = search(`q=${encodeURIComponent(q)}`);
    p.catch(() => _searchCache.delete(key));
    _searchCache.set(key, p);
  }
  return p;
}

const _codeCache = new Map<string, Promise<TaxonInfo | null>>();

/** Taxonomy record for one species code (null when eBird doesn't know it). */
export function lookupSpecies(code: string): Promise<TaxonInfo | null> {
  let p = _codeCache.get(code);
  if (!p) {
    p = search(`code=${encodeURIComponent(code)}`).then((rows) => rows[0] ?? null);
    p.catch(() => _codeCache.delete(code));
    _codeCache.set(code, p);
  }
  return p;
}
