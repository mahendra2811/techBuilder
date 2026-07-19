# techBuilder — Page & Variant Matrix

> **Scope:** 5 field roles only — Worker, Driver, Supervisor, Accountant, Site Manager. **Owner is deferred** (will get its own pass later); wherever Owner shares a page with these 5, it is listed as a reserved future variant, not detailed.
> **Ground truth:** verified directly against current `web/src/app/**/page.tsx` + `web/src/components/screens/*.tsx` + `web/src/lib/nav.ts` (uncommitted post-frozen.10/11 build round, 2026-07-18). Supersedes the page/variant angle of `techBuilder-Role-Page-Section-Map.md` (that doc still has deep per-section prose and stays useful for that).
> **Dashboard rule (applied below):** a dashboard never renders full record lists — only KPI/insight tiles, briefs (top 1–2 rows), and links that redirect to the real page.

---

## 1. Total pages per role

| Role | Home route | Total pages | Nav items shown | Drill-down pages (not in nav) |
|---|---|---:|---:|---|
| Worker | `/worker` | 4 | 4 | — |
| Driver | `/driver` | 8 | 8 | — |
| Supervisor | `/supervisor` | 11 | 11 | — |
| Accountant | `/accountant` | 8 | 7 | `/accountant/verify` (opened from dashboard cards) |
| Site Manager | `/site-manager` | 19 | 16 | `/fleet/[id]`, `/fleet/driver/[id]`, `/people/[id]` |
| **Total (5 roles)** | | **50** | **46** | **4** |

---

## 2. Role-wise page index

### 2.1 Worker — 4 pages

| # | Page | Route | Backing component | Sections |
|---|---|---|---|---|
| 1 | Dashboard | `/worker` | `worker-dashboard-screen.tsx` | ID-card→Profile link, expense-requests summary+link, Khata card, Contacts |
| 2 | Complaints | `/worker/complaints` | `complaint-screen.tsx` (raise variant) | Raise form, my-complaints history |
| 3 | Expense | `/worker/expense` | `expense-request-screen.tsx` (`variant="worker"`) | New request form (capped, org backdate), my-requests history |
| 4 | Profile | `/worker/profile` | `profile-screen.tsx` (shared, no props) | Personal details, guardian, money-I've-taken |

### 2.2 Driver — 8 pages

| # | Page | Route | Backing component | Sections |
|---|---|---|---|---|
| 1 | Dashboard | `/driver` | `driver-dashboard-screen.tsx` | Vehicle identity card, 3 traffic-light day-log chips → link to Meter, pending-switch badge, Khata card, Contacts |
| 2 | Complaints | `/driver/complaints` | `complaint-screen.tsx` (raise variant) | Raise form, my-complaints history |
| 3 | Damage | `/driver/damage` | `driver-damage-screen.tsx` | Report-damage form (vehicle locked), 180-day damage timeline (own) |
| 4 | Expense | `/driver/expense` | `expense-request-screen.tsx` (`variant="driver"`) | New request form (capped, org backdate), my-requests history |
| 5 | Fuel | `/driver/fuel` | `driver-fuel-screen.tsx` | Vehicle locked, litres primary, "I paid" tick→optional amount, today-only, 7-day recent list |
| 6 | Meter | `/driver/meter` | `driver-meter-screen.tsx` | Start-of-day form, End-of-day form (unlocks after morning) |
| 7 | Vehicle | `/driver/vehicle` | `vehicle-switch-screen.tsx` + `requests-screen.tsx` (stacked) | Self-switch (log-only), needs-approval list, VEHICLE_SWITCH request form + history |
| 8 | Profile | `/driver/profile` | `profile-screen.tsx` (shared) | Same as Worker's |

### 2.3 Supervisor — 11 pages

| # | Page | Route | Backing component | Sections |
|---|---|---|---|---|
| 1 | Dashboard | `/supervisor` | `supervisor-dashboard-screen.tsx` | Khata card, approvals-pending (vehicle-change only), today's-progress banner, Contacts |
| 2 | Approvals | `/supervisor/approvals` | `approvals-screen.tsx` (`role="SUPERVISOR"`) | Requests list, decide only on VEHICLE_SWITCH |
| 3 | Complaints | `/supervisor/complaints` | `complaint-screen.tsx` (raise variant) | Raise form, my-complaints history |
| 4 | Damage | `/supervisor/damage` | `supervisor-damage-screen.tsx` | Report-damage form (vehicle select over crew), crew damage timeline |
| 5 | Diesel | `/supervisor/diesel` | `diesel-screen.tsx` | Stock-in-hand, "Buy stock" sub-page + lazy history, "Issue to vehicle" sub-page + lazy history |
| 6 | Expense | `/supervisor/expense` | `expense-request-screen.tsx` (`variant="supervisor"`) | New request form (**uncapped**, 1-day backdate), my-requests history |
| 7 | Materials | `/supervisor/materials` | `material-entry-screen.tsx` (`role="SUPERVISOR"`) | IN/CONSUME form (fixed site, "Other"+remark), lazy recent entries |
| 8 | People | `/supervisor/people` | `people-screen.tsx` (`role="SUPERVISOR"`) | Roster (view-only), add-member form, ID cards (view-only) |
| 9 | Progress | `/supervisor/progress` | `progress-screen.tsx` (`role="SUPERVISOR"`) | Entry form (site picker — see §5 gap), today's + earlier reports (eager) |
| 10 | Vehicle | `/supervisor/vehicle` | `supervisor-crew-vehicles-card.tsx` | Crew vehicle roster, "Allot to…" re-assignment (log-only) |
| 11 | Profile | `/supervisor/profile` | `profile-screen.tsx` (shared) | Same as Worker's |

### 2.4 Accountant — 8 pages

| # | Page | Route | Backing component | Sections |
|---|---|---|---|---|
| 1 | Dashboard | `/accountant` | `accountant-dashboard-screen.tsx` | 4 KPI tiles, Khata card, briefs (pending/unverified ×3) each linking onward |
| 2 | Approvals | `/accountant/approvals` | `approvals-screen.tsx` (`role="ACCOUNTANT"`) | Requests list, decide only on EXPENSE_ADD (approve = verify, one act) |
| 3 | Complaints | `/accountant/complaints` | `complaint-screen.tsx` (raise variant) | Raise form, my-complaints history |
| 4 | Diesel | `/accountant/diesel` | `accountant-diesel-screen.tsx` (`role="ACCOUNTANT"`) | Read-only: stock per site, purchases, issuances, 🚩 flags |
| 5 | Ledger (Khata) | `/accountant/ledger` | `khata-screen.tsx` (`role="ACCOUNTANT"`) | Give (work) · Receive (work) · **Give salary** · Who-holds-what |
| 6 | Profile | `/accountant/profile` | `profile-screen.tsx` (shared) | Same as Worker's |
| 7 | Vendors | `/accountant/vendors` | `vendors-screen.tsx` | Shop list, add-shop form, ledger + record-payment (detail) |
| 8 | Verify (no nav entry) | `/accountant/verify` | `accountant-verify-screen.tsx` | Full unverified-expense / cash-transfer / vendor-payment queues, Verify/Flag actions |

### 2.5 Site Manager — 19 pages

| # | Page | Route | Backing component | Sections |
|---|---|---|---|---|
| 1 | Dashboard | `/site-manager` | `owner-dashboard-screen.tsx` (`variant="SITE_MANAGER"`) | KPIs, approvals-pending, Khata card, Quick-actions grid (8 shortcuts) |
| 2 | Approvals | `/site-manager/approvals` | `approvals-screen.tsx` (`role="SITE_MANAGER"`) | Requests list, decides everything **except** EXPENSE_ADD |
| 3 | Complaints | `/site-manager/complaints` | `complaints-inbox-screen.tsx` (`role="SITE_MANAGER"`) | Inbox / Mine tabs, `#no` search, load-more, detail sub-page, raise-to-Owner form |
| 4 | Expense | `/site-manager/expense` | `expense-screen.tsx` (`role="SITE_MANAGER"`) | Direct-entry form (fixed site), category/subcategory, recent list |
| 5 | Fleet | `/site-manager/fleet` | `fleet-screen.tsx` (`role="SITE_MANAGER"`) | Vehicle list, add-vehicle (fixed site), vehicle-types list+add |
| 6 | Fleet detail | `/site-manager/fleet/[id]` | `vehicle-detail-screen.tsx` | Analytics, damage history+resolve, logs, fuel, diesel-match, trips, documents, reminders |
| 7 | Fleet driver detail | `/site-manager/fleet/driver/[id]` | `driver-detail-screen.tsx` | Driver logs/fuel/trips/expenses (read-only) |
| 8 | Fuel | `/site-manager/fuel` | hub → `fuel-screen.tsx` + `accountant-diesel-screen.tsx` (`role="SITE_MANAGER"`) | "Fuel entry" sub-page + "Fuel monitor" sub-page (same read-only view Accountant sees) |
| 9 | Insights | `/site-manager/insights` | `insights-screen.tsx` (`role="SITE_MANAGER"`) | Fixed site, day-presets, progress/expense/requests, period summary |
| 10 | Ledger (Khata) | `/site-manager/ledger` | `khata-screen.tsx` (`role="SITE_MANAGER"`) | Give (work) · Receive (work) · Who-holds-what (**no** Give-salary section) |
| 11 | Materials | `/site-manager/materials` | `materials-screen.tsx` (`role="SITE_MANAGER"`) | Material types (edit), Add material type, Material entry (shared with Supervisor) |
| 12 | People | `/site-manager/people` | `people-screen.tsx` (`role="SITE_MANAGER"`) | Logins (full lifecycle), Add-member form, Site-team ID cards |
| 13 | People detail | `/site-manager/people/[id]` | `person-insights-screen.tsx` | Day-collapsed progress/expense/requests, money-taken, reset-password |
| 14 | Profile | `/site-manager/profile` | `profile-screen.tsx` (shared) | Same as Worker's |
| 15 | Progress | `/site-manager/progress` | `progress-screen.tsx` (`role="SITE_MANAGER"`) | Fixed site, entry form, today's + earlier reports (both lazy) |
| 16 | Reports | `/site-manager/reports` | `reports-screen.tsx` | Window + section picker, download/email |
| 17 | Requests | `/site-manager/requests` | `requests-screen.tsx` (`role="SITE_MANAGER"`) | VEHICLE_SWITCH form, request history (lazy) |
| 18 | Settings | `/site-manager/settings` | `sm-settings-screen.tsx` | Limits, categories+subcategories, per-form field toggles, emergency contacts |
| 19 | Vendors | `/site-manager/vendors` | `vendors-screen.tsx` | Same shape as Accountant's |

---

## 3. Shared pages — variant matrix

*A "shared page" = one underlying screen component rendered for more than one role, with real behavioral differences. Owner's slot is shown as a reserved future variant where it exists in the same file, not detailed.*

### 3.1 Complaint — 2 variants in scope (Owner = 3rd, deferred)

| Variant | Roles | Component | What it does |
|---|---|---|---|
| **v1 — Raise** | Worker, Driver, Supervisor, Accountant | `complaint-screen.tsx` | Identical for all four: target toggle (Site Manager / Owner-private), text + up to 3 photos + disabled video hint, own history (`#no`, status, expand→text+attachments) |
| **v2 — Inbox** | Site Manager | `complaints-inbox-screen.tsx` (`role="SITE_MANAGER"`) | Inbox tab (raised to him) + Mine tab (his own, raised to Owner) + `#no` search + load-more(8) + detail sub-page + Resolve action |
| **v3 — Owner inbox** *(deferred)* | Owner | same file, `role="OWNER"` | Reserved — not detailed this pass |

### 3.2 Expense entry — 2 families (3 role behaviors)

| Family | Roles | Component | Cap / backdate | Booking |
|---|---|---|---|---|
| **Direct entry** | Site Manager | `expense-screen.tsx` (`role="SITE_MANAGER"`) | site-configured limit | Books immediately, then accountant-verified |
| **Request-only** | Worker | `expense-request-screen.tsx` (`variant="worker"`) | org cap + org backdate window | Always an EXPENSE_ADD request |
| **Request-only** | Driver | same, `variant="driver"` | org cap + org backdate window | Always an EXPENSE_ADD request |
| **Request-only** | Supervisor | same, `variant="supervisor"` | **no cap**, hard-coded 1-day backdate | Always an EXPENSE_ADD request, decided by Accountant |

> ⚠️ `expense-screen.tsx`'s type still lists `'SUPERVISOR'` as a valid role and has a dead `directLimitPaise` branch for it — no page mounts it that way anymore (Supervisor moved fully to the request-only form). Leftover code, not a live variant.

### 3.3 Approvals / Decide (`approvals-screen.tsx`, `role` prop)

| Role | Can decide | Notes |
|---|---|---|
| Site Manager | Everything **except** EXPENSE_ADD | Money is out of his loop entirely |
| Supervisor | **Only** VEHICLE_SWITCH, own crew | No money requests ever reach him |
| Accountant | **Only** EXPENSE_ADD | His Approve = the verify tick, one action |
| Owner *(deferred)* | Everything + verify/flag | Reserved — not detailed this pass |

### 3.4 Khata / money ledger — 2 components

| Component | Roles | Sections |
|---|---|---|
| `khata-screen.tsx` | Accountant | Give (work) · Receive (work) · **Give salary** · Who-holds-what |
| `khata-screen.tsx` | Site Manager | Give (work) · Receive (work) · Who-holds-what (no Give-salary) |
| `ledger-screen.tsx` | Owner *(deferred)* | Combined form + WORK/SALARY/PERSONAL tag + rollup — reserved |

### 3.5 Vendors / udhaar (`vendors-screen.tsx`, no role prop — server-scoped)

| Roles | Difference |
|---|---|
| Site Manager, Accountant | None — identical UI now; add-vendor form is unconditional for both (was hidden for Accountant before this round) |

### 3.6 Diesel & fuel — 4 distinct pieces (same theme, different write/read scope)

| Piece | Roles | Component | Read/Write |
|---|---|---|---|
| Bulk stock (Buy/Issue) | Supervisor | `diesel-screen.tsx` | Write |
| Diesel monitor | Accountant | `accountant-diesel-screen.tsx` (`role="ACCOUNTANT"`) | Read-only |
| Diesel monitor | Site Manager | same file, `role="SITE_MANAGER"`, mounted inside `/site-manager/fuel` | Read-only (identical view) |
| Per-vehicle fuel entry | Site Manager | `fuel-screen.tsx` (`role="SITE_MANAGER"`) | Write — inside `/site-manager/fuel` hub |
| Per-vehicle fuel entry | Driver | `driver-fuel-screen.tsx` | Write — vehicle locked, "I paid" tick pattern, today-only |

### 3.7 Damage reporting — 2 write variants + 1 read variant

| Variant | Role | Component | Scope |
|---|---|---|---|
| Own vehicle | Driver | `driver-damage-screen.tsx` | Vehicle locked to his own |
| Crew vehicle | Supervisor | `supervisor-damage-screen.tsx` | Vehicle select over his crew's vehicles |
| Read + resolve | Site Manager | embedded section in `vehicle-detail-screen.tsx` (`/site-manager/fleet/[id]`) | Not a dedicated page — part of Fleet detail |

### 3.8 Vehicle switch / allotment — 2 mechanisms

| Mechanism | Role | Component | Behavior |
|---|---|---|---|
| Self-switch + request | Driver | `vehicle-switch-screen.tsx` + `requests-screen.tsx` | Instant if allowed-type available, else VEHICLE_SWITCH request |
| Direct re-allotment | Supervisor | `supervisor-crew-vehicles-card.tsx` | Always log-only/auto-approved across his crew — no request path |

### 3.9 Materials — catalog vs entry

| Variant | Roles | Component | Notes |
|---|---|---|---|
| Catalog (types mgmt) | Site Manager *(+ Owner, deferred)* | `materials-screen.tsx` | List/add/edit material types |
| Entry (IN/CONSUME) | Supervisor | `material-entry-screen.tsx` (own page) | Fixed site, "Other"+remark |
| Entry (IN/CONSUME) | Site Manager *(+ Owner, deferred)* | same component, as a sub-page inside `materials-screen.tsx` | SM: fixed site · Owner: site picker (reserved) |

### 3.10 Progress reporting (`progress-screen.tsx`, `role` prop)

| Role | Site field | History lists |
|---|---|---|
| Site Manager | Fixed label (no picker) | Both lazy |
| Supervisor | Still a live `SitePicker` (see §5) | Both eager |

### 3.11 People / roster (`people-screen.tsx`, `role` prop)

| Role | Lifecycle actions | Drilldown links | Add-member |
|---|---|---|---|
| Site Manager | Deactivate, reset-password (reactivate = Owner-only) | Yes | Merged login+worker form, login optional |
| Supervisor | None (view-only roster) | No | Same merged form, login toggle hidden+forced ON |
| Owner *(deferred)* | Full incl. reactivate | Yes | Reserved |

### 3.12 Profile — single variant, no differences

`profile-screen.tsx`, no props — identical across **all 6 roles** (Worker/Driver/Supervisor/Accountant/Site Manager + Owner): personal details, guardian/emergency contact, "money I've taken." Purely data-driven, zero role branching in the file.

---

## 4. Dashboard convention check

Every dashboard below follows the rule: KPI tiles / briefs / links only — never a full record list.

| Role | Shows | Redirects to |
|---|---|---|
| Worker | ID card, request-status pills, Khata balance, Contacts | Expense, (Profile) |
| Driver | Vehicle identity, 3 traffic-light chips, Khata balance, Contacts | Meter |
| Supervisor | Khata balance, approvals-pending count, progress-filed banner, Contacts | Approvals |
| Accountant | 4 KPI tiles, Khata balance, 3 unverified-item briefs, diesel-flag brief | Approvals, Verify, Diesel |
| Site Manager | KPI grid, approvals-pending, Khata balance, 8-shortcut quick-actions grid | Everything below it |

---

## 5. Gaps found while verifying (not asked for — flagged since found in-file)

- **Supervisor's Progress page still shows a live `SitePicker`** (`progress-screen.tsx`) instead of the fixed-site label Site Manager's branch got in the same file — functionally harmless now (his scope is narrowed to one site server-side) but inconsistent UI treatment.
- **`expense-screen.tsx` carries dead code for a `'SUPERVISOR'` role** — type + a `directLimitPaise` branch that nothing mounts anymore (Supervisor moved to `expense-request-screen.tsx`).
- **Vendor wording regression**: `messages.en.ts` changed `"Shops"` → lowercase `"vendors"` in `VENDOR_UI`/`NAV_LABELS.vendors` — reads as an unfinished find-replace, should likely be capitalized `"Vendors"`.
