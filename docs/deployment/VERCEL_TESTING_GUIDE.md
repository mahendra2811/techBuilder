# Vercel Frontend Deployment — Internal Testing Only

> **Hard rule:** Vercel Hobby is explicitly for non-commercial personal use per Vercel's own terms.
> Treat this deployment as **internal testing only** until Phase 2 moves the frontend to EC2 (see
> `PRODUCTION_DEPLOYMENT.md` §"Phase 2") or you upgrade to a paid Vercel plan before commercial
> merchant onboarding. Do not present the Hobby URL to a paying merchant as "production."

## Verified against this repo + current Vercel docs (not assumed)

- **`web/vercel.json`** already exists (`framework: "nextjs"`, a custom `buildCommand` that first builds the `shared` workspace). I added `"regions": ["bom1"]` to it in this pass.
- **Confirmed via live Vercel docs:** the Hobby plan supports **a single custom Function region** (the docs' own Limits table: "Hobby: Single region" — not zero). Setting `bom1` (Mumbai — confirmed in Vercel's region list, maps to `ap-south-1`) is valid on Hobby; you are not silently downgraded to `iad1`.
- Default region for any new project (if unset) would otherwise be `iad1` (Washington D.C.) — the exact wrong-continent problem this plan fixes for the frontend layer, mirroring the DB-region fix.

## Project setup (Vercel dashboard)

1. **Import the Git repository** into Vercel (New Project → import from GitHub/GitLab/Bitbucket).
2. **Root Directory:** set to `web` — this is a monorepo (npm workspaces: `shared`, `backend`, `app`, `web`); Vercel must be told the frontend lives in `web/`, not the repo root.
3. **Framework preset:** Next.js (auto-detected once Root Directory is `web`).
4. **Build command:** leave as **"Use `vercel.json` settings"** or explicitly confirm it picks up `cd .. && npm run build --workspace=shared && cd web && next build` from `web/vercel.json` — this is required because `web` depends on `@techbuilder/contracts` (`shared`), which must be built first; Vercel's default per-directory build would skip it.
5. **Install command:** default (`npm install`) run from the detected Root Directory context — Vercel is monorepo-aware and installs from the repo root when it detects a workspace `package.json`; confirm the build log shows all 4 workspaces being linked (`shared`, `backend`, `app`, `web`) before assuming this "just works."
6. **Output settings:** leave default — do **not** set `NEXT_OUTPUT_STANDALONE=1` here (that env var is Phase-2/EC2-only, wired into `web/next.config.ts` in this pass; Vercel's own build pipeline handles output tracing itself and ignoring/ overriding a manual `output: 'standalone'` is unnecessary on Vercel).

## Environment variables

| Variable | Value | Environment |
|---|---|---|
| `BACKEND_ORIGIN` | `https://api.example.com` (or the Railway URL if still using that backend during transition) | Production |
| `BACKEND_ORIGIN` | same, or a staging backend URL if you stand one up | Preview |

That's the **entire** env var surface for `web/` (confirmed: `web/.env.example` has exactly one variable). No `NEXT_PUBLIC_*` variables exist in this app at all — nothing can leak to the browser bundle by construction, so there's no "did I accidentally mark a secret public" risk to review here.

- **Preview vs Production separation:** set `BACKEND_ORIGIN` per-environment in Vercel's Environment Variables UI (the "Production"/"Preview"/"Development" checkboxes) so preview deployments can point at a different backend (e.g. a staging EC2/Railway instance) without touching production traffic.
- **No secrets are exposed as `NEXT_PUBLIC_*`** — verified, there are none to begin with.

## Custom domain

Vercel dashboard → Project → Settings → Domains → add `app.example.com` (or whatever your test subdomain is), point its DNS `CNAME`/`A` record per Vercel's instructions. Skip if you're testing on the default `*.vercel.app` URL only.

## What Vercel handles vs what to verify separately

- **Static assets** (`_next/static/*`, images, fonts) are served from Vercel's global CDN automatically — no region concern there.
- **SSR / Route Handlers / Server Actions / `proxy.ts`** are the parts that actually run in the configured Function region and are what this whole region-pinning exercise is for. Verify separately (below) — a successful deploy does **not** by itself prove the region setting took effect.

## Verifying the region actually applied (do not assume)

```bash
curl -sI https://<your-app>.vercel.app/ | grep -i x-vercel-id
```

The `x-vercel-id` response header lists the region(s) a request touched, `::`-separated (edge PoP
first, execution region last). Confirm `bom1` appears as the execution region. Cross-check against
Vercel's dashboard: **Project → Deployments → (a deployment) → Functions tab** also shows the
configured region directly — use both, don't rely on just one.

If `bom1` does **not** appear:
1. Confirm `web/vercel.json`'s `regions` key deployed correctly (re-check the file made it into the deployed commit — `vercel.json` must be inside the Root Directory Vercel is configured to use, i.e. `web/vercel.json`, not a root-level one).
2. Confirm the plan is actually Hobby-eligible for this (it should be — single region is allowed) — if the deployment failed outright with a region-related build error, check Vercel's plan limits page for any changes since this doc was written.

## Auth / CORS behavior in this deployment (nothing to configure here — noting why)

This app's auth is **server-to-server**: the browser talks only to the Next.js server (same-origin
Route Handlers), which talks to the NestJS backend using a Bearer token — **the browser never calls
the backend API directly**, so there is no cross-origin *browser* request to configure CORS for on
the Vercel side. The backend's own CORS allowlist (`CORS_ORIGINS` env var, added in this pass —
see `SECURITY_CHECKLIST.md`) is about defense-in-depth on the NestJS side, not something Vercel
needs to know about.

- `middleware`/`proxy.ts` runs correctly on Vercel out of the box (Next.js's own docs confirm Proxy "works self-hosted and on Vercel with zero configuration" for `next start`/Vercel deployments — nothing to configure here).
- Server Actions aren't used in this app (confirmed: it's Route Handlers + Server Components, not `"use server"` actions) — no CSRF-origin-allowlist config needed for that feature.

## Image domains

`web/next.config.ts` has no `images.remotePatterns`/`images.domains` configured — confirmed no
external image hosts are referenced anywhere in `web/src` today (media is presented via download
links, not `next/image` from a remote R2/S3 host, since the media pipeline itself isn't fully wired
yet — see the audit's File Upload finding). **Nothing to configure now; add `images.remotePatterns`
here once R2/S3 media display is actually built.**

## No direct database access (verified, not assumed)

Confirmed: `web/package.json` has no `pg`/`drizzle-orm` dependency, and no file under `web/src`
imports either — Vercel never needs (and must never be given) `DATABASE_URL` or any DB credential.

## No migrations run from Vercel

Confirmed: no `drizzle-kit` command appears anywhere in `web/package.json` or Vercel's build
command — migrations only ever run from `backend/` against `DATABASE_URL_ADMIN`, on your machine
or from EC2, never as part of a Vercel build.
