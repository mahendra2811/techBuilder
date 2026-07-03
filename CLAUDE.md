# techBuilder — Claude Code Project Memory

> **Read this first, then `docs/PROJECT_AI_CONTEXT.md` §0.** This file orients any new Claude session: what techBuilder is, where the build is, the doc map, the frozen conventions, and how to resume.
>
> **All project docs live under [`docs/`](docs/)** (`docs/*.md` = specs/plans, [`docs/research/`](docs/research/) = research prompts + results, [`docs/reference/`](docs/reference/) = PDFs/DOCX/SVG). Only `CLAUDE.md` stays at the repo root (Claude Code loads it from there).

---

## 1. What this is (Phase 1)

> ### ⚠️ FRONTEND PIVOT (2026-07-03): Android/Expo → Next.js WEB PORTAL
> **The `app/` Expo/React Native frontend is FROZEN — do not build on it further.** After a full day of native-tooling friction (Metro tunnel flakiness, `adb`/USB debugging-authorization resets, ngrok credential limits, a stray root `app.json` silently breaking bundling) with **zero actual bugs found in `backend/` or `shared/`** (31 unit + 19 integration tests green all day), the user — a web developer — decided to pivot the frontend to a **Next.js web portal** (mobile-first responsive, PWA later). This is a **final decision for Phase 1**, not a detour.
> - **KEPT, untouched:** `backend/` (NestJS+Drizzle+Neon+RLS) and `shared/` (contracts) — proven solid, zero changes needed for the pivot.
> - **FROZEN, not deleted:** `app/` — stays as a reference (screen logic, i18n keys, adapter patterns) but gets no more work.
> - **NEW:** `web/` — 4th npm workspace, Next.js App Router + TS strict + Tailwind + shadcn/ui + TanStack Query + react-hook-form + zod (from `shared/`). httpOnly-cookie auth (not bearer-in-JS). See `docs/techBuilder-Web-Pivot-Plan.md` for the full phase plan (Phase 0 assessment already done and approved; Phase 1 scaffold delegated to a Fable-5 agent, in progress as of this note).
> - **Still binding:** Build-Readiness Spec conventions, the Hardening Punchlist P0 backend work (platform-independent, already done), the Pilot Playbook's 7-screen build order (now the web screen build order too).
> - Backend stays framework-as-is (NestJS) — evaluated switching to plain Node/Express, decided against it (zero problems traced to NestJS all session; switching = pure rework for no gain).

A **Hindi-first web portal** (Next.js, pivoted from Android/Expo — see banner above) for running an Indian construction SMB's **daily field operations** — a *records + visibility* logbook (NOT project-management/BIM/estimation). Field roles log simple end-of-day records; they roll **up** to an Owner dashboard with Excel export.

- **Model:** managed/**agency** — the developer onboards each company by hand (offline payment → create org + owner login → hand over). After that, everything is **self-service in-app**. No self-signup/OTP/payment this phase.
- **Architecture:** one reusable **engine** + **one app codebase** (NOT per-merchant code forks — wrong for Android). Per-client = a config file + assets. **Adapter pattern:** screens call interfaces (`RecordsClient`/`AuthClient`/`SyncClient`), built on a `mock` adapter, swapped to `rest` with zero screen changes.
- **Multi-tenant-ready** (`orgId` on every row + Postgres RLS) but single-company-in-practice for Phase 1.
- **5 roles:** Owner · Site Manager · Team Head (Mistri) · Driver · Worker (view-only). Account creation cascades Owner→SM→TH.

## 2. ⚡ Resume in 60 seconds
1. Read **[`docs/PROJECT_AI_CONTEXT.md`](docs/PROJECT_AI_CONTEXT.md) §0** (current direction + the 26-row locked-decisions table + 🏗️ Build status).
2. Skim **[`docs/techBuilder-Build-Readiness-Spec.md`](docs/techBuilder-Build-Readiness-Spec.md)** (the authoritative build contract).
3. Check the **build status** below + `docs/PROJECT_AI_CONTEXT.md` §0 "Build status".
4. The auto-memory at `~/.claude/projects/.../memory/techbuilder-phase1-direction.md` has the running state.
5. Invoke the **`resume-techbuilder`** skill for an automated re-orientation.

## 3. 📚 Doc map — which doc has what
> All paths are relative to the repo root. Specs/plans live in [`docs/`](docs/); the cross-references *inside* those docs use bare filenames and stay valid because they all share the `docs/` folder.

| Doc | Contents |
|---|---|
| [`docs/techBuilder-Web-Pivot-Plan.md`](docs/techBuilder-Web-Pivot-Plan.md) ⭐🔜 | **CURRENT WORK ORDER (2026-07-03).** Frontend pivot Android/Expo → Next.js web. Phase 0 (assessment) done; Phase 1 (scaffold+auth) in progress. Read this + the pivot banner in §1 before anything else. |
| [`docs/PROJECT_AI_CONTEXT.md`](docs/PROJECT_AI_CONTEXT.md) | **Master index.** §0 = current direction + locked-decisions table + reading order + build status. §§1–12 = original (superseded) research. |
| [`docs/research/reserch-3/techBuilder-Hardening-Punchlist.md`](docs/research/reserch-3/techBuilder-Hardening-Punchlist.md) | **Pre-pilot fix list (research-3, 2026-07-02), platform-independent.** Tiers P0→P3 (RBAC scope, self-approval, edit windows, money-math tests, honest sync, hosted backend, backups, EAS APK, bulk seed, pilot surface, doc reconciliation). P0 (WP-1→WP-6) done; P1 mobile-infra items (WP-7/8/9/11) PAUSED by the web pivot. |
| [`docs/research/reserch-3/techBuilder-Pilot-Playbook.md`](docs/research/reserch-3/techBuilder-Pilot-Playbook.md) | **Pilot product spec (research-3).** ~8-screen pilot surface, 2-week plan, adoption tactics, hidden-feature flags, support runbook. |
| [`docs/techBuilder-SecondOpinion-Review.md`](docs/techBuilder-SecondOpinion-Review.md) | Code-grounded critical review (2026-07-02) that produced research-3: RBAC scope holes (B5), sync overselling, missing backdating policy/backups/tests, pilot-surface cuts, stack verdicts. |
| [`docs/techBuilder-NextSteps-and-LiveBackend-Plan.md`](docs/techBuilder-NextSteps-and-LiveBackend-Plan.md) | Milestone A plan (2026-07-01): flip to real backend over WiFi + roadmap B→F. Largely subsumed by the research-3 punchlist (WP-7/WP-10); still has the 5-role credentials + 3-terminal run steps. |
| [`docs/techBuilder-Build-Readiness-Spec.md`](docs/techBuilder-Build-Readiness-Spec.md) ⭐ | **Authoritative build contract** — final feature list, conventions, enums, data model, RBAC, OrgConfig, the Contracts-Pack + 3-prompt build plan. Wins on conflict. |
| [`docs/techBuilder-Roadmap.md`](docs/techBuilder-Roadmap.md) | 8 named build steps (STEP 0 Contracts Pack → STEP 7 ship) + done-gates + **per-step model strategy** + "production-ready complete" gate. |
| [`docs/techBuilder-Domain-Model-and-Permissions.md`](docs/techBuilder-Domain-Model-and-Permissions.md) | Data model + RBAC matrix + workflows (narrative; the Spec extends it for build details). |
| [`docs/techBuilder-Engine-Onboarding-Plan.md`](docs/techBuilder-Engine-Onboarding-Plan.md) | Engine + single-app architecture, onboarding playbook, build order (§7 locked scope). |
| [`docs/techBuilder-Phase1-Android-Screen-Plan.md`](docs/techBuilder-Phase1-Android-Screen-Plan.md) | Screen-by-screen product blueprint (§12 = authoritative revisions). |
| [`docs/techBuilder-Tech-Stack.md`](docs/techBuilder-Tech-Stack.md) | Locked frontend toolchain + backend stack summary. |
| [`docs/techBuilder-Backend-and-Database.md`](docs/techBuilder-Backend-and-Database.md) | Backend + Postgres design, RLS, API surface, hosting/budget. |
| [`docs/research/`](docs/research/) `research-prompt-1.md`, `research-prompt-2.md` | The research prompts given to web AIs. |
| [`docs/research/`](docs/research/) `reserch_1_*`, `reserch_2_*` | The research results (market validation + build-readiness). |
| [`docs/reference/`](docs/reference/) | Original binary docs (architecture DOCX/PDF, frontend guide, tech-stack PDF, offline-photo-upload SVG). |

## 4. 🏗️ Build status (keep this current)

> ### ▶ RESUME HERE (2026-07-03) — FRONTEND PIVOTED TO WEB, read the banner in §1 first
> **Current work: Phase 1 of the web pivot** (Next.js `web/` workspace — scaffold + httpOnly-cookie auth + 5-role router), delegated to a Fable-5 agent per user instruction, plan in `docs/techBuilder-Web-Pivot-Plan.md`. Phase 0 (assessment) confirmed: backend/shared are 100% solid, zero real bugs found; every issue that day was Expo/Android native-tooling friction. **The mobile pilot-infra work below (WP-7 Railway/WP-8 backups/WP-9 EAS/WP-11 Sentry) is PAUSED, not abandoned** — irrelevant until/unless a native app is revisited post-web-pilot. Railway was torn down (deleted) to stop billing; redeploying later is a 2-minute job (`railway.json` + code all still committed). Local dev now: backend runs on the laptop (`(cd shared && npm run build) && (cd backend && npm run build && npm start)`), DB is real Neon via `backend/.env`, seeded org "DevCo Builders" (code `devco`) has the full 1 owner/2 sites/1 SM/2 TH/4 driver/6 worker shape (`backend/merchants/dev/`, all passwords `changeme123`, `mustChangePassword=true`).
>
> ### Earlier: PUNCHLIST TIER P0 IS ✅ COMPLETE & PROVEN (platform-independent — still valid post-pivot) (all of WP-1…WP-6 from [`docs/research/reserch-3/techBuilder-Hardening-Punchlist.md`](docs/research/reserch-3/techBuilder-Hardening-Punchlist.md)):
> - **WP-1 RBAC scope**: new `backend/src/common/scope.util.ts` (`loadScope` derives site/crew/vehicle/self scope FRESH from DB) wired into ALL services (attendance, records, approvals, leave, wage, dashboards, reconciliation, sites, users, people, vehicles, **sync** — sync.pushBatch was a full RBAC bypass, now registry-trimmed to field records + per-type action+scope checks). Error code reused: `FORBIDDEN` (no contracts change).
> - **WP-2 self-approval** (requester≠decider + decide scope + REJECT re-decide) · **WP-3 edit/void** creator-only until business-day+1, Owner override, patch sanitized (immutable attribution/businessDate) · **WP-4 backdating** TH≤2d/SM≤7d/Owner-any (+ policy folded into Build-Readiness-Spec §5; corrected flag = `version>1`) · new pure `backend/src/common/business-date.ts` (EOD cutoff: after 20:00 IST → NEXT business date).
> - **WP-5 tests (vitest)**: `npm test` = **31 unit tests** (wage 3 hand-computed fixtures via extracted pure `wage-calc.ts`; completeness via pure `completeness-rule.ts`; business-date; RBAC matrix snapshot; scope asserts) + `npm run test:integration` = **19 integration tests vs LIVE Neon** (every review hole proven closed + RLS regression). Both green 2026-07-02.
> - **WP-6 honest sync**: `app/src/engine/sync/offline-records.ts` wraps rest RecordsClient — EXACTLY attendance/expense/fuel queue offline (optimistic result, server re-checks scope on push); all other writes throw typed OFFLINE error + `offlineNotice` in session store; `DelegatingOutboxStore` swapped to SqliteOutboxStore at boot in `_layout.tsx` + flush on boot/foreground; **all 23 list/dashboard screens converted `useEffect(load)` → `useFocusEffect(load)`**; Roadmap gate #2 reworded honestly. ⚠️ Device airplane-mode acceptance still to run on the real phone once in rest mode (fold into WP-9 device pass).
> **WP-10 bulk merchant seed: ✅ DONE & PROVEN** — `backend/scripts/seed-merchant.ts` + `npm run seed:merchant -- merchants/<code>`; templates + format rules at `backend/merchants/_template/` (org.json + 6 CSVs). Verified live on Neon (8/8 linkage checks: site-manager/team-head/crew-membership/driver-assignment/wage-rates/forced-password-change), test org torn down after.
> **WP-7 hosted backend: ✅ DONE & PROVEN** — deployed to **Railway** at `https://techbuilder-production.up.railway.app`. Fixes needed along the way (all committed): (1) Railway's monorepo auto-detect created bogus per-folder services (`app/`, `backend/` as separate services with Root Directory scoped to the subfolder) — deleted the `app` service (never deploy the Expo app), reset the `backend` service's Root Directory to blank/repo-root so `npm ci` sees the workspace; (2) `railway.json` buildCommand had a redundant `npm ci` that collided with Nixpacks' own install-phase `npm ci` on the BuildKit cache-mounted `node_modules/.cache` (`EBUSY` on rmdir) — removed it, buildCommand is now build-only (`npm run build --workspace=shared && npm run build --workspace=backend`); (3) added `backend/src/health.controller.ts` (`GET /api/v1/health`, unauthenticated) for Railway's healthcheck; (4) added `backend/package.json` `start:prod` (no `--env-file`, Railway injects env vars directly); (5) root `package.json` pinned `engines.node: "22.x"`. Env vars set in Railway: `DATABASE_URL`/`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`ACCESS_TTL_SEC`/`REFRESH_TTL_SEC`/`NODE_ENV=production` (copied from `backend/.env`, no `DATABASE_URL_ADMIN`/`R2_*` yet). **Verified E2E from outside the network** (curl, not just health): login→JWT, `/me`, unauthenticated→401, RBAC-scoped owner dashboard — all correct. `app/.env` now points `EXPO_PUBLIC_ADAPTER=rest` + `EXPO_PUBLIC_API_URL=https://techbuilder-production.up.railway.app` (works from any network, no WiFi/USB LAN tricks needed anymore). ⚠️ Still owed: the on-device airplane-mode outbox acceptance test (fold into WP-9 device pass) and an on-phone Expo Go check against this URL.
> **NEXT: rest of TIER P1 — ALL BLOCKED ON USER INPUTS:** WP-8 nightly pg_dump→R2 + restore drill (needs Cloudflare R2 bucket + keys), WP-9 EAS preview APK (needs user `eas login`; Expo Go BANNED as pilot channel; run the airplane-mode outbox acceptance on-device here), WP-11 Sentry (needs DSNs). P2 (flags, capture, WhatsApp digest, audit chip, Hindi gate, ≤30s check) needs NO user input — can start while waiting. Then P3 doc reconciliation. Punchlist + Build-Readiness Spec win on conflict.
> **Still-relevant context:** app can run on the phone via Expo Go (SDK 54) — mock mode uses seeded logins (any password): `acme_owner`, `sm1`, `th1`, `driver1`, `worker1`; **rest mode (now default in `app/.env`) uses real Neon creds** `acme_owner`/`changeme123` (mustChangePassword=true → app should prompt the forced change flow on first login).
> **SDK note:** app pinned to **Expo SDK 54** (user's Expo Go = 54.0.8). GOTCHAS (in auto-memory): `expo install --fix` runs `npm install` inside `app/` → corrupts workspace hoisting → always follow with a **root `npm install`**; `react-native-worklets`+`react-native-reanimated` required (NativeWind v4/SDK-54 babel needs the worklets plugin); no `updates.url`/`runtimeVersion` in app.json for Expo Go.

- **STEP 0 — Contracts Pack: ✅ FROZEN & verified** at `shared/` (`@techbuilder/contracts@1.0.0-frozen.1`). 30 Drizzle tables + `rls.sql`, all enums, OrgConfig (zod), domain/dto types, REST `ENDPOINTS`, adapter interfaces, RBAC `can()`. `npm run typecheck` clean.
- **STEP 1 — Backend: ✅ CODE-COMPLETE & typecheck-clean** at `backend/` (NestJS 11). All **16 modules**: auth, users, sites, people, vehicle-types, vehicles, attendance, leave, records, approvals, notifications, media, wage, dashboards, reconciliation, sync. Every contract adapter method has an endpoint. Tenant isolation via `DbService.runInTenant` (`SET LOCAL app.org_id`) + RLS.
  - **✅ DB gate CLOSED (verified on live Neon, 2026-07-01):** two-role setup (owner=BYPASSRLS for migrate/seed/auth_lookup; `techbuilder_app`=NOBYPASSRLS runtime); migrate (30 tables) + rls.sql + auth.sql + seed done; **RLS cross-tenant test 5/5 PASS**; live HTTP E2E (login/JWT/RBAC/RLS/dashboard/cascade-create/validation) all green. `shared` now builds to `dist`. Contracts bumped to **frozen.2** (`app_current_org` nullif + idempotent rls.sql; `/me`→MeController).
- **STEP 2 — Frontend engine (Expo app): 🟡 core + shell SCAFFOLDED** at `app/` (Expo **SDK 56**). Engine **core typecheck-clean** (config loader, full seeded **MockClient** for all 3 adapter interfaces, `createClients` registry, offline **outbox**). **RN shell scaffolded**: Metro (monorepo+NativeWind v4), Expo Router skeleton (`src/app/`: _layout→index→login→home), i18next hi/en, Zustand session store, `useCan()`, expo-sqlite OutboxStore, ui primitives. Engine-core `npm run typecheck` green; full app typecheck = `tsconfig.app.json` on a dev machine (`npm install && npx expo start`). **STEP 3 — Screens: ✅ ALL 5 ROLES + SHARED BUILT (35 screens)** on the mock adapter via parallel Sonnet; role-router wired (`home.tsx`→`/<role>/home`). owner(5)·site-manager(6)·team-head(6)·driver(8)·worker(2)·shared(4)·auth/root(4); only existing `RecordsClient` methods used. Engine-core `tsc` green; RN typecheck+device run = dev machine (`npm run typecheck:app` + `npx expo start`, login `acme_owner`/`changeme123`). Polish remaining: capture (camera/scanner/voice) wiring + Hindi catalog fill (keys present via `t(key,'default')`). **Next: STEP 4** — RestClient (`createClients('rest')`) + DB verification.

## 5. Repo structure
```
techBuilder/
  CLAUDE.md               # this file — the ONLY .md at root (Claude Code auto-loads it)
  package.json            # npm WORKSPACE root (workspaces: shared, backend; app added in STEP 2)
  docs/                   # ALL project docs live here
    *.md                  #   specs/plans (PROJECT_AI_CONTEXT + techBuilder-*)
    research/             #   research prompts + web-AI results
    reference/            #   original binary docs (PDF/DOCX/SVG)
  shared/                 # @techbuilder/contracts — FROZEN single source of truth (STEP 0)
    src/{common,enums,errors,config,domain,dto,api,adapters,permissions}.ts
    src/db/{schema.ts, rls.sql}
  backend/                # @techbuilder/backend — NestJS + Drizzle + Postgres + R2 (STEP 1)
    src/<module>/{*.service.ts,*.controller.ts,*.module.ts}  # 16 modules, all mirror sites/
    src/{db,common,config,auth}/ ; sql/auth.sql ; scripts/apply-sql.ts ; src/seed.ts
  app/                    # Expo app (STEP 2 — not yet created)
  proj/                   # OLD Next.js web scaffold — LATER-PHASE Owner dashboard, NOT Phase-1
```

## 6. Frozen conventions (NEVER violate — full detail in `.claude/rules/conventions.md`)
- IDs = **client-generated UUIDv7**. Money = **integer paise (bigint)**. Time = **UTC `timestamptz`** + business day = local date (Asia/Kolkata, EOD cutoff 20:00).
- **Soft-delete (`deletedAt`) + `version`** (LWW). RLS: per-tx `SET LOCAL app.org_id` + `FORCE ROW LEVEL SECURITY` + non-superuser app role.
- **`@techbuilder/contracts` is the ONLY source of enums/types/schema/interfaces — never redefine.** Screens use adapter interfaces only.
- Sync: LWW for logs; **reject** conflicts on approvals/auth/identity. Errors use the uniform envelope `{ error: { code, message, fields?, traceId } }`.

## 7. Commands
```bash
# from repo root
npm install                              # workspace install (hoists single drizzle-orm)
(cd shared && npm run typecheck)         # verify the frozen contracts
(cd backend && npm run typecheck)        # verify the backend
# DB (needs DATABASE_URL — see backend/.env.example):
(cd backend && npm run db:generate && npm run db:migrate && npm run db:rls && npm run seed)
```

## 8. Hard rules
- **Editing `shared/src/**` = editing the FROZEN contracts** → bump `shared/package.json` version + note in `docs/PROJECT_AI_CONTEXT.md` §0. (A hook reminds you.)
- **New backend module → copy the `sites/` pattern exactly** (`runInTenant`, idempotent UUID inserts, `mapXxx`, scoped RBAC, `ApiException`). See `.claude/rules/backend-modules.md` + the `new-backend-module` skill.
- **Latest-stable + verify docs:** use `ctx7` before integrating any library (versions are pinned at use-time, not from training data).
- **Model strategy** (token optimization): Opus for contracts/auth/RLS/wage/dashboards/recon/sync + reviews; Sonnet for mechanical CRUD (fan out as parallel subagents writing disjoint module folders, then wire `app.module.ts` + typecheck centrally); Haiku for trivial. See `docs/techBuilder-Roadmap.md` "Model strategy".
- **Keep `docs/PROJECT_AI_CONTEXT.md` §0 build status + the auto-memory current** after each work session.

## 9. .claude/ contents
- `rules/` — `conventions.md`, `backend-modules.md`, `contracts-frozen.md`, `build-strategy.md`
- `skills/` — `resume-techbuilder` (re-orient), `new-backend-module` (codifies the pattern)
- `hooks/` — `guard-frozen-contracts.sh` (non-blocking reminder when editing `shared/src`)
- `settings.json` — permission allowlist + the frozen-contracts hook
