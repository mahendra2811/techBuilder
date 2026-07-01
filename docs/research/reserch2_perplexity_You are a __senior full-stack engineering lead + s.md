<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# You are a **senior full-stack engineering lead + solutions architect**. I have validated my product's market (round 1, summarized below). Your job now is to get me to **build-ready completeness**: (1) the **final, complete Phase-1 feature list**, and (2) an **exhaustive pre-build planning checklist** covering backend, frontend, database, and everything else — so that I can write a **single "mega-prompt" that builds the entire application in one shot**, then only do small polish afterward. Anything left unspecified now will be guessed (often wrongly) by the code-generating AI, so your job is to make sure **nothing is missing**.

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

Produce the **definitive feature list** for Phase 1, integrating the round-1 must-adds with the locked plan. Organize by area (Auth/onboarding · Org \& people \& RBAC · Sites · Vehicles \& types · Attendance \& leave · Wage/cost summary · Records: expense/fuel/trip/material/issue/progress/photo · Approvals · Roll-up dashboards \& analytics · Reports/export/backup · Capture: camera/scanner/GPS · Notifications · Low-literacy/kiosk UX · Offline/sync · Shared screens). For each feature: **must-have vs nice-to-have**, and a one-line acceptance criterion. **Then add anything still missing** that a real construction SMB workflow needs and neither the plan nor round-1 covered (reason it out; quick web check only if needed).

### Task B — Exhaustive PRE-BUILD planning checklist (the core deliverable)

Enumerate **everything that must be decided/specified before writing the mega-prompt**, so the one-shot build has no gaps. For each item, state the decision needed + a **recommended default**. Cover ALL of these layers:

1. **Product/UX:** complete screen inventory per role; navigation; the exact end-of-day entry flow (must be <2 min); empty/loading/error states; kiosk mode; voice-note flow; language switching.
2. **Data model:** every entity, every field (name, type, nullable, enum values), every relationship, every unique constraint, audit fields, soft-delete policy. Flag anything the current model is missing (e.g. wage-rate fields, reconciliation baselines, completeness tracking, voice-note media).
3. **API contract:** every endpoint (method, path, request body, response shape, error shape), pagination/filtering conventions, the `RecordsClient`/`AuthClient` interface methods, and how the mock vs rest adapter map.
4. **Database:** full Postgres schema, migrations strategy, **RLS policies** per table, indexes, and **seed/demo data** needed to onboard the first org + show a populated dashboard.
5. **Auth \& session:** manual login, JWT contents, refresh/expiry, first-login change-password, role resolution, logout, multi-device.
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

Below is the build-complete spec I’d want before writing a one-shot mega-prompt. I’m treating your phase-1 scope as already validated and focusing on completeness, defaults, and the places code-gen usually guesses badly. For a few architecture points, the web-backed best-practice defaults are: use `SET LOCAL` per transaction for tenant context under pooling, enable and `FORCE ROW LEVEL SECURITY`, and keep interactive touch targets large on mobile.[^1][^2]

## 1) Final feature list

### Auth/onboarding

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Manual org creation by developer | Must | A new company can be onboarded without any self-signup flow. |
| Owner login | Must | Owner can log in with manual credentials and land on their dashboard. |
| First-login password change | Must | First login forces password change before any app access. |
| Org config + assets assignment | Must | Each org loads its brand/config/assets without code changes. |
| Multi-device login policy | Must | A user can log in on more than one device only if you explicitly allow it. |
| Logout | Must | Logout clears session and local auth state cleanly. |
| Password reset by admin/manual support | Nice | You can recover an account without OTP. |

### Org \& people \& RBAC

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Roles: Owner, Site Manager, Team Head, Driver, Worker | Must | Each role sees only allowed screens/actions. |
| Scoped user creation cascade | Must | Owner can create Site Managers, Site Managers can create Team Heads, etc. |
| Employee profile | Must | Each person has name, phone, role, default site, status, notes. |
| User status: active/inactive | Must | Inactive users cannot sign in or receive new assignments. |
| Permission matrix | Must | Every action has a clear allow/deny rule by role and scope. |
| Client/server `can()` enforcement | Must | UI hides actions the server will also reject. |
| Audit trail for admin changes | Must | Role/site/vehicle assignments are traceable. |
| User search/filter | Nice | Owner can quickly find people by role/site/status. |

### Sites

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Site create/edit/archive | Must | Owner can manage sites and site metadata. |
| Site assignment of people | Must | People can be linked to one or more sites as needed. |
| Site dashboard | Must | Site Manager sees today’s pending/complete state for that site. |
| Site notes/metadata | Nice | Site has address, geo, client label, and remarks. |
| Site archive/soft delete | Must | Archived sites remain in reports and history. |

### Vehicles \& types

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Vehicle create/edit/archive | Must | Owner can add vehicles and mark them inactive. |
| Vehicle type templates | Must | Type determines counters/fields, e.g. KM or hours. |
| Allowed operator roles per type | Must | Only permitted drivers can log a given vehicle type. |
| Vehicle assignment to site | Must | A vehicle can be tied to one or more sites. |
| Vehicle switch request | Must | A user can request a vehicle switch and get approval. |
| Vehicle start/end logs | Must | Each workday can record start/end readings. |
| Vehicle issue/breakdown log | Must | Breakdowns are capturable and visible to managers. |
| Vehicle cost roll-up | Must | Owner sees vehicle-level costs and utilization. |
| Vehicle docs/attachments | Nice | RC, insurance, permits can be stored as files. |

### Attendance \& leave

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Present/absent/half-day | Must | Team Head/Site Manager can mark daily attendance quickly. |
| Multi-day leave | Must | Leave ranges can be created and visible in calendars. |
| Attendance by site and role | Must | Attendance is scoped to the right site/team. |
| Attendance edit reason | Must | Changes are auditable. |
| Attendance notes | Nice | Short reason text can be attached to a day. |
| Attendance summary export | Must | Attendance can be exported for payroll/costing. |

### Wage/cost summary

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Read-only wage summary | Must | System can compute wage cost without making payments. |
| Wage rules by person or role | Must | A rate can be attached at person or role level. |
| Daily/weekly/monthly cost roll-up | Must | Owner can see cost totals by window. |
| Cost per site / vehicle / crew / material | Must | Each entity shows its rolled-up cost contribution. |
| Wage export to Excel | Must | The app exports a payroll-ready summary file. |
| Overtime/bonus/deduction | Nice | Optional cost adjustments can be represented later. |

### Records: expense/fuel/trip/material/issue/progress/photo

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Site progress note | Must | A site can receive a daily end-of-day progress entry. |
| Progress photos | Must | Photos attach to records and upload on sync. |
| Expense entry | Must | Team Head/Site Manager can log amount, category, receipt. |
| Fuel entry | Must | Fuel supports rupees, liters, vehicle, receipt, reading. |
| Trip entry | Must | Trips can record origin, destination, vehicle, driver, reading. |
| Material usage | Must | Consumption can be recorded against a site and date. |
| Material movement | Must | Material transfer between sites is supported. |
| Issue/breakdown record | Must | Problems can be logged with photos and severity. |
| Remark/voice note | Must | A record can include short text and optional voice note. |
| Record tags/categories | Nice | Entries can be classified for reporting. |

### Approvals

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Vehicle switch approval | Must | Request can be approved/rejected with audit trail. |
| Leave approval | Must | Leave requests can be approved/rejected by scope. |
| Material request approval | Must | Request flows up before material is issued/moved. |
| Expense exception approval | Nice | Large or unusual expense can require approval. |
| Approval comments | Must | Approver can leave a reason. |

### Roll-up dashboards \& analytics

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Owner dashboard | Must | Owner sees all sites/vehicles/people in one view. |
| Site Manager dashboard | Must | Manager sees only assigned sites. |
| Team Head dashboard | Must | Team Head sees today’s tasks/records status. |
| Today completeness indicator | Must | Missing daily records are clearly marked. |
| Roll-up by date window | Must | 7-day and 30-day views work. |
| Cost/reconciliation widgets | Must | Fuel and material reconciliation is visible. |
| Trend charts | Nice | Simple charts show movement over time. |
| Exception list | Must | Late/missing/overspend issues are surfaced first. |

### Reports/export/backup

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Excel export | Must | Core reports export to XLSX without server PDF. |
| PDF summary share | Must | A compact summary can be generated for WhatsApp share. |
| Windowed export | Must | 7-day and 30-day exports are supported. |
| Backup export/import | Must | Data can be exported and restored from a backup package. |
| CSV fallback | Nice | CSV exists for low-friction interchange. |
| Report presets | Must | Reports are predefined and not free-form initially. |

### Capture: camera/scanner/GPS

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Camera capture | Must | Photo capture works inside the app. |
| Compression | Must | Photos are compressed before upload. |
| Watermark | Must | Image watermark includes org/date/time and record context. |
| QR/barcode scan | Must | Users can scan supported codes for assets/materials. |
| GPS geotag on records/photos | Must | Capture includes location when permitted. |
| GPS not required for attendance | Must | Attendance works without location. |
| Thumbnail generation | Must | List screens load thumbnails fast. |

### Notifications

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Sync/result notifications | Must | User sees sync success/failure clearly. |
| Approval notifications | Must | Approvers get alerted for pending requests. |
| Daily reminder | Nice | Site Manager can get a reminder near EOD. |
| Owner exception notification | Nice | Missing/abnormal activity can be nudged. |

### Low-literacy/kiosk UX

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Icon + label everywhere | Must | Every main action is visually obvious. |
| Large tap targets | Must | Buttons remain easy to hit on small phones. |
| Numeric/tap-first inputs | Must | Most entries avoid free text. |
| Shared-device kiosk mode | Must | A device can be handed between workers safely. |
| Fast role switch | Must | User can switch tasks without reconfiguring the app. |
| Hindi-first text with English fallback | Must | All core screens support Hindi and English. |
| Voice note flow | Must | User can record, preview, delete, and attach voice. |
| Color-coded completeness/status | Must | Status is visible without reading long text. |

### Offline/sync

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| Local SQLite source of truth | Must | Users can create/read records offline. |
| Outbox queue | Must | Writes queue locally and sync later. |
| Client UUIDs | Must | Records exist locally before server sync. |
| Idempotency keys | Must | Duplicate sync submissions do not duplicate records. |
| Backoff/attempt caps | Must | Sync retries are bounded and visible. |
| LWW conflict rule | Must | A deterministic conflict policy is documented and implemented. |
| WAL mode | Must | SQLite uses WAL for better concurrent behavior. |
| Photo media separate from SQLite | Must | Media is stored as files, not BLOBs. |
| Version-based migrations | Must | Old app versions can upgrade safely. |
| Sync status UI | Must | Users can see pending/synced/failed counts. |

### Shared screens / engine

| Feature | Must/Nice | Acceptance criterion |
| :-- | --: | :-- |
| One engine, one app codebase | Must | New orgs use config/assets, not forks. |
| Mock adapter first | Must | Screens run against fake data before backend exists. |
| REST adapter second | Must | Swapping adapters does not change screen code. |
| Config-driven feature flags | Must | Org-specific features can be enabled without code changes. |
| Role-based route gating | Must | Users cannot navigate to unauthorized routes. |

### New gaps I’d add now

| Gap | Must/Nice | Why it matters |
| :-- | --: | :-- |
| Basic entity archive/soft-delete everywhere | Must | Construction history must survive mistakes and audits. |
| Audit log for all approvals and edits | Must | Disputes are common in field ops. |
| Device/installation reset handling | Must | Shared devices and reinstall recovery will happen. |
| Site/material master data import | Must | Real orgs will have lists to seed, not manual typing. |
| Read-only “today not complete” exception queue | Must | Missing records must be obvious, not buried in charts. |
| Duplicate detection for photos/entries | Nice | Reduces accidental double logging. |
| Background sync trigger on app foreground | Must | Prevents stale dashboards. |
| Timezone discipline (org/site local time) | Must | Daily cutoffs otherwise break rollups. |
| Offline draft save for every form | Must | Users abandon half-entered work often. |

## 2) Pre-build planning checklist

### 1. Product / UX

| Decision needed | Recommended default |
| :-- | :-- |
| Screen inventory per role | Make a fixed set: Login, Select Org, Owner Home, Site Home, Team Head Home, Driver Home, Worker Home, Create Record, Approvals, People, Sites, Vehicles, Reports, Settings, Sync Status, Audit Log, Help. |
| Navigation model | Use role-based bottom tabs plus a universal “Create” entry point. |
| EOD entry flow | Single “Today” screen with 5–7 big tiles, one-tap record types, and a hard cap of 2 minutes for a normal site update. |
| Empty state design | Every empty state must say what to do next, not just “No data.” |
| Loading states | Use skeletons for dashboards; never show blank white waits. |
| Error states | Show short Hindi/English message, retry button, and if relevant “save locally”. |
| Kiosk mode | Add a “shared device” mode with quick user handoff and optional PIN per role. |
| Voice-note flow | Record, play back, delete, then save as attachment; default off unless user taps mic. |
| Language switching | Per-user preferred language plus manual toggle in settings. |
| Today-complete definition | A site is complete only when required record types for that org+site are present. |
| Daily cut-off time | Use org-configurable local cutoff, default 8:00 PM India local time. |

### 2. Data model

You need to lock the entity graph before codegen. At minimum the system needs org, user, role, site, vehicle, vehicle_type, attendance, leave_request, approval, record, record_item, expense, fuel, trip, material, material_lot, material_transfer, issue, progress_update, photo, voice_note, attachment, sync_outbox, sync_cursor, audit_log, notification, and config_version.
Missing fields to add now: wage_rate, wage_basis, daily_cost summary snapshots, record completeness flags, reconciliation baselines, approval status/reason, media metadata, device_id, client_uuid, deleted_at, created_by/updated_by, and source_type/source_id for derived summaries.

Recommended defaults:

- Use UUID primary keys everywhere.
- Use `org_id` on every tenant row.
- Use soft delete with `deleted_at`.
- Use `created_at`, `updated_at`, `created_by`, `updated_by` on all mutable tables.
- Use enums only for stable states; otherwise use lookup/config tables.
- Store dates as `date` for daily business records and timestamps as `timestamptz` for events.


### 3. API contract

Define three layers:

- Auth endpoints.
- CRUD endpoints for master data and records.
- Sync endpoints for push/pull and report export.

Recommended defaults:

- `POST /auth/login`
- `POST /auth/change-password`
- `POST /auth/logout`
- `GET /me`
- `GET /orgs/current`
- `GET /sites`, `POST /sites`, `PATCH /sites/:id`
- `GET /vehicles`, `POST /vehicles`, `PATCH /vehicles/:id`
- `GET /records`, `POST /records`, `PATCH /records/:id`
- `POST /records/:id/approve`
- `GET /dashboards/owner`
- `GET /reports/daily`
- `POST /sync/push`
- `GET /sync/pull`
- `POST /files/presign`
- `POST /files/complete`

Standardize errors as `{ code, message, details?, requestId }`. Use cursor pagination for list endpoints. The mock adapter should implement the same interface as the REST adapter, not a different shape.

### 4. Database

Recommended tables:

- `orgs`, `users`, `roles`, `user_roles`, `sites`, `vehicles`, `vehicle_types`, `attendance`, `leave_requests`, `approvals`, `records`, `record_photos`, `record_voices`, `expenses`, `fuel_entries`, `trips`, `materials`, `material_lots`, `material_transfers`, `issues`, `sync_outbox`, `sync_state`, `audit_logs`, `notifications`, `configs`, `config_versions`, `device_sessions`.

RLS defaults:

- `FORCE ROW LEVEL SECURITY` on tenant tables.
- Policies based on `org_id = current_setting('app.org_id')::uuid`.
- `SET LOCAL` on each transaction.
- Non-superuser app DB role only.
- Manual `org_id` filtering in application queries as defense in depth.[^2]

Indexes:

- Every tenant table: `(org_id, created_at)` and `(org_id, id)` or equivalent.
- Entity lookups: `(org_id, site_id)`, `(org_id, vehicle_id)`, `(org_id, status)`.
- Outbox: `(org_id, status, next_attempt_at)`.

Seed/demo data:

- One org, 1 owner, 2 managers, 2 team heads, 2 drivers, 4 workers.
- 2 sites, 3 vehicles, 5 materials, 7 sample records across 7 days.
- At least one pending approval, one fuel issue, one material movement, one incomplete day.


### 5. Auth \& session

Recommended defaults:

- JWT access token short-lived.
- Refresh token longer-lived and rotatable.
- Store device/session ID in backend.
- Include `sub`, `org_id`, `role`, `scope`, `session_id`, `iat`, `exp` in JWT.
- Force password change on first login.
- Allow multiple devices only if the user record or org policy allows it.
- Logout should revoke refresh token and clear local storage.


### 6. RBAC

You need a full permission matrix. At minimum, every action should be evaluated for:

- Create, read, update, delete, approve, export, assign, archive, sync.
- Scope: own, site, org, none.

Recommended defaults:

- Owner: org-wide everything except super-admin only.
- Site Manager: site-scoped CRUD on records and approvals.
- Team Head: create daily records, attendance, requests.
- Driver: create vehicle/fuel/trip logs only.
- Worker: read-only view of assigned info.
- Client-side `can()` is only for UX; server decides final access.


### 7. Offline / sync

You need to specify:

- Outbox table schema.
- Record status lifecycle.
- Conflict policy.
- Retry policy.
- Sync triggers.
- Local-only vs synced entities.

Recommended defaults:

- Outbox rows store `client_uuid`, `entity_type`, `entity_id`, `operation`, `payload`, `attempt_count`, `next_attempt_at`, `last_error`.
- LWW for normal records, but never for approvals or auth changes; those should reject conflicts.
- Retry with exponential backoff and max attempt cap.
- Background sync on app start, foreground, and connectivity regain.
- Local-only: UI prefs, drafts, cached lookups.
- Synced: all business records, approvals, media metadata, audit events.


### 8. Media / files

Recommended defaults:

- Store files in R2 by org/date/entity path.
- Upload flow: presign → upload → complete.
- Keep SQLite only for metadata.
- Watermark image with org name, date, time, and record type.
- Compress photos before upload to a mobile-safe target.
- Generate thumbnails on device for list rendering.


### 9. i18n

Recommended defaults:

- String catalogs in `en` and `hi`.
- No mixed-language hardcoded strings in components.
- Format numbers/currency/date with locale-aware helpers.
- Hindi should cover core flow, errors, labels, and approvals.
- Voice notes should be language-agnostic attachments, with optional later transcription.


### 10. Reports / export / backup

Recommended defaults:

- Excel reports: daily summary, weekly summary, site-wise rollup, vehicle-wise rollup, attendance, wage summary, material reconciliation, fuel reconciliation, approvals pending, exception list.
- PDF: single-page shareable summary only.
- Backup format: zipped JSON + media manifest + version metadata.
- Restore must validate config/version before importing.
- Windowed exports: 7/30 days only in phase 1.
- Add sheet tabs per report area rather than one giant sheet.


### 11. Config / merchant schema

Recommended defaults:

```ts
type OrgConfig = {
  orgName: string
  brand: { logoUrl?: string; primaryColor: string; accentColor?: string; localeDefault: 'hi' | 'en' }
  features: {
    attendance: boolean
    wageSummary: boolean
    kiosks: boolean
    voiceNotes: boolean
    qrScan: boolean
    gpsGeotag: boolean
    approvals: boolean
    reportsPdfShare: boolean
  }
  rolesEnabled: Array<'owner'|'siteManager'|'teamHead'|'driver'|'worker'>
  recordTypesEnabled: Array<'progress'|'expense'|'fuel'|'trip'|'materialUsage'|'materialMove'|'issue'|'attendance'|'leave'|'vehicleStartEnd'>
  vehicleTypes: Array<{ key:string; labelHi:string; labelEn:string; counterMode:'km'|'hours'; extraFields: Array<{ key:string; labelHi:string; labelEn:string; type:'text'|'number'|'select'|'photo' }> }>
  wageRules: Array<{ scope:'person'|'role'; refId:string; basis:'day'|'hour'|'crew'; rate:number; currency:'INR' }>
  completionRules: { requiredRecordsByRole: Record<string, string[]>; cutoffLocalTime: string }
}
```

Validate config strictly on load and version it.

### 12. Non-functional

Recommended defaults:

- Target acceptable performance on 8–10K INR Android phones: initial dashboard under ~3 seconds after cold start on cached data, normal EOD save under 2 minutes, photo capture workflow under 10 seconds to save locally.
- Security: server-side input validation, file type checks, size limits, rate limiting, audit logs, no secrets in app.
- Error UX: short human-readable message plus retry and local-save hint.
- Observability: Sentry for frontend and backend, plus structured logs with request IDs.
- Accessibility: large taps, readable contrast, simple hierarchies, avoid dense tables on mobile.


### 13. Build / release

Recommended defaults:

- EAS profiles: `dev`, `preview`, `prod`, and optional `whiteLabel`.
- White-label build should change app name, icon, splash, colors, and config at build time.
- Env vars split frontend/backend clearly; no backend secret in app.
- Versioning: semantic versioning with app build number tied to schema migration version.
- DB migrations must be backward compatible for at least one prior app version if possible.


### 14. Testing

Must test:

- Entity validation and enum rules.
- Permission matrix.
- RLS cross-tenant isolation.
- Offline outbox queuing and retry.
- Sync conflict cases.
- Media upload success/failure.
- Report generation.
- Config validation.
- Low-end-device manual flow.
- Shared-device/kiosk switching.
- Restore from backup.
- Happy-path one-org seed experience.


## 3) Open-decisions table

| Decision | Options | Recommendation |
| :-- | :-- | :-- |
| Wage-rate model | Per day / per hour / per role / per crew | Support all three, but default to person or role basis per org. |
| Completeness definition | Hard-coded vs config-driven | Config-driven by org and site, with sane defaults. |
| Kiosk auth | PIN / select user / QR / biometric | Start with PIN or select-user on shared device. |
| Voice-note storage | Local only / synced file / transcribed text | Store as synced file with optional later transcription. |
| Reconciliation baseline | Estimated vs last-known vs manual baseline | Use last-known ledger state plus manual adjustments. |
| Soft-delete | Hard delete / soft delete / mixed | Soft delete for all business objects. |
| ID scheme | Server IDs only / client IDs / UUIDs | Client-generated UUIDs plus server acceptance. |
| Timezone handling | UTC only / org local / site local | Store UTC timestamps, compute business days in org local time, optionally site override later. |
| Photo compression | Heavy quality / balanced / aggressive | Balanced; preserve evidence, reduce size. |
| Report scope | Free-form / preset only | Preset only in phase 1. |
| Sync conflicts | Reject all / LWW / merge by type | LWW for simple logs, reject for approvals and identity changes. |
| Multi-device access | One device / many devices | Many devices allowed, but track `device_session`. |
| WhatsApp share | Native text only / PDF + text | Use both a compact PDF and a text summary. |
| Archived data | Hidden / visible in reports | Visible in reports, hidden from normal creation flows. |

## 4) Guess-wrong hotspots

These are the places a code-generating model will most likely improvise incorrectly unless explicitly pinned:

- Exact permission matrix by role and scope.
- Full enum values for every status/type/counter mode.
- Org/site/day cutoff logic and timezone rules.
- Client UUID vs server UUID generation.
- RLS tenant context via `SET LOCAL` inside transactions and `FORCE ROW LEVEL SECURITY`.[^2]
- The outbox schema and retry state machine.
- Whether photos are BLOBs or external files. Use external files only.
- Whether completeness is hard-coded or config-driven.
- Whether approval workflows are mutable after submission. Pin this.
- Whether soft-delete is used on every table.
- Whether driver logs are tied to one vehicle type or several.
- Whether wage summary is read-only or feeds payment. It should stay read-only.
- How kiosk mode authenticates and switches users.
- Report sheet names, columns, and default date windows.
- Which data is local-only versus synced.
- The shape of `OrgConfig` and how validation rejects bad configs.
- Device/session handling across logout, reinstall, and shared devices.
- How server and client adapters share types without drifting.
- Error response contract and retry semantics.
- Seed/demo dataset shape and whether it must show incomplete days and pending approvals.


## 5) Mega-prompt structure

Use this order so the code-generation model builds coherently instead of inventing disconnected pieces:

1. **Product brief and non-goals**
    - Re-state techBuilder, phase-1 scope, and explicitly excluded scope.
    - Lock the “records-only, not PM/ERP” line.
2. **Architecture rules**
    - One engine, one app codebase, mock adapter first, REST adapter second.
    - Shared types package for enums/interfaces.
    - No feature outside the config schema.
3. **Domain model first**
    - Define entities, enums, relationships, and config schema in one place.
    - Then generate DB schema and TS types from that conceptual model.
4. **Database and RLS**
    - Create tables, constraints, indexes, migrations, RLS policies, and seed data.
    - Pin `SET LOCAL`, `FORCE ROW LEVEL SECURITY`, non-superuser app role.[^2]
5. **Backend API**
    - Implement auth, CRUD, approvals, sync, file presign/complete, dashboards, reports.
    - Emit one standard error format everywhere.
    - Implement request validation before business logic.
6. **Shared client contract**
    - `RecordsClient` and `AuthClient` interfaces.
    - Mock adapter implementation with seeded data.
    - REST adapter implementation matching the same method signatures.
7. **Frontend shell**
    - Navigation, role-aware routes, shared components, theme, i18n.
    - Shared-device/kiosk mode.
    - Loading/empty/error states.
8. **Core flows**
    - Login → home → today → create record → save offline → sync.
    - Approvals.
    - Dashboards.
    - Reports/export/share.
    - Media capture and upload.
9. **Offline sync**
    - Outbox, conflict handling, retry, background sync, local cache refresh.
    - Be explicit about what syncs and what stays local-only.
10. **Notifications**

- Approval and sync notifications only.

11. **Tests**

- Unit, integration, RLS, offline, and smoke tests.

12. **Build/release config**

- EAS profiles, env vars, white-label config, versioning.

13. **Polish backlog**

- Leave only cosmetic refinement, copy tweaks, and small chart improvements for after the one-shot build.

Best practices for one-shot code-gen:

- Give one canonical type source and forbid re-deriving enums in multiple places.
- Require the model to stop and wire shared types before screens.
- Demand generated seed data and a working demo state on first run.
- Keep report outputs preset and narrow.
- Separate “must implement” from “nice to have later” very explicitly.


## 6) Sources

- Expo SQLite docs: [https://docs.expo.dev/versions/latest/sdk/sqlite/](https://docs.expo.dev/versions/latest/sdk/sqlite/)[^3]
- Expo local-first guide: [https://docs.expo.dev/guides/local-first/](https://docs.expo.dev/guides/local-first/)[^4]
- React Native UX guidance on touch targets and text inputs: [https://reactnative.dev/docs/improvingux.html](https://reactnative.dev/docs/improvingux.html)[^1]
- PostgreSQL RLS best-practice article covering `SET LOCAL`, `FORCE ROW LEVEL SECURITY`, and tenant indexing: [https://dev.to/geekyfox90/postgresql-row-level-security-a-complete-guide-2l4](https://dev.to/geekyfox90/postgresql-row-level-security-a-complete-guide-2l4)[^2]
<span style="display:none">[^10][^11][^12][^13][^14][^15][^16][^17][^18][^19][^20][^5][^6][^7][^8][^9]</span>

<div align="center">⁂</div>

[^1]: https://reactnative.dev/docs/improvingux.html

[^2]: https://dev.to/geekyfox90/postgresql-row-level-security-a-complete-guide-2l4

[^3]: https://docs.expo.dev/versions/latest/sdk/sqlite/

[^4]: https://docs.expo.dev/guides/local-first/

[^5]: https://expo.dev/blog/what-synced-in-app-sqlite-brings-to-expo-apps

[^6]: https://medium.com/@nnaemekaonyeji27/using-sqlite-in-expo-build-fast-offline-ready-apps-1f1ecc532d71

[^7]: https://libraries.io/npm/@sqliteai%2Fsqlite-sync-expo-dev

[^8]: https://docs.powersync.com/integrations/neon

[^9]: https://www.reddit.com/r/expo/comments/1qsvo0c/offlinefirst_data_syncing_strategies/

[^10]: https://www.linkedin.com/posts/expo-dev_expo-file-system-gets-a-major-upgrade-in-activity-7410670296443039744-LxQ-

[^11]: https://www.npmjs.com/package/@sqliteai/todoapp

[^12]: https://nerdleveltech.com/postgres-row-level-security-multi-tenant-nodejs-tutorial

[^13]: https://mvpfactory.io/blog/row-level-security-in-postgresql-multi-tenant-data-isolation-for-your-saas/

[^14]: https://matheuspalma.com/es/blog/postgresql-row-level-security-multi-tenant-saas

[^15]: https://appmaster.io/blog/postgresql-row-level-security-multitenant-patterns

[^16]: https://konghq.com/blog/engineering/ensuring-tenant-scoping-row-level-security

[^17]: https://www.linkedin.com/posts/christophernorthfield_if-youre-building-a-multi-tenant-saas-using-activity-7435268286663208960-WJk1

[^18]: https://www.jusdb.com/blog/postgresql-row-level-security-rls-multi-tenant

[^19]: https://dev.to/m_zinger_2fc60eb3f3897908/why-tenant-context-must-be-scoped-per-transaction-3aop

[^20]: https://ricofritzsche.me/mastering-postgresql-row-level-security-rls-for-rock-solid-multi-tenancy/

