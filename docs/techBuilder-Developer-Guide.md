# techBuilder — Developer & Maintenance Guide

> **Purpose:** the single index for *changing* techBuilder — how to add a feature, where the frontend vs backend vs DB changes go, how to see and organize the data, and how to onboard a merchant. Read this whenever the task is "add / change / extend something."
>
> **For Claude sessions:** when the user says *"add feature X to role Y"* or *"link this to that,"* start at §10 (the playbook). It routes you to the exact files. Combine with `CLAUDE.md` §6 (frozen conventions) and `.claude/rules/`.

---

## 0. The one rule that governs everything

**`shared/` (`@techbuilder/contracts`) is the single source of truth.** Every enum, type, DTO, the DB schema, the REST endpoint list, the RBAC matrix, and the org-config shape live there ONCE. The backend and the web app both *import* from it — they never redefine. So **almost every feature change starts by editing `shared/`, then flows outward** to backend and web. If you find yourself typing an enum value or a field name a second time in `backend/` or `web/`, stop — it belongs in `shared/`.

Editing `shared/src/**` = editing frozen contracts → bump `shared/package.json` version + re-typecheck all three workspaces (a hook reminds you). See `.claude/rules/contracts-frozen.md`.

---

## 1. System map — three layers, one data flow

```
   ┌─────────────────────────────────────────────────────────────────┐
   │  shared/  (@techbuilder/contracts)  — THE CONTRACT, imported by both │
   │  enums · dto · domain · api(ENDPOINTS) · permissions · config ·   │
   │  errors · db/schema.ts (Drizzle) · db/rls.sql                     │
   └───────────────▲───────────────────────────────▲──────────────────┘
                   │ imports                        │ imports
   ┌───────────────┴───────────────┐   ┌────────────┴──────────────────┐
   │  backend/  (NestJS + Drizzle)  │   │  web/  (Next.js 16 App Router) │
   │  16 resource modules, RLS,     │◄──┤  browser → Next Route Handlers │
   │  RBAC guard + per-service      │REST│  (/api/proxy) → backend        │
   │  scope, JWT auth               │   │  screens · nav · i18n          │
   └───────────────▲────────────────┘   └───────────────────────────────┘
                   │ SQL (RLS-scoped per request)
   ┌───────────────┴────────────────┐
   │  Neon Postgres  (30 tables, row-level security by org_id)          │
   └───────────────────────────────────────────────────────────────────┘
```

**Request lifecycle (a screen loads data):**
1. Web screen calls `api('GET', '/records/expense?...')` (`web/src/lib/api-client.ts`).
2. That hits the **Next.js proxy** `web/src/app/api/proxy/[...path]/route.ts`, which reads the httpOnly cookie, attaches `Authorization: Bearer <token>`, and forwards to the backend (`http://localhost:4000/api/v1/...`).
3. Backend **JwtAuthGuard** validates the token → **RbacGuard** checks `can(role, action)` → the **service** re-derives scope fresh from the DB (`loadScope`) and runs the query inside `runInTenant(orgId, …)` which sets `app.org_id` so **Postgres RLS** only returns that org's rows.
4. Response envelope `{ data }` (or `{ error }`) flows back; the proxy relays it; `api-client` unwraps `data` or throws `ApiClientError`.

---

## 2. Where everything lives (file-path index)

### shared/src/ — the contract
| File | What it holds | Edit when… |
|---|---|---|
| `enums.ts` | All `as const` enum arrays (roles, statuses, categories, skills, UOMs, approval types…) → TS unions + pgEnums derive from these | adding/changing any fixed set of values |
| `dto.ts` | Create/mutation input shapes (`CreateExpenseInput`, `MarkAttendanceInput`, …) | adding a new write, or a field to a write |
| `domain.ts` | Entity read models (`Expense`, `Attendance`, `OwnerDashboard`, `WageSummary`, …) | adding a new entity, or a field to a read |
| `api.ts` | `ENDPOINTS` registry (method + path per operation) + `API_BASE='/api/v1'` | adding a new endpoint |
| `permissions.ts` | `ACTIONS`, `PERMISSIONS` matrix (role→action→scope), `can()`, `scopeFor()` | changing who-can-do-what |
| `config.ts` | `OrgConfig` zod schema (brand, locale, feature flags, wage, vehicle types) | adding an org-level setting/feature flag |
| `errors.ts` | Error envelope + `ErrorCode` union | adding an error code |
| `db/schema.ts` | 30 Drizzle tables (the physical DB) | adding a table or column |
| `db/rls.sql` | Row-level-security policies (FORCE RLS, `app_current_org()`) | adding a new tenant table (needs its RLS policy) |
| `index.ts` | Barrel re-export — everything above is exported here | adding a new source file |

### backend/src/ — one module per resource (mirror the `sites/` pattern)
Each module folder = `<name>.controller.ts` (routes + RBAC), `<name>.service.ts` (logic + tenant tx + scope), `<name>.module.ts` (registered in `app.module.ts`).
- **Resource modules:** `auth, users, people, sites, vehicle-types, vehicles, attendance, leave, records, approvals, notifications, media, wage, dashboards, reconciliation, sync`.
- **`common/`** — the shared backend toolkit: `scope.util.ts` (RBAC scope: `loadScope`, `assertSiteInScope`, etc.), `backdate.util.ts` (date windows), `business-date.ts` (Kolkata/EOD), `org-config.util.ts`, `rbac.guard.ts`, `api-exception.ts`, `all-exceptions.filter.ts` (envelope), `transform.interceptor.ts` (`{data}` wrap), `zod-body.pipe.ts`, `current-user.decorator.ts`.
- **`db/db.service.ts`** — `runInTenant(orgId, fn)` (the RLS-scoping transaction) + `raw` escape hatch.
- **`auth/`** — login (`auth_lookup` SECURITY DEFINER), JWT, refresh rotation, `password.ts` (scrypt).
- **`seed.ts`**, **`scripts/seed-merchant.ts`**, **`scripts/apply-sql.ts`**, **`sql/auth.sql`**.

### web/src/ — Next.js App Router
| Path | What |
|---|---|
| `app/<role>/<feature>/page.tsx` | **Thin route wrapper** — renders a shared screen. Role area = `owner / site-manager / team-head / driver / worker`. |
| `app/<role>/layout.tsx` | Calls `requireRole(role)` (auth guard) + wraps in `RoleShell`. |
| `app/api/auth/{login,logout,refresh}/route.ts` | httpOnly-cookie auth handlers. |
| `app/api/proxy/[...path]/route.ts` | Authenticated gateway to the backend (token attach + refresh-retry). |
| `components/screens/<feature>-screen.tsx` | **The real screens** — one shared component per feature, reused across roles. |
| `components/{entry,owner,dashboard,requests,ui}/` | Reusable pieces (states, cards, primitives). |
| `lib/api-client.ts` | `api()` — the only backend access from the browser. |
| `lib/nav.ts` | Action→nav-item map; nav renders per `can(role,action)`. **Add a nav entry here.** |
| `lib/roles.ts` | `ROLE_SLUG`, `ROLE_LABEL`, `roleHome()`. |
| `lib/i18n/messages.en.ts` + `messages.hi.ts` | The two locale catalogs (hi typed against en — missing key = compile error). **Add strings here.** |
| `lib/{money,business-date,cascade,digest,export-excel,media-upload}.ts` | Shared helpers (paise↔₹, Kolkata dates, create-cascade, WhatsApp digest, SheetJS, photo upload). |
| `lib/server/{require-session,backend,cookies,locale}.ts` | Server-side helpers. |
| `proxy.ts` | Next 16 middleware (route gating). |

---

## 3. How to SEE and query the data (Neon)

The database is **Neon Postgres** (serverless). Connection strings live in **`backend/.env`** (gitignored):
- `DATABASE_URL` — the **app role** (`techbuilder_app`, NOBYPASSRLS). Used at runtime; **RLS-enforced** — queries only see rows for the org set by `app.org_id`.
- `DATABASE_URL_ADMIN` — the **owner role** (`neondb_owner`, BYPASSRLS). Used for migrations/seed/admin. **Use this to browse ALL orgs' data.**

**Three ways to look at the data:**

1. **Neon web console (easiest for eyeballing):** log in at neon.tech → your project → **SQL Editor**. Run `select * from sites;`, `select username, role from users;`, etc. This connects as the owner (bypasses RLS) so you see everything across all orgs. Also has a **Tables** browser and monitoring. *This is your "see my whole data" answer.*

2. **Drizzle Studio (a local GUI over the schema):** from `backend/`, run `npx drizzle-kit studio` → opens a browser table explorer wired to your schema. Good for structured browsing/editing during dev.

3. **psql / any SQL client:** paste `DATABASE_URL_ADMIN` as the connection string. ⚠️ If you use the **app** URL instead, RLS hides tenant rows unless you first run `select set_config('app.org_id', '<org-uuid>', false);` in the session — this is the #1 "why is my query empty?" gotcha.

**Organizing/interpreting the data:** every business table has `org_id` (tenant), `created_at/updated_at`, `created_by/updated_by` (who), `deleted_at` (soft-delete — filter `where deleted_at is null` for live rows), and `version` (>1 = corrected/edited). Money columns are **integer paise** (÷100 for ₹). Dates use `business_date` (a `YYYY-MM-DD` local Kolkata date) distinct from `created_at` (UTC timestamp). To find "org id for merchant X": `select id, code, name from orgs;`.

---

## 4. RECIPE — add a whole new feature / record type (end-to-end)

Example: "track **water tanker deliveries** per site." Order matters — **contracts first, then backend, then web.**

**A. `shared/` (the contract):**
1. `enums.ts` — add any new fixed sets (e.g. a status enum) if needed.
2. `db/schema.ts` — add the `waterDeliveries` pgTable (copy an existing table's shape: `...base()` gives id/org/audit/version/soft-delete; add `siteId`, `businessDate`, your columns). Add it to `TENANT_TABLES`.
3. `db/rls.sql` — add the RLS policy block for the new table (copy an existing `DROP POLICY … CREATE POLICY … tenant_isolation` block).
4. `domain.ts` — add the `WaterDelivery` read type. `dto.ts` — add `CreateWaterDeliveryInput`.
5. `api.ts` — add endpoints to `ENDPOINTS` (e.g. `waterCreate: {method:'POST', path:'/records/water'}`, `waterList: …`).
6. `permissions.ts` — usually **reuse** an existing action (`record.enter`) unless it needs a brand-new permission (adding to `ACTIONS` touches the matrix for every role).
7. Bump `shared/package.json` version; `cd shared && npm run build && npm run typecheck`.

**B. Database migration:**
```
cd backend
npm run db:generate     # drizzle-kit reads schema.ts → creates a migration SQL
npm run db:migrate      # applies it (uses DATABASE_URL_ADMIN)
npm run db:rls          # re-applies rls.sql + auth.sql (drizzle doesn't emit FORCE/policy DDL)
```

**C. `backend/` (the API):** either extend `records/` (if it's a record type) or scaffold a new module copying `sites/` exactly (see `.claude/rules/backend-modules.md` + the `new-backend-module` skill). In the service: `runInTenant`, client-UUID idempotent insert, `assertSiteInScope`/scope checks, `assertBackdateWindow` if it's dated, `mapXxx()` row→domain. Register the module in `app.module.ts`. `npm run typecheck`. Add a test to `test/scope.integration.spec.ts` and `npm test`.

**D. `web/` (the screen):**
1. `lib/nav.ts` — add a nav entry (action → label → path) so it appears for permitted roles.
2. `lib/i18n/messages.en.ts` **and** `messages.hi.ts` — add all strings (both, or it won't compile).
3. `components/screens/water-screen.tsx` — the screen (copy `records-screen.tsx` / `fuel-screen.tsx` pattern: TanStack Query, `api()`, `states.tsx`, mobile-first).
4. `app/<role>/water/page.tsx` — thin wrapper per role that should have it.
5. `cd web && npm run typecheck && npm run lint && npm run build`.

**E. Verify:** start backend + web, log in per role, exercise it; confirm the row lands in Neon and shows up scoped correctly.

---

## 5. RECIPE — add a FIELD to existing data
1. `shared/db/schema.ts` — add the column. `shared/domain.ts` (+`dto.ts` if writable) — add the field. Bump shared version, build.
2. `cd backend && npm run db:generate && npm run db:migrate`.
3. `backend/` — set it on insert / include in the `mapXxx()`.
4. `web/` — surface it in the screen (+ i18n strings if labeled).

## 6. RECIPE — change what a role can do (RBAC)
- **Whole action** (e.g. let Team Heads export reports): edit `PERMISSIONS` in `shared/src/permissions.ts` (give `TEAM_HEAD` the `report.export` scope). Bump shared. The web nav updates automatically (it reads `can()`); the backend guard + service scope enforce it. Update the RBAC matrix snapshot test if one exists. **The `/dev/rbac-matrix` page shows the live matrix** — check it after.
- **Scope of an action** (e.g. narrow/ widen OWN_SITE vs ORG): change the scope value in `PERMISSIONS` AND the enforcement in the relevant `*.service.ts` (`scope.util.ts` helpers). Add an integration test.

## 7. RECIPE — add a new SCREEN to an existing role (no new data)
1. `lib/nav.ts` — nav entry (if it should be in the menu). 2. `components/screens/<x>-screen.tsx`. 3. `app/<role>/<x>/page.tsx` wrapper. 4. i18n strings in both catalogs. 5. typecheck/lint/build. (This is the "small reuse wrapper" pattern — e.g. `/site-manager/reports` reusing the owner reports screen.)

## 8. RECIPE — onboard a new merchant / seed DB data
Dev-side CSV seed (no in-app typing). Copy the template, fill the CSVs with the customer's real data, run one command:
```
cd backend
cp -r merchants/_template merchants/<code>
#   edit merchants/<code>/org.json + the 6 CSVs
#   (sites, vehicle-types, people, crews, users, vehicles — see merchants/_template/README.md for columns + linking rules)
npm run seed:merchant -- merchants/<code>
```
It creates the org + all users (temp passwords, forced change) + linked sites/crews/vehicles/wage-rates. Aborts if the org code already exists. `backend/merchants/dev/` is the current test org "DevCo Builders" (code `devco`, all passwords `changeme123`).

## 9. RECIPE — add a user / understand the cascade
Users are created **in-app** by the role above them (Owner→SM→TH→Driver/Worker) via the **People** screen, or **in bulk** via the seed (§8). The cascade is enforced in `backend/src/users/users.service.ts` (`CAN_CREATE`) and mirrored in `web/src/lib/cascade.ts`. A **Person** (labour master, for attendance/wages) can exist without a login; link a login to a person via `personId`.

---

## 10. PLAYBOOK — "add feature X to role Y" (Claude's decision tree)

When the user asks for a change, classify it and jump to the recipe:

| The ask is… | It touches… | Recipe |
|---|---|---|
| A brand-new kind of record/data | shared (schema+dto+domain+api) → DB migration → backend module → web screen | §4 (+ §3 to verify data) |
| A new field on existing data | shared (schema+domain/dto) → migration → backend map → web | §5 |
| "let role Y also do Z" / permission change | `shared/permissions.ts` (+ service scope, matrix test) | §6 |
| A new screen for existing data | web only (nav + screen + wrapper + i18n) | §7 |
| A new org setting / feature flag | `shared/config.ts` (`OrgConfig`) → web reads it; **note: no config-update endpoint yet (§11)** | §11 gap |
| Onboard a customer / load data | CSV seed | §8 |
| A new user or role assignment | in-app People screen or seed | §9 |

**Always:** (1) start in `shared/` if data/contract/permission is involved; (2) money = integer paise, dates = Kolkata business-date, ids = client UUIDv7; (3) every user-facing web string goes in **both** `messages.en.ts` and `messages.hi.ts`; (4) never redefine a contract type outside `shared/`; (5) after changes: `typecheck` all workspaces, `npm test` (backend), `npm run build` (web), and exercise it live; (6) confirm the data in Neon (§3).

---

## 11. Known gaps (decide before relying on them)
- **No crews API** — crews are only created by the seed (§8). In-app crew create/list/membership isn't possible yet; a Team Head created in-app has no crew until one is seeded. To add: a `crews` module (list/create + crew_members management) copying the `sites/` pattern, + endpoints in `api.ts`, + a web screen.
- **No org-config update endpoint** — the Settings screen (`/owner/settings`) is **read-only**. To make it editable: add a `config.manage`-gated `PATCH /orgs/current` that merges a partial `OrgConfig` and re-validates via `parseOrgConfig`, then a form on the settings screen.
- **Media/photos** — `POST /media/presign` returns a stub locally (no R2 configured); real photo upload needs Cloudflare R2 keys in `backend/.env` (`R2_*`) + a real presigned-PUT. Web already degrades gracefully (saves record without photo).
- **Monitoring (Sentry)** — deferred by choice.

---

## 12. Run / test / verify (local)
```
# backend (terminal 1) — links to Neon via backend/.env
cd techBuilder && npm run build --workspace=shared && npm run build --workspace=backend
cd backend && npm start                      # → http://localhost:4000/api/v1  (health: /api/v1/health)

# web (terminal 2)
cd techBuilder/web && npm run dev            # → http://localhost:3000  (dev-login panel on /login)

# checks
(cd backend && npm test && npm run test:integration)   # 31 unit + integration vs live Neon
(cd web && npm run typecheck && npm run lint && npm run build)
```
Full local-run detail: `docs/techBuilder-Web-Local-Dev-Startup.md`. Frozen conventions: `CLAUDE.md` §6 + `.claude/rules/`. What each doc holds: `CLAUDE.md` §3 doc map.
