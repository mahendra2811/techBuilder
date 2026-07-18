# techBuilder — Role × Page × Section × Subsection Map

> **Purpose:** a complete, code-grounded inventory of every page each of the 5 roles sees in the `web/` portal, and — inside each page — every section and subsection and what it actually contains. Built to answer one question: *"which page has which section, and which section has which subsection/fields"* — so the next build phase can be planned against a full picture instead of guesswork.
>
> **How this was built:** 6 parallel code-reading agents (one per role), each reading the actual current route files (`web/src/app/<role>/**/page.tsx`) and their backing screen components (`web/src/components/screens/*.tsx`), cross-checked against `web/src/lib/nav.ts` and `shared/src/permissions.ts`. **`docs/CODEBASE-INDEX.md`'s route table was deliberately NOT used as the source** — it predates the Round-2 Supervisor/Accountant build and is missing several current routes/screens.
>
> **Snapshot date:** 2026-07-18, branch `main`, commit `716be0a4123d`. Pages get added/changed — re-audit if this drifts.
>
> ### ⚡⚡ 2026-07-18 EVENING update (contracts `frozen.10` — the 5-role client-audit round)
> A second, larger delta shipped the same day (as-built record: [`COMBINED-BUILD-PLAN.md`](COMBINED-BUILD-PLAN.md); per-role specs in `driver/`, `supervisor/`, `accountant/`, `site-manager/`). Headlines vs the map below: driver dashboard = traffic-light day-log chips (readings gone) + new `/driver/fuel` + `/driver/damage` pages (vehicle page = switch-only); supervisor = single-site everywhere, diesel Buy/Issue sub-pages, "Other" material + remark, 1-day dates, decides crew VEHICLE_SWITCH, crew-vehicles allot card, crew/attendance card removed; accountant+SM ledger route = the new khata hub (Give/Receive/Give-salary/Who-holds-what + lazy filterable histories; `ledger-screen` is Owner-only); complaints = per-org `#101…` numbers + detail sub-pages + load-more on SM/Owner inboxes + SM raises to Owner; SM settings/fleet/people = sub-pages + subcategory manager + form-config hub; money rule = accountant (+Owner) decides ALL money requests, SM out. Dev-login roster: 17 logins across both sites.
>
> ### ⚡ 2026-07-18 update (contracts `frozen.9`, applied AFTER the snapshot below)
> The same day this map was written, a worker-feedback round shipped. **The per-role breakdowns and table below predate it** — apply these deltas when reading:
> 1. **New `/{role}/profile` page for ALL 6 roles** (nav item "Profile / प्रोफ़ाइल", last in every nav). Sections: Personal details (name, role badge, username, site, phone) · Guardian/emergency contact (shown only when a labour-master person is linked; **one-time self-add form** via new `PATCH /me/guardian` when both fields empty, read-only + "ask your SM" hint after) · Money I've taken (always-expanded list, `GET /me/money`).
> 2. **"Money I've taken" (`MyMoneyCard`) removed from all 5 dashboards** (worker/driver/supervisor/accountant/SM) — it lives only on the Profile page now.
> 3. **Worker dashboard "My card" is now compact** — icon + name + role badge only, the whole card links to `/worker/profile` (site/mobile/guardian moved there).
> 4. **Person detail (`/{owner,site-manager}/people/[id]`) gained a "Money taken" section** — new `GET /users/:id/money` (Owner any · SM/Accountant site-scoped).
> 5. **Complaint history is an accordion** (all 4 raiser roles): collapsed = `#shortid` + status + date only; text/target/attachments visible only when expanded.
> 6. **Expense-request history is an accordion** (worker + driver): collapsed = amount + date + status + two-tick badge; expanded = category, paid-via (+shop name), attachment count, remark, rejection comment.
> 7. **Ledger form (Owner + Accountant) gained a Work/Salary/Personal tag picker** — salary/personal forces GIVE; history rows show the tag badge. The Accountant's stale "coming soon" empty-state was removed (his give/return form works). This is the UI that writes the Profile money entries (accountant auto-verified; owner's entries need the accountant's tick).
> 8. **Worker/driver expense-request backdate window: today + yesterday only** (`requestBackdateDays` default 2 → 1).
> These deltas also close three of the Part-3 gaps: the accountant ledger "coming soon" gap, "no UI sends a SALARY/PERSONAL tag", and (partially) the worker's no-guardian-edit gap.
>
> **Not covered (non-role-specific system routes):** `/` (role router/redirect), `/login` (+ dev tap-panel), `/change-password`, `/api/auth/*`, `/api/proxy/[...path]`, `/dev/rbac-matrix` (dev-only). These exist but aren't part of any role's "app" — see the Appendix.
>
> **Structure:** Part 1 = per-role narrative (pages → sections → subsections → contents, plus each role's own observed gaps). Part 2 = the same information flattened into one table. Part 3 = cross-cutting gaps that showed up in more than one role's audit.

---

## Quick summary

| Role | Home | Total pages | Nav items visible |
|---|---|---|---|
| OWNER | `/owner` | 16 | 12 |
| SITE_MANAGER | `/site-manager` | 19 | 16 |
| SUPERVISOR | `/supervisor` | 10 | 10 |
| ACCOUNTANT | `/accountant` | 6 | 6 |
| DRIVER | `/driver` | 5 | 5 |
| WORKER | `/worker` | 4 | 4 |
| **Total** | | **60** | |

(Counts include the frozen.9 `/{role}/profile` page added 2026-07-18 — see the update banner above. +4 non-role-specific routes — see Appendix.)

---

# Part 1 — Per-role breakdown

## 1. OWNER (`/owner`)

**Total pages:** 15

### Global chrome
- `web/src/app/owner/layout.tsx` calls `requireRole('OWNER')` then wraps every owner page in `RoleShell` (`web/src/components/role-shell.tsx`).
- Sticky header: org name, a role badge, "logged in as {user.name}", a locale toggle (हि/EN — `locale-toggle.tsx`), and a logout button (`logout-button.tsx`).
- Below the header: `RoleNav` (`web/src/components/role-nav.tsx`) — a horizontally-scrollable pill nav built from `navItemsFor('OWNER', …)` in `web/src/lib/nav.ts`, filtered by `can(role, action)` against the frozen RBAC matrix (`shared/src/permissions.ts`). The OWNER nav bar shows, in order: **Dashboard, Approvals, People, Sites, Fleet, Reports, Settings, Insights, Ledger, Materials, Complaints** (11 items — Expense/Progress/Vehicle-Fuel/Requests/Vendors are hidden for OWNER since he can't submit records/requests, and Vendors is SM/Accountant-only).
- The remaining 4 owner pages (site detail, person detail, vehicle detail, driver detail) are reached only via in-page links (site/person/vehicle rows, "view driver" link), not via the nav bar.

### Pages

#### 1. Dashboard — `/owner` (`owner/page.tsx` → `owner-dashboard-screen.tsx`, default `variant='OWNER'`)
- **Section: Window toggle** — Today/7d/30d (`owner/window-toggle.tsx`); drives the KPI/cost-rollup window (KPIs' "today" fields stay pinned to today regardless).
- **Section: KPI grid** — 6 stat cards: headcount today, spend today (₹), active sites, vehicles active today, open issues, pending approvals. Static skeleton while loading.
- **Section: My cash khata** (`khata-card.tsx`) — hidden-by-default (eye toggle) balance (received − given − approved cash expenses, red if negative) + received/spent/given breakdown; refresh icon once revealed.
- **Section: Approvals-pending callout** (`dashboard/approvals-pending-card.tsx`) — renders only when `pendingApprovals > 0`; links to `/owner/approvals`.
- **Section: Diesel check** (`fuel-flags-card.tsx`) — hidden-by-default 🚩 list of fuel-match mismatches/pending-side rows (date, vehicle regNo, issued vs received litres, status chip) over a trailing 30-day window.
- **Section: Insights link card** — one-line teaser row linking to `/owner/insights`.
- **Section: Completeness** — per-site list: name+code, "N marked" today, a 7-day dot row, today's state badge, chevron; each row links to `/owner/sites/[id]` (owner-only drill-in).
- **Section: Cost rollup** — Subsection "cost by site" (site name → ₹ total) and Subsection "cost by vehicle" (regNo → ₹ total); empty state if both are zero.
- **Section: WhatsApp digest** — collapsed by default; once opened, a plain-text preview of the daily digest + "Share via WhatsApp" link + "Copy" button + refresh icon + copy success/fail notices.
- **Not shown for OWNER:** `MyMoneyCard`, `QuickActions`, `ContactPanel` — these render only on the Site-Manager variant of this same screen.

#### 2. Sites list — `/owner/sites` (`owner/sites/page.tsx` → `owner-sites-screen.tsx`)
- **Section: Sites list** (one Card) — header + a list of every site: name, code, today's completeness badge, chevron; each row links to `/owner/sites/[id]`. Loading/error/empty states.

#### 3. Site detail — `/owner/sites/[id]` (`owner/sites/[id]/page.tsx` → `site-detail-screen.tsx`)
- **Section: Back link** to `/owner/sites`.
- **Section: Site header card**
  - Subsection: title (site name + code).
  - Subsection: window toggle 7d/30d.
  - Subsection: 4 tabs (Attendance / Expenses / Progress / Fuel).
  - Subsection: **Attendance tab** — person name, status + OT hours, business date + "marked by {user}", audit chip if corrected.
  - Subsection: **Expenses tab** — category + bill no., ₹ amount, business date + "entered by {user}", VOID badge if voided, audit chip.
  - Subsection: **Progress tab** — free-text note (wraps), business date + entered-by, audit chip.
  - Subsection: **Fuel tab** — vehicle regNo, litres, ₹ amount, business date + odometer reading, audit chip (client-filtered to vehicles assigned to this site — fuel has no siteId).
  - Entirely **read-only** — no edit/void actions anywhere.

#### 4. Approvals — `/owner/approvals` (`owner/approvals/page.tsx` → `approvals-screen.tsx`, `role="OWNER"`)
- **Section: Filter/header card**
  - Subsection: status filter tabs (PENDING/APPROVED/REJECTED/ALL).
  - Subsection: **owner-only site tabs** (ALL + one tab per site), derived client-side from `payload.siteId`/requester's site.
  - Subsection: conflict/server-error notices.
- **Section: Requests list** (accordion, `ShowMore` 10) —
  - Subsection: collapsed row — type label, status badge, ✓Verified/🚩Flagged badge (decided EXPENSE_ADD only), requester + one-line payload summary + timestamp, chevron.
  - Subsection: decided-row footer — decided-by + timestamp + comment.
  - Subsection: **verify/flag actions** — OWNER may Verify (✓) or Flag (🚩, required note) any APPROVED EXPENSE_ADD not yet ticked.
  - Subsection: expanded payload (pending only) — type-specific `PayloadSummary` + "your own request" note.
  - Subsection: **decide form** — category-override select (EXPENSE_ADD only), comment (required to reject), Reject/Approve buttons.

#### 5. People — `/owner/people` (`owner/people/page.tsx` → `people-screen.tsx`, `role="OWNER"`)
- **Section: Header card.**
- **Section: User list** (logins) — name, username + role, active/inactive badge; row links to `/owner/people/[id]`. Actions: **Deactivate** (any creatable role, not self), **Activate** (owner-only), **Reset password** (reveals a fresh temp password once).
- **Section: Create login form** — role select (`CREATABLE_ROLES.OWNER` = SM/Supervisor/Driver/Worker/Accountant), name, username, phone, site select (optional for Owner), "link to labour-master person" select.
- **Section: Create person (labour master) form** — name, skill select, default daily wage (₹), phone.
- **Section: Labour master / ID-card list** (`ShowMore`, 10) — name, skill + mobile, guardian name + phone; **Edit ID card** (Owner/SM only) → inline form.

#### 6. Person detail — `/owner/people/[id]` (`owner/people/[id]/page.tsx` → `person-insights-screen.tsx`, `role="OWNER"`)
- **Section: Back link.**
- **Section: Header card** — person's name; `DatePresets` chips; **Reset password** action.
- **Section: ID card** (if linked) — mobile/guardian read view; **Edit** (Owner/SM) → inline form.
- **Section: Totals for period** — total spend, per-category ₹ chips, progress/no-progress day counts, request status counts.
- **Section: Day-by-day** (`ShowMore`, 7) — each day collapses to a header row, expands to Progress/Expense/Request lists.

#### 7. Fleet — `/owner/fleet` (`owner/fleet/page.tsx` → `fleet-screen.tsx`, `role="OWNER"`)
- **Section: Header card.**
- **Section: Vehicle list** — regNo + name, status badge, vehicle-type + tracking mode, assigned site, assigned driver; links to `/owner/fleet/[id]`.
- **Section: Add vehicle form** — regNo, name, vehicle-type select, site select (optional for Owner), driver select, status select.
- **Section: Vehicle types list** — name + tracking mode per type.
- **Section: Add vehicle-type form** — type name, tracking-mode select.

#### 8. Vehicle detail — `/owner/fleet/[id]` (`owner/fleet/[id]/page.tsx` → `vehicle-detail-screen.tsx`)
- **Section: Back link.**
- **Section: Vehicle header card**
  - Subsection: title (regNo + name) + current driver + "view driver" link.
  - Subsection: **Analytics** — avg run/day 7/30/90d, fuel litres+₹ 30d, monthly cost, total cost.
  - Subsection: **Damage history** — severity + status badges, description, raised/resolved/closed notes; inline resolve form on OPEN issues (Owner/SM).
  - Subsection: **Vehicle logs** — date, start→end odometer, note.
  - Subsection: **Fuel** — date, litres, ₹ amount.
  - Subsection: **Diesel match** — per business-date issued vs received litres + status chip.
  - Subsection: **Trips** — from→to text, date, purpose.
  - Subsection: **Documents** (CW-12, SM+Owner only) — kind badge, title, expiry (highlighted if ≤30 days), note, file marker, Delete + add-document form.
  - Subsection: **Reminders** (CW-12, SM+Owner only) — kind badge, label, due date + recurrence + remind-days, active toggle, Delete + add form / "EMI (monthly)" preset button.

#### 9. Driver detail — `/owner/fleet/driver/[id]` (`owner/fleet/driver/[id]/page.tsx` → `driver-detail-screen.tsx`)
- **Section: Back link.**
- **Section: Driver header card** — name, phone, currently-assigned vehicle; **Logs** (date, start→end reading); **Fuel** (date, litres, ₹); **Trips** (from→to, date); **Expenses** (category + bill no., date, ₹). Entirely read-only.

#### 10. Ledger — `/owner/ledger` (`owner/ledger/page.tsx` → `ledger-screen.tsx`, `role="OWNER"`)
- **Section: Header card.**
- **Section: Give / receive-back money form** — kind toggle (Give/Return), recipient select (client-filtered to SM/Supervisor/Driver/Worker), amount (₹), date, note.
- **Section: Transfers history** (`ShowMore`, 10) — from → to, ₹ amount, kind chip, date, note.
- **Section: Money rollup** (Owner + SM only) — per-person balance (red if negative), received/given/spent totals, per-category ₹ chips.

#### 11. Insights — `/owner/insights` (`owner/insights/page.tsx` → `insights-screen.tsx`, `role="OWNER"`)
- **Section: Header/picker card** — `SitePicker` + `DatePresets`.
- **Single-day mode:** Progress (no-progress banner + list), Expenses (total-spend + list), Requests (list).
- **Period mode:** Period totals (`PeriodSummary`), Day-by-day list (`ShowMore`, 10; tap drills into single-day mode).

#### 12. Reports — `/owner/reports` (`owner/reports/page.tsx` → `reports-screen.tsx`)
- **Section: Single report-builder card**
  - Subsection: window toggle (Today/7d/30d/90d/custom) + custom from/to.
  - Subsection: **section picker** — grouped Money (Expenses/Money-khata/Vendors), Site (Attendance/Progress/Site-summary), Vehicles (Fleet), Other (Issues/People) — checkboxes with live row-count preview, select-all/clear-all.
  - Subsection: readiness/error notices.
  - Subsection: **delivery picker** (Download vs Email, email-flag-gated) — email input + validation.
  - Subsection: file-name preview.
  - Subsection: **Download** (client-built ExcelJS workbook) or **Send email** (`POST /exports/email`) button.

#### 13. Settings — `/owner/settings` (`owner/settings/page.tsx` → `settings-screen.tsx`)
- **Section: Header card** + read-only warning notice (no org-config PATCH endpoint exists).
- **Section: Brand** — org name, primary-color swatch + hex.
- **Section: Locale** — default locale, enabled-locales pills.
- **Section: Roles** — enabled-roles pills.
- **Section: Records** — enabled record-types pills.
- **Section: Features** — grid of 10 feature flags, each ON/OFF badge.
- **Section: Wage** — wage model, OT multiplier.
- **Section: Vehicle types** — list from DB, config fallback if empty.
- Every section is **read-only display** — zero forms/mutations on this page.

#### 14. Materials — `/owner/materials` (`owner/materials/page.tsx` → `materials-screen.tsx`, shared with SM)
- **Section: Header card.**
- **Section: Material types list** — name, unit, config badges ("Supervisor logs it"/"Driver can pick it"/"Driver view-only"); **Edit** → inline form (name + 3 toggles only — uom not editable after creation).
- **Section: Add material type form** — name, unit select, 3 config toggles.

#### 15. Complaints — `/owner/complaints` (`owner/complaints/page.tsx` → `complaints-inbox-screen.tsx`, `role="OWNER"`)
- **Section: Header/filter card** — status tabs (Open/Resolved/All); conflict/error notices.
- **Section: Complaints list** (`ShowMore`, 10) — raiser + target, status badge, **"Private to Owner" badge** (target=OWNER rows), text, timestamp, attachment count (no thumbnails), **Resolve** button (any OPEN complaint regardless of target).

### Observed gaps / thin spots (OWNER)
- **Reports: the Materials export section is unreachable from the UI.** `reports-screen.tsx` fully wires `SectionKey: 'material'` end-to-end, but the `GROUPS` array that renders the checkboxes never lists `'material'` — there is no checkbox to ever check it; it is permanently unselected dead code.
- **Reports: `buildMaterialSheet` never resolves a material name** — columns are date/site/txn-type/qty/uom/status/counterpart-site with no material-name lookup, even though the Materials catalog now exists.
- **Settings (`/owner/settings`) is 100% read-only** — no org-config update (PATCH) endpoint yet.
- **Materials catalog edit form cannot change the unit (uom)** once created — only name + toggles are editable.
- **Vehicle document uploads have no preview** — success shows only "File uploaded — no preview available yet."
- **Complaint/progress photo attachments show only a count, never thumbnails** — no media-read endpoint exists yet (R2 keys absent).
- **`VehicleDetail.expenses` is structurally always empty** and isn't even rendered — the `expenses` table has no `vehicleId` column; fuel is used as the cost signal instead.
- **Approvals' owner-only site tabs are derived client-side** (`payload.siteId` → requester's site → "Other" bucket) since `ApprovalRequest` has no `siteId` column — a workaround, not a real column.

---

## 2. SITE_MANAGER (`/site-manager`)

**Total pages:** 18

### Global chrome
- `RoleShell` wraps every page: header (org name, "Site Manager" role badge, user name, locale toggle, logout).
- SM nav order: Dashboard → Expense → Progress → Vehicle/Fuel → Requests → Approvals → People → Fleet → Reports → Insights → Ledger → Vendors → Settings (SM variant) → Materials → Complaints (inbox variant) — 15 nav entries. The 3 remaining SM routes (`fleet/[id]`, `fleet/driver/[id]`, `people/[id]`) are drill-downs, not nav items. SM does **not** see a "Sites" nav entry (no `site.manage` action).

### Pages

#### 1. Dashboard — `/site-manager` (`site-manager/page.tsx` → `owner-dashboard-screen.tsx` variant="SITE_MANAGER")
- **Section: Heading** — plain text, SM-variant only.
- **Section: Window toggle** — Today/7d/30d.
- **Section: KPI grid** — 6 stat tiles (headcount, spend today, active sites, vehicles active, open issues, pending approvals).
- **Section: My cash khata** (`KhataCard`) — collapsed balance + received/spent/given breakdown.
- **Section: Money I've taken** (`MyMoneyCard`, SM-only, not shown for Owner) — total + entries (date, amount, SALARY/PERSONAL tag, from, note, verified line).
- **Section: Approvals pending callout** — links to `/site-manager/approvals`, shown only if count > 0.
- **Section: Diesel check** (`FuelFlagsCard`) — 30-day mismatch/missing-side list, "All matched ✓" when empty.
- **Section: Insights link card.**
- **Section: Completeness** — per-site rows (plain divs, not links — site drill-in is Owner-only).
- **Section: Cost rollup** — cost-by-site / cost-by-vehicle lists.
- **Section: Quick actions** (SM-only) — Vehicle/Fuel, Reports shortcut tiles.
- **Section: WhatsApp digest of today** — collapsed; preview text, Share/Copy, refresh.
- **Section: Emergency & contacts** (SM-only) — SM/Supervisor tap-to-call rows + curated site emergency numbers.

#### 2. Approvals — `/site-manager/approvals` (`approvals-screen.tsx` role="SITE_MANAGER")
- **Section: Filter header** — Pending/Approved/Rejected/All tabs; conflict/error notices (no per-site tabs — Owner-only).
- **Section: Requests list** (`ShowMore`, 10, accordion) — collapsed row, decided-row footer, expanded decide form (never his own request; final-category override for EXPENSE_ADD, required-comment-on-reject, Reject/Approve). SM has **no verify/flag** actions (ACCOUNTANT/OWNER-only).

#### 3. Complaints — `/site-manager/complaints` (`complaints-inbox-screen.tsx` role="SITE_MANAGER")
- **Section: Filter header** — Open/Resolved/All tabs.
- **Section: Complaint list** (`ShowMore`, 10) — raiser + target, status, body, timestamp, attachment count only, "Mark resolved" for OPEN complaints targeted at SITE_MANAGER (server never sends OWNER-target rows to SM).

#### 4. Expense — `/site-manager/expense` (`expense-screen.tsx` role="SITE_MANAGER")
- **Section: Entry form card** — site picker + date field; `ExpenseForm` (category grid, amount, paid-via cash/credit+vendor, bill photo + 2 extra photos, remark, voice note, submit). **Note:** `directLimitPaise` hard-coded `undefined` for SM (only SUPERVISOR gets `0`) — no client-side over-limit hint ever shows.
- **Section: Recent expenses** (`RecentEntries`, last 7 days, site-scoped) — category+bill no., amount, date + entered-by.

#### 5. Fleet — `/site-manager/fleet` (`fleet-screen.tsx` role="SITE_MANAGER")
- **Section: Header card.** **Section: Vehicle list** (site-scoped). **Section: Add vehicle** (site **required** for SM). **Section: Vehicle types list.** **Section: Add vehicle type.**

#### 6. Fleet detail — `/site-manager/fleet/[id]` (`vehicle-detail-screen.tsx`)
- Same structure as Owner's vehicle detail: header, Analytics, Damage history, Vehicle logs, Fuel, Diesel match, Trips, Documents, Reminders (SM+Owner only). Analytics/total-expense cost is structurally always ₹0 (no `vehicleId` on `expenses`).

#### 7. Fleet driver detail — `/site-manager/fleet/driver/[id]` (`driver-detail-screen.tsx`)
- Header, Logs, Fuel, Trips, Driver expenses — same as Owner's variant.

#### 8. Insights — `/site-manager/insights` (`insights-screen.tsx` role="SITE_MANAGER")
- Same structure as Owner's Insights: header/picker, single-day Progress/Expenses/Requests, period-mode Period summary + Day-by-day list.

#### 9. Ledger — `/site-manager/ledger` (`ledger-screen.tsx` role="SITE_MANAGER")
- **Section: Header card.** **Section: Give/receive-back money form** — person select filtered to SUPERVISOR/DRIVER/WORKER. **Section: Transfers history.** **Section: Rollup** — SM sees this (Supervisor/Accountant do not).

#### 10. Materials — `/site-manager/materials` (`materials-screen.tsx`, shared with Owner)
- **Section: Header card.** **Section: Material types list** — name+unit, config badges, inline edit. **Section: Add material type form.** Catalog management ONLY — does not itself log transactions.

#### 11. People — `/site-manager/people` (`people-screen.tsx` role="SITE_MANAGER")
- **Section: Header card.**
- **Section: User (login) list** (`ShowMore`, 10) — deactivate/reset-password (confirm-tap); **activate is Owner-only** (SM never sees it).
- **Section: Create login form** — role select from `CREATABLE_ROLES['SITE_MANAGER']`, site select **required**, person-link select for WORKER/DRIVER.
- **Section: Create person (labour master) form** (SM+Owner only).
- **Section: Person list** ("Labour master / ID cards", `ShowMore`, 10) — Edit ID card (SM/Owner only).

#### 12. People detail — `/site-manager/people/[id]` (`person-insights-screen.tsx` role="SITE_MANAGER")
- Back link + header, `DatePresets`, `ResetPasswordAction`; **ID card** (edit SM/Owner only); **Totals**; **Days** (`ShowMore`, 7) — expands to Progress/Expense/Request lists (names outside SM's scope resolve to "unknown").

#### 13. Progress — `/site-manager/progress` (`progress-screen.tsx` role="SITE_MANAGER")
- **Section: Entry card** — site picker + date + "already covered today" info banner (never blocks) + `ProgressForm` (free text, up to 20 site photos, 4 bill photos, voice note).
- **Section: Today's reports.** **Section: History** (last 7 days grouped by date).

#### 14. Reports — `/site-manager/reports` (`reports-screen.tsx`, identical component to Owner's)
- Window + section picker, Readiness, Delivery (Download/Email), Output (file-name preview, Download/Send-email button).

#### 15. Requests — `/site-manager/requests` (`requests-screen.tsx` role="SITE_MANAGER")
- **Section: New request form** — only `VEHICLE_SWITCH` is active this phase (LEAVE/MATERIAL commented out).
- **Section: My requests** — SM's own submitted requests only.

#### 16. Settings — `/site-manager/settings` (`sm-settings-screen.tsx` — **not** `settings-screen.tsx`)
- **Section: Limits** — Worker/Driver request-cap override, Supervisor direct-limit override, SM's own limit shown read-only (Owner-only field, backend rejects if sent). *(Note: this SM limit is configured but not client-enforced in the Expense screen — see gaps.)*
- **Section: Categories** — per-category enable toggle + Hindi/English labels.
- **Section: Request-form fields** — 5 field-visibility toggles for the worker/driver expense-request form.
- **Section: Emergency contacts** — contact rows (kind, label, phone, remove) + Add-contact; separate save/`PATCH`. No site picker — assumes exactly one site.

#### 17. Vehicle (Fuel entry) — `/site-manager/vehicle` (`fuel-screen.tsx` role="SITE_MANAGER")
- **Section: Entry card** — vehicle picker, entry form (reading, litres, amount, date, receipt photo), recent fuel entries (last 7 days — **no diesel-match badge for SM**, that badge is `role === 'DRIVER'` only).

#### 18. Vendors — `/site-manager/vendors` (`vendors-screen.tsx`)
- **List view:** Header card, Shop list, Add shop form.
- **Detail view:** Back button, Ledger (4-stat row + month-wise breakdown), Record payment form (direction toggle, amount, date, note).

### Observed gaps / thin spots (SITE_MANAGER)
- **Direct expense entries lose extra attachments** — the direct-booking mutation keeps only ONE uploaded photo id even though the form accepts 1 bill + 2 extra photos; the rest upload but are never referenced anywhere.
- **No media-read/display endpoint anywhere** — attachments show a count only, never a thumbnail or voice-note player.
- **Vehicle detail has no real per-vehicle expense data** — `expenses` has no `vehicleId` column.
- **Materials page is catalog-only** — no SM-facing screen to enter/reconcile actual material transactions (that's Supervisor's, not in SM's nav) and no accountant/SM reconciliation screen for driver-picked vs. supervisor-logged mismatches.
- **Diesel-match status invisible on SM's own Vehicle/Fuel page** — only visible via the Fleet-detail "Diesel match" section.
- **Reports' Materials sheet has no material-name join.**
- **SM's own direct-expense limit is configured but not client-enforced** — `expense-screen.tsx` hard-codes `directLimitPaise = undefined` for SM.
- **Settings screen assumes a single site** — no site picker, always edits `sitesQ.data?.[0]`.

---

## 3. SUPERVISOR (`/supervisor`)

**Total pages:** 9

### Global chrome
- `RoleShell`: header (org name, "SUPERVISOR" badge, user name, locale toggle, logout).
- Nav (per RBAC: `user.create`/`record.enter`/`request.submit`/`view.all`, all scope `OWN_CREW`; no `request.decide`, `vehicleLog.enter`, `site.manage`, `vehicle.manage`, `wage.view`, `report.export`, `config.manage`): **Dashboard, Expense, Progress, Requests, Approvals (read-only variant), People, Materials (supervisor-entry variant), Diesel, Complaints** — 9 items. No vehicle/fuel, sites, fleet, reports, settings, insights, or ledger.

### Pages

#### 1. Dashboard — `/supervisor` (`supervisor-dashboard-screen.tsx`)
- **Section: Khata card** — collapsed cash balance + received/spent/given.
- **Section: My money card** — collapsed "Money I've taken" (SALARY/PERSONAL draws).
- **Section: Approvals-pending callout** — "N pending" link, shown only if count > 0 (client-computed nudge — he still can't decide anything).
- **Section: Site picker** — fixed row (1 site) or select.
- **Section: "Crew" card** — headcount summary (`onSite/total` + PRESENT/HALF_DAY/ABSENT/unmarked counts) from today's attendance vs. people list.
- **Section: "Today's progress" card** — single status banner ("done"/"pending"), no list.
- **Section: "Crew today" strip** — link to `/supervisor/insights` — **route does not exist**, 404s (see gaps).
- **Section: Contact panel** — his own Site Manager tap-to-call row + site emergency numbers.

#### 2. Approvals — `/supervisor/approvals` (`approvals-screen.tsx` role="SUPERVISOR")
- **Section: Filter/header card** — status tabs; (no site tabs — Owner-only); conflict/error notices largely dead for him.
- **Section: Requests list** — collapsed row, decided-row footer, expanded payload. **`canDecide()` is hard-coded `false` for SUPERVISOR** — no category-override/comment/Approve/Reject buttons ever render. Verify/flag also gated to ACCOUNTANT/OWNER only. Pure **read-only crew visibility.**

#### 3. Complaints — `/supervisor/complaints` (`complaint-screen.tsx`, raise-side, shared with WORKER/DRIVER/ACCOUNTANT)
- **Section: Complaint box form** — target picker (SM vs Owner-only-private), text, photos (max 3), disabled video hint, submit.
- **Section: My complaints list** (`ShowMore`, 5) — target, status, text, timestamp, attachment count.

#### 4. Diesel — `/supervisor/diesel` (`diesel-screen.tsx`)
- **Section: Page title/subtitle.**
- **Section: Stock-in-hand card** — per-site `purchased − issued` litres remaining.
- **Section: "Buy stock" form** — site picker, litres, amount ₹, date, note → `POST /fuel-stock/purchases`.
- **Section: "Issue to vehicle" form** — vehicle picker, litres, date, note → `POST /fuel-stock/issuances`.
- **Section: Recent issuances** (`ShowMore`, 7) — date/vehicle/note/litres + match-status pill (waiting/confirmed/mismatch).
- **Section: Recent purchases** (`ShowMore`, 7) — date/site/note/litres/₹.

#### 5. Expense — `/supervisor/expense` (`expense-screen.tsx` role="SUPERVISOR")
- **Section: "Expense" entry card** — site picker + date, category grid, amount (**`directLimitPaise=0` — ZERO direct authority, every entry routes as an EXPENSE_ADD request, always shows "over limit" warning**), paid-via selector, bill+extra photos, remark, voice note, submit (always behaves as "submit request" for him).
- **Section: Recent expenses list** (last 7 days).

#### 6. Materials — `/supervisor/materials` (`material-entry-screen.tsx` — the Supervisor-specific final-entry variant)
- **Section: "Material entry" form** — site+date, material select (only `config.supervisorLogs !== false` types), IN/CONSUME toggle, quantity + read-only UOM, submit → `POST /records/material-txn` stamped `enteredRole:'SUPERVISOR', finalized:true`.
- **Section: "Recent entries" list** (last 7 days).

#### 7. People — `/supervisor/people` (`people-screen.tsx` role="SUPERVISOR")
- **Section: Title card** (no content).
- **Section: User list** (`ShowMore`, 10) — rows are **plain text, no drilldown link** (person-insights is SM/Owner-only); **no deactivate/activate/reset-password actions at all** for SUPERVISOR.
- **Section: "Create login" form** — role picker limited to `['WORKER','DRIVER']`; **no site field** — auto-attaches to his own `crewId` with just a caption note; blocked entirely with a warning if he has no crew yet.
- **Section: Create Person (labour master) form** — **not rendered for SUPERVISOR.**
- **Section: "Labour master (ID cards)" list** — **Edit button hidden for SUPERVISOR** (view-only).

#### 8. Progress — `/supervisor/progress` (`progress-screen.tsx` role="SUPERVISOR")
- **Section: "Progress report" entry card** — site+date, "covered" info banner (never blocks), free-text (required unless photo), up to 20 site photos, 4 bill photos, voice note.
- **Section: "Today's reports" card.** **Section: "History" card** (last 7 days grouped).

#### 9. Requests — `/supervisor/requests` (`requests-screen.tsx` role="SUPERVISOR")
- **Section: "New request" form** — effectively single-type (`VEHICLE_SWITCH` only; LEAVE/MATERIAL phase-scoped off); vehicle select (often shows "no vehicles in scope" — he typically has no fleet), desired-type select, reason.
- **Section: "My requests" list** — own requests only.

### Observed gaps / thin spots (SUPERVISOR)
- **Dead link on the dashboard** — "crew today" strip links to `/supervisor/insights`, which doesn't exist; `nav.ts` role-filters insights to `['OWNER','SITE_MANAGER']` only. 404s for every Supervisor.
- **Approvals screen is fully decorative for decision-making** — `canDecide()` hard-coded `false`; large fraction of the shared component's decide/verify UI is unreachable for this role.
- **People screen: Supervisor's created users are dead-end rows** — no drill-down, no lifecycle management (deactivate/reactivate/reset-password) of anyone he creates.
- **No crews API surface anywhere** — no crew name, roster count, or member list beyond the flat People/user-list screen.
- **Expense screen always forces the request path** — `directLimitPaise=0` makes the "direct booking" code path permanently dead for him.
- **Requests screen is effectively single-purpose and can be a functional dead end** — only VEHICLE_SWITCH live, and he typically has zero fleet scope so the vehicle select is often empty with submit disabled.

---

## 4. ACCOUNTANT (`/accountant`)

**Total pages:** 5

### Global chrome
- `RoleShell` (`requireRole('ACCOUNTANT')`).
- Nav (per `request.decide`, `wage.view`, `report.export`, `view.all`, plus per-entry role allowlists): **Dashboard, Approvals, Ledger, Vendors, Complaints** — exactly 5 items, matching the 5 pages. **Reports and Insights are explicitly filtered out** despite the Accountant holding `report.export`/`view.all` — those nav entries are restricted to `roles: ['OWNER','SITE_MANAGER']`.

### Pages

#### 1. Dashboard — `/accountant` (`accountant-dashboard-screen.tsx`)
Data source: `GET /accountant/queue`, plus `GET /users`/`GET /vehicles` for name/reg-no resolution (both scope-gapped for this role — see gaps).
- **Section: KPI strip** — 4 cards: pending requests, awaiting-your-tick count, today's decided count, cash in hand.
- **Section: KhataCard** — masked balance toggle.
- **Section: MyMoneyCard** — collapsed "Money I've taken."
- **Section: Pending money requests** — top-5 list + "Go to Approvals →" link.
- **Section: Expenses awaiting your tick** — `VerifyRow` list, green Verify / red Flag(+note) → `POST /records/expense/:id/verify`.
- **Section: Cash transfers awaiting your tick** — same pattern → `POST /cash-transfers/:id/verify`.
- **Section: Vendor payments awaiting your tick** — same pattern → `POST /vendors/payments/:id/verify`.
- **Section: Diesel flags** — read-only mismatch list, vehicle regNo (falls back to shortened id — see gaps).

#### 2. Approvals — `/accountant/approvals` (`approvals-screen.tsx` role="ACCOUNTANT")
- **Section: Filters/header card** — status tabs (no site tabs); conflict/error notices.
- **Section: Requests list** — collapsed row, decided-row footer, verify/flag action block (any APPROVED EXPENSE_ADD nobody ticked), expanded decide form (only for `type==='EXPENSE_ADD'`, requester≠self, requester present in the — gapped — scoped `/users` list). For ACCOUNTANT, **approve IS the verify tick in one act.**
- **Known gap:** `GET /requests` has no ACCOUNTANT scope branch server-side — PENDING tab reads near-empty in practice; the dashboard's `/accountant/queue` is the reliable view.

#### 3. Complaints — `/accountant/complaints` (`complaint-screen.tsx`, raise-side — accountant never sees the inbox variant)
- **Section: Complaint box (raise form)** — target toggle, required text, up to 3 photos, disabled video hint, submit.
- **Section: My complaints** — own history, read-only.

#### 4. Ledger — `/accountant/ledger` (`ledger-screen.tsx` role="ACCOUNTANT")
- **Section: Header card.**
- **Section: Give/return-cash form** — **non-functional for ACCOUNTANT**: `GET /users` returns only himself (no ACCOUNTANT branch server-side), so `candidates` is always empty and the UI shows a "coming soon" EmptyState instead of the actual form, even though his rank would otherwise permit giving down to SM/Supervisor/Driver/Worker.
- **Section: Transfers history** — still works (his own transfers).
- **Section: Rollup — NOT rendered** for ACCOUNTANT (client-side guard + server 403).

#### 5. Vendors — `/accountant/vendors` (`vendors-screen.tsx`)
- **Section: Header card.**
- **Section: Shop list.**
- **Section: Add shop form — HIDDEN for ACCOUNTANT** (backend restricts vendor creation to OWNER/SITE_MANAGER).
- **Section: Vendor detail** — Ledger summary (4-stat + month-wise breakdown), Record-payment form (PAYMENT/RECEIPT toggle, amount, date, note — available to Accountant, auto-verified per the two-tick rule for his own entry).

### Observed gaps / thin spots (ACCOUNTANT)
- **Give/return-cash form is non-functional** on `/accountant/ledger` — `GET /users` has no ACCOUNTANT branch, so the recipient picker is always empty.
- **Same `GET /users` gap degrades name resolution everywhere** — dashboard/approvals fall back to shortened ids for requesters/parties.
- **`GET /vehicles` has no ACCOUNTANT branch either** — diesel-flag rows show a shortened vehicle id instead of the reg no.
- **No Reports/Excel-export screen variant**, despite holding `report.export` — explicitly called a "known follow-up" in `nav.ts`.
- **No analytics/insights access at all** — deliberate client decision, not just a gap.
- **`GET /requests` has no ACCOUNTANT scope branch** — same shape of gap as `/users`; the dashboard's separately-scoped `/accountant/queue` is the only reliable pending-request view.

---

## 5. DRIVER (`/driver`)

**Total pages:** 4

### Global chrome
- `RoleShell`: header (org name, "DRIVER" badge, user name, locale toggle, logout).
- Nav (per `vehicleLog.enter`/`request.submit`/`view.all`, all scope `OWN_VEHICLE`): **Dashboard, Vehicle/Fuel, Requests, Complaints** — 4 items. No Expense/Progress/Approvals/People/Sites/Fleet/Reports/Settings/Insights/Ledger/Vendors/Materials/Diesel.

### Pages

#### 1. Dashboard — `/driver` (`driver-dashboard-screen.tsx`)
- **Section: Vehicle snapshot** — reg no/name/status chip, current vs. yesterday reading, pending-switch chip.
- **Section: My cash khata** (`KhataCard`) — masked balance + received/spent/given.
- **Section: Money I've taken** (`MyMoneyCard`) — collapsed SALARY/PERSONAL draws list.
- **Section: Start/end-of-day vehicle log** — Morning form (compulsory: meter photo, start reading, up to 3 extra photos) + Evening form (optional, shown once morning exists: meter photo, end reading, hours worked, loads count, note).
- **Section: Recent fuel entries** (last 7 days).
- **Section: Contacts** — Site Manager + Supervisor tap-to-call rows, site emergency numbers.

#### 2. Complaints — `/driver/complaints` (`complaint-screen.tsx`)
- **Section: Complaint box (raise)** — target picker, required text, up to 3 photos, disabled video hint, submit.
- **Section: My complaints** — `ShowMore` (5), target/status/text/timestamp/photo-count.

#### 3. Requests — `/driver/requests` (`RequestsScreen role="DRIVER"` + `ExpenseRequestScreen variant="driver"`, stacked)
- **Section: New request (vehicle switch)** — vehicle select, desired-type select, reason (only allowed `ApprovalType` is VEHICLE_SWITCH).
- **Section: My requests** (generic, all types).
- **Section: Expense reimbursement request** — amount (validated against cap), date (backdate window), category picker, paid-via + shop selector, photos, remark, voice note.
- **Section: My expense requests** — amount/category/date + two-tick verified/flagged badge, rejection-reason notice.

#### 4. Vehicle — `/driver/vehicle` (`VehicleSwitchScreen` + `FuelScreen role="DRIVER"`, stacked)
- **Section: Switch vehicle** — log-only notice (instant switch if allowed-type vehicle exists) + other-vehicle list ("Switch now" instant vs. "Needs approval" deep link to Requests).
- **Section: Report vehicle damage** — severity select, required description, up to 4 photos, voice note.
- **Section: Damage history** (`DamageTimeline`) — last 180 days, raised→resolved→closed sub-timeline; inline "Add closing remark" appears only when RESOLVED and not yet closed.
- **Section: Fuel entry** (driver-specific copy) — vehicle display, entry form (reading, litres, amount, date, receipt photo), recent fuel list with a **driver-only** match-status badge.

### Observed gaps / thin spots (DRIVER)
- **Crew membership never explicitly surfaced** — carries `users.crewId` but no screen shows "your crew"/crew name; only an indirect signal via the Supervisor row in Contacts.
- **LEAVE and MATERIAL request types are dead code, not deleted** — Driver can currently only submit VEHICLE_SWITCH through the generic requests screen.
- **No assigned vehicle blocks the entire day-log workflow** with only a bare empty-state string, no CTA.
- **No withdraw/edit path for an OPEN damage report** — the closing-remark action only appears once RESOLVED.
- **"My requests" (generic) and "My expense requests" are two separate, unmerged lists** stacked on the same page.

---

## 6. WORKER (`/worker`)

**Total pages:** 3

### Global chrome
- `RoleShell`: header (org name, "Worker" badge, user name, locale toggle, logout).
- Nav (per `request.submit`/`view.all`, both scope `SELF`): **Dashboard, Requests, Complaints** — 3 items, the fewest of any role. No Expense/Progress/Vehicle-Fuel/Approvals/People/Sites/Fleet/Wages/Reports/Settings/Insights/Ledger/Vendors/Materials/Diesel.

### Pages

#### 1. Dashboard — `/worker` (`worker-dashboard-screen.tsx`)
- **Section: My card** — worker's own identity: name, role badge, assigned site, mobile, guardian name/phone if present. Read-only, from `GET /people` + `GET /sites`.
- **Section: My requests (summary)** — status-count pills (Pending/Approved/Rejected), last-3 list, "view all / raise a request" link to `/worker/requests`.
- **Section: My khata** (`KhataCard`) — masked balance + received/spent/given, read-only (no give/receive form here).
- **Section: Money I've taken** (`MyMoneyCard`) — collapsed total + entries list (accountant-verified SALARY/PERSONAL draws only).
- **Section: Emergency & contacts** — Site Manager/Supervisor tap-to-call rows + site emergency numbers.

#### 2. Complaints — `/worker/complaints` (`complaint-screen.tsx`)
- **Section: Complaint box** — target picker, required text, up to 3 photos, disabled video hint, submit.
- **Section: My complaints** — `ShowMore` (5), read-only history, no edit/withdraw, no resolution note shown even when RESOLVED.

#### 3. Requests — `/worker/requests` (`expense-request-screen.tsx` variant="worker")
- **Section: New expense request** — amount (validated against request cap), date select (backdate window), category picker, paid-via/vendor selector, photo field, remark field, voice note field, submit. Worker never books an expense directly — always creates an `EXPENSE_ADD` request.
- **Section: My expense requests** — unbounded list (no `ShowMore` cap): type, status, amount, category, date, two-tick badge once APPROVED, rejection comment if REJECTED. Read-only, no edit/cancel.

### Observed gaps / thin spots (WORKER)
- **`worker-dashboard-screen.tsx`'s own docstring is stale** — claims the dashboard shows "this month's attendance," but there's no `GET /attendance` call or attendance UI anywhere on the page.
- **Same docstring calls this screen "the ONLY worker screen"** — inaccurate since Round 2 added `/worker/complaints` and `/worker/requests` as full separate pages.
- **`my-money-card.tsx`'s docstring never mentions Worker** as a mount point even though `worker-dashboard-screen.tsx` does mount it — comment drift.
- **Neither "My complaints" nor "My expense requests" offers any edit/withdraw/cancel** — pure read-only history even for still-open/pending items.
- **No full `/worker/ledger` screen** — worker can never see a scrollable transaction history, only the current balance snapshot (ledger nav is OWNER/SITE_MANAGER/ACCOUNTANT only).

---

# Part 2 — Full page × section × subsection table

| Role | Page (path) | Section | Subsection | Contents |
|---|---|---|---|---|
| OWNER | /owner | Window toggle | -- | Today/7d/30d selector driving KPI + cost window |
| OWNER | /owner | KPI grid | -- | 6 stat cards: headcount, spend today, active sites, vehicles active, open issues, pending approvals |
| OWNER | /owner | My cash khata | -- | Reveal-on-tap balance + received/spent/given breakdown |
| OWNER | /owner | Approvals-pending callout | -- | Shown only if pendingApprovals>0; links to approvals |
| OWNER | /owner | Diesel check | -- | Reveal-on-tap 🚩 list of fuel-match mismatches (30d) |
| OWNER | /owner | Insights link card | -- | Teaser row linking to /owner/insights |
| OWNER | /owner | Completeness | -- | Per-site name/code, 7-day dots, today badge, links to site detail |
| OWNER | /owner | Cost rollup | By site | Site name → ₹ total |
| OWNER | /owner | Cost rollup | By vehicle | Vehicle regNo → ₹ total |
| OWNER | /owner | WhatsApp digest | -- | Collapsed by default; plain-text summary preview + Share/Copy buttons |
| OWNER | /owner/sites | Sites list | -- | Name, code, today completeness badge, links to site detail |
| OWNER | /owner/sites/[id] | Back link | -- | Link to /owner/sites |
| OWNER | /owner/sites/[id] | Site header card | Window/tabs | 7d/30d toggle + 4 tabs (Attendance/Expenses/Progress/Fuel) |
| OWNER | /owner/sites/[id] | Site header card | Attendance tab | Person, status+OT, date+marked-by, audit chip |
| OWNER | /owner/sites/[id] | Site header card | Expenses tab | Category+bill no., ₹, date+entered-by, VOID/audit chip |
| OWNER | /owner/sites/[id] | Site header card | Progress tab | Free-text note, date+entered-by, audit chip |
| OWNER | /owner/sites/[id] | Site header card | Fuel tab | Vehicle regNo, litres, ₹, date+reading, audit chip |
| OWNER | /owner/approvals | Filter/header card | Status tabs | PENDING/APPROVED/REJECTED/ALL |
| OWNER | /owner/approvals | Filter/header card | Site tabs | Owner-only per-site filter derived client-side |
| OWNER | /owner/approvals | Filter/header card | Notices | Conflict/server-error banners |
| OWNER | /owner/approvals | Requests list | Collapsed row | Type, status badge, verified/flagged badge, requester+one-liner+timestamp |
| OWNER | /owner/approvals | Requests list | Decided footer | Decided-by, timestamp, comment |
| OWNER | /owner/approvals | Requests list | Verify/flag actions | Verify ✓ / Flag 🚩 (with required note) on APPROVED EXPENSE_ADD |
| OWNER | /owner/approvals | Requests list | Expanded payload | Type-specific field summary + own-request note |
| OWNER | /owner/approvals | Requests list | Decide form | Category override (EXPENSE_ADD), comment, Reject/Approve |
| OWNER | /owner/people | Header card | -- | Title/subtitle |
| OWNER | /owner/people | User list | -- | Name, username+role, active badge; Deactivate/Activate/Reset-password actions |
| OWNER | /owner/people | Create login form | -- | Role/name/username/phone/site/link-person, reveals temp password |
| OWNER | /owner/people | Create person form | -- | Name/skill/default wage/phone (labour master) |
| OWNER | /owner/people | Labour master list | -- | Name, skill+mobile, guardian name+phone; Edit ID card inline |
| OWNER | /owner/people/[id] | Header card | -- | Name, date presets, reset-password action |
| OWNER | /owner/people/[id] | ID card | -- | Mobile/guardian name/phone; Owner-editable inline form |
| OWNER | /owner/people/[id] | Totals for period | -- | Total spend, category chips, progress/no-progress, request status counts |
| OWNER | /owner/people/[id] | Day-by-day | -- | Collapsible day rows expanding to Progress/Expense/Request lists |
| OWNER | /owner/fleet | Header card | -- | Title/subtitle |
| OWNER | /owner/fleet | Vehicle list | -- | RegNo+name, status, type+tracking mode, site, driver; links to detail |
| OWNER | /owner/fleet | Add vehicle form | -- | RegNo/name/type/site/driver/status |
| OWNER | /owner/fleet | Vehicle types list | -- | Name + tracking mode |
| OWNER | /owner/fleet | Add vehicle-type form | -- | Type name + tracking mode |
| OWNER | /owner/fleet/[id] | Back link | -- | Link to /owner/fleet |
| OWNER | /owner/fleet/[id] | Vehicle header card | Title/driver | RegNo+name, current driver, "view driver" link |
| OWNER | /owner/fleet/[id] | Vehicle header card | Analytics | Avg run/day 7/30/90, fuel litres+₹ 30d, monthly cost, total cost |
| OWNER | /owner/fleet/[id] | Vehicle header card | Damage history | Severity/status badges, description, timeline notes, inline resolve form |
| OWNER | /owner/fleet/[id] | Vehicle header card | Vehicle logs | Date, start→end reading, note |
| OWNER | /owner/fleet/[id] | Vehicle header card | Fuel | Date, litres, ₹ amount |
| OWNER | /owner/fleet/[id] | Vehicle header card | Diesel match | Per-date issued vs received litres + status |
| OWNER | /owner/fleet/[id] | Vehicle header card | Trips | From→to text, date, purpose |
| OWNER | /owner/fleet/[id] | Vehicle header card | Documents | Kind/title/expiry/note, delete, add-document form |
| OWNER | /owner/fleet/[id] | Vehicle header card | Reminders | Kind/label/due date/recurrence, active toggle, delete, add form/EMI preset |
| OWNER | /owner/fleet/driver/[id] | Back link | -- | Link to /owner/fleet |
| OWNER | /owner/fleet/driver/[id] | Driver header card | Details | Name, phone, assigned vehicle |
| OWNER | /owner/fleet/driver/[id] | Driver header card | Logs | Date, start→end reading |
| OWNER | /owner/fleet/driver/[id] | Driver header card | Fuel | Date, litres, ₹ amount |
| OWNER | /owner/fleet/driver/[id] | Driver header card | Trips | From→to text, date |
| OWNER | /owner/fleet/driver/[id] | Driver header card | Expenses | Category+bill no., date, ₹ amount |
| OWNER | /owner/ledger | Header card | -- | Title/subtitle |
| OWNER | /owner/ledger | Give/receive-back form | -- | Kind toggle, recipient select, ₹ amount, date, note |
| OWNER | /owner/ledger | Transfers history | -- | From→to name, ₹ amount, kind chip, date, note |
| OWNER | /owner/ledger | Money rollup | -- | Per-person balance, received/given/spent, category chips |
| OWNER | /owner/insights | Header/picker card | -- | Site picker + date presets |
| OWNER | /owner/insights | Progress (single-day) | -- | No-progress banner + progress list |
| OWNER | /owner/insights | Expenses (single-day) | -- | Total-spend + expense list |
| OWNER | /owner/insights | Requests (single-day) | -- | Request list w/ status badges |
| OWNER | /owner/insights | Period totals (period mode) | -- | Total spend, category chips, day/request counts |
| OWNER | /owner/insights | Day list (period mode) | -- | No-progress dot, date, note count, ₹ total; tap-to-drill |
| OWNER | /owner/reports | Report builder card | Window | Today/7d/30d/90d/custom + custom date fields |
| OWNER | /owner/reports | Report builder card | Section picker | Grouped checkboxes w/ live row counts, select-all/clear-all |
| OWNER | /owner/reports | Report builder card | Readiness/notices | Loading/error/long-window warning |
| OWNER | /owner/reports | Report builder card | Delivery picker | Download vs Email (env-gated), email input+validation |
| OWNER | /owner/reports | Report builder card | File name preview | Generated export file name |
| OWNER | /owner/reports | Report builder card | Download/Send button | Builds ExcelJS workbook / POSTs /exports/email |
| OWNER | /owner/settings | Header card | -- | Title/subtitle + read-only warning |
| OWNER | /owner/settings | Brand | -- | Org name, primary color swatch+hex |
| OWNER | /owner/settings | Locale | -- | Default locale, enabled-locales pills |
| OWNER | /owner/settings | Roles | -- | Enabled roles pills |
| OWNER | /owner/settings | Records | -- | Enabled record-types pills |
| OWNER | /owner/settings | Features | -- | 10 feature-flag ON/OFF grid |
| OWNER | /owner/settings | Wage | -- | Wage model, OT multiplier |
| OWNER | /owner/settings | Vehicle types | -- | Name + tracking mode (DB, config fallback) |
| OWNER | /owner/materials | Header card | -- | Title/subtitle |
| OWNER | /owner/materials | Material types list | -- | Name, uom, config badges; edit (name+toggles) inline |
| OWNER | /owner/materials | Add material form | -- | Name, unit select, config toggles |
| OWNER | /owner/complaints | Header/filter card | -- | Status tabs (Open/Resolved/All), notices |
| OWNER | /owner/complaints | Complaints list | -- | Raiser+target, status badge, private badge, text, timestamp, attachment count, Resolve button |
| SITE_MANAGER | /site-manager | Heading | -- | SM dashboard title/subtitle text |
| SITE_MANAGER | /site-manager | Window toggle | -- | Today/7d/30d selector; KPIs stay "today", cost/completeness follow window |
| SITE_MANAGER | /site-manager | KPI grid | -- | 6 stat tiles: headcount, spend today, active sites, vehicles active, open issues, pending approvals |
| SITE_MANAGER | /site-manager | My cash khata | -- | Collapsed balance card; GET /me/balance: balance + received/spent/given |
| SITE_MANAGER | /site-manager | Money I've taken | -- | Collapsed; GET /me/money: total + entries (date, amount, SALARY/PERSONAL tag, from, verified note) |
| SITE_MANAGER | /site-manager | Approvals pending callout | -- | Link to approvals inbox, shown only when count > 0 |
| SITE_MANAGER | /site-manager | Diesel check | -- | Collapsed; GET /fuel-stock/flags: mismatch/pending rows by vehicle+date |
| SITE_MANAGER | /site-manager | Insights link | -- | One-line link card to /site-manager/insights |
| SITE_MANAGER | /site-manager | Completeness | -- | Per-site rows: marked count, 7-day dots, today's state badge |
| SITE_MANAGER | /site-manager | Cost rollup | -- | Cost-by-site and cost-by-vehicle ₹ lists |
| SITE_MANAGER | /site-manager | Quick actions | -- | Shortcuts: Vehicle/Fuel, Reports |
| SITE_MANAGER | /site-manager | WhatsApp digest | -- | Collapsed; preview text, Share-to-WhatsApp, Copy, refresh |
| SITE_MANAGER | /site-manager | Emergency & contacts | -- | Site Manager/Supervisor call rows + emergency numbers, tap-to-call |
| SITE_MANAGER | /site-manager/approvals | Filter header | -- | Pending/Approved/Rejected/All tabs + conflict/error notices |
| SITE_MANAGER | /site-manager/approvals | Requests list | Collapsed row | Type, status badge, tick badge, requester, one-liner, timestamp |
| SITE_MANAGER | /site-manager/approvals | Requests list | Decided-row footer | Decided-by, decided-at, comment (non-expandable) |
| SITE_MANAGER | /site-manager/approvals | Requests list | Decide form | Payload summary, category override (EXPENSE_ADD), comment, Reject/Approve |
| SITE_MANAGER | /site-manager/complaints | Filter header | -- | Open/Resolved/All tabs + conflict/error notices |
| SITE_MANAGER | /site-manager/complaints | Complaint list | -- | Raised-by, target, status, text, timestamp, attachment count, resolve button |
| SITE_MANAGER | /site-manager/expense | Entry form | Site+date | Site picker (fixed/select) + date field (max today) |
| SITE_MANAGER | /site-manager/expense | Entry form | ExpenseForm | Category grid, amount, paid-via (cash/credit+vendor), bill+extra photos, remark, voice, submit |
| SITE_MANAGER | /site-manager/expense | Recent expenses | -- | Category+billNo, amount, date+entered-by (last 7 days) |
| SITE_MANAGER | /site-manager/fleet | Header | -- | Title/subtitle |
| SITE_MANAGER | /site-manager/fleet | Vehicle list | -- | regNo/name, status, type+tracking mode, assigned site+driver, links to detail |
| SITE_MANAGER | /site-manager/fleet | Add vehicle | -- | regNo, name, type, site (required), driver, status |
| SITE_MANAGER | /site-manager/fleet | Vehicle types list | -- | Name + tracking-mode chip |
| SITE_MANAGER | /site-manager/fleet | Add vehicle type | -- | Name + tracking-mode select |
| SITE_MANAGER | /site-manager/fleet/[id] | Header | -- | Back link, regNo/name, current driver + view-driver link |
| SITE_MANAGER | /site-manager/fleet/[id] | Analytics | -- | Avg run/day 7/30/90d, fuel litres+cost 30d, monthly cost, total cost |
| SITE_MANAGER | /site-manager/fleet/[id] | Damage history | -- | Severity/status badges, description, raised/resolved/closed notes, inline resolve form |
| SITE_MANAGER | /site-manager/fleet/[id] | Vehicle logs | -- | Date + odometer readings + note |
| SITE_MANAGER | /site-manager/fleet/[id] | Fuel | -- | Date + litres + amount |
| SITE_MANAGER | /site-manager/fleet/[id] | Diesel match | -- | Issued/received litres + confirmed/mismatch/waiting chip by date |
| SITE_MANAGER | /site-manager/fleet/[id] | Trips | -- | From→to, date, purpose |
| SITE_MANAGER | /site-manager/fleet/[id] | Documents | -- | Doc list (kind, title, expiry, note, file marker, delete) + add-document form |
| SITE_MANAGER | /site-manager/fleet/[id] | Reminders | -- | Reminder list (kind, label, due date, recurrence, active toggle, delete) + add form + EMI preset |
| SITE_MANAGER | /site-manager/fleet/driver/[id] | Header | -- | Back link, driver name, phone, assigned vehicle |
| SITE_MANAGER | /site-manager/fleet/driver/[id] | Logs | -- | Date + odometer readings |
| SITE_MANAGER | /site-manager/fleet/driver/[id] | Fuel | -- | Date + litres + amount |
| SITE_MANAGER | /site-manager/fleet/driver/[id] | Trips | -- | From→to + date |
| SITE_MANAGER | /site-manager/fleet/driver/[id] | Driver expenses | -- | Category+billNo+date + amount |
| SITE_MANAGER | /site-manager/insights | Header | -- | Site picker + date presets/custom date |
| SITE_MANAGER | /site-manager/insights | Progress | -- | No-progress banner + progress notes list (single-day mode) |
| SITE_MANAGER | /site-manager/insights | Expenses | -- | Total spend + expense list (single-day mode) |
| SITE_MANAGER | /site-manager/insights | Requests | -- | Request list w/ status (single-day mode) |
| SITE_MANAGER | /site-manager/insights | Period summary | -- | Total spend, category chips, progress/no-progress counts, request status counts (period mode) |
| SITE_MANAGER | /site-manager/insights | Day-by-day list | -- | Date rows w/ no-progress dot, note count, total spend (period mode) |
| SITE_MANAGER | /site-manager/ledger | Header | -- | Title/subtitle |
| SITE_MANAGER | /site-manager/ledger | Give/receive-back form | -- | Kind toggle, person select (below SM), amount, date, note |
| SITE_MANAGER | /site-manager/ledger | Transfers history | -- | From→to, amount, kind chip, date, note |
| SITE_MANAGER | /site-manager/ledger | Rollup | -- | Per-person balance, received/given/spent, per-category chips |
| SITE_MANAGER | /site-manager/materials | Header | -- | Title/subtitle |
| SITE_MANAGER | /site-manager/materials | Material types list | -- | Name+unit, config badges, edit toggle |
| SITE_MANAGER | /site-manager/materials | Add material type | -- | Name, unit, 3 config toggles |
| SITE_MANAGER | /site-manager/people | Header | -- | Title/subtitle |
| SITE_MANAGER | /site-manager/people | User list | -- | Name/username/role, active badge, deactivate/reset-password actions |
| SITE_MANAGER | /site-manager/people | Create login form | -- | Role, name, username, phone, site (required), person-link, temp password reveal |
| SITE_MANAGER | /site-manager/people | Create person form | -- | Name, skill, default wage, phone |
| SITE_MANAGER | /site-manager/people | Person list | -- | Name, skill+mobile, guardian name/phone, ID-card edit |
| SITE_MANAGER | /site-manager/people/[id] | Header | -- | Back link, person name, date presets, reset-password action |
| SITE_MANAGER | /site-manager/people/[id] | ID card | -- | Mobile/guardian display + edit form |
| SITE_MANAGER | /site-manager/people/[id] | Totals | -- | Period summary over selected range |
| SITE_MANAGER | /site-manager/people/[id] | Days | -- | Collapsible per-day progress/expense/request lists |
| SITE_MANAGER | /site-manager/progress | Entry card | Site+date+banner | Site picker, date field, "already covered today" info banner |
| SITE_MANAGER | /site-manager/progress | Entry card | ProgressForm | Free text, site photos (20), bill photos (4), voice note, submit |
| SITE_MANAGER | /site-manager/progress | Today's reports | -- | Who+time+text+attachment count |
| SITE_MANAGER | /site-manager/progress | History | -- | Last 7 days grouped by date |
| SITE_MANAGER | /site-manager/reports | Window + sections | -- | Window toggle, custom dates, checkbox section groups w/ row counts |
| SITE_MANAGER | /site-manager/reports | Readiness | -- | Loading/error state while sections settle |
| SITE_MANAGER | /site-manager/reports | Delivery | -- | Download vs Email toggle, email input, long-window warning |
| SITE_MANAGER | /site-manager/reports | Output | -- | File name, Download/Send-email button, success/error notices |
| SITE_MANAGER | /site-manager/requests | New request form | -- | Vehicle select, desired-type select, reason (VEHICLE_SWITCH only) |
| SITE_MANAGER | /site-manager/requests | My requests | -- | Own requests: type, status badge, payload summary |
| SITE_MANAGER | /site-manager/settings | Limits | -- | Worker/driver request-cap override, Supervisor limit override, SM's own limit (read-only) |
| SITE_MANAGER | /site-manager/settings | Categories | -- | Per-category enable toggle + Hindi/English labels |
| SITE_MANAGER | /site-manager/settings | Request-form fields | -- | 5 field-visibility toggles for the worker/driver expense form |
| SITE_MANAGER | /site-manager/settings | Emergency contacts | -- | Contact rows (kind, label, phone, remove) + add-contact button |
| SITE_MANAGER | /site-manager/vehicle | Entry card | Vehicle picker | Fixed row (1 vehicle) or select (multiple) |
| SITE_MANAGER | /site-manager/vehicle | Entry card | Entry form | Reading, litres, amount, date, receipt photo, submit |
| SITE_MANAGER | /site-manager/vehicle | Entry card | Recent entries | Vehicle, amount, date+litres+reading (no diesel-match badge for SM) |
| SITE_MANAGER | /site-manager/vendors | Header | -- | Title/subtitle |
| SITE_MANAGER | /site-manager/vendors | Shop list | -- | Name+sells/phone, tap to open detail |
| SITE_MANAGER | /site-manager/vendors | Add shop form | -- | Name (required), phone, sells |
| SITE_MANAGER | /site-manager/vendors | Ledger (detail) | -- | Purchased/received/paid/balance stats + month-wise breakdown |
| SITE_MANAGER | /site-manager/vendors | Record payment (detail) | -- | Direction toggle (paid/received), amount, date, note |
| SUPERVISOR | /supervisor | Khata card | Balance reveal | Collapsed by default; reveals ₹ balance (red if negative) + received/spent/given breakdown; refresh icon; GET /me/balance |
| SUPERVISOR | /supervisor | My money card | Draws list | Collapsed by default; total + list of accountant-verified SALARY/PERSONAL draws (date, amount, tag, from-giver, note, verified checkmark); GET /me/money |
| SUPERVISOR | /supervisor | Approvals-pending callout | -- | Single "N pending" link to /supervisor/approvals; renders only if count>0 |
| SUPERVISOR | /supervisor | Site picker | -- | Fixed read-only site row (1 site) or native select (multiple) |
| SUPERVISOR | /supervisor | Crew card | Headcount summary | onSite/total count + PRESENT/HALF_DAY/ABSENT/unmarked breakdown from today's attendance vs people list |
| SUPERVISOR | /supervisor | Today's progress card | Status banner | Single Notice: "done" (success) or "pending" (warning) based on whether a progress note exists today |
| SUPERVISOR | /supervisor | Crew-today strip | -- | Link to /supervisor/insights — route does not exist, 404s |
| SUPERVISOR | /supervisor | Contact panel | People | Tap-to-call row for his Site Manager (name, phone) |
| SUPERVISOR | /supervisor | Contact panel | Emergency | Tap-to-call rows per site's configured emergency contacts |
| SUPERVISOR | /supervisor/approvals | Filter/header card | Status filter | PENDING/APPROVED/REJECTED/ALL tab buttons |
| SUPERVISOR | /supervisor/approvals | Filter/header card | Conflict/error notice | Re-decide-race or server error banner (rarely relevant since he can't decide) |
| SUPERVISOR | /supervisor/approvals | Requests list | Pending row (collapsed) | Type, status badge, verified/flagged badge (EXPENSE_ADD), requester name + one-liner + timestamp, chevron |
| SUPERVISOR | /supervisor/approvals | Requests list | Decided row | "Decided by" line: decider name, decided-at, comment; not expandable |
| SUPERVISOR | /supervisor/approvals | Requests list | Expanded payload | Full type-specific payload summary + "own request" note if applicable; NO decide buttons |
| SUPERVISOR | /supervisor/complaints | Complaint box form | Target picker | "Site Manager" vs "Owner only (private)" toggle buttons |
| SUPERVISOR | /supervisor/complaints | Complaint box form | Text field | Required "what happened" textarea |
| SUPERVISOR | /supervisor/complaints | Complaint box form | Photo field | Up to 3 photos, best-effort upload |
| SUPERVISOR | /supervisor/complaints | Complaint box form | Video hint | Disabled dashed-border notice — video not wired (blocked on R2) |
| SUPERVISOR | /supervisor/complaints | Complaint box form | Submit + notices | Submit button; success/error/photo-partial-fail notices |
| SUPERVISOR | /supervisor/complaints | My complaints | List rows | Target (SM/Owner), status pill (Open/Resolved), text body, timestamp, attachment count |
| SUPERVISOR | /supervisor/diesel | Page header | -- | "Diesel" title + subtitle (plain text, no Card) |
| SUPERVISOR | /supervisor/diesel | Stock-in-hand card | Per-site stock list | purchased − issued litres remaining, per site in scope |
| SUPERVISOR | /supervisor/diesel | Buy stock form | Site + fields | Site picker, litres (required), amount ₹ (optional), date, note; POST /fuel-stock/purchases |
| SUPERVISOR | /supervisor/diesel | Issue to vehicle form | Vehicle + fields | Vehicle picker (fixed/select), litres (required), date, note; POST /fuel-stock/issuances |
| SUPERVISOR | /supervisor/diesel | Recent issuances | List rows | Date, vehicle regNo, note, litres, match-status pill (waiting/confirmed/mismatch) |
| SUPERVISOR | /supervisor/diesel | Recent purchases | List rows | Date, site name(code), note, litres, ₹ amount |
| SUPERVISOR | /supervisor/expense | Expense entry card | Site + date | Site picker, business-date field (max today) |
| SUPERVISOR | /supervisor/expense | Expense entry card | Category picker | Button-grid of enabled expense categories |
| SUPERVISOR | /supervisor/expense | Expense entry card | Amount field | ₹ amount input; ALWAYS over his 0-paise direct limit → always routes as request; warning banner shown |
| SUPERVISOR | /supervisor/expense | Expense entry card | Paid-via selector | Cash / On-credit toggle + shop select (only if site allows vendor field and shops exist) |
| SUPERVISOR | /supervisor/expense | Expense entry card | Photo fields | Bill photo (max 1, RECEIPT), extra photos (max 2, PHOTO) |
| SUPERVISOR | /supervisor/expense | Expense entry card | Remark + voice | Free-text remark; voice note field if org voiceNotes enabled |
| SUPERVISOR | /supervisor/expense | Expense entry card | Submit + notices | Submit (always behaves as "submit request"); success/error notices |
| SUPERVISOR | /supervisor/expense | Recent expenses | List rows | Category (+bill no), ₹ amount, date + entered-by name, last 7 days |
| SUPERVISOR | /supervisor/materials | Material entry form | Site + date | Site picker, business-date field |
| SUPERVISOR | /supervisor/materials | Material entry form | Material picker | Select filtered to config.supervisorLogs !== false; empty message if none eligible |
| SUPERVISOR | /supervisor/materials | Material entry form | Type toggle | IN (received) vs Used/consumed (CONSUME) |
| SUPERVISOR | /supervisor/materials | Material entry form | Qty + UOM | Quantity input + read-only unit label |
| SUPERVISOR | /supervisor/materials | Material entry form | Submit + notices | POST /records/material-txn (stamped finalized:true, enteredRole:SUPERVISOR); success/error notices |
| SUPERVISOR | /supervisor/materials | Recent entries | List rows | Material name + type, qty+uom, date, last 7 days |
| SUPERVISOR | /supervisor/people | Title card | -- | "People management" heading/subtitle, no content |
| SUPERVISOR | /supervisor/people | User list | Row | Name, username·role, active/inactive pill; plain text (no drilldown link) for SUPERVISOR viewer |
| SUPERVISOR | /supervisor/people | User list | Row actions | NONE — deactivate/activate/reset-password all hidden for SUPERVISOR |
| SUPERVISOR | /supervisor/people | Create login form | Role picker | WORKER or DRIVER only (CREATABLE_ROLES.SUPERVISOR) |
| SUPERVISOR | /supervisor/people | Create login form | Identity fields | Name, username, phone (optional) |
| SUPERVISOR | /supervisor/people | Create login form | Crew note | No site field shown; crew auto-filled from own crewId; blocked entirely with a warning if he has no crew |
| SUPERVISOR | /supervisor/people | Create login form | Person link | Optional link to existing labour-master Person (WORKER/DRIVER only) |
| SUPERVISOR | /supervisor/people | Create login form | Submit + notices | POST /users; success shows username + one-time temp password; duplicate-username inline error |
| SUPERVISOR | /supervisor/people | Labour master list | Row | Name, skill·mobile, guardian name·guardian mobile; NO edit button for SUPERVISOR (view-only) |
| SUPERVISOR | /supervisor/progress | Progress entry card | Site + date | Site picker, business-date field (max today) |
| SUPERVISOR | /supervisor/progress | Progress entry card | Covered banner | Informational-only "already filed today by X at Y" success notice; never blocks |
| SUPERVISOR | /supervisor/progress | Progress entry card | Form fields | Free-text note (required unless photos), up to 20 site photos, up to 4 bill photos, optional voice note |
| SUPERVISOR | /supervisor/progress | Progress entry card | Submit + notices | POST /records/progress; success/error/photo-warning notices; create-only, no edit |
| SUPERVISOR | /supervisor/progress | Today's reports | List rows | Filer name, timestamp, note text, generic attachment-count chip |
| SUPERVISOR | /supervisor/progress | History (7 days) | Grouped rows | Notes grouped by business date, newest first, same per-note row format |
| SUPERVISOR | /supervisor/requests | New request form | Type | Effectively fixed to VEHICLE_SWITCH (only allowed type) |
| SUPERVISOR | /supervisor/requests | New request form | Vehicle fields | Vehicle select (often empty — no fleet scope), optional desired-vehicle-type select, required reason textarea |
| SUPERVISOR | /supervisor/requests | New request form | Submit + notices | POST /requests type=VEHICLE_SWITCH; success/error notices |
| SUPERVISOR | /supervisor/requests | My requests | List rows | Type label, status badge, payload one-liner (own requests only) |
| ACCOUNTANT | /accountant | KPI strip | -- | 4 stat cards: pending requests, awaiting-tick count, today approved/rejected/verified, cash in hand |
| ACCOUNTANT | /accountant | KhataCard | Masked balance toggle | Hidden-by-default GET /me/balance: balance + received/spent/given breakdown, refresh icon |
| ACCOUNTANT | /accountant | MyMoneyCard | Collapsed money-taken list | GET /me/money: total + own SALARY/PERSONAL draws, date/amount/tag/giver/note, verified checkmark |
| ACCOUNTANT | /accountant | Pending money requests | Pending list (top 5) | PayloadSummary + requester + timestamp + "Decide →" link to Approvals |
| ACCOUNTANT | /accountant | Expenses awaiting your tick | VerifyRow list | Category+amount, enteredBy/date/remark, Verify (POST /records/expense/:id/verify) / Flag+note |
| ACCOUNTANT | /accountant | Cash transfers awaiting your tick | VerifyRow list | from→to+amount, date/note, Verify/Flag via POST /cash-transfers/:id/verify |
| ACCOUNTANT | /accountant | Vendor payments awaiting your tick | VerifyRow list | Paid-to-shop/Received-from-shop label+amount, date/note, Verify/Flag via POST /vendors/payments/:id/verify |
| ACCOUNTANT | /accountant | Diesel flags | Mismatch list (read-only) | Vehicle regNo/id, MISMATCH badge, date, issued vs received litres |
| ACCOUNTANT | /accountant/approvals | Filters/header | Status + reject/error notices | PENDING/APPROVED/REJECTED/ALL tabs, conflict/error banner |
| ACCOUNTANT | /accountant/approvals | Requests list | Collapsed row | Type label, status badge, verified/flagged tick badge, requester+one-liner+timestamp |
| ACCOUNTANT | /accountant/approvals | Requests list | Decided-row footer | "Decided by {name} · {datetime} · {comment}" for non-pending rows |
| ACCOUNTANT | /accountant/approvals | Requests list | Verify/flag action block | Verify / Flag(+required note) on an APPROVED EXPENSE_ADD nobody ticked yet |
| ACCOUNTANT | /accountant/approvals | Requests list | Expanded decide form | PayloadSummary, final-category select, comment textarea, Reject/Approve (EXPENSE_ADD only) |
| ACCOUNTANT | /accountant/complaints | Complaint box | Raise form | Target toggle (SM/Owner-private), required text, up to 3 photos, disabled video hint, submit |
| ACCOUNTANT | /accountant/complaints | My complaints | Own history list | Target, status badge, text, timestamp, attachment count (read-only) |
| ACCOUNTANT | /accountant/ledger | Header | -- | Title/subtitle only |
| ACCOUNTANT | /accountant/ledger | Give/return-cash form | Candidates/EmptyState | Recipient picker always empty for ACCOUNTANT (GET /users self-only bug) → "coming soon" EmptyState |
| ACCOUNTANT | /accountant/ledger | Transfers history | History list | GET /cash-transfers: from→to+amount, kind chip, date, note |
| ACCOUNTANT | /accountant/vendors | Header | -- | Title/subtitle only |
| ACCOUNTANT | /accountant/vendors | Shop list | Vendor rows | GET /vendors: name, sells/phone, "View ledger" tap-to-open |
| ACCOUNTANT | /accountant/vendors | Vendor detail | Ledger summary | Purchased/received/paid/balance stats + month-wise breakdown |
| ACCOUNTANT | /accountant/vendors | Vendor detail | Record-payment form | Direction toggle (PAYMENT/RECEIPT), amount, date, note, submit |
| DRIVER | /driver | Vehicle snapshot | vehicle info card | reg no/name/status chip, current vs yesterday reading, pending-switch chip |
| DRIVER | /driver | My cash khata (KhataCard) | balance reveal | masked by default; eye-tap shows balance + received/spent/given + refresh |
| DRIVER | /driver | Money I've taken (MyMoneyCard) | collapsible list | collapsed "tap to view"; expanded shows total + SALARY/PERSONAL draws w/ verified tag |
| DRIVER | /driver | Start/end-of-day vehicle log | Morning form | meter photo (required), start reading, up to 3 extra photos, submit |
| DRIVER | /driver | Start/end-of-day vehicle log | Evening form | meter photo (required), end reading, hours worked, loads count, note, submit |
| DRIVER | /driver | Recent fuel entries | 7-day list | litres, amount, date·litres·reading |
| DRIVER | /driver | Contacts (ContactPanel) | People | Site Manager + Supervisor tap-to-call rows |
| DRIVER | /driver | Contacts (ContactPanel) | Emergency | site-curated emergency numbers, tap-to-call |
| DRIVER | /driver/complaints | Complaint box (raise) | target picker | Site Manager vs Owner-only(private) toggle |
| DRIVER | /driver/complaints | Complaint box (raise) | complaint text | required textarea "What happened?" |
| DRIVER | /driver/complaints | Complaint box (raise) | photos | up to 3 optional photos |
| DRIVER | /driver/complaints | Complaint box (raise) | video hint | disabled placeholder, R2-blocked |
| DRIVER | /driver/complaints | My complaints | list | target, status Open/Resolved, text, timestamp, photo count |
| DRIVER | /driver/requests | New request (vehicle switch) | vehicle select | in-scope vehicle native select or no-vehicles warning |
| DRIVER | /driver/requests | New request (vehicle switch) | desired vehicle type | optional native select |
| DRIVER | /driver/requests | New request (vehicle switch) | reason | required textarea |
| DRIVER | /driver/requests | My requests (all types) | list | type label, status badge, payload summary |
| DRIVER | /driver/requests | Expense reimbursement request | amount | ₹ input, validated against cap |
| DRIVER | /driver/requests | Expense reimbursement request | date | today/backdate-window native select |
| DRIVER | /driver/requests | Expense reimbursement request | category picker | site/org-enabled category buttons |
| DRIVER | /driver/requests | Expense reimbursement request | paid-via + shop selector | Cash vs On-credit toggle, conditional vendor select |
| DRIVER | /driver/requests | Expense reimbursement request | photos | bill/extra photos, conditional max 1-3 |
| DRIVER | /driver/requests | Expense reimbursement request | remark | optional textarea, conditional |
| DRIVER | /driver/requests | Expense reimbursement request | voice note | conditional on org/site flags |
| DRIVER | /driver/requests | My expense requests | list | amount, category, date, two-tick verified/flagged badge, rejection reason |
| DRIVER | /driver/vehicle | Switch vehicle | log-only notice | success banner when an allowed-type vehicle exists |
| DRIVER | /driver/vehicle | Switch vehicle | other-vehicle list | regNo/name + Switch-now button or Needs-approval deep link |
| DRIVER | /driver/vehicle | Report vehicle damage | damage form | severity, description, up to 4 photos, voice note, submit |
| DRIVER | /driver/vehicle | Damage history | timeline | severity/status badges, raised/resolved/closed notes, closing-remark action |
| DRIVER | /driver/vehicle | Fuel entry | vehicle display/select | fixed row (1 vehicle) or native select (multiple) |
| DRIVER | /driver/vehicle | Fuel entry | entry form | reading, litres, amount, date, receipt photo, submit |
| DRIVER | /driver/vehicle | Fuel entry | recent fuel list | regNo, amount, date·litres·reading + match-status badge |
| WORKER | /worker | My card | -- | ID-card block: name, role badge, assigned site name+code, mobile, guardian name/phone if present |
| WORKER | /worker | My requests (summary) | Status-count pills | Pending/Approved/Rejected counts for the worker's own EXPENSE_ADD requests |
| WORKER | /worker | My requests (summary) | Last-3 list | Most-recent 3 requests: amount, date, status badge |
| WORKER | /worker | My requests (summary) | View-all link | Link to /worker/requests; read-only summary only |
| WORKER | /worker | My khata | Balance (masked/reveal) | Eye-toggle hidden balance; GET /me/balance on reveal, refresh icon, red if negative |
| WORKER | /worker | My khata | Received/Spent/Given breakdown | 3-column figures shown once revealed |
| WORKER | /worker | Money I've taken | Total | Collapsed by default; GET /me/money total once expanded, refresh icon |
| WORKER | /worker | Money I've taken | Entries list | ShowMore(7) of accountant-verified SALARY/PERSONAL draws: date, amount, tag badge, giver name, note, verified checkmark |
| WORKER | /worker | Emergency & contacts | People | Tap-to-call rows for Site Manager and/or Supervisor, if present |
| WORKER | /worker | Emergency & contacts | Emergency | Tap-to-call rows for site's Police/Ambulance/Hospital/Fire/Site office/Other numbers |
| WORKER | /worker/complaints | Complaint box | Target picker | 2-button toggle: Site Manager vs Owner only (private) |
| WORKER | /worker/complaints | Complaint box | Text field | Required textarea "What happened?", inline validation |
| WORKER | /worker/complaints | Complaint box | Photos field | PhotoMultiField, optional, max 3 |
| WORKER | /worker/complaints | Complaint box | Video hint | Disabled informational block "Video coming soon (storage pending)" |
| WORKER | /worker/complaints | Complaint box | Submit + notices | "Send complaint" button, success/error/photo-upload-warning notices |
| WORKER | /worker/complaints | My complaints | Complaint history list | ShowMore(5): target, OPEN/RESOLVED badge, text, created date/time, attachment count; no edit/withdraw |
| WORKER | /worker/requests | New expense request | Amount field | ₹ number input, validated against site/org request cap |
| WORKER | /worker/requests | New expense request | Date select | Today/Yesterday/... up to org.expense.requestBackdateDays |
| WORKER | /worker/requests | New expense request | Category picker | Button grid of site/org-enabled categories, bilingual labels |
| WORKER | /worker/requests | New expense request | Paid-via / vendor selector | Cash vs "on credit" toggle + required shop select, shown only if site has vendors |
| WORKER | /worker/requests | New expense request | Photo field | Bill + extra photos, shown/sized per site field toggles |
| WORKER | /worker/requests | New expense request | Remark field | Optional textarea, conditional on site field toggle |
| WORKER | /worker/requests | New expense request | Voice note field | Conditional on org.features.voiceNotes AND site field toggle |
| WORKER | /worker/requests | New expense request | Submit + notices | "Send request" button; creates an EXPENSE_ADD approval request, never books directly |
| WORKER | /worker/requests | My expense requests | Full request history list | Unbounded list: type, status badge, amount, category, date, two-tick badge, rejection comment; no edit/cancel |

---

# Part 3 — Cross-cutting gaps (seen across multiple roles)

These patterns showed up independently in more than one role's audit — meaning they're structural, not role-specific, and likely the highest-leverage things to fix next:

1. **No media playback anywhere in the app.** Every attachment surface — Owner's site detail, Complaints (all 6 roles), Progress, Expense recent-entries, Vehicle documents — shows only an attachment **count** (paperclip icon), never an actual photo thumbnail or voice-note player. Root cause: no media-read endpoint exists yet (R2 keys absent). This is the single biggest "looks unfinished" gap, visible on nearly every role's dashboard/list screens.
2. **Complaint video attachment is a non-functional placeholder for all 4 raiser roles** (Worker/Driver/Supervisor/Accountant) and the SM/Owner inbox never shows one either — a permanently disabled hint block, since the frozen contracts have no `VIDEO` media kind and R2 isn't wired.
3. **`GET /users` (and `/vehicles`, `/requests`) have no ACCOUNTANT scope branch server-side.** This single backend gap cascades into several distinct symptoms found independently by the Accountant, Supervisor, and Site-Manager audits: the Accountant's give/return-cash form is permanently a "coming soon" empty state, names fall back to shortened ids on his dashboard/approvals, vehicle reg numbers fall back to ids on diesel flags, and his Approvals PENDING tab reads near-empty (only the separately-scoped `/accountant/queue` reliably works).
4. **No crews API/UI anywhere.** Supervisor's own crew has no name, roster, or member-count view; a Driver's `crewId` membership is never surfaced except indirectly (the Supervisor's name appears in Contacts); Supervisor's "create login" form auto-attaches to his crew with just a caption note, no visible crew identity.
5. **Vehicle "expenses" is structurally always empty** on both Owner's and SM's Vehicle-detail page — the `expenses` table has no `vehicleId` column in this schema version, so fuel is the only real per-vehicle cost signal even though a section for it exists in the UI's data model.
6. **LEAVE and MATERIAL request types are fully coded but commented out** in the shared `requests-screen.tsx` (phase-scoped off) — every request-submitting role (SM, Supervisor, Driver) can currently only ever raise `VEHICLE_SWITCH` through that generic screen, even though two more request types are implemented and dormant.
7. **Reports: the Materials export section is wired server-side but has no checkbox to select it** (Owner + Site-Manager Reports screen), and even if reachable, `buildMaterialSheet` never resolves a material name from the now-existing Materials catalog.
8. **No org-level settings write endpoint** — `/owner/settings` is 100% read-only display; only per-site config is editable, and only by SM/Owner via a screen that itself assumes exactly one site.
9. **Read-only history lists offer no edit/withdraw/cancel for the submitter**, even while an item is still open/pending — consistent across Worker's and Driver's complaints/expense-requests and Supervisor's People-created-users (no lifecycle management at all for what he creates).
10. **Direct-limit / over-limit UI logic is dead code for two roles.** Supervisor's `directLimitPaise=0` means every expense entry always routes as a request (the "direct booking" branch never runs for him); conversely, Site-Manager's own configured direct limit is never client-enforced at all (`directLimitPaise=undefined` hard-coded in `expense-screen.tsx` for any role but SUPERVISOR).

---

# Appendix — non-role-specific routes

| Route | Purpose |
|---|---|
| `/` (`page.tsx`) | Role router — redirects to the logged-in user's role home. |
| `/login` | Login form + dev tap-panel (development builds only). |
| `/change-password` | Forced (first-login) or manual password change. |
| `/api/auth/{login,logout,refresh}` | Cookie-handling auth Route Handlers (httpOnly access/refresh/device cookies). |
| `/api/proxy/[...path]` | Authenticated same-origin gateway to the NestJS backend. |
| `/dev/rbac-matrix` | Dev-only view of the frozen RBAC matrix (`shared/src/permissions.ts`). |
