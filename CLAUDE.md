# techBuilder — Claude Code Project Memory

> **Read this first, then `docs/PROJECT_AI_CONTEXT.md` §0.** This file orients any new Claude session: what techBuilder is, where the build is, the doc map, the frozen conventions, and how to resume.
>
> **All project docs live under [`docs/`](docs/)** (`docs/*.md` = specs/plans, [`docs/research/`](docs/research/) = research prompts + results, [`docs/reference/`](docs/reference/) = PDFs/DOCX/SVG). Only `CLAUDE.md` stays at the repo root (Claude Code loads it from there).

---

## 1. What this is (Phase 1)
A **Hindi-first Android app** (Expo/React Native) for running an Indian construction SMB's **daily field operations** — a *records + visibility* logbook (NOT project-management/BIM/estimation). Field roles log simple end-of-day records; they roll **up** to an Owner dashboard with Excel export.

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
| [`docs/PROJECT_AI_CONTEXT.md`](docs/PROJECT_AI_CONTEXT.md) | **Master index.** §0 = current direction + locked-decisions table + reading order + build status. §§1–12 = original (superseded) research. |
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
- **STEP 0 — Contracts Pack: ✅ FROZEN & verified** at `shared/` (`@techbuilder/contracts@1.0.0-frozen.1`). 30 Drizzle tables + `rls.sql`, all enums, OrgConfig (zod), domain/dto types, REST `ENDPOINTS`, adapter interfaces, RBAC `can()`. `npm run typecheck` clean.
- **STEP 1 — Backend: ✅ CODE-COMPLETE & typecheck-clean** at `backend/` (NestJS 11). All **16 modules**: auth, users, sites, people, vehicle-types, vehicles, attendance, leave, records, approvals, notifications, media, wage, dashboards, reconciliation, sync. Every contract adapter method has an endpoint. Tenant isolation via `DbService.runInTenant` (`SET LOCAL app.org_id`) + RLS.
  - **Remaining for STEP 1 done-gate (infra, not code):** `shared` `dist` build (runtime); provision Postgres/Neon → `db:generate`/`migrate` → apply `rls.sql`+`auth.sql` → `seed` → RLS cross-tenant tests + `nest build`.
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
