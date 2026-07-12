import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Opt-in only (Phase-2 EC2 self-hosting build) — leaving this off for Vercel/local dev
  // preserves `next start`/`next dev` exactly as they work today. Set NEXT_OUTPUT_STANDALONE=1
  // in the build environment to produce the minimal .next/standalone/server.js bundle instead.
  // (`next start` prints a harmless warning but should not be used once this is on — run
  // `node .next/standalone/server.js` per docs/deployment/PRODUCTION_DEPLOYMENT.md.)
  ...(process.env.NEXT_OUTPUT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
