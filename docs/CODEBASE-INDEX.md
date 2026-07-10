# techBuilder — Codebase Index (file-by-file map)

> **Purpose:** let any session (human or AI) find the right file WITHOUT exploring/grepping the tree.
> Regenerate hint: file headers carry doc-comments — this index is distilled from them.
> Last regenerated: 2026-07-09 (Excel Export v2 pass — `backend/src/exports/`, section-picker Reports screen, ExcelJS). If you add/move files, update the matching section only.

---

## 1. Repo top level

| Path | What it is |
|---|---|
| `CLAUDE.md` | Session orientation: what the project is, build status, doc map, frozen conventions. |
| `package.json` | npm workspace root (`shared`, `backend`, `web`; `app/` frozen Expo reference). |
| `docs/` | All specs/plans/research. `docs/techBuilder-Developer-Guide.md` = "where do I change what". |
| `shared/` | `@techbuilder/contracts` — FROZEN single source of truth (types, enums, schema, RBAC). |
| `backend/` | NestJS 11 + Drizzle + Neon Postgres (RLS). 21 modules, port 4000. |
| `web/` | Next.js 16 App Router portal (the CURRENT frontend). |
| `app/` | FROZEN Expo/React-Native app — reference only, do not build on. |
| `proj/` | OLD Next.js scaffold (pre-pivot) — not Phase-1, ignore. |

---

## 2. `shared/src/` — @techbuilder/contracts (FROZEN)

| File | Contents |
|---|---|
| `index.ts` | Barrel — everything importable from `@techbuilder/contracts`. |
| `common.ts` | `UUID`, `Paise`, `BusinessDate`, `Timestamp`, audit fields, pagination. |
| `enums.ts` | ALL enums as `as const` arrays (TS unions + pgEnums derive from these). |
| `errors.ts` | Uniform envelope `{ error: { code, message, fields?, traceId } }` + `ErrorCode` + `isApiFailure`. |
| `config.ts` | `OrgConfig` zod schema (limits, categories, form toggles, EOD cutoff…). |
| `domain.ts` | Entity + derived read-model types (`Site`, `Attendance`, `OwnerDashboard`, `Completeness`…). |
| `dto.ts` | Create/mutation input types. |
| `api.ts` | `API_BASE` (`/api/v1`) + `ENDPOINTS` map — backend controller paths MUST match. |
| `adapters.ts` | `AuthClient` / `RecordsClient` / `SyncClient` interfaces (frontend talks ONLY to these shapes). |
| `permissions.ts` | RBAC matrix + `can(role, action)` + `ACTIONS`. |
| `db/schema.ts` | Drizzle schema — 30+ tables. Import as `@techbuilder/contracts/db/schema`. |
| `db/rls.sql` | RLS policy DDL (`FORCE ROW LEVEL SECURITY` + `tenant_isolation`), applied after migrations. |

---

## 3. `backend/src/` — NestJS modules

Every resource module = `<name>.service.ts` + `<name>.controller.ts` + `<name>.module.ts`, registered in `app.module.ts`, following the `sites/` pattern (see `.claude/rules/backend-modules.md`).

### Core / cross-cutting

| Path | What it does |
|---|---|
| `main.ts` | Bootstrap: global prefix `/api/v1`, filters/interceptors, port 4000. |
| `app.module.ts` | Wires ALL modules — new modules register here. |
| `health.controller.ts` | `GET /api/v1/health` unauthenticated (Railway healthcheck). |
| `seed.ts` | Dev seed (org "DevCo Builders", code `devco`). Bulk merchant seed: `scripts/seed-merchant.ts` + `merchants/`. |
| `config/env.ts` | Env loading/validation (`DATABASE_URL`, JWT secrets, TTLs). |
| `db/db.service.ts` | pg `Pool` + Drizzle + **`runInTenant(orgId, fn)`** — per-tx `SET LOCAL app.org_id` for RLS. |
| `common/scope.util.ts` | **`loadScope`** — derives site/crew/vehicle/self scope FRESH from DB per request (RBAC WP-1). |
| `common/rbac.guard.ts` + `current-user.decorator.ts` | `@RequireAction(...)` guard + `Principal` (userId/orgId/role). |
| `common/api-exception.ts` + `all-exceptions.filter.ts` + `transform.interceptor.ts` | Frozen error envelope + `{ data }` success wrapper. |
| `common/zod-body.pipe.ts` | `ZodBody(schema)` body validation. |
| `common/business-date.ts` | Pure Kolkata business-date (EOD cutoff 20:00) + `.spec.ts`. |
| `common/backdate.util.ts` | Backdating policy TH≤2d / SM≤7d / Owner any. |
| `common/org-config.util.ts` | Org/site config resolution (site overrides org). |

### Auth

| Path | What it does |
|---|---|
| `auth/auth.service.ts` | login (SECURITY-DEFINER `auth_lookup`), refresh rotation, change-password, `/me`, `/me/contacts`. |
| `auth/auth.controller.ts` | `/auth/*` + `MeController` (`/me`, `/me/contacts`). |
| `auth/jwt.strategy.ts` + `jwt-auth.guard.ts` | Stateless JWT → `Principal` (NO DB hit per request). |
| `auth/password.ts` | scrypt hash/verify (documented deviation from argon2id). |

### Resource modules (per-domain)

| Module | Owns |
|---|---|
| `users/` | User CRUD + creation cascade (Owner→SM→TH), forced password change. |
| `sites/` | Sites + **`PATCH /sites/:id/config`** (per-site settings). THE pattern module — copy it. |
| `people/` | Workers/people registry (person-scoped, crew membership). |
| `vehicle-types/`, `vehicles/` | Fleet registry + driver assignment + vehicle switch. |
| `attendance/` | Attendance upsert (`onConflictDoUpdate`) + list. |
| `leave/` | Leave records. |
| `records/` | Field records: progress / expense / material / issue / fuel / trip / damage lifecycle. |
| `approvals/` | Request→approve workflow incl. EXPENSE_ADD threshold ladder + materialize-on-approve (WP-2 self-approval guards). |
| `cash-transfers/` | Money ledger / khata (`balance-calc.ts` pure + spec). |
| `vendors/` | Vendor/shop udhaar khata. |
| `wage/` | Wage summary + advances (`wage-calc.ts` pure + spec). |
| `dashboards/` | Owner/SM dashboard KPIs + cost rollup + completeness (`completeness-rule.ts` pure + spec). ~18 sequential queries — the slowest endpoint. |
| `insights/` | WO-13 day-wise + per-person insights. |
| `reconciliation/` | Recon views. |
| `notifications/` | In-app notifications. |
| `media/` | Presign for photo/voice (R2 keys absent → accepted, not stored). |
| `sync/` | Outbox push/pull (mobile legacy; registry-trimmed + per-type action+scope checks). |
| `exports/` | Excel export v2 email delivery (`GET /exports/config` — SMTP-presence flag; `POST /exports/email` — `report.export` RBAC, 202-then-background). Gathers data ONLY via the other services' already-scoped methods (imports their modules with `exports: [XxxService]` added) — never queries the DB itself. `export-sheets.ts` = slim ExcelJS builder (bilingual en/hi, independent duplication of `web/src/lib/export-excel.ts` — no cross-workspace import). No `/materials` catalog endpoint exists anywhere in the backend — the Materials sheet omits a resolved name. |

Tests: `npm test` (unit) + `npm run test:integration` (live Neon). SQL: `backend/sql/auth.sql` (auth_lookup), `scripts/apply-sql.ts`.

---

## 4. `web/src/` — Next.js portal

### 4.1 Request/data flow (READ THIS FIRST)

```
Browser (React Query, staleTime 30s)
  → same-origin fetch /api/proxy/<path>        [api-client.ts]
    → Next Route Handler attaches Bearer from httpOnly cookie,
      one-shot refresh+retry on 401             [app/api/proxy/[...path]/route.ts]
      → NestJS localhost:4000 (BACKEND_ORIGIN)  [lib/server/backend.ts]
        → runInTenant tx → Neon Postgres (us-east-1!)
```
- Auth cookies: access(900s)/refresh/device — set ONLY by `/api/auth/*` handlers.
- `proxy.ts` (Next middleware): protected-route gate + pre-render token rotation.
- SSR session: `lib/server/require-session.ts` → `getSession()` (`/me`, memoized 60s per token) — runs in every role layout.

### 4.2 `app/` routes (29 routes, all thin wrappers around `components/screens/*`)

| Route | Screen component (variant) |
|---|---|
| `/` (`page.tsx`) | Role router → redirects to role home. |
| `/login` | Login + dev tap-panel (development only). |
| `/change-password` | Forced/manual password change. |
| `/api/auth/{login,logout,refresh}` | Cookie-handling auth Route Handlers. |
| `/api/proxy/[...path]` | Authenticated gateway to backend. |
| `/dev/rbac-matrix` | Dev-only RBAC matrix view. |
| `/owner` | `owner-dashboard-screen` (OWNER) |
| `/owner/sites`, `/owner/sites/[id]` | `owner-sites-screen`, `site-detail-screen` |
| `/owner/approvals` | `approvals-screen` (OWNER) |
| `/owner/people`, `/owner/people/[id]` | `people-screen`, `person-insights-screen` |
| `/owner/fleet`, `/owner/fleet/[id]`, `/owner/fleet/driver/[id]` | `fleet-screen`, `vehicle-detail-screen`, `driver-detail-screen` |
| `/owner/ledger` | `ledger-screen` |
| `/owner/insights` | `insights-screen` |
| `/owner/reports` | `reports-screen` (Excel export v2 — section picker, download or email) |
| `/owner/settings` | `settings-screen` (org config read-only) |
| `/site-manager` | `owner-dashboard-screen` (SITE_MANAGER variant) |
| `/site-manager/{approvals,people,people/[id],fleet,fleet/[id],fleet/driver/[id]}` | same shared screens, SM variant |
| `/site-manager/{expense,progress,vehicle,requests,ledger,vendors,insights,reports,settings}` | `expense-screen`, `progress-screen`, `fuel-screen`, `requests-screen`, `ledger-screen`, `vendors-screen`, `insights-screen`, `reports-screen`, `sm-settings-screen` |
| `/team-head` | `team-head-dashboard-screen` |
| `/team-head/{expense,progress,approvals,requests,people,people/[id],ledger,insights}` | shared screens, TH variant |
| `/driver` | `driver-dashboard-screen` |
| `/driver/vehicle` | `fuel-screen` (DRIVER) + vehicle switch |
| `/driver/requests` | `expense-request-screen` / `requests-screen` |
| `/worker` | `worker-dashboard-screen` (read-only) |
| `/worker/requests` | `expense-request-screen` |

Each role area has a `layout.tsx` = `requireRole(ROLE)` + `<RoleShell>`.

### 4.3 `components/screens/` — one component, N role wrappers

| File | Screen |
|---|---|
| `owner-dashboard-screen.tsx` | Owner+SM dashboard: KPI grid, completeness strip, cost rollup, khata card, WhatsApp digest. Fires ~6 queries + per-site attendance. |
| `team-head-dashboard-screen.tsx` | TH dashboard from TH-scoped queries. |
| `driver-dashboard-screen.tsx` | Driver day (WO-7): vehicle, fuel, trips, damage. |
| `worker-dashboard-screen.tsx` | Only worker screen; read-only + contacts. |
| `approvals-screen.tsx` | Approvals inbox (Owner/SM/TH) + decide actions. |
| `requests-screen.tsx` | Raise request (SM/TH/Driver). |
| `expense-request-screen.tsx` | Worker/Driver EXPENSE_ADD request form (WO-5). |
| `expense-screen.tsx` | Direct expense entry (SM/TH). |
| `progress-screen.tsx` | Progress report (SM/TH). |
| `fuel-screen.tsx` | Fuel entry (Driver/SM). |
| `fleet-screen.tsx` / `vehicle-detail-screen.tsx` / `driver-detail-screen.tsx` | Fleet list + WO-12 drill-downs (Owner/SM). |
| `vehicle-switch-screen.tsx` | WO-11 driver self-switch vehicle. |
| `ledger-screen.tsx` | Cash khata (Owner/SM/TH). |
| `vendors-screen.tsx` | Vendor udhaar khata (SM). |
| `people-screen.tsx` / `person-insights-screen.tsx` | People mgmt + WO-13 per-person drill-down. |
| `insights-screen.tsx` | WO-13 day-wise insights (Owner/SM/TH). |
| `owner-sites-screen.tsx` / `site-detail-screen.tsx` | Site list + owner-only drill-in. |
| `reports-screen.tsx` | Excel export v2 (Owner/SM) — window picker (Today/7d/30d/90d/custom) + checkbox section picker (default: Expenses + Cash khata; money/vendor/attendance/progress/site-summary/materials/fleet/issues/people), each section's queries `enabled` only when checked. Download in-browser, or email delivery when the backend reports `emailEnabled` (`GET /exports/config`). |
| `settings-screen.tsx` / `sm-settings-screen.tsx` | Owner org config (read-only) / WO-8 per-site editable settings. |
| `attendance-screen.tsx`, `wages-screen.tsx` | PHASE-PARKED, unrouted (manual this phase). |

### 4.4 Other `components/`

| Path | What |
|---|---|
| `role-shell.tsx` / `role-nav.tsx` | Mobile-first shell (org bar, logout, locale) + RBAC-gated nav. |
| `khata-card.tsx` | "My cash khata" card on all 5 dashboards. |
| `contact-panel.tsx` | WO-4 tap-to-call footer (worker/driver). |
| `locale-toggle.tsx` / `logout-button.tsx` | हि/EN toggle; logout. |
| `dashboard/quick-actions.tsx` | Big tappable shortcut grid. |
| `entry/*` | Form building blocks: `date-field`, `site-picker`, `photo-field`, `photo-multi-field`, `voice-field`, `recent-entries`, `states` (**LoadingState/EmptyState/ErrorState/Notice — the loading-UX primitives**). |
| `insights/*` | WO-13 shared: `date-presets`, `period-summary`, `record-lists`. |
| `owner/*` | `completeness` (badge+dots), `window-toggle` (today/7d/30d), `audit-chip` (version>1 = corrected). |
| `requests/*` | `my-requests` (own EXPENSE_ADD list), `request-bits` (status badge etc.). |
| `vehicle/damage-timeline.tsx` | Damage lifecycle timeline (raised→resolved→closed). |
| `ui/*` | shadcn-style primitives: button, card, checkbox (`@base-ui/react/checkbox`, used by the export section picker), field, input, label, native-select, separator, textarea. |

### 4.5 `lib/`

| File | What |
|---|---|
| `api-client.ts` | Browser→`/api/proxy` wrapper; throws `ApiClientError` (envelope). `api()`, `login()`, `logout()`, `me()`. |
| `server/backend.ts` | Server→NestJS client; `backendFetch`, auth primitives, **`getSession()` + 60s session memo**. |
| `server/cookies.ts` | httpOnly cookie names + options (access/refresh/device). |
| `server/require-session.ts` | `requireRole(role)` guard for layouts (redirects). |
| `server/locale.ts` | Server-side locale from `tb_locale` cookie. |
| `i18n/*` | `messages.hi.ts` (default) / `messages.en.ts` (shape-defining) / `locale-context.tsx` (`useMessages()`). |
| `business-date.ts` | Kolkata `todayKolkata()`, `addDays`, `formatBusinessDate`. |
| `money.ts` | Integer-paise → ₹ display formatting. |
| `roles.ts` / `nav.ts` | Role→URL-slug map + action→nav-item visibility gating. |
| `cascade.ts` | Client mirror of user-creation cascade (who can create whom). |
| `digest.ts` | Pure WhatsApp daily-digest text builder. |
| `export-excel.ts` | Pure ExcelJS workbook builders (one per export section) + `buildWorkbook`/`downloadWorkbook` (bold+frozen header, autofilter, ₹ numFmt, totals row). Replaced SheetJS (`xlsx`) — its free tier can't style. |
| `media-upload.ts` | Downscale → presign → PUT upload flow. |
| `utils.ts` | `cn()` (clsx+tailwind-merge). |

### 4.6 Root files

| File | What |
|---|---|
| `proxy.ts` | Next 16 middleware: protected-route gate + pre-render refresh-token rotation. |
| `app/layout.tsx` / `app/providers.tsx` | Root layout (locale cookie) / **QueryClient: staleTime 30s, retry 1, no refetchOnWindowFocus**. |
| `app/manifest.ts` | PWA manifest. |

---

## 5. Where to change what (quick routing)

| Task | Files |
|---|---|
| Add API endpoint | `shared/src/api.ts` (if new path) → backend module (copy `sites/`) → `app.module.ts`. |
| Add field to a record | `shared/` (schema+dto+domain, BUMP VERSION) → Neon migration → backend service map → web screen form. |
| Change RBAC | `shared/src/permissions.ts` (frozen — reuse actions) + `@RequireAction` + `common/scope.util.ts` + `web/lib/nav.ts`. |
| Add web screen | `components/screens/x-screen.tsx` → thin `app/<role>/x/page.tsx` → nav item in `lib/nav.ts` + labels in `i18n/messages.*`. |
| Loading/error UX | `components/entry/states.tsx` + per-screen skeletons + `app/providers.tsx` query defaults. |
| Auth/session/cookies | `web/src/proxy.ts`, `lib/server/{backend,cookies,require-session}.ts`, `app/api/auth/*`, `backend/src/auth/*`. |
| Per-site settings | `sm-settings-screen.tsx` ↔ `PATCH /sites/:id/config` (`sites.service.ts`) ↔ `common/org-config.util.ts`. |
| Add an export section | `web/lib/export-excel.ts` (new sheet builder) + `reports-screen.tsx` (checkbox + `enabled` query) + `backend/src/exports/export-sheets.ts` (mirror sheet, bilingual labels) — same section key string in both places. |

Full playbook: `docs/techBuilder-Developer-Guide.md` §10.
