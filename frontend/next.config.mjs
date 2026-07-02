/** @type {import('next').NextConfig} */

// GitHub Pages PROJECT site served from a fixed subpath:
//   https://<user>.github.io/BirdTracker/
// basePath/assetPrefix prefix Next's <Link>, router, and /_next assets;
// NEXT_PUBLIC_BASE_PATH lets hand-built URLs (the /data/*.json fetches in
// lib/api.ts) resolve under the subpath too.
const basePath = "/BirdTracker";

const nextConfig = {
  // Static HTML export to ./out — no server (GitHub Pages serves files only).
  output: "export",
  reactStrictMode: true,
  basePath,
  assetPrefix: `${basePath}/`,
  // GitHub Pages serves /route/ -> /route/index.html; trailing slashes make that work.
  trailingSlash: true,
  // No Image Optimization server exists for a static export.
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
