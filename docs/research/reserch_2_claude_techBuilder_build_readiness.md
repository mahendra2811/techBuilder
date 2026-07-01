# techBuilder — Build-Readiness Specification

**Purpose:** the direct input to writing the one-shot "mega-prompt." Every section below is prescriptive: where a decision is open, a **recommended default** is given so you can confirm in one pass. Round-1 must-adds are integrated, not re-argued.

**One headline recommendation up front (see §5):** do **not** literally write one prompt that builds the whole stack. Write a **frozen "Contracts Pack" (Prompt 0)** — shared enums, types, config schema, DB schema, API contract, adapter interfaces — then **three ordered build prompts** (backend, frontend-engine, frontend-screens) that each *reference the frozen contracts verbatim*. A single literal mega-prompt is a known failure mode (truncation, enum drift, stubbing). This document is structured so Prompt 0 falls out of it directly.

---

## 1. Final Phase-1 Feature List

Legend: **M** = must-have (Phase 1), **N** = nice-to-have (Phase 1 if cheap, else fast-follow).

### 1.1 Auth & Onboarding
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Manual JWT login (username/phone + password) | M | Valid creds return access+refresh token; invalid returns uniform 401 error envelope. |
| First-login forced password change | M | A user with `must_change_password=true` cannot reach any screen until password is changed. |
| Agency org-provisioning (admin/seed path, not in-app) | M | A script/endpoint creates an org + Owner user + default config + seed masters in one transaction. |
| Logout (single device) | M | Refresh token for that device is revoked; local encrypted token store cleared. |
| Multi-device login | M | Same user can be logged in on ≥2 devices; each has an independent refresh token row. |
| Forgot-password (admin-reset only this phase) | N | Owner/agency can reset a downstream user's password; no self-serve email/OTP. |

### 1.2 Org, People & RBAC
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Cascade user creation (Owner→Site Manager→Team Head, scoped) | M | A creator can only create roles below them and only assign scopes they own. |
| **Person/labour master** (distinct from login users — see §3 note) | M | Attendance can be marked for a person who has **no** app account. |
| Optional link person↔user account | M | A person may be promoted to a view-only Worker login without duplicating the record. |
| Crew/gang grouping under a Team Head at a site | M | A Team Head sees only crews assigned to them; attendance is markable per crew. |
| Edit/deactivate users & people (soft) | M | Deactivating hides from pickers but preserves historical records. |
| Server + client permission enforcement (`can()`) | M | Any action denied client-side is also rejected server-side (defense-in-depth test passes). |

### 1.3 Sites
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Owner creates/edits sites | M | Site has name, code, location (optional geo), status, working-day calendar. |
| Site status (active / paused / closed) | M | Completeness & analytics ignore paused/closed sites for "missing data" flags. |
| Site working-day calendar (weekly off + holidays) | M | A site's day-off is excluded from "is today complete?" and from wage default. |
| Assign Site Manager(s) + crews to a site | M | A Site Manager sees only their site(s); cross-site read is denied. |

### 1.4 Vehicles & Vehicle Types
| Feature | M/N | Acceptance criterion |
|---|---|---|
| **Type-driven vehicle config** (tracking mode KM/HOURS + dynamic fields) | M | A "JCB" logs hours; a "Truck" logs KM — driven by config, zero code change to add a type. |
| Vehicle master (reg no, type, site assignment, status) | M | Vehicle belongs to one org; optionally assigned to a site/driver. |
| Driver↔allowed-vehicle-type restriction | M | A driver cannot select a vehicle of a type not in their allowed list. |
| Driver-of-the-day assignment | M | Each vehicle log records which person drove it that day. |
| Odometer/hour-meter continuity validation | M | End reading ≥ start reading; start should equal (or warn vs) prior log's end. |
| Document-expiry fields + alert (insurance/fitness/PUC) | N | Owner sees a list of vehicles with docs expiring in ≤30 days. |

### 1.5 Attendance & Leave
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Per-person daily status (present/absent/half-day) | M | Marked only by Team Head/Site Manager; one status per person per day (unique). |
| Overtime hours capture (optional per present record) | M | OT hours feed the wage summary; defaults to 0. |
| Multi-day leave ranges (typed) | M | A leave range auto-marks affected days; overlapping ranges are rejected. |
| Bulk "mark whole crew present" | M | Team Head can mark a crew present in one tap, then adjust exceptions. |
| **No** clock-in/out, **no** GPS punch | M (skip) | Confirmed absent; attendance is a manual roster action only. |

### 1.6 Wage / Cost Summary *(round-1 must-add #1 — read-only calc, NOT a payment rail)*
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Per-person wage rate (daily, with optional skill default) | M | Rate × attendance factor (1 / 0.5 / 0) + OT produces a per-person payable figure. |
| Crew/site/period wage-payable rollup | M | Owner sees ₹ payable per crew, per site, for a 7/30-day window. |
| Advance/peshgi tracking + balance | M | Advances reduce net payable; running advance balance per person/crew is visible. |
| Excel export of wage summary | M | Export columns match the on-screen summary; numbers reconcile to attendance. |
| **No** disbursement/payment | M (skip) | Summary only; no money moves through the app. |

### 1.7 Records (end-of-day entry)
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Progress note + photos (geotagged, watermarked) | M | A note saves offline with ≥0 photos; photos upload as R2 references on sync. |
| Headcount (auto-derived from attendance + manual override) | M | Defaults to present count; override is flagged in audit. |
| Expense entry (category, ₹, vendor?, bill no?, receipt photo) | M | Saved with category enum; receipt optional; amount stored as integer paise. |
| Fuel log (₹ + litres + odo/hour reading + receipt) | M | Saves linked to a vehicle; feeds fuel reconciliation. |
| Vehicle start/end log (readings per tracking mode) | M | One log per vehicle per day; continuity validated. |
| Trip log (from→to, purpose, material?, count) | M | A trip optionally links to a material movement. |
| Material usage (consumed at site) | M | Decrements site material balance. |
| **Material movement (site→site transfer)** with dispatch + receive | M | Two-sided: dispatch creates pending; receive confirms; mismatch is flagged. |
| Issue / breakdown log (severity, vehicle/site link, photos) | M | Saves with severity enum; open issues surface on dashboard. |
| **Voice note** attached to progress/issue *(round-1 #7)* | M | A ≤60s audio note saves offline, uploads as R2 reference, plays back inline. |
| Same-day correction window on records | M | Creator can edit their own record until end of business day +1; edits audited. |

### 1.8 Reconciliation *(round-1 must-add #5)*
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Material running balance per site (opening + in − consumed − transferred) | M | Balance never silently goes negative without a warning flag. |
| Material reconciliation view (received vs consumed vs moved) | M | Owner sees per-material variance for a window. |
| Fuel reconciliation (expected vs actual) | M | Expected = distance/hours × configurable norm per vehicle type; variance flagged. |
| Unit-of-measure master per material (bag/kg/cft/nos/MT) | M | Movements/usage carry a UOM consistent with the material's master UOM. |

### 1.9 Approvals
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Request→approval workflow (vehicle-switch, leave, material) | M | A typed request has states pending/approved/rejected; approver scoped correctly. |
| Approval audit trail | M | Each transition records who/when/action/comment. |
| Notification on request + decision | M | Requester and approver get a push on state change (see §1.12). |

### 1.10 Roll-up Dashboards & Analytics
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Owner cross-site/cross-vehicle dashboard | M | One screen rolls up all active sites/vehicles for a selected window. |
| Site Manager single-site dashboard | M | Shows only their site's rolled-up records. |
| **"Is today complete?" indicator** per site/vehicle *(round-1 #2)* | M | Shows complete / partial / missing per active site per working-day, defined by §3. |
| **Per-entity cost roll-ups** (site/vehicle/crew/material) *(round-1 #4)* | M | Owner sees ₹ totals broken down by each entity for a window. |
| Open issues / pending approvals / expiring docs widgets | N | Counts link to filtered lists. |

### 1.11 Reports / Export / Backup
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Excel export (primary), client-side via SheetJS | M | Each report exports to .xlsx with stable column order on a ₹10K device. |
| PDF export (occasional), client-side via expo-print | N | Daily/weekly summary renders to a shareable PDF. |
| **WhatsApp one-tap share** of summary/PDF *(round-1 #6)* | M | Share sheet opens with the file/summary pre-attached. |
| Windowed 7/30-day export/import | M | Export bounded by date window; import validates schema before applying. |
| Local backup + restore | N | A device backup can be exported and restored on reinstall without data loss. |

### 1.12 Capture (camera / scanner / GPS)
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Camera with watermark (date/time/site/geo) + compression | M | Photos are stamped and compressed to target size before queueing. |
| QR/barcode scanner (material/vehicle/person lookup) | M | A scan resolves to an entity or a clear "not found" state. |
| GPS geotag on records/photos (NOT attendance) | M | Geo attaches when available; absence of GPS never blocks saving. |

### 1.13 Notifications
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Push via Expo Notifications + FCM | M | Token registered per device; revoked on logout. |
| Approval + assignment notifications | M | Delivered on relevant state changes. |
| Owner daily digest | N | One summary push per day per org (no realtime). |

### 1.14 Low-Literacy / Kiosk UX *(round-1 must-add #3, #7 — first-class)*
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Icon + text label on every primary action | M | No action is icon-only; labels localized. |
| Numeric/tap input over typing wherever possible | M | Counts, statuses, amounts use steppers/pickers, not free text. |
| Color-coded status (present/absent, complete/missing, ok/variance) | M | Status is conveyed by color **and** label/icon (not color alone). |
| Hindi-first with in-app language toggle | M | App launches in Hindi; toggle persists per device/user. |
| **Kiosk / shared-device mode** for attendance | M | A device-bound org session lets a Team Head mark a roster without per-worker login. |

### 1.15 Offline / Sync *(round-1 must-add #8 — hardened)*
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Offline-first writes (local SQLite → outbox → sync) | M | Every write succeeds offline and appears immediately in local UI. |
| Client-generated UUIDv7 PKs | M | No server round-trip needed to create an ID; no collisions on merge. |
| Idempotent sync (idempotency key per event) | M | Replaying an outbox event never creates a duplicate row. |
| Backoff + attempt cap per event | M | A poison event is parked after N attempts without blocking the queue. |
| Last-write-wins conflict rule | M | Concurrent edits resolve deterministically by server-assigned version/timestamp. |
| Sync status surfaced to user | M | User sees pending/synced/failed counts and can retry failed. |

### 1.16 Shared Screens / Cross-cutting
| Feature | M/N | Acceptance criterion |
|---|---|---|
| Empty / loading / error / offline states for every list & form | M | No screen shows a blank white view; each has a defined state. |
| Global error UX (uniform, localized, actionable) | M | Server error envelope maps to a user-friendly localized message. |
| Audit log (who/when/action on mutations) | M | Every create/update/void writes an audit row. |
| Soft-delete / void (no hard delete of records) | M | Voided records are excluded from rollups but retained + auditable. |

### 1.17 Newly-found gaps (added by this analysis — not in plan or round-1)
1. **Person/labour master separate from login users** — attendance must work for phone-less workers (resolves the "Worker = view-only user" vs "most workers lack phones" contradiction). *Add now.*
2. **Advance/peshgi tracking** — Indian construction runs on cash advances to mistris/site managers; without it the cost picture is wrong. *Add now (folded into §1.6).*
3. **Vendor master (light) + bill-number capture on expenses** — needed for owner audit/reconciliation credibility. *Add now (light).*
4. **Unit-of-measure master + opening material balance** — material reconciliation is meaningless without these. *Add now.*
5. **Two-sided material transfer (dispatch + receive confirmation)** — single-sided movement silently loses stock. *Add now.*
6. **Site working-day calendar / site status** — without it, "is today complete?" cries wolf on Sundays and paused sites. *Add now.*
7. **Same-day correction window + audit** — end-of-day entry guarantees typos; needs a bounded, audited edit path. *Add now.*
8. **Odometer/hour-meter continuity validation** — cheap, high-trust check on vehicle logs. *Add now.*
9. **Overtime hours on attendance** — needed for an honest wage summary. *Add now (small).*

---

## 2. Pre-Build Planning Checklist (the 14 layers)

> Format: **Decision needed → recommended default.** Confirm or override each.

### Layer 1 — Product / UX
- **Screen inventory per role → adopt the list below.**
  - *Owner:* Login → Org Home (cross-site dashboard) → Sites list/detail → Vehicles list/detail → People/Crews → Wage & Cost summary → Reconciliation → Reports/Export → Approvals → Settings/Config/Language.
  - *Site Manager:* Login → Site dashboard (single) → Attendance → Records hub (expense/fuel/trip/material/issue/progress) → Approvals (own scope) → Reports (own site) → Settings.
  - *Team Head/Mistri:* Login → Crew attendance → End-of-day records hub → Requests (leave/material/vehicle) → Sync status.
  - *Driver:* Login → My vehicle(s) → Vehicle log (start/end) → Fuel → Trips → Issue/breakdown → Requests.
  - *Worker (view-only):* Login → My attendance/leave view → My crew's site progress (read-only).
  - *Kiosk:* Org-PIN unlock → person picker → roster marking → done.
- **Navigation → bottom-tab per role + stack within tab** (Expo Router file-based, role-gated route groups). Default ≤4 tabs per role.
- **End-of-day entry flow (<2 min) → a single "Today" hub** with large tappable cards (Attendance, Expense, Fuel, Material, Issue, Progress). Each card opens a one-screen form with steppers/pickers, optional photo/voice, and a single Save that queues offline. Pre-fill site/date/crew from context.
- **Empty/loading/error/offline states → mandatory for every list and form** (skeleton loaders; "no records yet — add the first"; localized error with retry; offline banner). Pin as a reusable `<ScreenState>` component.
- **Kiosk mode → device-bound org session** (long-lived restricted token, attendance-only scope, no settings/export access).
- **Voice-note flow → record (≤60s) → local file → queue → R2 reference;** inline playback from local-or-remote.
- **Language switching → top-level toggle**, default Hindi, persisted; affects all UI strings via i18next.

### Layer 2 — Data Model
**Conventions (defaults):** PK = `id uuid` (UUIDv7, client-generated); every table has `org_id uuid` (FK + RLS), `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` (soft-delete), `version int` (for LWW). Money = `bigint` paise. Timestamps = `timestamptz` (UTC). "Business day" = `date` in Asia/Kolkata.

**Entities + key fields (enum values in §4):**
- **org**(id, name, code unique, config jsonb, status)
- **user**(id, org_id, person_id?, username unique-per-org, phone?, password_hash, role enum, must_change_password bool, status)
- **person**(id, org_id, name, skill enum?, default_wage_paise bigint?, status) — *attendance subject; may have no user*
- **crew**(id, org_id, site_id, team_head_user_id, name)
- **crew_member**(crew_id, person_id) [unique pair]
- **site**(id, org_id, name, code, geo?, status enum, weekly_off int[]?, created…)
- **site_holiday**(id, org_id, site_id, date, label)
- **vehicle_type**(id, org_id, name, tracking_mode enum {KM,HOURS}, fields_schema jsonb)
- **vehicle**(id, org_id, vehicle_type_id, reg_no, site_id?, status, doc_expiry jsonb?)
- **driver_allowed_type**(user_id, vehicle_type_id)
- **attendance**(id, org_id, site_id, person_id, business_date, status enum, ot_hours numeric default 0, marked_by) [unique (org_id, person_id, business_date)]
- **leave**(id, org_id, person_id, start_date, end_date, type enum, reason?) [no overlap per person]
- **wage_rate**(id, org_id, person_id, daily_paise bigint, effective_from) — *or skill-level default on person*
- **advance**(id, org_id, person_id?, crew_id?, amount_paise, business_date, note)
- **expense**(id, org_id, site_id, category enum, amount_paise, vendor_id?, bill_no?, receipt_media_id?, business_date, entered_by)
- **vendor**(id, org_id, name, phone?)
- **fuel_log**(id, org_id, vehicle_id, amount_paise, litres numeric, reading numeric, receipt_media_id?, business_date)
- **vehicle_log**(id, org_id, vehicle_id, driver_person_id, start_reading numeric, end_reading numeric, business_date) [unique (vehicle_id, business_date)]
- **trip**(id, org_id, vehicle_id, from_text, to_text, purpose, material_txn_id?, business_date)
- **material**(id, org_id, name, uom enum)
- **material_balance**(id, org_id, site_id, material_id, opening numeric, business_date) — *or derived view*
- **material_txn**(id, org_id, type enum {IN,CONSUME,DISPATCH,RECEIVE}, material_id, qty numeric, site_id, counterpart_site_id?, related_txn_id?, status enum, business_date)
- **issue**(id, org_id, site_id?, vehicle_id?, severity enum, description, status enum, business_date)
- **progress_note**(id, org_id, site_id, text, business_date, entered_by)
- **media**(id, org_id, kind enum {PHOTO,RECEIPT,VOICE}, r2_key, thumb_key?, parent_type, parent_id, geo?, taken_at)
- **approval_request**(id, org_id, type enum, payload jsonb, status enum, requested_by, approver_user_id, decided_at?, comment?)
- **notification**(id, org_id, user_id, type, payload jsonb, read_at?)
- **audit_log**(id, org_id, actor_user_id, action, entity_type, entity_id, before jsonb?, after jsonb?, at)
- **refresh_token**(id, org_id, user_id, device_id, token_hash, expires_at, revoked_at?)
- **completeness**(id, org_id, scope_type enum {SITE,VEHICLE}, scope_id, business_date, state enum {COMPLETE,PARTIAL,MISSING}, computed_at) — *derived; see §3*
- **outbox** *(client-only SQLite, not in Postgres)* — see Layer 7.

**Flagged-missing-in-original-plan (now added):** wage_rate/advance, fuel & material reconciliation baselines (norm per vehicle_type, opening balance), completeness table, voice/media `kind`, vendor + bill_no, person-vs-user split, site calendar, version column for LWW.

### Layer 3 — API Contract
- **Conventions →** REST under `/api/v1`; JSON; **uniform error envelope** `{ error: { code, message, fields?, traceId } }`; success `{ data, meta? }`. Cursor pagination `?limit=&cursor=`; filtering by explicit query params; all list endpoints filter by scope server-side.
- **Adapter interfaces (single source of truth) →** define `AuthClient` and `RecordsClient` (+ optional `MediaClient`, `SyncClient`) as TS interfaces in a **shared package**. Screens import only these interfaces. Two implementations: `MockClient` (in-memory/seeded) and `RestClient`.
  - `AuthClient`: `login`, `refresh`, `logout`, `changePassword`, `me`.
  - `RecordsClient`: per entity `list(filter)`, `get(id)`, `create(dto)`, `update(id,dto)`, `void(id)`; plus `markAttendance(bulk)`, `submitRequest`, `decideRequest`, `getDashboard(window)`, `getCompleteness(window)`, `getWageSummary(window)`, `getReconciliation(window)`.
  - `SyncClient`: `pushBatch(events)`, `pull(since)`.
- **Mock↔Rest mapping →** identical method signatures and identical DTO/return types (from shared types). Mock seeds from the same seed dataset used for demo (Layer 4) so dashboards look real offline.

### Layer 4 — Database
- **Schema source → Drizzle schema in the shared package** (single definition; backend imports it). Enable RLS per table (`.enableRLS()` / policies).
- **Migrations → drizzle-kit generate + a manual RLS migration step.** Note: drizzle-kit does **not** auto-generate RLS policy DDL — write policies in schema and/or a custom SQL migration, and run an `ALTER TABLE … ENABLE RLS` sweep post-migrate.
- **RLS policy (default for every tenant table) →** `USING (org_id = current_setting('app.org_id')::uuid) WITH CHECK (same)`. **Do not** copy Neon's `auth.user_id()` / Data-API pattern — techBuilder's NestJS server sets the tenant context, not Neon Auth.
- **Indexes (defaults) →** every FK; `(org_id, business_date)` on all record tables; unique `(org_id, person_id, business_date)` on attendance; unique `(vehicle_id, business_date)` on vehicle_log; `(org_id, site_id, material_id)` on balances.
- **Seed/demo data → one seed script** producing: 1 org, 1 Owner + 1 Site Manager + 2 Team Heads + 1 Driver + ~15 people, 2 sites, 3 vehicle types (Truck-KM, JCB-Hours, Generic), 4 vehicles, ~10 days of back-dated records so the Owner dashboard is populated on first open.

### Layer 5 — Auth & Session
- **Login → username/phone + password**, bcrypt/argon2 hash. **Default: argon2id.**
- **JWT contents → `{ sub, orgId, role, deviceId, scopeIds?, iat, exp }`.** Access TTL **15 min**; refresh TTL **30 days**, rotating, stored hashed in `refresh_token`.
- **First-login → `must_change_password` gate** as in §1.1.
- **Role/scope resolution → from JWT + a server-side scope lookup** (don't trust client scope claims for authorization; claims are a hint, server re-checks).
- **Logout → revoke that device's refresh token;** clear Expo SecureStore.
- **Multi-device → allowed;** one refresh row per device; LWW handles concurrent edits.

### Layer 6 — RBAC
- **Permission matrix → action × role × scope, defined in a shared `permissions.ts`** consumed by both `can()` (client, for UI gating) and a Nest guard (server, authoritative). Default matrix:

| Action \ Role | Owner | Site Mgr | Team Head | Driver | Worker |
|---|---|---|---|---|---|
| View all sites/vehicles | yes | own site | own crew | own vehicle | own data |
| Create users | SM + below | Team Head | — | — | — |
| Create sites/vehicles/types | yes | — | — | — | — |
| Mark attendance | yes (any) | own site | own crew | — | — |
| Enter records (expense/material/progress) | — | own site | own crew | — | — |
| Vehicle/fuel/trip logs | — | own site veh. | — | own vehicle | — |
| Submit request | — | yes | yes | yes | — |
| Decide request | yes | own scope | — | — | — |
| Reports/export | yes | own site | — | — | — |
| Config/settings | yes | — | — | — | — |

- **Enforcement → server is authoritative;** every mutation passes a `@Roles()/@Scope()` guard that re-derives scope from DB. Client `can()` only hides/disables UI.

### Layer 7 — Offline / Sync
- **Outbox schema (SQLite) →** `outbox(id uuidv7, idempotency_key uuid, entity_type, op enum {CREATE,UPDATE,VOID}, payload json, status enum {PENDING,IN_FLIGHT,SYNCED,FAILED}, attempts int, next_attempt_at, last_error?, created_at)`.
- **State machine →** PENDING → IN_FLIGHT → (SYNCED | FAILED→PENDING with backoff). Backoff exponential, cap **8 attempts**, then park as FAILED (user-retryable).
- **Idempotency → server dedupes on `idempotency_key`** (unique); replay returns the original result.
- **Conflict → LWW by `version`/server `updated_at`;** server is tiebreaker. (Each record is single-author by role, so true conflicts are rare — LWW is sufficient.)
- **Completeness computation → server-side on read** (cheap query), surfaced via `getCompleteness(window)`. **Definition (default):** for each **active** site on a **working day**, COMPLETE = attendance marked for the assigned crew **and** at least a progress note OR explicit "nothing to report"; PARTIAL = some but not all; MISSING = none. Vehicles: COMPLETE if a vehicle_log exists for an in-use vehicle.
- **Syncs vs local-only →** all records/masters sync; **local-only:** outbox, UI prefs, draft-in-progress forms, cached thumbnails.

### Layer 8 — Media / Files
- **R2 layout → `r2://{bucket}/{orgId}/{entityType}/{entityId}/{mediaId}.{ext}`** (+ `…/thumb/…`). Never store media in SQLite; store `media` rows with `r2_key`.
- **Upload flow → presigned PUT from backend;** client uploads directly to R2 after the record syncs, then patches `media.r2_key`. Photos queue offline and upload opportunistically.
- **Watermark spec → bottom strip:** date-time (Asia/Kolkata), site name, lat/long if present, org name. Burned into the image client-side.
- **Compression → target ≤300 KB / long edge ≤1600 px, JPEG q≈0.7;** voice ≤60s AAC/m4a.
- **Thumbnails → generate ~200px client-side** for list views.
- **Scanner data → QR/barcode resolves to `{type,id}`;** unknown codes show "not recognized," never crash.

### Layer 9 — i18n
- **Catalog → i18next JSON namespaces** (`common`, `auth`, `attendance`, `records`, `errors`, …); **keys are dot-paths**, no hardcoded UI strings anywhere (lint rule).
- **Coverage → Hindi + English complete for Phase 1;** missing key falls back to English + logs a warning.
- **Formatting → Indian locale:** ₹ with lakh/crore grouping, dates `dd MMM yyyy`, Asia/Kolkata. Use a single `format.ts` util.
- **Voice notes → not translated;** stored as audio, labelled by entity + timestamp.

### Layer 10 — Reports / Export / Backup
- **Reports (Phase 1) →** (a) Daily site summary, (b) Wage/cost summary (window), (c) Vehicle/fuel summary, (d) Material reconciliation, (e) Expense ledger. **Columns:** mostly numeric/English headers; Hindi only in free-text remark columns.
- **Excel → SheetJS, client-side,** one sheet per report, stable column order, totals row.
- **PDF → expo-print** for the daily/weekly summary only (N).
- **Windowed export/import → 7/30-day bounded;** import validates against shared zod schema before applying; reject + report on mismatch.
- **Backup → JSON dump of local DB + manifest;** restore validates schema/version before load.

### Layer 11 — Config / Merchant Schema
- **Shape (`org.config`, validated by zod) →**
```ts
{
  brand: { name, logoAsset, primaryColor, secondaryColor },
  locale: { default: 'hi'|'en', enabled: ['hi','en'] },
  roles: { enabled: Role[] },           // subset of the 5
  records: { enabled: RecordType[] },   // toggle expense/fuel/trip/material/issue/progress
  features: {                            // feature flags
    voiceNotes, kioskMode, fuelReconciliation, materialReconciliation,
    wageSummary, whatsappShare, pdfExport, docExpiryAlerts
  },
  vehicleTypes: VehicleTypeConfig[],     // name, trackingMode, fieldsSchema
  wage: { model: 'daily', otMultiplier?: number },
  reconciliation: { fuelNorms?: Record<vehicleTypeId, number> }
}
```
- **Validation → parse config on app boot and on backend org-load;** invalid config fails loudly (not silently), with a clear error. Config is **data**, never code.

### Layer 12 — Non-Functional
- **Performance budget (₹8–10K Android, ~2–3 GB RAM) →** cold start ≤4s; list scroll 60fps with 500 rows (FlashList/virtualization); SQLite reads async + paginated; **WAL mode ON**; no SQLite BLOBs; image work off the JS thread.
- **Security → zod input validation at API boundary;** secrets in env only; rate-limit auth endpoints (defer Redis — in-memory/IP limiter Phase 1); RLS + manual `org_id` filter (defense-in-depth); HTTPS only; SecureStore for tokens.
- **Error handling → uniform envelope → localized, actionable UI;** never surface raw stack/SQL.
- **Logging/observability → Sentry (frontend + backend),** structured server logs with `traceId` + `orgId`; **no PII in logs**.
- **Accessibility → min touch target 48dp,** color + label (never color alone), scalable text, high-contrast palette for outdoor screens.

### Layer 13 — Build / Release
- **EAS profiles → `development`, `preview`, `production`,** plus a **white-label mechanism via env/config** (one binary reads org config; per-brand build only if app-store identity differs — defer per-brand stores).
- **Env inventory →** *Frontend:* `API_BASE_URL`, `SENTRY_DSN`, `R2_PUBLIC_BASE`, `EAS_PROJECT_ID`, `DEFAULT_LOCALE`. *Backend:* `DATABASE_URL` (app-role, **non-superuser, non-BYPASSRLS**), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `R2_*` (account, key, secret, bucket), `SENTRY_DSN`, `NODE_ENV`.
- **Versioning/migrations on update → version-based SQLite migrations** (missing migration must not crash existing users); backend migrations run on deploy; **expand-then-contract** schema changes.

### Layer 14 — Testing
- **Unit → wage calc, reconciliation math, completeness rules, RBAC `can()`, config validation, money/UOM conversions.**
- **RLS/cross-tenant → automated:** set `app.org_id` to org A, assert reads/writes against org B's rows fail; assert the app DB role cannot BYPASS RLS.
- **Offline-sync → simulate** offline create → reconnect → assert single row (idempotency), conflicting edits → assert LWW, poison event → assert parked not blocking.
- **Low-end-device manual checklist →** cold start time; 500-row list scroll; photo capture+compress+watermark; offline day of entries then sync; export .xlsx; kiosk roster; Hindi rendering of all screens.

---

## 3. Open-Decisions Table (lock before the mega-prompt)

| # | Decision | Options | **Recommendation** |
|---|---|---|---|
| 1 | Wage-rate model | daily / hourly / per-crew | **Per-person daily rate** (skill default fallback), half-day=0.5, OT as extra hours × (daily/8 × otMultiplier). Simplest honest model. |
| 2 | "Today complete" definition | attendance-only / attendance+progress / configurable | **Attendance + (progress note OR explicit "nothing to report")** per active site/working-day; configurable later. |
| 3 | Kiosk auth | per-worker PIN / device org-PIN / no auth | **Device-bound org session + attendance-only scope;** no per-worker credentials. |
| 4 | Voice-note storage | SQLite blob / R2 reference | **R2 reference**, AAC/m4a, ≤60s. Never blob. |
| 5 | Fuel recon baseline | none / manual expected / norm×distance | **Norm per vehicle type × distance(or hours)**, norm configurable; variance flag. |
| 6 | Material recon | movements-only / opening+running balance | **Opening balance + running balance** (IN−CONSUME−DISPATCH+RECEIVE); warn on negative. |
| 7 | Delete policy | hard / soft / void | **Soft-delete (`deleted_at`) for records; "void" status for financial entries.** Hard-delete only unsynced drafts. |
| 8 | ID scheme | server serial / client UUIDv4 / client UUIDv7 | **Client UUIDv7** (time-ordered → index locality + natural sort) via `uuidv7` lib; v4 fallback. |
| 9 | Timezone / business day | UTC only / local date | **Store UTC `timestamptz`; "business day" = `date` in Asia/Kolkata.** All "today" logic uses local date. |
| 10 | Money type | float / decimal / integer paise | **Integer paise (`bigint`)** everywhere; format at the edge. Never float. |
| 11 | Person vs User | workers are users / separate person master | **Separate `person` master**, optional link to a view-only `user`. |
| 12 | Attendance uniqueness | multiple per day / one per day | **One status per person per business_date** (unique constraint); corrections overwrite + audit. |
| 13 | Material transfer | one-sided / two-sided | **Two-sided (DISPATCH→RECEIVE)** with mismatch flag. |
| 14 | RLS tenant context | session SET / per-transaction SET LOCAL | **Per-transaction `SET LOCAL app.org_id`** (pooled Neon reuses connections — session-level leaks across tenants). |
| 15 | Rate limiting | none / in-memory / Redis | **In-memory/IP limiter on auth** Phase 1 (Redis deferred). |
| 16 | Refresh token | stateless / stored+rotating | **Stored, hashed, rotating, per device.** |
| 17 | Sync granularity | per-record / batched | **Batched `pushBatch`** with per-event idempotency. |
| 18 | Headcount source | manual / derived | **Derived from attendance, manual override flagged.** |

---

## 4. Guess-Wrong Hotspots (mandatory explicit sections in the mega-prompt)

A one-shot generator will get these wrong or inconsistent unless pinned **verbatim**:

1. **UUID generation** — must be **client-side UUIDv7** at creation, not server-assigned, not `nanoid`, not auto-increment. State the exact lib and where IDs are minted.
2. **RLS tenant context under pooled Neon** — must be **`SET LOCAL app.org_id` inside the request transaction**, with a Nest interceptor wrapping each request in a transaction that sets (and the pool resets) the GUC. **Forbid** copying Neon's `auth.user_id()`/Data-API pattern (wrong architecture here).
3. **App DB role** — connect as a **non-superuser, non-`BYPASSRLS`** role, or RLS silently does nothing. Pin this in env + migration.
4. **Adapter boundary** — screens import **only** `AuthClient`/`RecordsClient` interfaces; **never** import `RestClient`/axios/fetch directly. State this as an inviolable rule + a lint guard.
5. **Single source of truth for enums & types** — all enums (below) and DTOs live in the **shared package**; backend and frontend import them; **no redefinition**. Drift here breaks everything silently.
6. **Exhaustive enum lists (pin verbatim):**
   - Role: `OWNER|SITE_MANAGER|TEAM_HEAD|DRIVER|WORKER`
   - AttendanceStatus: `PRESENT|ABSENT|HALF_DAY`
   - LeaveType: `CASUAL|SICK|UNPAID|OTHER`
   - ExpenseCategory: `FOOD|SUPPLIES|TRANSPORT|LABOUR|MISC`
   - VehicleTrackingMode: `KM|HOURS`
   - MaterialTxnType: `IN|CONSUME|DISPATCH|RECEIVE`
   - UOM: `BAG|KG|CFT|NOS|MT|LITRE`
   - ApprovalType: `VEHICLE_SWITCH|LEAVE|MATERIAL`
   - ApprovalStatus: `PENDING|APPROVED|REJECTED`
   - IssueSeverity: `LOW|MEDIUM|HIGH`
   - IssueStatus: `OPEN|RESOLVED`
   - SiteStatus: `ACTIVE|PAUSED|CLOSED`
   - MediaKind: `PHOTO|RECEIPT|VOICE`
   - CompletenessState: `COMPLETE|PARTIAL|MISSING`
   - OutboxStatus/Op: `PENDING|IN_FLIGHT|SYNCED|FAILED` / `CREATE|UPDATE|VOID`
7. **Config schema** — pin the exact zod shape (Layer 11) and that config is validated at boot/load and is **data not code**.
8. **Error contract** — pin the exact envelope `{ error: { code, message, fields?, traceId } }`; all endpoints conform; frontend maps codes → localized messages.
9. **Money = integer paise** everywhere; never float; format only at display.
10. **Business-day/timezone** — UTC storage, Asia/Kolkata business date; "today" everywhere means local date.
11. **Soft-delete semantics** — every query filters `deleted_at IS NULL`; rollups exclude voided.
12. **Idempotency + LWW** — pin the key location, the dedupe, and the version-based tiebreak.
13. **i18n discipline** — zero hardcoded strings; all via keys; pin the namespace list.
14. **Permission checks on both layers** — server authoritative; pin that client `can()` is UI-only.
15. **No SQLite BLOBs** — media is R2 references only; pin it.
16. **Migrations don't crash existing users** — version-based, expand-then-contract; pin it.

---

## 5. Mega-Prompt Structure

### 5.1 The key recommendation: contracts-first, then 3 ordered build prompts
A single literal prompt that emits backend + DB + frontend reliably is a **known failure mode**: context truncation, the model re-deriving enums inconsistently across files, silent stubbing/`// TODO`, and adapter-boundary leaks. Instead:

- **Prompt 0 — "Contracts Pack" (frozen, you generate + hand-edit + LOCK first).** Output: the shared package — enums, DTO/zod types, `org.config` schema, Drizzle DB schema (with RLS policies), the REST API contract (paths + envelopes), and the `AuthClient`/`RecordsClient`/`SyncClient` interfaces. **Nothing else is written until this is locked.** This *is* §1–§4 of this document, formalized into code. Freeze it verbatim into every later prompt.
- **Prompt 1 — Backend** (NestJS + Drizzle + RLS + auth + RBAC guards + endpoints + seed). References Prompt 0 verbatim.
- **Prompt 2 — Frontend engine** (adapters: mock + rest; outbox/sync; SQLite + WAL + migrations; i18n; config loader; shared UI states; `can()`). References Prompt 0.
- **Prompt 3 — Frontend screens** (Expo Router routes per role; end-of-day hub; kiosk; dashboards; capture; export). Built on the engine + mock adapter first, then rest.

Splitting on the **adapter boundary** is what makes this safe: screens depend only on interfaces, so Prompts 2/3 can be built and tested on mocks before the backend exists.

### 5.2 Section order *within* each prompt
1. **Role + global constraints** — "senior full-stack lead," stack versions pinned, the 16 hotspots as hard rules, "no stubs/TODOs in critical paths," "if unspecified, follow the stated defaults — do not invent."
2. **Frozen Contracts Pack** (verbatim) — enums, types, config schema, DB schema, API contract, adapter interfaces. *Reference, don't paraphrase.*
3. **Architecture & file tree** — monorepo layout (`/shared`, `/backend`, `/app`), engine/app/adapter boundaries, explicit folder structure.
4. **This prompt's scope** (backend OR engine OR screens) with per-feature acceptance criteria from §1.
5. **Cross-cutting rules** — error envelope, i18n discipline, money/timezone, soft-delete, RLS context, UUIDv7.
6. **Definition of done + self-check** — "before emitting, confirm every enum matches the Contracts Pack; list any place you deviated."
7. **Output instructions** — generate in dependency order; full file contents (no ellipses); a final file-tree manifest.

### 5.3 Tips & failure modes
- **Freeze contracts once; reference verbatim.** The single biggest cause of broken one-shot builds is the model re-inventing enums/types per file.
- **Make the model echo the contract first** ("restate the enum list and config schema you will use") before it writes code — catches drift early.
- **Forbid stubs explicitly** in auth, RLS, sync, and wage calc; allow TODOs only in deferred-polish areas.
- **Generate in dependency order** (types → schema → server → adapters → screens) so later files compile against earlier ones.
- **Pin libraries + versions** to stop hallucinated APIs; if unsure of an API, instruct "use the documented signature or leave a clearly-marked verify-me note," never invent.
- **If a prompt is still too big,** split Prompt 3 by role (Owner / SiteMgr / TeamHead-Driver-Worker) — the adapter boundary keeps them independent.

### 5.4 Deliberately defer to post-build polish
Visual/brand theming finesse, animations/transitions, PDF layout polish, additional vehicle types beyond the seeded 3, advanced analytics charts, doc-expiry alerts, daily-digest push, second-pass Hindi copy review, Sentry dashboards/alerts, EAS store submission, backup/restore UX niceties. None of these block a working Phase-1 build; all are safe to iterate after the one-shot.

---

## 6. Sources (new web-verified claims only)
- Drizzle ORM — Row-Level Security (pgPolicy / crudPolicy / `.link()`; drizzle-kit does not auto-generate policy DDL): https://orm.drizzle.team/docs/rls and discussion https://github.com/drizzle-team/drizzle-orm/discussions/2450
- Neon RLS with Drizzle (confirms `crudPolicy`/`authUid` are tied to Neon's Data API + JWT-in-Postgres `auth.user_id()` model — i.e. the pattern to *avoid* for a NestJS-server-in-front design): https://neon.com/docs/guides/rls-drizzle , https://neon.tech/docs/guides/neon-rls-tutorial , https://neon.com/blog/modelling-authorization-for-a-social-network-with-postgres-rls-and-drizzle-orm
- Drizzle + Postgres 2025 best practices (identity columns over serial; RLS patterns): https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717

*(All architecture, data-model, RBAC, offline-sync, config, and mega-prompt-structuring recommendations above are reasoning/best-practice synthesis, not new factual claims; round-1 already verified the offline-sync, RLS-hardening, and low-literacy-UX evidence base.)*
