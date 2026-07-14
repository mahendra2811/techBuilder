# Round 2 — Supervisor + Accountant: Target Design (2026-07-12, refined same day)

> **Status: PLAN ONLY — nothing built yet.** Source: client (Owner-role) meeting 2026-07-12 + same-day refinement pass.
> This is the **developer spec** for Round 2: role model, money verification layer, flows, contracts impact (`frozen.8`), work orders (CW-0…CW-11), remaining questions.
> **Client-readable set:** `docs/client-plan/` — `finalPlan.md` (complete merged plan), `1stroundplan.md` (v1 as built), `2ndroundplan.md` (this round's changes), each with a diagram `*index.html`. Build-Readiness-Spec conventions still bind.

---

## 1 · The model in one paragraph

Six roles. **Supervisor** (renamed from Team Head) is the field boss of a crew of **workers + drivers** (each has exactly ONE supervisor; a supervisor sees only his own crew's requests). **Accountant** (new) is the company's money desk: **every money event — field request, SM direct expense, personal/salary give — must carry his VERIFIED tick**, and once approved+verified it is **immutable**. Insights/analytics belong to **SM + Owner only**; everyone else sees only their own data. **Attendance is removed from the app entirely.**

---

## 2 · Money system (the core rewire)

### 2.1 Request caps
| Role | Request cap | Direct entry |
|---|---|---|
| WORKER | ₹2,000 default (site-config) | ✗ |
| DRIVER | driver cap (site-config) | ✗ |
| SUPERVISOR | **NO CAP — any amount** (₹10k, ₹50k…) | ✗ ₹0 |
| SITE_MANAGER | — (doesn't request) | ✓ any amount, **every entry accountant-verified** (v1 ₹1L→request ladder REMOVED) |
| ACCOUNTANT | — | records money moves (give/take/vendor) |
| OWNER | — | ✓ anything |

### 2.2 The two-tick rule (approve ≠ verify)
Every money event carries TWO marks:
1. **APPROVED** — the decision. Accountant is the routine decider for field requests; **SM or Owner may also approve a request, but it still awaits the accountant's tick**.
2. **ACCOUNTANT-VERIFIED ✓** — the ledger truth ("money actually moved from X to Y"). Mandatory on EVERY money event: field requests, SM direct expenses, personal gives, vendor moves.

Rules:
- Approved + verified → **immutable** (no undo, no re-reject).
- Accountant can reject / red-flag anything pre-verification (incl. an SM direct expense). A flag is visible to **SM + Owner**; the **Owner decides the resolution** of a flagged/mismatched item.
- Nothing is auto-approved, ever.

### 2.3 Personal money (salary / personal draw)
- **Only three givers: OWNER, SITE_MANAGER, ACCOUNTANT.**
- Giver raises the claim ("gave ₹5,000 to person P on date D, tag SALARY | PERSONAL") → **accountant verifies** → entry appears in the **receiver's personal khata** with the tag.
- **Every user (worker/driver/supervisor/accountant/SM) has a "money I've taken" page**: date-wise list of only their own verified entries with tags. Only accountant-verified entries show.

### 2.4 Cash chain + vendor
Unchanged from the morning spec: Owner → Accountant (cash desk) → SM / workers / drivers; SM can also hand cash (client confirmed — three givers). Vendor **money-IN (RECEIPT)** + payments via accountant. Supervisor is **not** a cash node.

---

## 3 · Diesel (refined)

1. **Supervisor buys bulk stock** (e.g. 500 L) → stock purchase entry (stock balance = purchases − issues).
2. Supervisor **issues** per vehicle ("40 L to vehicle X") — one side.
3. That vehicle's **driver logs receipt** — other side.
4. **Accountant matches** (vehicle + business date + litres): match → VERIFIED (one event, not double-counted); mismatch or one side missing after EOD → 🚩 flag → **accountant verifies the facts, Owner approves the resolution**, SM + Owner see the flag.
5. Diesel averages/insights → **SM + Owner only** (driver only fills data).

---

## 4 · Materials (refined)

- **SM creates material types** (10–20: cement, sand kinds, …) each with a **per-type config (booleans)**: who fills what — supervisor-only logs / supervisor + driver picks / view-only for driver, etc.
- **Supervisor's entry = the FINAL record** (he is the accountable role). **Driver picks = data-purpose input only** (e.g. "7 trips of sand today").
- Where both sides exist, they are **matched → VERIFIED** (not double-counted). **Accountant reviews/finalizes**; mismatch → 🚩 visible to accountant + SM + Owner.

---

## 5 · Vehicles (switch + documents & reminders)

### 5.1 Switch (simplified)
- **Allowed vehicle type → NO request.** Driver just logs "changed to vehicle B" → notification/list entry for **Supervisor + SM**.
- **Non-allowed type → request** (decided by SM; supervisor notified). Supervisor now decides **nothing** (money or otherwise).

### 5.2 Documents & reminders (NEW — in this phase; was SUG-6 "phase 2")
- **Per-vehicle document vault:** insurance, PUC, RC, permit, fitness + any other PDF/photo — each doc stored with its **expiry date** and a note.
- **EMI dues** tracked per vehicle (amount + due day).
- **Reminders:** one-time (`remindDaysBefore` an expiry), **MONTHLY** (EMI) or **YEARLY** → fires a 🔔 notification to SM + Owner before the date.
- **Hard lockdown: upload + view = SM (own site) + Owner ONLY.** Accountant, supervisor, driver, worker must not see these documents or reminders exist (exclude from every read incl. notifications fan-out).
- ⚠️ PDF/photo storage needs **R2 keys** (same blocker as complaint media); dates + reminders + notifications work fully without files (graceful degrade, existing pattern). Due-check needs a **daily job** — backend has no scheduler today; use an in-process daily interval + lazy check on SM/Owner dashboard load.

---

## 6 · Complaint box (NEW feature)

- **Who can raise:** worker, driver, supervisor, accountant (all four).
- **Addressed to:** SITE_MANAGER (→ Owner automatically sees it too) or OWNER-only (private to Owner).
- **Content:** text + photos + video. Media budget ~**200–300 MB total** (video ~100–200 MB). ⚠️ **Hard dependency: real object storage (R2 keys) — currently absent.** Multipart/resumable upload needed at this size.

---

## 7 · Insights & data-visibility policy

| Audience | Gets |
|---|---|
| **SM + Owner** | ALL insights/analytics: vehicle & diesel averages (7/30/90d), money rollups, day/week/month totals, person drill-downs, flags |
| **ACCOUNTANT** | **Operational queue only** — pending list, approved/rejected today, his own give/take entries, **current cash-in-hand**. NO weekly/monthly analytics |
| **WORKER / DRIVER / SUPERVISOR** | Own entries, own requests, own history, own personal khata — nothing aggregated |

Supervisor request visibility: a supervisor sees **only his own crew's** requests (worker assigned to another supervisor is invisible to him). Flow: worker/driver → their supervisor (visibility) → SM (site visibility) + Accountant (decision + verification).

**Attendance: removed for every role** (comment out UI/nav; keep tables dormant).

---

## 8 · Contracts impact (`1.0.0-frozen.8`) — one bump, one migration

| Piece | Change |
|---|---|
| `enums.ts` | `ROLES`: rename `TEAM_HEAD→SUPERVISOR`, add `ACCOUNTANT`. New: `MONEY_TAGS = ['WORK','SALARY','PERSONAL']`; `COMPLAINT_TARGETS = ['OWNER','SITE_MANAGER']`; `VEHICLE_DOC_KINDS += 'OTHER'` (RC/INSURANCE/PUC/FITNESS/PERMIT exist); `NOTIFICATION_TYPES += 'VEHICLE_DOC_DUE'`; `REMINDER_KINDS = ['EXPIRY','EMI','CUSTOM']` + `REMINDER_RECURRENCES = ['ONCE','MONTHLY','YEARLY']`; fuel/material match reuses `PENDING/CONFIRMED/MISMATCH` |
| `permissions.ts` | `SUPERVISOR` row (no money actions); `ACCOUNTANT` row (`request.decide: ORG` money-only, verify writes, `wage.view: ORG`, `report.export: ORG` financial) |
| `db/schema.ts` | `people += guardian_name, guardian_phone` · **verification cols** on `expenses` + `approval_requests` + `cash_transfers`: `verifiedBy uuid, verifiedAt timestamptz, flagged boolean` · `cash_transfers += tag` (WORK/SALARY/PERSONAL) · new `fuel_stock_purchases` (siteId, litres, amountPaise, purchasedBy, businessDate) · new `fuel_issuances` (siteId, vehicleId, litres, issuedBy, businessDate, status, matchedFuelLogId) · `fuel_logs += status, matchedIssuanceId` · `vendor_payments += kind (PAYMENT\|RECEIPT)` · `materials += config jsonb` (per-type booleans) · `material_txns += enteredRole, finalized boolean` (driver pick vs supervisor final) · new `complaints` (raisedBy, target, siteId, text, mediaIds, status) · new `vehicle_documents` (vehicleId, kind, title, mediaId?, expiryDate?, note) · new `vehicle_reminders` (vehicleId, documentId?, label, kind, dueDate, recurrence, remindDaysBefore, active) — all new tables in `TENANT_TABLES` + `rls.sql` |
| `dto/domain` | FuelStock/Issuance/MatchFlag, MyMoney (tagged), MaterialTypeConfig, Complaint, AccountantQueue types |
| `api.ts` | materials CRUD+config · fuelStockPurchase/issuance/matchFlags · verify endpoints (`POST /expenses/:id/verify`, `/approvals/:id/verify`, `/cash-transfers/:id/verify`) · myMoney · complaints CRUD · accountant queue · vehicleDocs CRUD + vehicleReminders CRUD (guarded `vehicle.manage`, SM/Owner-only reads) |
| Migration | `ALTER TYPE role RENAME VALUE 'TEAM_HEAD' TO 'SUPERVISOR'` before code deploy; run with `DATABASE_URL_ADMIN` (known drizzle-kit gotcha) |

Server-side rules (not schema): supervisor cap-check skipped (no cap); approve-then-immutable guard; verify-only-by-ACCOUNTANT (Owner override); three-giver rule on tagged cash transfers; attendance routes gated off.

---

## 9 · Work orders (dependency-ordered)

| WO | What | Model | Depends |
|---|---|---|---|
| **CW-0** | Contracts `frozen.8` + migration (§8) | Fable/Opus, solo, FIRST | — |
| **CW-1** | Rename sweep: `TEAM_HEAD` literals, `/team-head`→`/supervisor` + redirects, i18n (सुपरवाइज़र), seeds, fixtures | Sonnet | CW-0 |
| **CW-2** | **Money rewire + verification layer**: two-tick statuses, immutable-after-approve, supervisor no-cap, SM ladder removal (direct any + mandatory verify), personal-money three-giver flow with tags, drivers-in-crews scope, crew-visibility filter. Integration tests re-prove every path | Fable/Opus | CW-0 |
| **CW-3** | Accountant surface: layout/nav, **operational queue** (pending / today's decided / cash-in-hand / own entries — NO analytics), verify actions, ledger, vendors | Sonnet | CW-1, CW-2 |
| **CW-4** | Guardian/ID card (unchanged from morning spec) | Sonnet | CW-0 |
| **CW-5** | Diesel: bulk stock purchases + issuance + matcher (pure fn + fixtures) + flag surfacing (accountant/SM/owner) | Opus core + Sonnet UI | CW-0, CW-2 |
| **CW-6** | Vendor money-IN (`kind`) + ledger math + UI | Sonnet | CW-0 |
| **CW-7** | **"Money I've taken" page** (tagged personal khata, verified-only entries) on every role's surface | Sonnet | CW-2 |
| **CW-8** | Materials v2: catalog + per-type config editor (SM) + supervisor final entry + driver pick + match/review | Sonnet | CW-0 |
| **CW-9** | Vehicle-switch simplification (allowed = log+notify supervisor/SM; request only for non-allowed) + **attendance removal** (all roles) + insights lockdown (SM/Owner only) | Sonnet | CW-1 |
| **CW-10** | **Complaint box** (4 roles → SM+Owner / Owner-only; photos+video) — ⚠️ video path **blocked on R2 keys**; ship text+photos degrade-first | Sonnet | CW-0 |
| **CW-12** | **Vehicle documents & reminders** (§5.2): vault CRUD + reminders + daily due-check → `VEHICLE_DOC_DUE` notifications + SM/Owner-only lockdown (excluded from every other role's reads). File upload degrades gracefully without R2 (dates/reminders fully functional) | Sonnet | CW-0 |
| **CW-11** | Final audit + gate: visibility matrix asserted (sealed-box integration tests: crew-scoped supervisor, accountant no-insights, immutability, three-giver rule, **vehicle-docs invisible to accountant/supervisor/driver/worker**), full suite + web build + per-role click-through | Fable/Opus, LAST | all |

Batching as before: CW-1/4/6/8/9/10/12 parallel Sonnet (disjoint folders); CW-2 and CW-5-core solo first; orchestrator owns `app.module.ts`/`nav.ts` + central gates.

---

## 10 · Client answers received (this refinement pass)

| Was | Now decided |
|---|---|
| Q2/Q3 SM ladder | **Removed** — SM books direct (any amount), accountant verifies every entry; can reject/flag pre-verification |
| Q4 supervisor decides vehicle switch | **No** — allowed-type switch needs no decision at all; non-allowed → SM |
| Q5 supervisor cap | **No cap** — any amount |
| Q7 who hands cash | Owner, SM, Accountant — all three (via accountant verification) |
| Q9 receiver acknowledgment | Covered by the "money I've taken" page (verified entries visible to the taker) |
| Attendance | **Removed entirely, every role** |

## 11 · Still open

| # | Question | Default |
|---|---|---|
| Q1 | Accountant org-wide or per-site? | Org-wide |
| Q6 | Diesel match exact litres or ±1–2 L? | Exact |
| Q8 | Existing Team Heads become Supervisors in place? | Yes |
| Q10 | Balance ₹200, request ₹500 — block or allow-minus? | Allow, show minus |
| Q11/Q12 | WhatsApp digest / budget alert | Not built until yes |
| NEW | Complaint video size cap + retention (needs R2 budget) | 200 MB video / 300 MB total, 90-day retention |
