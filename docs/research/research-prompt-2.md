# Research Prompt #2 — "Build-readiness completeness sweep (before the mega-prompt)"

> **How to use this:** copy everything inside the `=== PROMPT ===` block and paste it into a web-connected AI (Perplexity / Claude / ChatGPT with web access). Bring its answer back here. Goal of this round: lock the **final feature set** and an **exhaustive pre-build planning checklist** so we can write ONE mega-prompt that builds the whole app (backend + frontend + database + everything) in a single shot, then only polish.
>
> This is **round 2**. Round 1 already validated the market and surfaced gaps (summarized inside the prompt). Do NOT repeat market research — build on it.

---

=== PROMPT ===

You are a **senior full-stack engineering lead + solutions architect**. I have validated my product's market (round 1, summarized below). Your job now is to get me to **build-ready completeness**: (1) the **final, complete Phase-1 feature list**, and (2) an **exhaustive pre-build planning checklist** covering backend, frontend, database, and everything else — so that I can write a **single "mega-prompt" that builds the entire application in one shot**, then only do small polish afterward. Anything left unspecified now will be guessed (often wrongly) by the code-generating AI, so your job is to make sure **nothing is missing**.

Use the web only to fill specific gaps or verify best practices — most of the work here is rigorous reasoning about completeness. Be concrete and prescriptive: where a decision is needed, **recommend a default** so I can confirm fast. Cite sources only for new factual claims.

## Context 1 — The product (already locked)
**techBuilder**: a Hindi-first **Android** app (Expo/React Native) for running an Indian construction SMB's daily field operations — a *records + visibility* logbook (NOT project management/BIM/estimation/payroll). Field roles log simple daily records end-of-day; they roll **up** automatically to an Owner dashboard with Excel export.

- **Model:** managed/agency — developer manually onboards each company (offline payment → create org + Owner login). No self-signup/OTP/in-app payment this phase. After onboarding, fully self-service in-app.
- **Single company in practice, multi-tenant-ready** (`orgId` on all data; one backend + one Postgres with Row-Level Security).
- **Architecture:** one reusable **engine** + one app codebase; new company = config file + assets, never a code fork. **Adapter pattern:** screens call an interface (`RecordsClient`/`AuthClient`), built on a **mock** adapter first, then a **rest** adapter — zero screen changes on swap.
- **5 roles:** Owner, Site Manager, Team Head (Mistri), Driver, Worker (view-only). **Account creation cascades** Owner → Site Manager → Team Head (scoped).
- **Vehicles are type-driven** (truck=KM / JCB=hours + dynamic fields, config-not-code); drivers restricted to allowed vehicle types; **request→approval** workflow for vehicle-switch, leave, material.
- **Attendance:** per-person present/absent/half-day + multi-day leave ranges, **marked by Team Head / Site Manager only — no clock-in/out, no GPS.**
- **Records (end-of-day):** site progress notes + photos, headcount, expenses (incl. Team Head), fuel (₹+litres+receipt), vehicle start/end logs, trips, material usage + material movement, issues/breakdowns. Capture via camera, QR/barcode scanner, GPS geotag (records/photos only).
- **Roll-up:** every record entered once flows up to Site Manager + Owner; Owner only consumes/analyses/exports.
- **Stack — frontend:** Expo SDK 55, Expo Router, NativeWind, TypeScript, npm; Zustand + TanStack Query + custom offline outbox; **expo-sqlite** (not PowerSync); expo-camera + watermark + compression; i18next; SheetJS + expo-print export; Cloudflare R2; Expo Notifications + FCM.
- **Stack — backend:** **NestJS + Drizzle + PostgreSQL (Neon) + Cloudflare R2**; JWT manual login; shared-schema multi-tenant + RLS; server-side RBAC; no Redis/queues/sockets/server-PDF this phase. Target infra ~₹0–500/month.

## Context 2 — What round-1 research already concluded (build on these; don't re-derive)
- **Plan is sound and well-scoped.** The "records-only, not PM/ERP" discipline is the key strength; competitors (Powerplay, Onsite) over-build and monetize poorly.
- **Must-add features identified in round 1** (treat as already-accepted inputs — your job is to integrate + complete them, not re-argue):
  1. **Attendance → wage/cost *summary*** (read-only calc + Excel export; NOT a payment rail) — the single highest-leverage add; closes the loop so data entry pays back.
  2. **"Is today complete?" daily-completeness indicator** per site/vehicle on dashboards (so missing data is visible, not silently assumed zero).
  3. **Kiosk / shared-device mode** (workers share/lack phones).
  4. **Per-entity cost roll-ups** (cost per site / vehicle / crew / material).
  5. **Fuel reconciliation** (expected vs actual) and **material reconciliation** (received vs consumed vs moved — running balance).
  6. **WhatsApp one-tap share** of the daily/weekly rolled-up summary/PDF.
  7. **Low-literacy UX as a first-class feature** — icon+label on every action, numeric/tap input over typing, color-coded status, voice notes for issues/progress.
  8. **Hardened offline sync** — client-generated UUIDs, idempotency keys, backoff/attempt caps, last-write-wins, WAL mode, photos as R2 references (never SQLite BLOBs), version-based migrations.
  9. **RLS hardening** — non-superuser DB role, per-transaction tenant context under pooled Neon connections, defense-in-depth manual `org_id` filters, `security_invoker` views, automated cross-tenant tests.
- **Deliberately skip** (keep skipping): GPS/biometric clock-in, BIM/estimation/Gantt, in-app payments/payroll disbursement, real-time GPS telematics, real-time sockets, self-signup/OTP this phase.

## Your tasks

### Task A — The FINAL, complete Phase-1 feature list
Produce the **definitive feature list** for Phase 1, integrating the round-1 must-adds with the locked plan. Organize by area (Auth/onboarding · Org & people & RBAC · Sites · Vehicles & types · Attendance & leave · Wage/cost summary · Records: expense/fuel/trip/material/issue/progress/photo · Approvals · Roll-up dashboards & analytics · Reports/export/backup · Capture: camera/scanner/GPS · Notifications · Low-literacy/kiosk UX · Offline/sync · Shared screens). For each feature: **must-have vs nice-to-have**, and a one-line acceptance criterion. **Then add anything still missing** that a real construction SMB workflow needs and neither the plan nor round-1 covered (reason it out; quick web check only if needed).

### Task B — Exhaustive PRE-BUILD planning checklist (the core deliverable)
Enumerate **everything that must be decided/specified before writing the mega-prompt**, so the one-shot build has no gaps. For each item, state the decision needed + a **recommended default**. Cover ALL of these layers:
1. **Product/UX:** complete screen inventory per role; navigation; the exact end-of-day entry flow (must be <2 min); empty/loading/error states; kiosk mode; voice-note flow; language switching.
2. **Data model:** every entity, every field (name, type, nullable, enum values), every relationship, every unique constraint, audit fields, soft-delete policy. Flag anything the current model is missing (e.g. wage-rate fields, reconciliation baselines, completeness tracking, voice-note media).
3. **API contract:** every endpoint (method, path, request body, response shape, error shape), pagination/filtering conventions, the `RecordsClient`/`AuthClient` interface methods, and how the mock vs rest adapter map.
4. **Database:** full Postgres schema, migrations strategy, **RLS policies** per table, indexes, and **seed/demo data** needed to onboard the first org + show a populated dashboard.
5. **Auth & session:** manual login, JWT contents, refresh/expiry, first-login change-password, role resolution, logout, multi-device.
6. **RBAC:** the full permission matrix (action × role × scope) and how `can()` is enforced both client and server.
7. **Offline/sync:** outbox schema, sync state machine, idempotency, conflict (LWW) rules, completeness computation, retry/backoff, what syncs vs what's local-only.
8. **Media/files:** R2 bucket layout, presigned upload flow, watermark spec, compression targets, thumbnail strategy, scanner data handling.
9. **i18n:** string-catalog structure, Hindi+English coverage, number/date/currency formatting, where voice notes fit.
10. **Reports/export/backup:** which reports, columns, Excel/PDF structure, windowed (7/30-day) export/import, backup format + restore.
11. **Config/merchant schema:** the exact `merchant.config.ts`/org-config shape (brand, enabled roles/records, vehicle types, feature flags) and validation.
12. **Non-functional:** performance budget on a ₹8–10K Android phone, security (input validation, secrets, rate limits), error handling + user-facing error UX, logging/observability (Sentry), accessibility.
13. **Build/release:** EAS build profiles (incl. white-label), env-var inventory (frontend + backend), versioning/migrations on update.
14. **Testing:** what to unit-test, the RLS/cross-tenant tests, offline-sync tests, and the low-end-device manual test checklist.

### Task C — Open decisions that MUST be locked before the mega-prompt
List every ambiguity/decision still open (e.g. wage-rate model — daily vs hourly vs per-crew; how completeness is defined; kiosk auth; voice-note storage; reconciliation baselines; soft-delete vs hard-delete; ID scheme; timezone handling). For each, give a **recommended answer** so I can confirm in one pass.

### Task D — "The one-shot build will guess wrong unless pinned" hotspots
Identify the specific things a single mega-prompt code-generation is most likely to get wrong or do inconsistently unless explicitly specified (e.g. UUID generation, RLS context under pooled connections, adapter interface boundaries, enum values, the config schema, error contracts). These become mandatory explicit sections in the mega-prompt.

### Task E — How to STRUCTURE the mega-prompt itself
Recommend the optimal structure/order for a single mega-prompt that builds the whole stack (backend + DB + frontend) coherently in one shot: what sections it must contain, in what order, how to keep the engine/app/adapter boundaries clean, how to make it self-consistent (shared types/enums), and what to deliberately leave for post-build polish. Note best practices and known failure modes for very large one-shot code-gen prompts, and whether/where to split if one prompt is too big.

## Output format
1. **Final feature list** (tables by area; must/nice; acceptance criteria; + newly-found gaps).
2. **Pre-build planning checklist** (by the 14 layers above; decision + recommended default each).
3. **Open-decisions table** (decision · options · recommendation).
4. **Guess-wrong hotspots** (the mandatory-to-pin list).
5. **Mega-prompt structure** (section outline + order + tips + what to defer to polish).
6. **Sources** (only for new web-verified claims).

Be exhaustive and prescriptive — this output is the direct input to writing the mega-prompt, so leave nothing implicit.

=== END PROMPT ===
