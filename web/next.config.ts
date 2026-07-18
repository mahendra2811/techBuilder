import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next build` OOM-killed (exit 137) building directly on a small EC2 box (2026-07-16).
  // Turbopack's memory-eviction fix (`experimental.turbopackMemoryEviction`) isn't in this
  // installed version (16.2.10) — it only exists on Next's canary branch, verified against
  // node_modules/next/dist, not assumed. Fell back to webpack instead (`--webpack` in
  // package.json's build script, verified as a real CLI flag on this version) + this flag,
  // which IS present in 16.2.10's config schema and trims webpack's own memory footprint
  // (string interning instead of dual-buffer caching). The durable fix is still to build off
  // the box entirely (see docs/deployment/PRODUCTION_DEPLOYMENT.md's "build strategy") — this
  // is the on-box mitigation for whoever is running the ad-hoc start.sh/PM2 flow instead.
  experimental: {
    webpackMemoryOptimizations: true,
  },

  // Opt-in only (Phase-2 EC2 self-hosting build) — leaving this off for Vercel/local dev
  // preserves `next start`/`next dev` exactly as they work today. Set NEXT_OUTPUT_STANDALONE=1
  // in the build environment to produce the minimal .next/standalone/server.js bundle instead.
  // (`next start` prints a harmless warning but should not be used once this is on — run
  // `node .next/standalone/server.js` per docs/deployment/PRODUCTION_DEPLOYMENT.md.)
  ...(process.env.NEXT_OUTPUT_STANDALONE === "1" ? { output: "standalone" as const } : {}),

  // Round-2 CW-1: TEAM_HEAD → SUPERVISOR rename moved the role area from /team-head to
  // /supervisor — permanently redirect any stale bookmarks/links.
  async redirects() {
    return [
      {
        source: "/team-head/:path*",
        destination: "/supervisor/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
