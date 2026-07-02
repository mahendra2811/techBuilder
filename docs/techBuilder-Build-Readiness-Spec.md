# techBuilder — Build-Readiness Spec (AUTHORITATIVE)

> The single build contract, consolidating both research rounds (`docs/`) + every locked decision.
> **Where this differs from the earlier plan docs, this wins.** It is the direct input to **Prompt 0 (the Contracts Pack)**.
> Three decisions confirmed: (1) build = **Contracts-Pack first → 3 ordered build prompts**; (2) **read-only Wage/Cost Summary is IN** (no payments); (3) **separate `person`/labour master** distinct from login users.

---

## 1. Locked engineering conventions (pin verbatim in every prompt)
- **IDs:** client-generated **UUIDv7** PKs (offline-safe, time-ordered). Never serial/auto-increment.
- **Money:** **integer paise (`bigint`)** everywhere. Never float. Format only at display.
- **Time:** store **UTC `timestamptz`**; "business day" = `date` in **Asia/Kolkata**; org-configurable EOD cutoff (default **20:00**). All "today" logic uses local business date.
- **Deletes/versioning:** **soft-delete (`deleted_at`)** on all business tables; **void** status for financial entries; hard-delete only unsynced drafts. **`version int`** column for LWW.
- **Multi-tenancy / RLS:** every tenant table has `org_id`; per-transaction **`SET LOCAL app.org_id`** + **`FORCE ROW LEVEL SECURITY`** + **non-superuser, non-BYPASSRLS** app DB role + defense-in-depth manual `org_id` filters + automated cross-tenant tests. (Do **not** use Neon's `auth.user_id()`/Data-API pattern — NestJS sets the context.)
- **Shared contracts:** ONE shared package is the single source of truth for enums, DTO/zod types, `OrgConfig` schema, Drizzle DB schema, REST API contract, and adapter interfaces. **No redefinition anywhere** (#1 cause of broken builds).
- **Error envelope:** `{ error: { code, message, fields?, traceId } }`; success `{ data, meta? }`. Client maps codes → localized messages.
- **Sync conflicts:** **LWW** (by `version`/server time) for normal logs; **REJECT** conflicts on approvals / auth / identity changes. Idempotency key per outbox event; exponential backoff, cap ~8 attempts, then park as FAILED (user-retryable).
- **Media:** photos/voice as **R2 references**, never SQLite BLOBs. Watermark burned client-side; compress ≤300 KB / long-edge ≤1600 px; voice ≤60 s AAC/m4a.
- **i18n discipline:** zero hardcoded strings; all via i18next keys; Hindi-first + English; ₹ lakh/crore + `dd MMM yyyy` formatting.
- **Adapter boundary:** screens import **only** `AuthClient`/`RecordsClient`/`SyncClient` interfaces — never axios/fetch/`RestClient` directly (lint-guarded).

## 2. Canonical enums (single source of truth)
```
Role:               OWNER | SITE_MANAGER | TEAM_HEAD | DRIVER | WORKER
AttendanceStatus:   PRESENT | ABSENT | HALF_DAY
LeaveType:          CASUAL | SICK | UNPAID | OTHER
ExpenseCategory:    FOOD | SUPPLIES | TRANSPORT | LABOUR | REPAIR | MISC
VehicleTrackingMode:KM | HOURS
MaterialTxnType:    IN | CONSUME | DISPATCH | RECEIVE
UOM:                BAG | KG | CFT | NOS | MT | LITRE
ApprovalType:       VEHICLE_SWITCH | LEAVE | MATERIAL
ApprovalStatus:     PENDING | APPROVED | REJECTED
IssueSeverity:      LOW | MEDIUM | HIGH
IssueStatus:        OPEN | RESOLVED
SiteStatus:         ACTIVE | PAUSED | CLOSED
MediaKind:          PHOTO | RECEIPT | VOICE
CompletenessState:  COMPLETE | PARTIAL | MISSING
OutboxStatus:       PENDING | IN_FLIGHT | SYNCED | FAILED
OutboxOp:           CREATE | UPDATE | VOID
```

## 3. Data model (authoritative — supersedes the entity list in Domain-Model doc)
Every table: `id uuid` (UUIDv7), `org_id uuid` (FK + RLS), `created_at/updated_at/created_by/updated_by`, `deleted_at?`, `version int`. Money = `bigint` paise.

**Identity & org**
- `org`(name, code unique, config jsonb, status)
- `user`(person_id?, username unique-per-org, phone?, password_hash, role, must_change_password, status)
- **`person`** (labour master — attendance/wage subject, **may have no user**) (name, skill?, default_wage_paise?, phone?, status)
- `crew`(site_id, team_head_user_id, name) · `crew_member`(crew_id, person_id) unique pair
- `refresh_token`(user_id, device_id, token_hash, expires_at, revoked_at?)

**Sites & vehicles**
- `site`(name, code, geo?, status, weekly_off int[]?) · `site_holiday`(site_id, date, label)
- `vehicle_type`(name, tracking_mode KM|HOURS, fields_schema jsonb)
- `vehicle`(vehicle_type_id, reg_no, site_id?, status, doc_expiry jsonb?)
- `driver_allowed_type`(user_id, vehicle_type_id)

**Attendance, leave, wage**
- `attendance`(site_id, person_id, business_date, status, ot_hours numeric default 0, marked_by) — **unique(org_id, person_id, business_date)**
- `leave`(person_id, start_date, end_date, type, reason?) — no overlap per person
- `wage_rate`(person_id, daily_paise, effective_from) — or skill default on person
- `advance`(person_id?, crew_id?, amount_paise, business_date, note) — peshgi tracking

**Records (end-of-day)**
- `progress_note`(site_id, text, business_date, entered_by)
- `expense`(site_id, category, amount_paise, vendor_id?, bill_no?, receipt_media_id?, business_date, entered_by) · `vendor`(name, phone?)
- `fuel_log`(vehicle_id, amount_paise, litres, reading, receipt_media_id?, business_date)
- `vehicle_log`(vehicle_id, driver_person_id, start_reading, end_reading, business_date) — unique(vehicle_id, business_date); continuity validated
- `trip`(vehicle_id, from_text, to_text, purpose, material_txn_id?, business_date)
- `material`(name, uom) · `material_balance`(site_id, material_id, opening, business_date) *(or derived view)*
- `material_txn`(type IN|CONSUME|DISPATCH|RECEIVE, material_id, qty, uom, site_id, counterpart_site_id?, related_txn_id?, status, business_date) — **two-sided dispatch→receive**
- `issue`(site_id?, vehicle_id?, severity, description, status, business_date)
- `media`(kind PHOTO|RECEIPT|VOICE, r2_key, thumb_key?, parent_type, parent_id, geo?, taken_at)

**Workflow & system**
- `approval_request`(type, payload jsonb, status, requested_by, approver_user_id, decided_at?, comment?)
- `notification`(user_id, type, payload jsonb, read_at?)
- `audit_log`(actor_user_id, action, entity_type, entity_id, before jsonb?, after jsonb?, at)
- `completeness`(scope_type SITE|VEHICLE, scope_id, business_date, state, computed_at) *(derived; see §5)*
- **client-only (SQLite, not Postgres):** `outbox`(idempotency_key, entity_type, op, payload, status, attempts, next_attempt_at, last_error?), UI prefs, drafts, cached thumbs.

## 4. RBAC matrix (client `can()` = UI only; server guard = authoritative; scope re-derived from DB)
| Action \ Role | Owner | Site Mgr | Team Head | Driver | Worker |
|---|---|---|---|---|---|
| Create users | SM + below | Team Head/Driver/Worker (own site) | Worker/Driver (own crew) | — | — |
| Create sites / vehicles / types | ✅ | — | — | — | — |
| Mark attendance | ✅ any | own site | own crew | — | — |
| Enter records (expense/material/progress) | — | own site | own crew | — | — |
| Vehicle / fuel / trip logs | — | own-site veh. | — | own vehicle | — |
| Submit request | — | ✅ | ✅ | ✅ | — |
| Decide request | ✅ | own scope | own crew (vehicle-switch) | — | — |
| Wage/cost summary + reports/export | ✅ org | own site | — | — | — |
| Config/settings | ✅ | — | — | — | — |
| View | org-wide | own site | own crew | own vehicle | own data only |

## 5. Key rules (lock these defaults)
- **Wage model:** per-person **daily** rate (skill default fallback); HALF_DAY = 0.5; OT = `ot_hours × (daily/8 × otMultiplier)`. **Read-only summary + Excel only — no disbursement.** Advances reduce net payable (running balance per person/crew).
- **Completeness ("is today complete?"):** per **ACTIVE** site on a **working day** (respects `weekly_off`/`site_holiday`) → COMPLETE = attendance marked for assigned crew **AND** (a progress note OR explicit "nothing to report"); PARTIAL = some; MISSING = none. Vehicle COMPLETE if a `vehicle_log` exists for an in-use vehicle. **Config-driven** via `requiredRecordsByRole`; sane default above.
- **Fuel reconciliation:** expected = norm(per vehicle_type) × distance/hours; variance flagged.
- **Material reconciliation:** running balance = opening + IN − CONSUME − DISPATCH + RECEIVE; warn on negative; two-sided transfer with mismatch flag.
- **Kiosk mode:** device-bound org session (org-PIN + select-person), **attendance-only scope**, no settings/export.
- **Same-day correction:** creator may edit own record until business-day +1; edits audited. Attendance correction overwrites + audits.
- **Backdated-correction policy (attendance — WP-4, research-3):** **Team Head** may correct **own-crew** attendance up to **48 h (2 business days)** back · **Site Manager** may correct **own-site** attendance up to **7 days** back · **older than 7 days: Owner only** (audited override) · future business dates are rejected. All corrections are audited (`marked_by`, `updated_by`, `version` bump) and **flagged in Excel exports** (corrected = `version > 1`).
- **Entry business date:** an entry made after the org EOD cutoff (default 20:00 Asia/Kolkata) belongs to the **next** business date.
- **Headcount:** derived from attendance; manual override flagged.

## 6. OrgConfig (zod-validated at boot + backend org-load; config is data, not code)
```ts
{
  brand: { name, logoAsset, primaryColor, secondaryColor? },
  locale: { default: 'hi'|'en', enabled: ('hi'|'en')[] },
  roles:  { enabled: Role[] },
  records:{ enabled: RecordType[] },          // progress|expense|fuel|trip|materialUsage|materialMove|issue|attendance|leave|vehicleStartEnd
  features:{ voiceNotes, kioskMode, fuelReconciliation, materialReconciliation,
             wageSummary, whatsappShare, pdfExport, docExpiryAlerts, qrScan, gpsGeotag },
  vehicleTypes: { key, labelHi, labelEn, trackingMode:'KM'|'HOURS',
                  extraFields:{ key,labelHi,labelEn,type:'text'|'number'|'select'|'photo' }[] }[],
  wage: { model:'daily', otMultiplier?: number },
  reconciliation: { fuelNorms?: Record<vehicleTypeKey, number> },
  completion: { requiredRecordsByRole: Record<Role,string[]>, cutoffLocalTime: string /*default '20:00'*/ }
}
```

## 7. Final feature list — Phase 1 (M = must, N = nice)
- **Auth/onboarding (M):** manual JWT login (access 15m / refresh 30d rotating, hashed, per-device, argon2id); first-login forced password change; agency org-provisioning script (org + Owner + config + seed masters in one tx); logout (revoke device token); multi-device. Admin-reset password (N).
- **Org/people/RBAC (M):** cascade user creation (Owner→SM→TH, scoped); **person/labour master** (attendance for phone-less workers); optional person↔Worker-user link; crew grouping; soft deactivate; server+client `can()`.
- **Sites (M):** create/edit; status (active/paused/closed); working-day calendar (weekly off + holidays); assign SM + crews.
- **Vehicles (M):** type-driven config (KM/hours + dynamic fields); master; driver↔allowed-type restriction; driver-of-the-day; odometer/hour continuity validation. Doc-expiry alerts (N).
- **Attendance & leave (M):** per-person present/absent/half-day (TH/SM only, no clock-in/GPS); OT hours; multi-day leave ranges (no overlap); bulk "all present".
- **Wage/Cost Summary (M):** per-person daily rate; crew/site/period payable rollup; **advance/peshgi** + balance; Excel export. No disbursement.
- **Records (M):** progress note + photos; headcount (derived + override); expense (category/₹/vendor?/bill?/receipt?); fuel; vehicle start/end; trip; material usage; **two-sided material movement**; issue/breakdown; **voice note** on progress/issue; same-day correction window.
- **Reconciliation (M):** material running balance + variance view; fuel expected-vs-actual; UOM master.
- **Approvals (M):** request→approve (vehicle-switch/leave/material) + audit trail + notification.
- **Dashboards/analytics (M):** Owner cross-site/vehicle + SM single-site; **"is today complete?"** indicator; **per-entity cost rollups** (site/vehicle/crew/material); open-issues/pending-approvals/expiring-docs widgets (N).
- **Reports/export/backup (M):** Excel (SheetJS, client-side): daily summary, wage/cost, vehicle/fuel, material recon, expense ledger, exception list; **WhatsApp share**; windowed 7/30-day export/import (schema-validated); local backup+restore (N PDF via expo-print).
- **Capture (M):** camera + watermark + compression; QR/barcode scan; GPS geotag on records/photos (not attendance); thumbnails.
- **Notifications (M):** Expo + FCM; approval/assignment + sync result; daily digest (N).
- **Low-literacy/kiosk (M):** icon+label everywhere; numeric/tap input; color+label status; Hindi-first toggle; kiosk/shared-device mode; voice-note flow.
- **Offline/sync (M):** local-first writes; UUIDv7; idempotent outbox; backoff/cap; LWW (reject for approvals/auth); WAL mode; R2 media refs; version-based migrations; sync-status UI; background sync on foreground; draft-save per form.
- **Cross-cutting (M):** empty/loading/error/offline state on every screen; uniform localized error UX; audit log on all mutations; soft-delete/void; master-data import (seed sites/materials/people).

## 8. The build plan — Contracts-Pack first, then 3 ordered prompts
1. **Prompt 0 — Contracts Pack (generate, hand-edit, FREEZE before anything else).** The shared package: enums (§2), DTO/zod types, `OrgConfig` (§6), Drizzle DB schema + RLS policies (§3 + §1), REST API contract + error envelope, and `AuthClient`/`RecordsClient`/`SyncClient` interfaces. **Nothing else is written until this is locked. Frozen verbatim into every later prompt.**
2. **Prompt 1 — Backend** (NestJS + Drizzle + RLS + auth + RBAC guards + endpoints + seed script). References Prompt 0 verbatim.
3. **Prompt 2 — Frontend engine** (mock + rest adapters; outbox/sync state machine; expo-sqlite + WAL + migrations; i18n; config loader; shared UI states; `can()`). References Prompt 0.
4. **Prompt 3 — Frontend screens** (Expo Router per-role routes; "Today" end-of-day hub; kiosk; dashboards; capture; export). Built on engine + **mock adapter first**, then rest. *(Split by role if too big — adapter boundary keeps them independent.)*

**Each prompt contains, in order:** role + global constraints (pinned conventions §1 as hard rules; "no stubs/TODOs in critical paths; follow stated defaults, don't invent") → **frozen Contracts Pack verbatim** → architecture & file tree (`/shared`, `/backend`, `/app`) → this prompt's scope + acceptance criteria → cross-cutting rules → definition-of-done + self-check ("echo the enum list & config schema you'll use before writing code") → output instructions (full files, dependency order, file-tree manifest).

## 9. Deliberately deferred to post-build polish
Brand-theming finesse, animations, PDF layout polish, vehicle types beyond the seeded 3, advanced charts, doc-expiry alerts, daily-digest push, 2nd-pass Hindi copy, Sentry dashboards, EAS store submission, backup/restore UX niceties. None block a working Phase-1 build.

## 10. Deliberately SKIPPED in Phase 1 (do not build)
GPS/biometric clock-in punch; BIM/estimation/BOQ/Gantt; in-app payments/payroll disbursement; real-time GPS telematics; real-time sockets/live chat; self-signup/OTP/in-app purchase; Redis/queues; server-side PDF (Puppeteer).

---
*This spec is the input to Prompt 0. Generate the Contracts Pack from §1–§6, freeze it, then run Prompts 1→3.*
