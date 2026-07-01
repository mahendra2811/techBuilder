# techBuilder — AI Project Context

> **Purpose of this file**: Give any AI (Claude, ChatGPT, Gemini) or human reader a complete understanding of this project in one read. Also serves as my personal interview-prep cheat sheet.

---

## 0. ⚡ CURRENT DIRECTION — Phase 1 (READ THIS FIRST; supersedes the original architecture below)

The project has **pivoted** from the original multi-tenant web+mobile+API plan to a focused Phase-1 build. **Sections 1–12 below are the original architecture/research — kept for reference but SUPERSEDED by this section for what we're actually building now.**

- **Product:** a **self-service org-management + daily-records app** for a **single construction company at a time**.
- **Platform:** **Android app** (Expo SDK 55 / React Native, NativeWind). No web/iOS in Phase 1. The `proj/apps/web` Next.js scaffold is a *later-phase* Owner web dashboard — **not** the Phase-1 build.
- **Architecture:** one reusable **`techbuilder-engine`** (git submodule) + **ONE app codebase** — **no per-merchant code forks** (wrong for Android distribution). Per-client = a `merchants/<id>/config.ts` + assets only. White-label = an EAS build profile, not a code fork. Modeled on Primathon's storefront builder (engine + thin per-merchant), minus the page-builder/widget-registry/editor (overkill — techBuilder screens are identical across construction companies; variation is config + seed data).
- **Adapter pattern (key):** screens call `RecordsClient` / `AuthClient` interfaces, never the backend. Build all screens against a **`mock` adapter** now, swap to `rest` later with **zero screen changes**.
- **Business model:** **managed/agency** — the developer onboards each company by hand (take payment offline → create org + owner login → hand over). **After onboarding the developer does nothing further — everything is self-service in-app.**
- **Auth + payment: OUT of scope** — manual login stub only (no signup/OTP/forgot/payment). Added later behind the same interface.
- **Tenant-aware from day one:** `orgId` on every model + every query org-scoped, so a future flip to self-serve multi-tenant SaaS is additive, not a rewrite.

**The 5 roles (Phase 1)** — renamed/trimmed from the original 6:

| Phase-1 role | maps to original | account creation rights |
|---|---|---|
| **Owner** | Manager / company owner | creates anyone (org-wide) |
| **Site Manager** | Sub-Manager | creates Team Head / Driver / Worker (own site) |
| **Team Head** (Mistri) | Worker Head | creates Worker / Driver (own crew) |
| **Driver** | Driver | — |
| **Worker** | Worker | — (view-only in P1) |

*(Original "Admin / Super Admin" role is dropped — the developer provisions orgs in the agency model.)*

**What's IN Phase 1:** self-service org management with **RBAC + scopes**; cascading account creation (Owner→Site Manager→Team Head); type-driven vehicles (km/hours + dynamic inputs, config-not-code) with driver-compatibility + a generic **request→approval** engine (vehicle-switch, leave, material); **per-person attendance + multi-day leave** (marked manually by Team Head / Site Manager only — **no clock-in/out, no GPS** on attendance); daily **records** (expense tracker incl. Team Head, fuel, trips, material-movement, photos, issues) captured via camera/scanner/GPS, entered **end-of-day**, rolling up to the Owner; **Excel export** + windowed (7/30-day) import/export + scheduled backups; Hindi/English; offline-first.

### ✅ Locked decisions (at a glance)
| # | Decision | Choice |
|---|---|---|
| 1 | Product | Self-service org-management + daily-records app; **functionality only**, design not negotiated |
| 2 | Platform | **Android** (Expo SDK 55 / RN), single-merchant; web/iOS later |
| 3 | Packaging | **One engine + one app codebase** (engine = git submodule); **no code forks**; per-client = `merchants/<id>/config.ts` + assets |
| 4 | Business model | **Managed/agency** — dev provisions org + owner login; everything else self-service in-app |
| 5 | Auth & payment | **Manual & out of scope** — login stub only (no signup/OTP/forgot/payment); added later behind same interface |
| 6 | Multi-tenant | **Tenant-aware from day one** (`orgId` everywhere) → future self-serve flip is additive |
| 7 | Roles | **5**: Owner, Site Manager, Team Head, Driver, Worker |
| 8 | Account creation | Cascades **Owner → Site Manager → Team Head** (scoped) |
| 9 | Attendance | Per-person present/absent/half-day + multi-day leave; **marked by TH/SM only — no clock-in/out, no GPS** |
| 10 | Vehicles | **Type-driven** (km/hours + dynamic fields, config-not-code); driver-compatibility; request→approval engine (vehicle-switch/leave/material) |
| 11 | Frontend stack | Expo + Expo Router + NativeWind + TS, **npm**; Zustand + TanStack Query + offline outbox; **expo-sqlite** (no PowerSync); **expo-camera**; i18next |
| 12 | Export | **Client-side** — SheetJS (Excel) + expo-print (PDF, Hindi remarks via OS engine); **no Puppeteer/server** |
| 13 | Backend | **NestJS + Drizzle + PostgreSQL (Neon) + R2**, built properly in P1; shared-schema multi-tenant + **RLS**; server-side RBAC; **no Redis/BullMQ/Socket.io** |
| 14 | Budget | **~₹0–500/month** Phase 1 (Neon + R2 free tiers + cheap API host) |
| 15 | Adapter pattern | Screens call `RecordsClient`/`AuthClient` interfaces; build on **`mock`**, swap to **`rest`** with zero screen changes |
| 16 | Shared contracts | One shared package = single source of truth for enums, DTO/zod types, config schema, DB schema, API contract, adapter interfaces. No redefinition anywhere. |
| 17 | IDs | Client-generated **UUIDv7** PKs (offline-safe, time-ordered). Never serial/auto-increment. |
| 18 | Money | **Integer paise (bigint)** everywhere; format only at display. Never float. |
| 19 | Time | Store **UTC `timestamptz`**; "business day" = local date (Asia/Kolkata); org-configurable EOD cutoff (default 20:00). |
| 20 | Deletes / versioning | **Soft-delete (`deleted_at`)** everywhere; "void" status for financial; hard-delete only unsynced drafts. `version` column for LWW. |
| 21 | RLS hardening | Per-transaction `SET LOCAL app.org_id` + `FORCE ROW LEVEL SECURITY` + non-superuser app role + manual `org_id` filter (defense-in-depth) + automated cross-tenant tests. |
| 22 | Error contract | Uniform envelope `{ error: { code, message, fields?, traceId } }`; client maps codes → localized messages. |
| 23 | Sync conflicts | **LWW** for normal logs; **reject** conflicts on approvals / auth / identity changes. Idempotency key per outbox event; backoff cap ~8. |
| 24 | Build approach | **Contracts-Pack first (Prompt 0, frozen) → 3 ordered build prompts** (backend · frontend-engine · frontend-screens), split on the adapter boundary. NOT one literal mega-prompt. |
| 25 | Wage/Cost Summary | **IN (Phase 1), read-only** — rate × attendance + OT, advances (peshgi), per-entity cost rollups, Excel. **No payments/disbursement.** |
| 26 | Person/labour master | **Separate `person` master** = attendance/wage subject (no login needed); optionally linked to a view-only Worker user. |

### 📚 Phase-1 doc reading order (these are the source of truth now)
0. **`techBuilder-Build-Readiness-Spec.md`** ⭐ **AUTHORITATIVE build contract** — final feature list, locked conventions, enums, data model, RBAC, OrgConfig, and the Contracts-Pack + 3-prompt build plan. Where it differs from the docs below, it wins. (Inputs: the 2 analyses in `docs/`.)
0a. **`techBuilder-Roadmap.md`** — the 8 named big steps (STEP 0 Contracts Pack → … → STEP 7 ship) with DONE gates, and the "production-ready complete" final gate.
1. **`techBuilder-Engine-Onboarding-Plan.md`** — the engine + single-app architecture, onboarding playbook, build order (§7 = locked scope).
2. **`techBuilder-Domain-Model-and-Permissions.md`** — the data model, RBAC matrix, and all workflows (vehicles, attendance, approvals, records, export). **The foundation.**
3. **`techBuilder-Phase1-Android-Screen-Plan.md`** — screen-by-screen product blueprint, reconciled with the domain model (see its §12 for the revisions).
4. **`techBuilder-Tech-Stack.md`** — locked Phase-1 toolchain (Expo + npm; expo-camera; expo-sqlite+outbox, no PowerSync; client-side export via SheetJS + expo-print, no Puppeteer).
5. **`techBuilder-Backend-and-Database.md`** — the real backend + Postgres: NestJS + Drizzle + Neon + R2, ~20 tables, shared-schema multi-tenant + RLS, API surface. Built properly in Phase 1; frontend reaches it via the `rest` adapter.

### 🏗️ Build status
- **STEP 0 — Contracts Pack: ✅ FROZEN & verified** at `shared/` (`@techbuilder/contracts@1.0.0-frozen.1`). 30 Drizzle tables + `rls.sql` (ENABLE+FORCE+tenant policy), all enums, `OrgConfig` (zod), domain types, input DTOs, REST `ENDPOINTS`, `AuthClient`/`RecordsClient`/`SyncClient` interfaces, RBAC `can()`. `npm run typecheck` passes (drizzle 0.44.7 / zod 3.25.76 / TS 5.9.3). Frozen — referenced verbatim by Prompts 1–3.
- **STEP 1 — Backend: 🟡 IN PROGRESS** at `backend/` (NestJS 11). **Foundation + auth core done & typechecking** (`tsc --noEmit` clean): npm **workspace** root (`shared`+`backend`, single hoisted drizzle-orm); env (zod); **DbService.runInTenant** (per-tx `set_config('app.org_id')` → RLS); common (uniform error filter, zod pipe, JWT guard, **RbacGuard** using contracts `can()`, decorators); **auth** (login under RLS via SECURITY DEFINER `auth_lookup`, scrypt passwords, rotating refresh tokens, change-password, `/me`); **sites** reference CRUD module (tenant+scope pattern); `sql/auth.sql`, `apply-sql` script, **seed** (provisions org+owner under app role via the GUC), drizzle.config. **Password = Node scrypt** (not argon2 — avoids native build; documented in `password.ts`). **9 more resource modules built via 4 parallel Sonnet agents + wired + typecheck clean:** vehicle-types, vehicles, people, attendance (per-person upsert), leave, records (7 types + update/void/list), approvals, notifications, media (presign). Whole backend (12 modules) `tsc --noEmit` passes. The 5 reserved logic-heavy modules (Opus) now done too — **users** (cascade create + scrypt hash), **wage** (getWageSummary calc), **dashboards** (owner KPIs + cost rollups + completeness), **reconciliation** (material balance + fuel variance), **sync** (idempotent pushBatch + pull). **STEP 1 is CODE-COMPLETE: all 16 modules implemented, `npm run typecheck` clean** (every adapter method from the contracts has a backend endpoint). **Remaining for the STEP 1 done-gate (needs infra, not code):** give `shared` a `dist` build so the app runs at runtime · provision Postgres/Neon → `db:generate`/`migrate` → apply `rls.sql`+`auth.sql` → `seed` → RLS cross-tenant tests + `nest build`.
- **STEP 2 — Frontend engine: 🟡 IN PROGRESS** at `app/` (npm workspace member). **Engine core built & typecheck-clean** (framework-agnostic, no RN toolchain needed yet): `src/engine/config/config.ts` (OrgConfig loader + Acme default + enablement helpers), `src/engine/adapters/mock.ts` (full seeded MockClient implementing AuthClient+RecordsClient+SyncClient — what STEP 3 screens use), `adapters/index.ts` (registry: `createClients('mock')`; `'rest'`→STEP 4), `src/engine/sync/outbox.ts` (idempotent queue, backoff, cap 8; storage abstracted — expo-sqlite store drops in later). All 3 packages typecheck.
  - **Expo/RN shell SCAFFOLDED** (Expo **SDK 56** — not 55; latest stable): configs (app.json, metro.config monorepo+NativeWind v4, babel, tailwind, global.css, nativewind-env, tsconfig.app.json), i18n (i18next + hi/en catalogs, Hindi-first), Zustand session store (wires `createClients('mock')`), `useCan()` hook, **expo-sqlite OutboxStore** (persistent drop-in, WAL), ui primitives (Button/Card/Screen/Text, NativeWind), Expo Router skeleton (`src/app/`: _layout→index→login→home). Engine-core `tsc` still green (RN shell excluded from `tsconfig.json`; full app typecheck = `tsconfig.app.json` on a dev machine).
  - **Remaining in STEP 2 (dev-machine step):** `npm install` the Expo toolchain + `npx expo start` to validate the shell on a device/emulator; wire `SqliteOutboxStore` into the `Outbox` at boot.
- **STEP 3 — Screens: 🟡 IN PROGRESS.** **Owner role built end-to-end (reference pattern)** on the mock adapter: ui primitives (ActionCard/KpiCard/ListRow/Field + Button/Card/Screen/Text), `lib/format.ts` (₹/date-window), role-aware `home`, and Owner screens `owner/{dashboard,sites,people,fleet}` (dashboard KPIs via getOwnerDashboard; sites list+add; people list+cascade-create with role picker; fleet list+add with type picker). Screen pattern locked: `useSession()→clients.records.*` + primitives + i18n `t()`. Engine-core `tsc` still green; RN screens validate on dev machine.
  - **ALL ROLES NOW BUILT (35 screens) via 4 parallel Sonnet agents** on the mock adapter, role-router wired (`home.tsx`→`/<role>/home`): owner(5) · site-manager(6) · team-head(6) · driver(8) · worker(2) · shared(4: profile/change-password/settings/notifications) · auth/root(4). Every screen uses only existing `RecordsClient` methods (no invented APIs). Engine-core `tsc` green; configs+locales valid.
  - **STEP 3 remaining (polish / dev-machine):** RN typecheck+device run (`npm run typecheck:app` + `npx expo start`); camera/scanner/voice **capture** wiring (deferred, no native libs yet); **Hindi catalog fill** (screens use `t('key','English default')` — keys present); driver `summary` list placeholders (rest adapter fills).
- **STEP 4 — Integration: 🟡 code-side DONE & typecheck-clean.** `RestClient` (`app/src/engine/adapters/rest.ts`) implements all 3 interfaces via fetch→ENDPOINTS, unwraps `{ data }`, throws on `{ error }`, adapts arrays→Paginated. Backend `TransformInterceptor` wraps success as `{ data }`. Registry returns RestClient for `'rest'`; session reads `EXPO_PUBLIC_ADAPTER`/`EXPO_PUBLIC_API_URL` + carries token. **Flip mock→rest = one env var, zero screen changes.** Backend + app-engine typecheck green.
  - **Remaining for STEP 4 (needs a real DB — `DATABASE_URL`):** provision Postgres/Neon → `db:generate`/`migrate` → apply `rls.sql`+`auth.sql` → `seed` → start backend → set app env to rest → E2E login→records→rollup + RLS cross-tenant tests.
- **Blocked on infra (provide to proceed verifiably):** a Postgres/Neon `DATABASE_URL` closes STEP 1 + STEP 4 E2E. Device run (RN typecheck + `expo start`), capture pipeline (camera/scanner/voice), Hindi catalog fill = dev-machine tasks. Then STEP 5 QA → 6 pilot → 7 ship.

---

## 1. Quick Snapshot (TL;DR) — *(original; see §0 for current direction)*

- **Project ID**: `techbuilder`
- **Title**: techBuilder — Multi-Tenant Construction SaaS for Indian SMBs
- **Category**: SaaS · Architecture · Construction-tech
- **Status**: In Development — **Phase 1: single-merchant Android app (Expo), engine + single codebase** (see §0). Original multi-tenant architecture superseded.
- **Year**: 2026
- **Role**: Solo Developer + Architect (Self)
- **Local path**: `techBuilder/`
- **GitHub**: no remote yet (local monorepo)
- **Featured**: false (still architecting)

## 2. One-Sentence Description
A multi-tenant construction-tech SaaS for Indian SMBs — Turborepo-style monorepo with apps for web (Next.js 16 + shadcn), mobile (Expo SDK 55 + PowerSync offline-first), API (NestJS + Drizzle + Postgres + BullMQ + Socket.io) — with 6-role hierarchy (Admin → Manager → Sub-Manager → Worker Head → Worker → Driver) and integrations for Razorpay, MSG91 OTP, FCM, Mapbox, and Cloudflare R2.

## 3. Long Description
The most architecturally ambitious project in my portfolio — still in the scaffolding/architecture phase. Targets Indian construction-tech SMBs (small contractors, site supervisors, builder firms) who currently manage projects via WhatsApp + paper + Excel. The platform centralizes: site assignments, worker attendance, material requests, photo uploads (offline-first → sync), payment runs, vehicle dispatch, real-time site-status updates. Architecture: Turborepo-style monorepo. **Web** app (Next.js 16 App Router + TypeScript + Tailwind + shadcn + Zustand + TanStack Query/Table + React Day Picker + react-hook-form + zod + next-intl + next-themes + Recharts + @base-ui/react). **Mobile** app (Expo SDK 55 + Expo Router + NativeWind + PowerSync for offline-first). **API** (NestJS + Drizzle ORM + PostgreSQL + BullMQ for background jobs + Socket.io for real-time). 6-role hierarchy: Admin / Manager / Sub-Manager / Worker Head / Worker / Driver. Integrations: Razorpay (payouts), MSG91 (OTP), FCM (push), Mapbox (maps + tracking). Hosting: Vercel (web) + EAS (mobile) + Docker (API) + Cloudflare R2 (photos). Extensive architecture docs (DOCX + PDF) in repo root; web app has its own CLAUDE.md + AGENTS.md.

## 4. Tech Stack
### Web App (`apps/web`)
- Next.js 16 App Router + TypeScript
- Tailwind + shadcn/ui (Radix-based)
- Zustand + TanStack Query + TanStack Table
- react-day-picker + date-fns
- react-hook-form + zod
- next-intl + next-themes
- Recharts
- @base-ui/react (new accessible primitives lib)

### Mobile App (`apps/mobile`)
- Expo SDK 55 + Expo Router
- NativeWind + Tailwind
- **PowerSync** — offline-first SQLite ↔ Postgres sync
- React Native + reanimated + worklets

### API (`apps/api`)
- NestJS
- Drizzle ORM + PostgreSQL
- BullMQ (Redis-backed background jobs)
- Socket.io (real-time)
- JWT + role-based guards

### Integrations
- Razorpay (payouts to workers, vendor payments)
- MSG91 OTP (phone-based login, Indian standard)
- FCM (push notifications)
- Mapbox (site maps, vehicle tracking)
- Cloudflare R2 (photo storage)

### Hosting
- Vercel (web)
- EAS (mobile binary builds)
- Docker (API on VPS or Render/Railway)
- Cloudflare R2 (storage)

## 5. Key Highlights
- **Monorepo**: web / mobile / api / shared packages (likely Turborepo or pnpm workspaces)
- **Offline-first mobile** with PowerSync (SQLite mirrored from Postgres)
- **6-role hierarchy** (Admin → Manager → Sub-Manager → Worker Head → Worker → Driver)
- **Real-time via Socket.io** (site status updates, photo uploads, attendance)
- **Background jobs with BullMQ** (payment runs, daily attendance compute, photo OCR)
- **Phone-based OTP login** (MSG91 — Indian-standard)
- **Mapbox** for site location + vehicle tracking
- **Architecture-first**: extensive docs (DOCX + PDF) before code

## 6. Problem → Solution
- **Problem**: Indian construction SMBs run on WhatsApp + Excel + paper. Pain points: (a) worker attendance fraud, (b) material requests get lost in chat, (c) site photos don't have GPS+timestamp metadata, (d) payment runs are manual and error-prone, (e) supervisors can't see site progress without visiting.
- **Solution**: Single platform for project management + workforce + materials + finance + photos + dispatch. Offline-first mobile because construction sites have poor connectivity. Multi-tenant so multiple builder firms can use the same instance.

## 7. Architecture (Monorepo)
```
techBuilder/
├── proj/                           # the actual monorepo
│   ├── apps/
│   │   ├── web/                    # Next.js 16 + shadcn
│   │   │   ├── AGENTS.md
│   │   │   ├── CLAUDE.md
│   │   │   └── CLAUDE.local.md
│   │   ├── mobile/                 # Expo + PowerSync
│   │   └── api/                    # NestJS + Drizzle
│   ├── packages/
│   │   ├── ui/                     # shared UI primitives
│   │   ├── schemas/                # zod schemas shared web ↔ mobile ↔ api
│   │   ├── db/                     # Drizzle schema (single source)
│   │   └── types/
│   ├── turbo.json (likely)
│   └── package.json (workspace root)
├── techbuilder-architecture.docx
├── techbuilder-architecture-fullStack_phase-2.pdf
├── techbuilder-frontend-guide.docx
├── techbuilder-frontend-guide.pdf
├── The Definitive 2026 Tech Stack for techBuilder_ Multi-Tenant Construction SaaS for Indian SMBs.pdf
└── offline_photo_upload_flow.svg
```

### 6-Role Hierarchy
1. **Admin** — superuser, owns the tenant, full access
2. **Manager** — runs projects, assigns work, approves payments
3. **Sub-Manager** — manages a region or sub-project
4. **Worker Head** — supervises 5–20 workers on a single site
5. **Worker** — does the work, marks attendance, uploads photos
6. **Driver** — handles vehicle dispatch + material delivery

Each role sees a tailored mobile/web app surface — RBAC enforced at the API layer with NestJS guards + at the DB layer via row-level filtering.

### Offline Photo Upload Flow (offline_photo_upload_flow.svg)
Mobile → SQLite (queue) → on WiFi → upload to R2 → API record → broadcast via Socket.io → web admin sees photo appear live.

## 8. Important File Paths
- 2026 tech-stack research: `techBuilder/The Definitive 2026 Tech Stack for techBuilder_ Multi-Tenant Construction SaaS for Indian SMBs.pdf`
- Architecture (docx): `techBuilder/techbuilder-architecture.docx`
- Architecture phase-2: `techBuilder/techbuilder-architecture-fullStack_phase-2.pdf`
- Frontend guide (docx): `techBuilder/techbuilder-frontend-guide.docx`
- Frontend guide (pdf): `techBuilder/techbuilder-frontend-guide.pdf`
- Offline photo upload flow: `techBuilder/offline_photo_upload_flow.svg`
- Web app AGENTS: `techBuilder/proj/apps/web/AGENTS.md`
- Web app Claude memory: `techBuilder/proj/apps/web/CLAUDE.md`
- Web app local Claude memory: `techBuilder/proj/apps/web/CLAUDE.local.md`

## 9. Tags
`nestjs`, `nextjs-16`, `expo`, `monorepo`, `turborepo`, `construction-tech`, `powersync`, `saas`, `multi-tenant`, `offline-first`, `bullmq`, `socket-io`, `drizzle`, `razorpay`, `msg91-otp`, `fcm`, `mapbox`, `cloudflare-r2`, `india-msme`

---

## 10. Interview Questions I Should Be Ready For

### Architecture (THE big one)
1. Walk me through the monorepo structure (apps + packages).
2. Why Turborepo / pnpm workspaces over Nx?
3. How is the Drizzle schema shared across web / mobile / api?
4. How do zod schemas get shared (single-source validation)?
5. How would you bootstrap a new app inside the monorepo?
6. What's the build matrix in CI? (web, mobile, api built independently per affected)

### Multi-Tenancy
7. How is tenant isolation enforced? (Row-level — `tenant_id` on every table, NestJS guard inject)
8. How do you handle a tenant going over their quota?
9. How would you ship a tenant-customizable feature flag system?
10. How do you handle data export for a leaving tenant?

### Offline-First Mobile (PowerSync)
11. What is PowerSync and how does it differ from custom Dexie / WatermelonDB?
12. How does PowerSync handle conflicts (CRDT? Last-write-wins?)
13. How does it bridge SQLite ↔ Postgres?
14. What's the trade-off vs writing your own offline sync? (PowerSync = paid SaaS at scale; rolling-your-own = effort)
15. Walk me through the offline photo upload flow.

### NestJS / API
16. Why NestJS over plain Express or Fastify?
17. How do NestJS guards enforce RBAC across 6 roles?
18. How do you structure modules in a multi-tenant NestJS app?
19. How does NestJS integrate with Drizzle ORM (no official adapter)?
20. How do you handle async errors uniformly?

### Database (Postgres + Drizzle)
21. Why Drizzle over Prisma?
22. How would you design the schema for a 6-role hierarchy?
23. How do you handle soft-deletes for compliance?
24. How would you partition the `attendance` table at scale (per-tenant or per-month)?
25. How do you migrate schema in production with zero downtime?

### Real-time (Socket.io)
26. Why Socket.io over plain WebSockets?
27. How do you handle Socket.io horizontal scaling? (Redis adapter)
28. How do you scope rooms per tenant + per project?
29. How do you handle reconnects when mobile goes offline?

### Background Jobs (BullMQ)
30. Why BullMQ over RabbitMQ / SQS / cron jobs?
31. What jobs run on this platform? (Payment runs, daily attendance compute, photo OCR, FCM notifications)
32. How do you handle job idempotency?
33. How do you monitor BullMQ in production? (Bull Board / Arena)

### Integrations
34. How does Razorpay payout work (vs collection)?
35. What's MSG91 OTP, and why use it over Firebase Auth?
36. How does FCM push delivery work for both web + mobile?
37. How would you implement vehicle tracking with Mapbox + driver app?
38. Why Cloudflare R2 over AWS S3? (S3-compatible API + zero egress fees)

### Construction-Domain
39. What does an attendance flow look like? (Geofence + selfie + timestamp)
40. How do you prevent attendance fraud (sharing the device)?
41. How do material requests flow from worker → admin → vendor?
42. How would you build a "site progress photo timeline"?

### Why this is still in architecture phase
43. Why so much architecture before code?
44. What's the MVP scope you'd ship first?
45. How would you prioritize web vs mobile?

---

## 11. Extra Talking Points (Bring Up Voluntarily)

- **Why architecture-first**: Multi-tenant SaaS + offline-first mobile + real-time + 6 roles = many interacting concerns. Mistakes in foundation = months of rework. Architecture phase de-risks before coding.
- **The "definitive 2026 tech stack" doc**: I wrote a research doc choosing every dependency deliberately — why Drizzle not Prisma, why PowerSync not WatermelonDB, why NestJS not Fastify. That's in the repo.
- **PowerSync is the bet**: Offline-first sync engines are HARD. PowerSync is a paid SaaS that handles SQLite ↔ Postgres mirroring with sub-second latency. Trade-off: cost at scale. Bet: customer ARPU is high enough to absorb it.
- **6 roles is unusual but right for construction**: Most platforms have 2-3 roles. Construction reality has more — Worker Head (gang leader) vs Worker (laborer) is a meaningful distinction in India.
- **Why Indian construction SMBs**: 63M+ MSMEs in India; construction is a top-3 sector. Pain is universal. WhatsApp is the current "platform" — easy to beat with anything structured.
- **The hardest single feature**: Geofenced attendance with selfie + offline sync. Mobile must work in low-signal sites, validate selfie liveness, and queue till connectivity.
- **What I'd ship as MVP**: 
  1. Phone OTP login (MSG91)
  2. Single-tenant (one builder firm)
  3. Worker attendance (geofence + selfie) on mobile
  4. Admin web dashboard (Next.js) showing live attendance
  5. Material request workflow
  
  Then expand.

- **Risks I'm aware of**:
  - Multi-tenancy adds 3-5× complexity; might be wrong to start with it
  - PowerSync at scale could become expensive
  - Construction users have low tech literacy — UX has to be Hindi-first + voice-first
  - Sales cycle for SMB SaaS in India is long
- **Why this might not ship**: Pragmatically, I might spin off pieces (attendance app alone, material-request app alone) instead of building the full platform.

---

## 12. If I Need to Revisit This Project Later
Read in this order:
1. `The Definitive 2026 Tech Stack for techBuilder...pdf` — why every choice was made
2. `techbuilder-architecture.docx` — full architecture
3. `techbuilder-architecture-fullStack_phase-2.pdf` — phase 2 details
4. `techbuilder-frontend-guide.docx` / `.pdf` — frontend conventions
5. `offline_photo_upload_flow.svg` — the offline sync diagram
6. `proj/apps/web/CLAUDE.md` — web app spec
7. `proj/apps/web/AGENTS.md` — agent rules
8. `proj/apps/web/CLAUDE.local.md` — local-only notes (untracked typically)

To run locally (when code exists):
```bash
cd techBuilder/proj
# Likely Turborepo:
pnpm install
pnpm dev        # runs web + api in parallel
# Mobile separately:
cd apps/mobile
pnpm dev
```

Multi-tenant guard sketch (NestJS, reusable):
```ts
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new UnauthorizedException();
    // Inject tenantId into request so repositories filter by it
    req.tenantId = tenantId;
    return true;
  }
}
```

PowerSync sync rule sketch (high level):
```yaml
# powersync.yaml
bucket_definitions:
  tenant_data:
    parameters: |
      SELECT tenant_id FROM users WHERE id = token_parameters.user_id
    data:
      - SELECT * FROM projects WHERE tenant_id = bucket.tenant_id
      - SELECT * FROM attendance WHERE tenant_id = bucket.tenant_id
      - SELECT * FROM materials WHERE tenant_id = bucket.tenant_id
```
