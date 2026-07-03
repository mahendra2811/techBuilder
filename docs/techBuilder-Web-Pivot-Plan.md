# techBuilder — Web Pivot Plan (2026-07-03)

> **Decision:** pivot the frontend from Expo/React Native (Android) to a Next.js web portal. Final for Phase 1.
> **Reason:** a full day of native-mobile-tooling friction (Metro tunnel flakiness, `adb`/USB debugging-authorization
> resets, ngrok credential limits, a stray root `app.json` silently breaking bundling) — with **zero real bugs found
> in `backend/` or `shared/`** across 31 unit tests + 19 live-Neon integration tests, all green. The user is a web
> developer; native RN/Expo tooling was the actual velocity killer, not the product logic.

## What changes, what doesn't

- **KEEP untouched:** `backend/` (NestJS + Drizzle + Neon + RLS) and `shared/` (contracts) — proven solid.
- **FREEZE, don't delete:** `app/` (the Expo app) — stays as a reference (screen logic, i18n keys, adapter patterns), no more work on it.
- **NEW:** `web/` — a 4th npm workspace, Next.js portal, same product per the existing docs.
- **Still binding:** `docs/techBuilder-Build-Readiness-Spec.md` conventions, the Hardening Punchlist P0 backend work (platform-independent, already done and green), `docs/research/reserch-3/techBuilder-Pilot-Playbook.md`'s 7-screen build order (now the web build order too).

## Hard rules

1. Never copy-paste code from `shared/` into `web/` — import the workspace package. One source of truth.
2. Do not modify backend API contracts for the web app's convenience. Backend changes only for Hardening Punchlist items or named, justified bugs.
3. Plan before code — each phase gets a written plan/report, wait for approval before the next.
4. Small verifiable increments — every phase ends with a runnable acceptance check.
5. Web stack (locked): Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui + TanStack Query + react-hook-form + zod (from `shared/`). Mobile-first. No Redux, no Docker.
6. Dev backend runs locally against the existing Neon DB — no new database.

## Framework decision: NestJS backend stays (evaluated and rejected switching)

Considered switching `backend/` to plain Node/Express. Rejected: NestJS was never implicated in any bug this session (every failure was Expo/Android-tooling-specific); the hard-won logic (`scope.util.ts`, `business-date.ts`, `wage-calc.ts`, `completeness-rule.ts`) is already framework-agnostic and would transfer either way, so switching now would mean re-verifying 16 modules' worth of routing/guards for zero functional gain. Revisit only if a real NestJS-specific problem shows up.

## Phase 0 — Assess & plan — ✅ DONE (2026-07-03)

Repo inventory confirmed docs match reality. Backend health check: `shared`+`backend` build/typecheck green, 31/31 unit tests green, 19/19 integration tests green (verified earlier same day, not re-run at Phase-0-report time per user interrupt). Verdict: "the backend is not working" was false as stated — every issue traced to Expo/Android tooling or one `app/`-side bug (a private-constructor misuse in `_layout.tsx`'s `SqliteOutboxStore` usage), never to `backend/`/`shared/`.

**Reuse map:** `shared/` (100%, direct import) · `backend/` all 16 modules + endpoints (used as-is, zero changes) · `backend/scripts/seed-merchant.ts` + `backend/merchants/dev/` (local dev data) · `app/src/engine/adapters/rest.ts` fetch-wrapper *pattern* (port the shape, not the file) · `app/src/i18n/locales/{en,hi}.json` (starting point, incomplete in both old and new) · `app/src/ui/*` NOT portable (RN primitives) — re-implement as shadcn/ui equivalents.

**Gap map:** auth storage → **httpOnly cookie**, not bearer-in-JS (XSS-safe) · file upload → `<input type="file" capture="environment">` + client compress + existing presigned R2 PUT (`/media/presign` untouched) · GPS → browser `navigator.geolocation` · Excel export → SheetJS client-side (unchanged from original plan) · offline → **none in v1**, online-required with retry toasts (removes the single buggiest RN subsystem, the outbox/SQLite code that crashed today).

## Phase 1 — Scaffold + auth — ✅ DONE & INDEPENDENTLY VERIFIED (2026-07-03, built by a Fable-5 agent)

Built: `web/` as the 4th npm workspace (`@techbuilder/web`, Next.js **16** App Router + TS strict + Tailwind v4 + shadcn/ui + TanStack Query 5 + react-hook-form/zod), importing `@techbuilder/contracts` directly. Auth = **httpOnly cookies** (`tb_access` 900s / `tb_refresh` 30d / `tb_device`) set by Next Route Handlers (`/api/auth/{login,logout,refresh}`); browser JS never sees tokens; all backend traffic goes through one authenticated gateway `/api/proxy/[...path]` with one-shot refresh+retry; `web/src/proxy.ts` (Next 16's renamed middleware) does route gating + pre-render refresh. Env: `BACKEND_ORIGIN=http://localhost:4000` (server-only; `/api/v1` comes from the contracts' `API_BASE`). Login page → forced-change-password gate → role router to 5 distinct areas.

**Verified** (agent self-verified with Playwright via system Chrome `channel:'chrome'` + curl; orchestrator independently re-verified build, file tree, login round-trip, 307→/change-password gate, httpOnly cookie jar): all criteria green. **Side effect:** the forced-change verification flipped `mustChangePassword` to false for `owner`/`sm1`/`th1`/`driver1`/`worker1` (passwords unchanged: `changeme123`); `th2`/`driver2-4`/`worker2-6` still have the flag.
**Notes for later:** backend accepts newPassword === currentPassword on the forced change (consider rejecting in `auth.service.ts`); CORS never needed (same-origin proxy architecture).
**Gotchas:** Next 16 renamed `middleware.ts` → `proxy.ts`; `web/AGENTS.md` warns to check `web/node_modules/next/dist/docs/` before using Next APIs (training data is stale for Next 16); shadcn init pinned `shadcn` into deps (harmless); Playwright's bundled Chromium isn't installed on this machine — use `channel: 'chrome'`.

## Phase 2 — Role shells + RBAC visibility — ✅ DONE & INDEPENDENTLY VERIFIED (2026-07-03, Fable-5 agent)

Built: `web/src/lib/nav.ts` (12 actions → nav entries, filtered via `can()` — matrix data never redefined), `web/src/components/role-nav.tsx` (mobile-first horizontally-scrollable pill bar in the role shell, lucide icons, `data-testid="nav-<action-slug>"`), `web/src/app/dev/rbac-matrix/page.tsx` (**the configuration truth-check**: 12 actions × 5 roles table rendered from `ACTIONS`/`ROLES`/`scopeFor`, logged-in column highlighted, `requireSession()`-protected, `/dev` added to proxy protected prefixes). Nav hrefs point at `<roleHome>/{attendance,records,vehicle,requests,approvals,people,sites,fleet,wages,reports,settings}` (placeholders until Phase 3).

**Verified live** (agent + orchestrator independently): Worker nav = only Dashboard; Owner nav = 9 items incl. Attendance and correctly WITHOUT Records/Vehicle-Fuel/Requests; matrix spot-checks `OWNER×record.enter=—`, `WORKER×view.all=SELF`, `DRIVER×vehicleLog.enter=OWN_VEHICLE`, `SITE_MANAGER×wage.view=OWN_SITE`; worker→/owner cross-access 307s to /worker; backend/shared/app untouched.
**Correction captured:** the orchestrator's brief wrongly claimed Owner lacks `attendance.mark` — the frozen matrix (`permissions.ts:32`, `'attendance.mark':'ORG'`) and Spec §4 agree Owner CAN mark attendance org-wide. The agent followed the matrix over the prose (correct behavior; single source of truth held).

## Phase 3 — Pilot-surface screens — ✅ ALL 7 SCREENS DONE & INDEPENDENTLY VERIFIED (2026-07-03)

**Batch B delivered** (screens 5–7, Fable-5 agent, all proven E2E + independently re-verified): **Owner dashboard** at `/owner` (KPI cards live-matching `GET /dashboards/owner` — verified spendToday 177050p/₹1,770.50, headcount 3; per-site completeness strip GF=COMPLETE/ST=MISSING with 7-day dot rows, text labels never color-alone; cost rollups by site/vehicle; Today/7d/30d toggle — KPIs always "today", window drives rollups; **WhatsApp digest button** → `https://wa.me/?text=` + clipboard copy fallback, digest built purely from screen-fetched data). **Site list + drill-in** `/owner/sites`, `/owner/sites/[id]` (read-only attendance/expense/progress/fuel lists, ids→names via users/people/vehicles lists, fuel mapped to site via `vehicle.assignedSiteId`; **audit chip** `"corrected — <name> · <dd MMM, HH:mm>"` on every `version>1` row — verified showing "Mistri Greenfield" on the seeded v2/v3 rows). **Excel export** `/owner/reports` (SheetJS from the official CDN tarball `xlsx@0.20.3` — npm-registry xlsx is stale/vulnerable; two sheets Attendance+Expenses, Corrected=YES column from `version>1`, paise→numeric rupees with 0.00 format, `XLSX.writeFile` download; agent parsed the actual downloaded file: 16/16 checks). New shared bits: `lib/digest.ts`, `lib/export-excel.ts` (pure builders), `components/owner/{audit-chip,completeness,window-toggle}.tsx`. Next-16 note: dynamic route `params` is a Promise (awaited per bundled docs).

**Batch A delivered** (screens 1–4, all E2E-proven against live Neon by the agent AND re-verified independently): attendance roster (`/site-manager/attendance` + `/team-head/attendance`, one shared `attendance-screen.tsx` — bulk All-present, change-only submit so unchanged rows don't falsely bump `version`, pre-fills saved state, "corrected" chip on `version>1`, date capped to role window TH≤2d/SM≤7d), records page (`<role>/records`: Expense + Progress sub-tabs, ₹→integer-paise, 6 category buttons, "nothing to report" quick-submit), fuel entry (`/driver/vehicle`, own vehicle auto-fixed, recent-7d list). Shared helpers: `lib/business-date.ts`, `lib/money.ts`, `lib/media-upload.ts` (downscale→presign→PUT, never throws — photo-less fallback + notice, since R2 presign is a local stub). `uuidv7` added to web deps. Verified live: th1 3 attendance rows incl. HALF_DAY v2 correction; sm1 expense MISC 25000p + progress note; driver1 fuel 15.5L/152050p; driver1 on foreign vehicle → 403 FORBIDDEN; backend/shared/app untouched.
**Batch A findings for later:** (a) ⚠️ **record creation (expense/progress/fuel) has NO server-side backdating window** — WP-4 covered attendance only, WP-3 covers edits; client caps dates but the API accepts any past businessDate on create. Decide + enforce server-side (likely same role windows) in Phase 4. (b) Nav prefetch of still-unbuilt placeholder routes logs 404s — disappears as batches land.

### The 7 screens (Playbook order)

Split into two verified batches: **Batch A = screens 1–4** (attendance roster SM+TH, expense entry, progress note, fuel entry — the field-entry surface), **Batch B = screens 5–7** (Owner dashboard, site drill-in + audit chip, Excel export). Key facts baked into Batch A: money entered in ₹ → stored as integer paise; ids = client `uuidv7` (dep added to web); businessDate = Kolkata `en-CA` Intl format, backdating windows TH≤2d/SM≤7d surfaced in the date picker but server-authoritative; lists arrive pre-scoped from the backend (th1's `/people` = own crew only; driver1's `/vehicles` = own vehicle); **R2 is not configured locally and `/media/presign` is a stub, so photos are optional + degrade gracefully (record saves without photo + notice) — real uploads need R2 keys + a real presigned-PUT implementation later.**

### The 7 screens (Playbook order)

1. Attendance roster (SM/TH) — bulk "all present" + per-person present/absent/half/leave, ≤30s flow, backdating rules surfaced.
2. Expense entry (SM/TH) — paise-safe amount, category, receipt photo (capture → compress → presigned PUT).
3. Progress note + photo (SM/TH) — text or "nothing to report" + photo.
4. Fuel + odometer entry (Driver) — one screen.
5. Owner dashboard — headcount/expense/completeness/fuel + "Share today's summary" (WhatsApp/copy-text).
6. Owner site drill-in (read-only records list) with the "edited by X at HH:MM" audit chip.
7. Excel export (Owner) — attendance + expense ledger, 7/30-day, corrected-flag column, SheetJS.

**Acceptance per screen:** E2E against the local backend with seeded data, usable on a real phone's browser via LAN IP.

## Phase 4 — Backend hardening — ✅ DONE & LIVE-VERIFIED (2026-07-03, built directly by the orchestrator — backend/security tier)

1. **Record-creation backdating windows** (closes Phase-3A's finding): new shared `backend/src/common/backdate.util.ts` (`assertBackdateWindow` + the two limit maps); wired into ALL 7 record creates in `records.service.ts`, the sync CREATE path (any businessDate-stamped payload; attendance uses the attendance map), and `attendance.service.ts` refactored onto the same helper (duplication removed). Windows: TH ≤2d, SM ≤7d, DRIVER ≤2d, future rejected, Owner unlimited. Leave deliberately unwindowed.
2. **Same-password change rejected** in `auth.service.ts::changePassword` (closes Phase-1's finding).
3. **Tests:** 31 unit + **21** integration (2 new: REST create windows per role + sync create window) — all green vs live Neon. Live HTTP proof: 10-day-old expense → `FORBIDDEN: Backdating window exceeded: SITE_MANAGER may go up to 7 day(s) back (Owner override required)`; future date → `VALIDATION_FAILED: Business date cannot be in the future`; same-password → `VALIDATION_FAILED: New password must be different from the current password`.
4. Dev convenience: cleared `must_change_password` for the remaining devco seed users (driver2-4, worker2-6) since re-entering the same password is now rejected; Spec §5 updated with both new policy lines. Web posture confirmed online-required v1 (no offline queue).

## Phase 5 — Polish + pilot prep (not started)

PWA manifest + icon, responsive QA on a low-end Android browser, Hindi completeness for SM/TH/Driver flows, Sentry (web + backend), `web/README.md` (run/env/deploy — Vercel for web + Railway/Render for backend, only when pilot time actually comes).

**Acceptance:** Lighthouse mobile ≥85 on the dashboard, add-to-home-screen works, all pilot screens usable one-handed on a phone.

---

*Estimate at Phase-0 time: ~5–7 focused solo days to a usable pilot-surface web portal — faster than the native path because there's no device-pairing/bundler/native-module layer to fight.*
