// Cloudflare Worker — live eBird proxy for BirdTracker.
//
// Holds the eBird API key server-side so ANY location can be viewed live
// without exposing the key in the browser. The home area (config.json) reads
// the baked static JSON and never touches this Worker.
//
// Endpoints (all GET, all return raw eBird JSON arrays):
//   /obs?lat&lng&dist&back           recent observations (one newest per species)
//   /notable?lat&lng&dist&back       rare/notable reports (not deduped)
//   /hotspots?lat&lng&dist&back      nearby hotspots
//   /species-obs?code&lat&lng&dist&back   every recent report of one species
//
// Deploy:  npx wrangler deploy        (from worker/)
// Secret:  npx wrangler secret put EBIRD_API_KEY

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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "GET") return json({ error: "GET required" }, 405);
    if (!env.EBIRD_API_KEY) return json({ error: "Server missing EBIRD_API_KEY" }, 500);

    const url = new URL(request.url);
    const g = geoParams(url);

    let upstream = null;
    if (url.pathname.endsWith("/obs") && g) {
      upstream = `${EBIRD}/data/obs/geo/recent?lat=${g.lat}&lng=${g.lng}&dist=${g.dist}&back=${g.back}`;
    } else if (url.pathname.endsWith("/notable") && g) {
      upstream = `${EBIRD}/data/obs/geo/recent/notable?lat=${g.lat}&lng=${g.lng}&dist=${g.dist}&back=${g.back}&detail=simple`;
    } else if (url.pathname.endsWith("/hotspots") && g) {
      upstream = `${EBIRD}/ref/hotspot/geo?lat=${g.lat}&lng=${g.lng}&dist=${g.dist}&back=${g.back}&fmt=json`;
    } else if (url.pathname.endsWith("/species-obs") && g) {
      const code = (url.searchParams.get("code") || "").trim();
      if (!/^[a-z0-9]{3,12}$/.test(code)) return json({ error: "valid species code required" }, 400);
      upstream = `${EBIRD}/data/obs/geo/recent/${code}?lat=${g.lat}&lng=${g.lng}&dist=${g.dist}&back=${g.back}`;
    }
    if (!upstream) {
      return json({ error: g ? "Not found" : "lat & lng are required" }, g ? 404 : 400);
    }

    // --- daily self-cap: pause far below any real quota concern; resets 00:00
    //     UTC. Needs the optional COUNTER KV binding; without it the eBird
    //     account's own limits are the backstop. ---
    const CAP = parseInt(env.DAILY_CAP ?? "900", 10);
    if (env.COUNTER && CAP > 0) {
      const day = new Date().toISOString().slice(0, 10);
      const key = `count:${day}`;
      const used = parseInt((await env.COUNTER.get(key)) || "0", 10);
      if (used >= CAP) {
        return json(
          { error: `Daily live-lookup limit reached (${CAP}). Resets at 00:00 UTC — the home area still works.`, paused: true },
          429,
          { "Retry-After": "3600" },
        );
      }
      await env.COUNTER.put(key, String(used + 1), { expirationTtl: 172800 });
    }

    let r;
    try {
      r = await fetch(upstream, {
        headers: {
          "X-eBirdApiToken": env.EBIRD_API_KEY,
          Accept: "application/json",
          "User-Agent": "BirdTracker (personal, kidsdc.org/BirdTracker)",
        },
      });
    } catch {
      return json({ error: "Upstream fetch failed" }, 502);
    }
    if (!r.ok) return json({ error: `eBird error ${r.status}` }, 502);
    const data = await r.json();

    // Edge-cache 10 min: repeat lookups of the same place are fast and free.
    return json(data, 200, { "Cache-Control": "public, max-age=600" });
  },
};
