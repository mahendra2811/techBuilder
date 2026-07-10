# techBuilder Web — Performance Diagnosis & Fix Plan

> **Date:** 2026-07-09 · **Measured live** against the running local stack (backend `localhost:4000`, web `next dev`, DB = Neon).
> **Verdict up front:** the backend being on your PC is NOT the problem (local hop = 3.7ms). The problem is that the **database is in the USA (Neon `us-east-1`) while you and the backend are in India**, multiplied by an architecture that makes **many sequential DB round trips per API call** and **many API calls per page**. Dev mode + per-navigation SSR session checks add page-transition latency on top.

---

## 1. Measured data (raw evidence)

All timings taken 2026-07-09 with `curl` against `http://localhost:4000/api/v1` using a real seeded login (`owner`/devco).

| Call | Time | Notes |
|---|---|---|
| `GET /health` | **0.004s** | No DB. Proves the local backend hop is essentially free. |
| `POST /auth/login` (first call after idle) | **8.2s** | Neon free-tier compute had auto-suspended → cold resume + queries. |
| `GET /me` (warm) | **4.9s** | Multiple sequential queries (user + org + …) inside a tenant tx. |
| `GET /sites` (warm) | **1.6s** | ONE trivial select — still 1.6s (tx overhead × ocean RTT). |
| `GET /vehicles` (warm) | **1.5s** | Same shape as /sites. |
| `GET /dashboards/owner?from=…&to=…` (warm) | **6.2s** | ~18 sequential awaits in `dashboards.service.ts` (221 lines). |
| `GET /completeness?from=…&to=…` (warm) | **2.4s** | Aggregate query set. |

Supporting facts verified in code/config:

- `backend/.env` → `DATABASE_URL=…ep-curly-boat-atylh926-pooler.c-9.us-east-1.aws.neon.tech…` → **us-east-1 (N. Virginia, USA)**. India ⇄ us-east-1 RTT ≈ **250–300ms per SQL round trip**.
- `backend/src/db/db.service.ts` → `new Pool({ connectionString })` — **all pg defaults**: `max: 10`, `idleTimeoutMillis: 10_000` (connections die after 10s idle → next request re-pays TCP+TLS handshake to the US, ~3–4 RTTs ≈ +1s).
- `DbService.runInTenant` wraps EVERY request in a transaction: `BEGIN` + `select set_config('app.org_id',…)` + queries + `COMMIT` → **+3 round trips of pure overhead per API call** (required for RLS, but each is a US round trip today).
- `backend/src/common/scope.util.ts` `loadScope` → up to **~6 more sequential queries** (user → managed sites → crews → members → vehicles) before the endpoint's real work, on every scoped request.
- JWT validation is stateless (`jwt.strategy.ts`) — good, no DB hit there.
- Web runs as **`next dev`** (confirmed in process list) → every route compiles on first visit (seconds), nothing is optimized.
- Every protected page's SSR goes through `requireRole()` → `getSession()` → `GET /me`. It IS memoized (60s per token, `web/src/lib/server/backend.ts`) — but after 60s idle, the **next navigation blocks ~5s on /me before HTML is even sent**.
- `web/src/app/providers.tsx` → React Query `staleTime: 30_000` — after 30s, **every navigation refetches everything**; no `placeholderData`, no cache persistence, no manual-refresh affordance.
- Owner dashboard (`owner-dashboard-screen.tsx`) fires **6 base queries + 1 attendance query PER SITE + a second "today" dashboard query** — ~9+ HTTP requests, each browser → Next proxy → Nest → Neon. The dev server speaks HTTP/1.1, so the browser caps at ~6 concurrent requests to one origin.

### The multiplication that produces "6 seconds for a dashboard"

```
1 API call  =  BEGIN + set_config + (scope: up to 6 queries) + (business: 1–18 queries) + COMMIT
            =  5 … 25+ sequential round trips
            ×  ~300ms India→us-east-1 per round trip
            =  1.5s … 6s+ per API call            ← matches every measurement above
1 page      =  4 … 10 API calls (partly parallel, capped at 6)
            + SSR /me gate (up to 5s when memo cold)
            + next-dev route compilation (first visit)
```

---

## 2. The breaking flow (end to end)

```
User clicks a nav link
 │
 ├─ [next dev] first visit to that route → compile (1–5s, dev only)
 │
 ├─ proxy.ts middleware: cookie check (fast) / token rotation (1 backend call if expired)
 │
 ├─ SSR: role layout → requireRole() → getSession() → GET /me
 │        ├─ memo hit (<60s since last) → ~0ms  ✅
 │        └─ memo cold → 4.9s BLOCKING the whole page render  ❌
 │
 ├─ HTML arrives → React Query fires the page's queries (4–10 requests)
 │        each: browser → /api/proxy (Next) → NestJS → Neon(us-east-1)
 │                                              └─ BEGIN+set_config+scope+queries+COMMIT
 │                                                 = 1.5–6.2s each  ❌❌ (dominant cost)
 │
 ├─ staleTime is only 30s → coming BACK to a page usually refetches everything ❌
 ├─ no placeholderData → toggles/filters that change the queryKey drop the UI
 │        back to skeletons instead of keeping old data visible ❌
 └─ pg pool idle-closes after 10s → sporadic +1s TLS reconnect spikes;
    Neon free tier auto-suspends after ~5min idle → first hit 5–10s ❌
```

---

## 3. Root causes, ranked by impact

| # | Root cause | Evidence | Cost |
|---|---|---|---|
| 1 | **DB on another continent** — Neon `us-east-1`, users/backend in India | `backend/.env`; every warm call ≥1.5s | ~300ms × every SQL round trip |
| 2 | **Round-trip multiplication per request** — RLS tx (BEGIN/set_config/COMMIT) + `loadScope` (≤6 queries) + sequential service queries (dashboard ~18) | `db.service.ts`, `scope.util.ts`, `dashboards.service.ts` | 5–25 round trips per API call |
| 3 | **Request fan-out per page** — dashboard ≈ 9+ API calls incl. per-site attendance N+1 | `owner-dashboard-screen.tsx` | pages need many slow calls |
| 4 | **SSR session gate per navigation** — `/me` (4.9s) blocks rendering when the 60s memo is cold | `require-session.ts`, `backend.ts` | up to ~5s TTFB per nav |
| 5 | **`next dev` mode** — on-demand compilation, no optimization, HTTP/1.1 6-connection cap | process list | 1–5s first visit per route |
| 6 | **Connection churn + cold starts** — pg pool `idleTimeoutMillis` 10s; Neon free-tier auto-suspend | `db.service.ts` defaults; 8.2s login | +1s spikes; 5–10s after idle |
| 7 | **Cache policy too timid client-side** — staleTime 30s, no `keepPreviousData`, no persistence, no refresh button, loading states replace data | `providers.tsx`, screens | refetch storms; skeleton flashes; layout jumps on some screens |

**What is already good** (don't redo): httpOnly-cookie auth with one-shot refresh; stateless JWT; 60s SSR session memo; React Query everywhere; the owner-dashboard KPI skeleton already reserves exact geometry (`kpi-skeleton`); `refetchOnWindowFocus` disabled; deferred below-fold digest query.

---

## 4. Solutions (prioritized)

### Tier 1 — Move the data close to the compute (biggest win, ~10–20× on API times)

Pick ONE of these topologies; both eliminate the ocean-per-query problem:

**Option A (recommended for production): co-locate backend + DB, accept one ocean hop per API call — or none.**
- Redeploy the current backend to Railway (deploy predates this build) and point `web` at it. Railway (US) ⇄ Neon us-east-1 is ~1–5ms per query, so `/dashboards/owner` becomes ~1 browser round trip (~300ms) + a few ms of queries ≈ **0.4–0.7s instead of 6.2s** — even though the DB never moved.
- Better still: put BOTH backend and DB in/near India — e.g. Neon in its nearest Asian region (Singapore `ap-southeast-1`; check if Mumbai is offered now) + backend on a Singapore/Mumbai host. Then every API call is ~60–90ms of network total.
- Note: `web/.env` already has the Railway URL (with a trailing slash — strip it, it produces `//api/v1` when concatenated with `API_BASE`); `.env.local` currently overrides it to localhost.

**Option B (dev experience): run a local Postgres for development.**
- Docker Postgres + run migrations/rls/seed → every query <5ms locally; the whole app feels instant while developing. Keep Neon for staging/prod. This alone fixes "everything is slow on my PC" during development.

**Also in this tier:**
- Pool tuning in `db.service.ts`: `idleTimeoutMillis: 0` (or ≥5 min), `keepAlive: true` — stop re-paying TLS handshakes.
- Neon auto-suspend: disable it (paid setting) or add a 4-minute keep-warm ping (cron hitting `/health`-style DB query) so the 8s cold-resume never hits a user.

### Tier 2 — Cut round trips per request (backend)

1. **Collapse `loadScope` to one SQL statement** (joins/CTE instead of ≤6 sequential selects), or cache the scope per (userId, version) for 30–60s in-memory.
2. **Batch dashboard queries**: combine the ~18 sequential awaits into a few multi-aggregate statements (or `UNION ALL`/CTE bundles). Target ≤5 round trips for `/dashboards/owner`.
3. **Kill the attendance N+1**: one endpoint/query returning today's marked-count for ALL sites (the dashboard currently queries per site).
4. **Session/org config caching** server-side (org config, sites list) with short TTL — they change rarely.
5. Keep `runInTenant` (RLS is non-negotiable) but note: fewer queries per tx automatically means the BEGIN/COMMIT overhead amortizes better.

### Tier 3 — Frontend caching + refresh UX (exactly what you described)

1. **Central query defaults** (`providers.tsx`): raise `staleTime` per data class — reference data (sites, vehicles, me): 5–15 min; dashboards/lists: 1–3 min. Set `gcTime` ≥ 30 min so back-navigation renders instantly from cache while a background refetch runs.
2. **`placeholderData: keepPreviousData`** on every query whose key changes with a toggle/filter/date (dashboard window today/7d/30d, insights date pickers): old data stays on screen, no skeleton flash, zero height jump.
3. **Refresh button** (global in `RoleShell` header + optional per-card): calls `queryClient.invalidateQueries({ refetchType: 'active' })`. Show a small spinner on the button driven by `useIsFetching()`. React Query already keeps existing data during refetch — so **data never disappears; the loader appears only on the button** (plus optionally a thin top progress bar).
4. **Show skeletons only on true first load**: gate on `isPending` (no cached data yet), never on `isFetching`. Extend the owner-dashboard skeleton pattern (exact reserved geometry, `min-h-*` on every card/section) to all screens so pre-load/loading/loaded heights match.
5. **Persist the cache** with `@tanstack/react-query-persist-client` + localStorage: after a full reload/PWA relaunch the last data paints instantly, then revalidates in background.
6. **Prefetch on intent**: `queryClient.prefetchQuery` for a page's core queries on nav-link hover/press — navigation then lands on warm data.
7. **Hydrate `['me']` from the SSR session** the layout already fetched (pass via props/hydration) instead of re-querying `/me` from the browser.
8. **Run the production build** when using (not developing) the app: `next build && next start` — removes compile-on-navigate entirely.

### Expected outcome

| Scenario | Today | After Tier 1 | After Tiers 1–3 |
|---|---|---|---|
| `/sites`-class call | 1.6s | 50–300ms | same, but usually served from cache |
| Owner dashboard API | 6.2s | 0.4–0.9s | instant paint from cache + background refresh |
| Page-to-page nav | 2–10s | <1s | ~instant (cache + prefetch + prod build) |
| After 5 min idle | 8s+ first hit | no cold start | no cold start |

---

## 5. Suggested execution order

1. **Dev:** local Docker Postgres for day-to-day work (unblocks you immediately).
2. **Prod path:** redeploy Railway backend (current code + migrations 0001–0003 already on Neon), strip trailing slash in `web/.env`, point web at it — then re-measure.
3. Pool keepalive + Neon keep-warm.
4. Frontend Tier 3 (query defaults → keepPreviousData → refresh button → skeleton-geometry audit → persistence → prefetch).
5. Backend Tier 2 (scope collapse → dashboard batching → attendance endpoint).
6. Longer term: pick the India/Singapore region topology for pilot users.

---

## Appendix — collection notes

- Timings: `curl -w %{time_total}` after a real login; Neon was warm for all rows except the 8.2s login.
- ICMP and direct TCP:5432 to Neon are blocked from this network/sandbox (IPv6-only DNS answer locally); latency was therefore measured through the backend, which is the number that matters anyway.
- File inventory + per-file purposes captured in [`docs/CODEBASE-INDEX.md`](../CODEBASE-INDEX.md) (same session).
