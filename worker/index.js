// Cloudflare Worker — live eBird proxy for BirdTracker.
//
// Holds the eBird API key server-side so ANY location can be viewed live
// without exposing the key in the browser. The home area (config.json) reads
// the baked static JSON and never touches this Worker.
//
// Endpoints (all GET):
//   /obs?lat&lng&dist&back           recent observations (one newest per species)
//   /notable?lat&lng&dist&back       rare/notable reports (not deduped)
//   /hotspots?lat&lng&dist&back      nearby hotspots
//   /species-obs?code&lat&lng&dist&back   every recent report of one species
//   /seasonality?lat&lng             sampled 48-week presence profile (see below)
//   /calls?sp=Genus+species          xeno-canto recordings for one species
//
// Deploy:   npx wrangler deploy        (from worker/)
// Secrets:  npx wrangler secret put EBIRD_API_KEY
//           npx wrangler secret put XENOCANTO_API_KEY

const EBIRD = "https://api.ebird.org/v2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extraHeaders },
  });
}

// Shared lat/lng/dist/back parsing with eBird's hard limits enforced.
function geoParams(url) {
  const lat = parseFloat(url.searchParams.get("lat"));
  const lng = parseFloat(url.searchParams.get("lng"));
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  const dist = Math.min(Math.max(parseInt(url.searchParams.get("dist") || "25", 10) || 25, 1), 50);
  const back = Math.min(Math.max(parseInt(url.searchParams.get("back") || "14", 10) || 14, 1), 30);
  return { lat, lng, dist, back };
}

function ebirdFetch(path, env) {
  return fetch(`${EBIRD}${path}`, {
    headers: {
      "X-eBirdApiToken": env.EBIRD_API_KEY,
      Accept: "application/json",
      "User-Agent": "BirdTracker (personal, kidsdc.org/BirdTracker)",
    },
  });
}

// --- daily self-cap: pause far below any real quota concern; resets 00:00 UTC.
//     Needs the optional COUNTER KV binding; without it the eBird account's own
//     limits are the backstop. `cost` = upstream eBird calls this request makes.
async function chargeCap(env, cost) {
  const CAP = parseInt(env.DAILY_CAP ?? "900", 10);
  if (!env.COUNTER || CAP <= 0) return null;
  const day = new Date().toISOString().slice(0, 10);
  const key = `count:${day}`;
  const used = parseInt((await env.COUNTER.get(key)) || "0", 10);
  if (used + cost > CAP) {
    return json(
      { error: `Daily live-lookup limit reached (${CAP}). Resets at 00:00 UTC — the home area still works.`, paused: true },
      429,
      { "Retry-After": "3600" },
    );
  }
  await env.COUNTER.put(key, String(used + cost), { expirationTtl: 172800 });
  return null;
}

// --- /seasonality — sampled year-round presence profile around a point -------
//
// True seasonality needs a year of daily history (what the home pipeline
// accumulates); replaying that live is impossible. Instead: sample TWO days per
// month over the most recent complete year — the 11th (eBird pseudo-week 2 of
// the month) stands in for weeks 1-2, the 25th (pseudo-week 4) for weeks 3-4.
// 24 historic calls total, aggregated to the exact 48-week shape the frontend
// charts already read, then KV-cached per region for ~30 days. Frequencies are
// per SAMPLED day (binary per week-pair) — coarser than home, honest anywhere.
//
// The sampled region is the COUNTY (subnational2) of the nearest hotspot to
// the requested point: whole-state historic queries time out inside eBird
// (US-NC took 60s+ and 500ed), while county-days answer in ~1-2s — and county
// timing is the locally relevant answer anyway.
const SAMPLE_DAYS = [11, 25];
const SEASON_TTL_OK = 30 * 86400; // full sample set: refresh monthly
const SEASON_TTL_PARTIAL = 86400; // some samples failed: retry tomorrow
const MIN_SAMPLED_DAYS = 2; // drop one-off vagrants (would fake arrivals)

// Nearest hotspot's region codes, falling up the tree where counties don't
// exist (many countries have no subnational2 in eBird).
async function resolveRegion(lat, lng, env) {
  for (const dist of [25, 50]) {
    let hotspots;
    try {
      const r = await ebirdFetch(`/ref/hotspot/geo?lat=${lat}&lng=${lng}&dist=${dist}&fmt=json`, env);
      if (!r.ok) continue;
      hotspots = await r.json();
    } catch {
      continue;
    }
    if (!Array.isArray(hotspots)) continue;
    let best = null;
    let bestD = Infinity;
    for (const h of hotspots) {
      if (h.lat == null || h.lng == null) continue;
      const d = (h.lat - lat) ** 2 + (h.lng - lng) ** 2;
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    const code = best?.subnational2Code || best?.subnational1Code || best?.countryCode;
    if (code) return code;
  }
  return null;
}

// Human name for a region code ("Orange, North Carolina, United States");
// falls back to the code itself.
async function regionName(region, env) {
  try {
    const r = await ebirdFetch(`/ref/region/info/${region}`, env);
    if (!r.ok) return region;
    const info = await r.json();
    return typeof info?.result === "string" && info.result ? info.result : region;
  } catch {
    return region;
  }
}

function sampleDates(now) {
  // Most recent occurrence of each (month, day) strictly before today (UTC),
  // so every sampled day is complete. [{y, m0, d, weeks:[a,b]}]
  const dates = [];
  const todayKey = now.toISOString().slice(0, 10);
  for (let m0 = 0; m0 < 12; m0++) {
    SAMPLE_DAYS.forEach((d, sub) => {
      let y = now.getUTCFullYear();
      const key = `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (key >= todayKey) y -= 1;
      dates.push({ y, m0, d, weeks: [m0 * 4 + sub * 2, m0 * 4 + sub * 2 + 1] });
    });
  }
  return dates;
}

async function seasonality(url, env) {
  let region = (url.searchParams.get("region") || "").trim().toUpperCase();
  if (region && !/^[A-Z]{2}(-[A-Z0-9]{1,3}){0,2}$/.test(region)) {
    return json({ error: "valid region required (e.g. US-NC-135)" }, 400);
  }
  if (!region) {
    const lat = parseFloat(url.searchParams.get("lat"));
    const lng = parseFloat(url.searchParams.get("lng"));
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return json({ error: "lat & lng (or region) are required" }, 400);
    }
    const capped = await chargeCap(env, 2);
    if (capped) return capped;
    region = await resolveRegion(lat, lng, env);
    if (!region) {
      return json({ error: "No eBird hotspots near this point to anchor a region — try a nearby town." }, 404);
    }
  }

  const cacheKey = `season:v2:${region}`;
  if (env.COUNTER) {
    const hit = await env.COUNTER.get(cacheKey);
    if (hit) {
      return new Response(hit, {
        headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "public, max-age=3600" },
      });
    }
  }

  const dates = sampleDates(new Date());
  const capped = await chargeCap(env, dates.length + 1);
  if (capped) return capped;
  const displayName = await regionName(region, env);

  const weeksByCode = new Map(); // code -> Uint-ish array(48)
  const daysByCode = new Map(); // code -> sampled days present
  const names = {}; // code -> { com_name, sci_name }
  const covered = new Array(48).fill(0);
  let failed = 0;

  // Waves of 8 keep well inside eBird's tolerance and Workers' limits.
  for (let i = 0; i < dates.length; i += 8) {
    const wave = dates.slice(i, i + 8);
    await Promise.all(
      wave.map(async (s) => {
        let records;
        try {
          const r = await ebirdFetch(
            `/data/obs/${region}/historic/${s.y}/${s.m0 + 1}/${s.d}?detail=simple&cat=species`,
            env,
          );
          if (!r.ok) throw new Error(String(r.status));
          records = await r.json();
        } catch {
          failed += 1;
          return; // this sample's two weeks stay uncovered — charts dim them
        }
        for (const w of s.weeks) covered[w] += 1;
        const seen = new Set();
        for (const rec of Array.isArray(records) ? records : []) {
          const code = rec.speciesCode;
          if (!code || seen.has(code)) continue;
          seen.add(code);
          let weeks = weeksByCode.get(code);
          if (!weeks) {
            weeks = new Array(48).fill(0);
            weeksByCode.set(code, weeks);
          }
          for (const w of s.weeks) weeks[w] += 1;
          daysByCode.set(code, (daysByCode.get(code) || 0) + 1);
          if (!names[code] && rec.comName) {
            names[code] = { com_name: rec.comName, sci_name: rec.sciName || "" };
          }
        }
      }),
    );
  }

  if (failed > 4) {
    return json({ error: `eBird returned no data for ${region} (${failed}/${dates.length} samples failed).` }, 502);
  }

  const species = [...weeksByCode.entries()]
    .filter(([code]) => (daysByCode.get(code) || 0) >= MIN_SAMPLED_DAYS)
    .map(([code, weeks]) => ({ code, weeks, total_days: daysByCode.get(code) || 0 }))
    .sort((a, b) => b.total_days - a.total_days);

  const sampled = dates
    .map((s) => `${s.y}-${String(s.m0 + 1).padStart(2, "0")}-${String(s.d).padStart(2, "0")}`)
    .sort();
  const body = JSON.stringify({
    generated_at: new Date().toISOString(),
    region,
    region_name: displayName,
    regions: [region],
    first_date: sampled[0] ?? null,
    last_date: sampled[sampled.length - 1] ?? null,
    sample_count: dates.length,
    failed_samples: failed,
    weeks_covered: covered,
    species,
    names,
  });

  if (env.COUNTER) {
    await env.COUNTER.put(cacheKey, body, {
      expirationTtl: failed === 0 ? SEASON_TTL_OK : SEASON_TTL_PARTIAL,
    });
  }
  return new Response(body, {
    headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "public, max-age=3600" },
  });
}

// --- /calls — xeno-canto recordings for one species ---------------------------
//
// xeno-canto's API v3 needs a key and sends no CORS headers, so the browser
// can't call it directly — this proxies the search and slims the response.
// The audio itself streams straight from xeno-canto (media elements don't
// need CORS): https://xeno-canto.org/{id}/download
const QUALITY_RANK = { A: 0, B: 1, C: 2, D: 3, E: 4 };

async function calls(url, env) {
  if (!env.XENOCANTO_API_KEY) return json({ error: "Server missing XENOCANTO_API_KEY" }, 500);
  const sp = (url.searchParams.get("sp") || "").trim();
  // Scientific names only: "Setophaga ruticilla" (letters, spaces, .'-).
  if (!/^[A-Za-z][A-Za-z .'-]{2,60}$/.test(sp)) {
    return json({ error: "valid scientific name required (sp=Genus species)" }, 400);
  }

  let data;
  try {
    const r = await fetch(
      `https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(`sp:"${sp}"`)}&key=${env.XENOCANTO_API_KEY}&per_page=50`,
      { headers: { Accept: "application/json", "User-Agent": "BirdTracker (personal, kidsdc.org/BirdTracker)" } },
    );
    if (!r.ok) return json({ error: `xeno-canto error ${r.status}` }, 502);
    data = await r.json();
  } catch {
    return json({ error: "xeno-canto fetch failed" }, 502);
  }

  const recordings = (Array.isArray(data?.recordings) ? data.recordings : [])
    .filter((r) => r.file && r.id)
    .sort((a, b) => (QUALITY_RANK[a.q] ?? 9) - (QUALITY_RANK[b.q] ?? 9))
    .slice(0, 12)
    .map((r) => ({
      id: r.id,
      type: r.type || "",
      q: r.q || "",
      length: r.length || "",
      rec: r.rec || "",
      cnt: r.cnt || "",
      loc: r.loc || "",
      date: r.date || "",
      file: r.file,
    }));

  // Recordings change rarely — let the edge hold them for a day.
  return json(
    { species: sp, total: Number(data?.numRecordings ?? recordings.length), recordings },
    200,
    { "Cache-Control": "public, max-age=86400" },
  );
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "GET") return json({ error: "GET required" }, 405);
    if (!env.EBIRD_API_KEY) return json({ error: "Server missing EBIRD_API_KEY" }, 500);

    const url = new URL(request.url);

    if (url.pathname.endsWith("/seasonality")) return seasonality(url, env);
    if (url.pathname.endsWith("/calls")) {
      const capped = await chargeCap(env, 1);
      return capped ?? calls(url, env);
    }

    const g = geoParams(url);

    let upstream = null;
    if (url.pathname.endsWith("/obs") && g) {
      upstream = `/data/obs/geo/recent?lat=${g.lat}&lng=${g.lng}&dist=${g.dist}&back=${g.back}`;
    } else if (url.pathname.endsWith("/notable") && g) {
      upstream = `/data/obs/geo/recent/notable?lat=${g.lat}&lng=${g.lng}&dist=${g.dist}&back=${g.back}&detail=simple`;
    } else if (url.pathname.endsWith("/hotspots") && g) {
      upstream = `/ref/hotspot/geo?lat=${g.lat}&lng=${g.lng}&dist=${g.dist}&back=${g.back}&fmt=json`;
    } else if (url.pathname.endsWith("/species-obs") && g) {
      const code = (url.searchParams.get("code") || "").trim();
      if (!/^[a-z0-9]{3,12}$/.test(code)) return json({ error: "valid species code required" }, 400);
      upstream = `/data/obs/geo/recent/${code}?lat=${g.lat}&lng=${g.lng}&dist=${g.dist}&back=${g.back}`;
    }
    if (!upstream) {
      return json({ error: g ? "Not found" : "lat & lng are required" }, g ? 404 : 400);
    }

    const capped = await chargeCap(env, 1);
    if (capped) return capped;

    let r;
    try {
      r = await ebirdFetch(upstream, env);
    } catch {
      return json({ error: "Upstream fetch failed" }, 502);
    }
    if (!r.ok) return json({ error: `eBird error ${r.status}` }, 502);
    const data = await r.json();

    // Edge-cache 10 min: repeat lookups of the same place are fast and free.
    return json(data, 200, { "Cache-Control": "public, max-age=600" });
  },
};
