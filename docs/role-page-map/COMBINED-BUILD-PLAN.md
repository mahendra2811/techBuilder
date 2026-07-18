# Combined build plan — 5-role client-audit round (contracts `frozen.9` → `frozen.10`)

> **Status: 🚦 AWAITING CLIENT'S FINAL GO. Nothing builds until the user says yes.**
> Sources: [`driver/driver-role-updates.md`](driver/driver-role-updates.md) · [`supervisor/supervisor-role-updates.md`](supervisor/supervisor-role-updates.md) · [`accountant/accountant-role-updates.md`](accountant/accountant-role-updates.md) · [`site-manager/site-manager-role-updates.md`](site-manager/site-manager-role-updates.md) · tracker [`ROLE-AUDIT-TRACKER.md`](ROLE-AUDIT-TRACKER.md). Worker already shipped (frozen.9). Owner: cascade-only (no dedicated items).

---

## 1. Decisions locked with the client (2026-07-18)

| # | Question | Decision |
|---|---|---|
| 1 | Who decides supervisor above-limit expense | **Accountant + Owner override**; SM fully out of the supervisor-money loop |
| 2 | Missed (red) driver day-log entry | **Informational only** — no back-fill mechanism |
| 3 | New expense categories | **6 fixed enum categories + SM-created SUBcategories** (config) + new `expenses.subcategory` column |
| 4 | Complaint detail vs missing media (R2) | **Build now with attachment-count placeholders**; real images light up when R2 lands |
| 5 | Complaint ID format | **Numeric per-org counter `#101, #102…`** |
| 6 | Salary/Personal single category storage | **Always save as `SALARY`** (PERSONAL stays valid for old rows) |
| 7 | Accountant-added shops | **Attached to his site** (org-wide stays Owner-only) |
| 8 | Devco's 2-site SM vs one-SM-one-site | **New SM login for site 2**; existing SM keeps site 1 — expanded into the full canonical test layout, see §3a |
| 9 | Devco test-org structure + dev-login panel | **Client-specified §3a**: 1 owner · 2 sites · per site exactly 1 SM + 1 accountant · 2 supervisors per site (th1–th4) · 4 drivers + 4 workers each linked to exactly one supervisor · `/login` tap panel lists them all |

### Defaults I will apply (not asked — veto anything here before GO)

- **D1** Two-day date windows are enforced **server-side too** (supervisor backdate default 7 → 1; driver fuel = today only, no date field).
- **D2** Driver-dashboard chips: tapping a **yellow** chip opens that form (morning/evening form moves behind the chip); red/green chips are display-only.
- **D3** Driver dashboard keeps the khata card; the recent-fuel list moves to the new `/driver/fuel` page.
- **D4** Fuel "no money paid" case stores an explicit **`paidByDriver=false`** marker (amount NULL) so the accountant can tell "from store/khata" from a ₹0 typo.
- **D5** Supervisor vehicle allotment = direct action, **log-only + notification** to the SM and both affected drivers (mirrors the driver's allowed-type self-switch).
- **D6** Cross-site assignments (a crew driver's vehicle on another site) get **blocked at write time** once single-site lands.
- **D7** "Store attendance data for later": capture paths/tables stay intact — **UI-only removal** on the supervisor dashboard.
- **D8** Owner's ledger keeps the current combined form + tag toggle (frozen.9); only the **accountant** gets the 3-sub-page khata split. Owner's complaints inbox gets the same detail-sub-page + load-more as SM's (cascade), minus the raise form.
- **D9** Full-history pages filter by 7d/30d/custom date **and by person**.
- **D10** Who-holds-what for the accountant = **his site only**.
- **D11** SM complaints = two tabs: **Inbox** / **My complaints**.
- **D12** Per-form config hub v1 = **show/hide + required** toggles per known field, per form (behavior knobs later).
- **D13** Materials "Other": an auto-provisioned per-org **"Other" material** + new required-when-Other `material_txns.remark` column.
- **D14** People-list rows show the **phone number** (supervisor + SM asked to see mobiles); labour-master edit affordance = **pencil icon only**.

---

## 2. Contracts bump `frozen.10` — every schema/API change in ONE migration set

**DB (`shared/src/db/schema.ts` + migration 0005 + rls untouched):**
- `fuel_logs.amount_paise` → nullable; new `fuel_logs.paid_by_driver boolean NOT NULL DEFAULT false` (DRV-4/D4)
- `complaints.complaint_no int NOT NULL` + unique `(org_id, complaint_no)` (SUP-1; backfill by created_at, start 101)
- `material_txns.remark text NULL` (SUP-4/D13)
- `expenses.subcategory text NULL` (SM-2/decision 3)

**Enums/permissions (`shared/src/permissions.ts`, `enums.ts`):**
- `PERMISSIONS.SUPERVISOR` += `request.decide: OWN_CREW` (service narrows to `VEHICLE_SWITCH` only) (SUP-6)
- RBAC snapshot test updated.

**Config (`shared/src/config.ts`):**
- `expense.thBackdateDays` default 7 → **1** (supervisor two-day rule, D1) — jsonb backfill for orgs pinning the old value
- `expense.thDirectLimitPaise` **un-deprecated** as the supervisor limit default (site override already exists) (SUP-9)
- New `expense.subcategories: {key,parent,labelHi,labelEn,enabled}[]` (SM-2)
- New site-config `formsConfig` block — per-form field toggles (SM-2/D12)

**API (`shared/src/api.ts` — all additive):**
- `GET /cash-transfers` gains `tag`, `kind` query params (ACC-2)
- `GET /complaints` gains paging params (SM-1 load-more)
- Vehicle driver-assignment endpoint for the supervisor allotment (reuse the vehicles update route with a service branch — no new path if possible) (SUP-7)

**DTO:** `CreateFuelLogInput.amountPaise` optional + `paidByDriver`; `CreateExpense*/request payloads` gain optional `subcategory`; complaint domain type gains `complaintNo`; material-txn input gains `remark`.

## 3. Backend work (Fable)

1. **Money flow:** supervisor limit branch restored (below limit → direct-book + accountant verify; above → request routed to accountant as decider; Owner override; SM out) — approvals service decider rules + expense create path (SUP-9, decision 1).
2. **Supervisor decide (VEHICLE_SWITCH only)** — approvals service type-narrowing for role SUPERVISOR (SUP-6).
3. **Single-site scope:** narrow SUPERVISOR `loadScope` to `assignedSiteId`; SM screens' effective single site; write-time cross-site blocks (SUP-2/SM-4/D6).
4. **Complaint numbering** (max+1 in-tx, unique-index retry) + SM-as-raiser (target OWNER only) + paging (SUP-1/SM-1).
5. **Vendors:** ACCOUNTANT create branch, site-attached (ACC-1, decision 7).
6. **Rollup:** ACCOUNTANT allowed, site-scoped (ACC-3/D10).
7. **Fuel:** nullable amount + paidByDriver; driver date = today only (server-side) (DRV-4/D1).
8. **Materials:** remark column + per-org "Other" material provisioning (D13).
9. **Supervisor on-behalf:** damage raise for crew vehicles + direct driver↔vehicle assignment (crew-scoped, notify SM + drivers) (SUP-7/D5).
10. **Scripts/backfills (run on Neon):** complaint numbers · thBackdateDays jsonb · **devco restructure to the canonical test layout (§3a)** · "Other" material seed.

### 3a. Canonical devco test-org layout (client-specified 2026-07-18 — supersedes the narrow decision-8 answer)

One org, **2 sites**, with per-site staffing exactly:

| Login | Role | Site | Crew/link |
|---|---|---|---|
| `owner` | OWNER | both (org) | — |
| `sm1` | SITE_MANAGER | site 1 ONLY | — |
| `sm2` **(new)** | SITE_MANAGER | site 2 ONLY | — |
| `acct1` | ACCOUNTANT | site 1 ONLY | — |
| `acct2` **(new)** | ACCOUNTANT | site 2 ONLY | — |
| `th1`, `th2` | SUPERVISOR | site 1 (one crew each) | — |
| `th3`, `th4` **(new)** | SUPERVISOR | site 2 (one crew each) | — |
| `driver1`…`driver4` | DRIVER | via vehicle/crew | each in exactly ONE supervisor's crew |
| `worker1`…`worker4` | WORKER | via crew | each in exactly ONE supervisor's crew |

Structural rules (the onboarding model): every site has **exactly one SM and one accountant**; **one or more** supervisors, drivers, workers; every worker AND driver hangs under exactly one supervisor (crew). All passwords `changeme123`.

**Dev-login tap panel on `/login` must list this full set** (owner, sm1, sm2, acct1, acct2, th1–th4, driver1–4, worker1–4) so every role×site combination is one tap to test. Existing extra seeded users (worker5/6 etc.) stay but don't need panel slots.
11. **Integration tests:** new spec(s) covering every rule above (esp. supervisor decide-narrowing, money routing, single-site scope regressions, complaint numbering uniqueness).

## 4. Web work

**Foundations first (one Sonnet agent, sequential — everything else reuses these):**
- `SubPage` primitive — URL-stable in-page detail view + top back button (the vendors shop-detail pattern) → used by complaints, settings, khata, fleet, people.
- `LazyHistory` pattern — form-first; refresh/"show history" → last 30–50 → "view all" → full-history sub-page with 7d/30d/custom-date (+person, D9) filters.
- Load-more list (server paging) for inboxes.
- Dev-login tap panel on `/login` updated to the §3a roster (owner, sm1, sm2, acct1, acct2, th1–th4, driver1–4, worker1–4).

**Then 4 parallel Sonnet agents (disjoint files):**

| Agent | Scope |
|---|---|
| **Driver** | Dashboard: readings out, 3 traffic-light chips (yesterday-night/morning/evening; yellow opens form per D2), khata stays. New `/driver/fuel` (locked vehicle, litres+odometer, "I paid" tick → amount, today-only, receipt optional; recent-fuel list moves here). New `/driver/damage` (form + history). `/driver/vehicle` slims to switch. Nav update. |
| **Supervisor** | Diesel split (Buy stock / Issue) + 2-day dates + lazy histories + single-site stock. Materials: no site picker, 2-day dates, Other+remark, lazy recent. Progress/Expense: no site picker, 2-day dates, Other-category remark, two-tier limit branch, vendor-credit visible. People: no person-link, phones shown, ID cards read-only. Approvals: VEHICLE_SWITCH-only + decide buttons. Dashboard: crew card + dead insights strip removed. On-behalf: damage form + vehicle-allot UI. |
| **Accountant** | Khata → sub-pages: Give (work) / Receive (work) / Give salary (single category → SALARY) / Who-holds-what (rollup) — all with LazyHistory + full-history filters. Vendors: add-shop form enabled. |
| **SM (+Owner cascade)** | Complaints: raise-to-Owner form + Inbox/My-complaints tabs + detail SubPage (attachment placeholders per decision 4) + load-more — same detail/load-more applied to the Owner inbox. Settings sub-pages: categories+subcategories editor, limits, per-form config hub (D12). Khata sub-pages (reuse accountant framework). Fleet sub-pages. People sub-pages + pencil-only fix (D14). Single-site: remove pickers from insights/reports/etc. |

## 5. Gates & verification (Fable)

- `shared`+`backend` typecheck · backend unit + full integration vs live Neon · `web` build.
- Live devco walkthrough per role (each role's headline flows: driver fuel w/o amount, supervisor two-tier expense + vehicle-change decide, accountant 3-page khata + who-holds-what + add shop, SM complaint raise→Owner + detail sub-page, single-site checks: supervisor/SM see exactly one site).
- Backfills run + verified on Neon.
- Docs: role-page-map banner v3, `CLAUDE.md` §4, `PROJECT_AI_CONTEXT.md` §0 (frozen.10 entry), tracker flipped to ✅ built.

## 6. Out of scope (unchanged this round)

Real media display (R2 keys still needed from the user — placeholders only), LEAVE/MATERIAL request types, org-settings write endpoint, crews API surface, Owner-specific redesign.
