# techBuilder — Build Roadmap (Phase 1 → production-ready, first merchant live)

> The named big steps from "planning done" to "first construction company live in daily use," each with a one-line scope and an unambiguous **DONE gate**. Built per the locked plan: one engine + one app, agency-onboarded, offline-first, **Contracts-Pack first → 3 ordered build prompts**.
>
> Authoritative inputs: `techBuilder-Build-Readiness-Spec.md` (the build contract) + `PROJECT_AI_CONTEXT.md` §0 (decisions).

---

## Where we are
All planning is complete (product, architecture, data model, RBAC, stacks, conventions, build approach — see the Build-Readiness Spec). The next action is **STEP 0**.

---

## The 8 big steps

### STEP 0 — Contracts Pack *(Prompt 0 — generate, hand-edit, FREEZE first)*
The shared package = single source of truth: enums, DTO/zod types, `OrgConfig` schema, Drizzle DB schema + RLS policies, REST API contract + error envelope, and the `AuthClient`/`RecordsClient`/`SyncClient` interfaces.
- **DONE when:** types compile; DB schema + RLS reviewed; contract locked. **Nothing else starts until frozen** — Steps 1–3 reference it verbatim.

### STEP 1 — Backend *(Prompt 1)*
NestJS + Drizzle + PostgreSQL (Neon) + Cloudflare R2: auth (JWT + rotating refresh), tenant middleware (per-tx `SET LOCAL app.org_id` + `FORCE ROW LEVEL SECURITY`, non-superuser role), RBAC guards, all endpoints, presigned R2 upload, org-provisioning + seed script.
- **DONE when:** `build`+`lint`+`test` green; automated **cross-tenant RLS tests pass**; seed produces a populated org; deployed to a host (Railway/Render/Fly or VPS).

### STEP 2 — Frontend Engine *(Prompt 2)*
Expo app skeleton + **mock & rest adapters** + offline **outbox/sync state-machine** (UUIDv7, idempotency, backoff, LWW) + expo-sqlite (WAL) + version-based migrations + i18n + `OrgConfig` loader + design-system `ui/` + `can()` + capture pipeline (camera/scanner/GPS/watermark/compression).
- **DONE when:** engine builds; mock adapter serves seeded data; sync/outbox + `can()` unit tests pass.

### STEP 3 — Frontend Screens *(Prompt 3 — on the mock adapter; split by role if too big)*
All role screens: login/role-router; Owner setup (people/person-master/sites/vehicles+types); attendance + multi-day leave; the "Today" end-of-day records hub (<2 min); wage/cost summary; reconciliation (fuel/material); approvals inbox; dashboards + "is today complete?" + per-entity cost rollups; reports/Excel/WhatsApp-share; kiosk/shared-device mode; voice notes; shared screens.
- **DONE when:** every screen works E2E on mock data; all states (empty/loading/error/offline) present; Hindi+English complete; icon+label/numeric-input/color+label UX applied.

### STEP 4 — Integration (mock → rest)
Flip the adapter to the real backend; run the whole app end-to-end on a real Android device; resolve any contract mismatches.
- **DONE when:** full flow — login → create org data → log records → roll-up → export — works against the **live backend** on a phone.

### STEP 5 — Hardening & QA
Offline-sync stress (duplicate / conflict / poison-event); RLS cross-tenant audit; **low-end Android** performance budget (₹8–10K device: cold start ≤4s, 500-row list 60fps); security pass; a11y + Hindi review; Excel + WhatsApp-share verification; the "is today complete?" trust layer proven.
- **DONE when:** the Definition-of-Done gate is green and the sync/trust layer is provably reliable on a real low-end device.

### STEP 6 — First-merchant onboarding & pilot
Provision the real company's org + Owner login; seed their sites/vehicles/people (incl. person/labour master); **EAS-build the APK**; hand over; run a real-site pilot; fix what the field surfaces.
- **DONE when:** the merchant runs a **full day end-to-end** and the Owner trusts the rolled-up data + export.

### STEP 7 — Production-ready / ship + reflect
Sentry monitoring (frontend + backend); automated backups; finalized EAS build/release; distribution to the Owner's staff. Then **promote anything reusable from this build UP into the engine** so merchant #2 is faster.
- **DONE when:** the first merchant is **live in daily use, monitored, backed up** — and the engine is ready to onboard the next company with just config + assets.

---

## "Production-ready complete" — the final gate (all true)
- ✅ `build` + `lint` + `test` green (frontend + backend); RLS cross-tenant tests pass.
- ✅ Works **100% offline**; syncs reliably (UUIDv7, idempotent, LWW, no data loss) on a low-end Android phone.
- ✅ Every locked feature works E2E for all 5 roles; wage/cost summary + reconciliation + completeness + export all correct.
- ✅ One real construction company **onboarded, live, and trusting the data** — daily use, monitored (Sentry), backed up.
- ✅ Engine/app boundary clean → **next merchant = config + assets + EAS build**, no code fork.

---

## Model strategy per step (quality × token optimization)

**Core principle:** spend the strongest model (**Opus 4.8**) where an error *propagates* — the frozen contract, the sync engine, RLS/security, and audits. Use **Sonnet 4.6** for the bulk of code that just *follows* the frozen contract, and **Haiku 4.5** for trivial, high-volume, low-risk work. **Freezing the Contracts Pack with Opus once is the single biggest token optimizer** — it lets cheaper models build everything else reliably.

| Step | Primary model | Escalate ↑ to **Opus** for | Drop ↓ to **Haiku** for |
|---|---|---|---|
| **0 Contracts Pack** | **Opus** (high effort) | *all of it* — design-critical, errors propagate everywhere | — |
| **1 Backend** | **Sonnet** (CRUD, DTOs, modules) | auth, RLS tenant-context, wage/reconciliation calc, initial scaffold | env/config boilerplate |
| **2 Frontend Engine** | **Sonnet** (ui, i18n, config loader) | **offline outbox/sync state-machine + adapter layer** (subtle, critical) | — |
| **3 Frontend Screens** | **Sonnet** (bulk of screens) | dashboards/rollups, kiosk, wage summary, completeness | simple list/detail/form screens → **Haiku** |
| **4 Integration (mock→rest)** | **Sonnet** | a gnarly cross-cutting bug | — |
| **5 Hardening & QA** | **Opus** (RLS/security/sync-edge audit, adversarial review) | — | routine test scaffolding → **Sonnet** |
| **6 Onboarding & pilot** | **Haiku/Sonnet** (provision, seed, build, small fixes) | a real field bug needing deep diagnosis | ops + small fixes → **Haiku** |
| **7 Ship + reflect** | **Sonnet** (Sentry/backups/EAS config) | "what's reusable → promote to engine" (judgment call) | mechanical config → **Haiku** |

**Token-saving tactics (the "how"):**
- **Contract-then-cheap:** Opus freezes Prompt 0; Sonnet/Haiku build Prompts 1–3 against it. The frozen contract = no re-deriving enums/types, so weaker models succeed.
- **Parallelize STEP 3** with multiple **Sonnet/Haiku subagents**, each scoped to *only the frozen contract + one screen/module* (don't load the whole repo). Biggest screen-count = biggest saving.
- **Opus reviews critical-path output** (auth, RLS, sync, wage calc) — cheap to build with Sonnet, then a focused Opus adversarial pass, rather than building everything on Opus.
- **Scope context tightly:** keep per-task context to the contract + the file(s) in play; reserve the 1M-context Opus for the spec/contract and whole-system reasoning.
- **In Claude Code:** switch with `/model`; `/fast` = Opus with faster output for interactive design; set model **per subagent** (Agent tool `model:`) or **per workflow phase**. Run STEP 3 as a workflow that fans out cheap agents and escalates only the hard screens.

---

## After Phase 1 — the engine-improvement loop (merchant #2…N)
1. New company → provision org + Owner login → add `merchants/<id>/config.ts` + assets → seed data → EAS build. **Target: hours, not weeks.**
2. Anything bespoke a merchant needs → add behind a config flag; if generally useful, fold it into the engine.
3. Each onboarding makes the engine fitter — the reuse compounding loop.

*(Deferred to later phases: self-signup/OTP, in-app payment/subscriptions, multi-org self-serve, web/iOS, real-time tracking — all additive thanks to the tenant-aware + adapter architecture.)*
