# SUPERVISOR role — client review updates (round: role-by-role audit)

> **Status: 📋 PENDING — DO NOT BUILD YET.** Part of the role-by-role client review (2026-07-18); all roles build together in one pass at the end. Tracker: [`../ROLE-AUDIT-TRACKER.md`](../ROLE-AUDIT-TRACKER.md).
>
> Current-state facts code-verified against `supervisor-dashboard-screen.tsx`, `diesel-screen.tsx`, `material-entry-screen.tsx`, `people-screen.tsx`, `approvals-screen.tsx`, `expense-screen.tsx`, `complaint-screen.tsx`, `backend/src/common/scope.util.ts`, `shared/src/db/schema.ts` (contracts `frozen.9`).

---

## SUP-0 — Profile page: ✅ no change (client question answered)

Client asked whether Profile is reusable across roles. **It already is**: all 6 role routes render the single shared `profile-screen.tsx`; only the data differs. Nothing to do.

## SUP-1 — Complaint ID: real, short, trackable numbers (CROSS-ROLE change)

**Today (and why every complaint "has the same ID"):** the complaints table has **no number column** — only the UUID `id`. The accordion shows `#` + first 8 UUID chars, and with UUIDv7 those chars encode the **creation timestamp**, so complaints filed in the same period all share the same visible prefix. The client's observation is a genuine defect of the shortening approach.

**Requested:** every complaint gets a short (3–4 char) consistent ID — e.g. numeric starting around 100 — that increments with the DB, is the same for everyone (raiser, SM, Owner), and can be used to **search/track** the complaint in the inbox and in "my complaints".

**Recommended scheme (researched):** per-org sequential integer `complaint_no`, starting at **101**:
- New column `complaints.complaint_no int NOT NULL` + unique index `(org_id, complaint_no)`; assigned server-side at create (`max(complaint_no)+1` inside the tenant tx; unique-index + retry guards the race — volume is tiny).
- Backfill existing complaints in `created_at` order per org.
- Display everywhere as `#101` (raiser history, SM/Owner inbox, notifications payload).
- Add a search/filter-by-number box on the inbox and "my complaints".
- ⚠️ Contracts bump: schema + `Complaint` domain type.
- "From whom" (raisedBy) already recorded and shown — confirmed working, no change.

## SUP-2 — SINGLE-SITE rule (CROSS-CUTTING, every role below Owner)

**Client rule:** one person = exactly one site. SM, Accountant, Supervisor, Driver, Worker each see **only their own site's data** — never another site's. The site is fixed by their assignment (their "profile"), so screens must stop offering site pickers entirely.

**Today:** the supervisor's scope is a **union** — his `assignedSiteId` + every site of crews he leads + his crew-drivers' **vehicles'** sites (`scope.util.ts:74-80,120-127`). That's exactly why the diesel page shows two sites (Sunrise Tower + GVil Residence). Several supervisor screens render a `SitePicker`.

**Requested:** trim supervisor reads/writes to the one assigned site; remove the site picker from **diesel, materials, progress, expense** (and the dashboard's picker becomes a fixed label). Stock-in-hand shows only his site's stock.

**Implication:** narrow the SUPERVISOR branch in `loadScope` (or filter site-carrying screens to `assignedSiteId`); audit seeded data where a crew driver's vehicle sits at another site (that's the leak vector). Applies to the driver file's pages too.

## SUP-3 — Diesel page restructure

**Requested:**
- **Split into two subpages/sections navigated separately: "Buy stock" (diesel arriving at the site) and "Issue to vehicle".**
- **Date fields on both forms: today + yesterday only** (currently any past date via `assertBackdateWindow` with the supervisor's 7-day default).
- **History lists (recent issuances / recent purchases): NOT loaded by default.** Show a refresh icon; only on tap does the section fetch+render (same lazy pattern as the khata eye-toggle).
- Stock-in-hand: single site only (SUP-2).

**Implication:** supervisor backdate window becomes 1 day for these forms — decide whether to enforce server-side too (org-config `thBackdateDays` default is currently 7; a supervisor-specific 1-day rule is a config/contract default change like the worker's frozen.9 one).

## SUP-4 — Materials page

**Requested:**
- Remove the site picker (SUP-2 — auto from assignment).
- Date: **today + yesterday only**.
- **Add an "Other" option to the material picker** — choosing it opens a remark field where he writes what the material is.
- "Recent entries (7 days)" list: lazy — rendered only after tapping a refresh icon.

**Implication (⚠️ contracts/DB):** `material_txns` has no free-text remark column today — "Other + remark" needs either a txn-level `remark` column or an OTHER sentinel material + note. Flag for the combined bump.

## SUP-5 — People page

**Requested:**
- **Remove the "link to labour-master person (optional)" select** from the create-login form — "not feasible as written".
- Create-login keeps: role (worker/driver), name, username, phone (optional).
- He must see **name + mobile number** for everyone under him (user list currently shows name/username/role — add the phone).
- Labour-master ID cards (read-only for him — unchanged): name, mobile, guardian name, guardian mobile — for **all workers AND drivers under his supervision**.
- Structural rule (matches Round-2 crews): every worker and driver hangs under exactly one supervisor.

## SUP-6 — Approvals: supervisor DECIDES vehicle-change; money never reaches him

**Today:** Round 2 made the supervisor's approvals page pure read-only (`canDecide()` hard-coded `false`); he sees his crew's requests of all types.

**Requested (reverses part of Round 2):**
- The supervisor's approvals inbox shows **ONLY vehicle-change requests** — no money/expense requests at all (all money requests route to the **accountant**).
- He **CAN approve/reject** those vehicle-change requests.

**Implication (⚠️ contracts):** `PERMISSIONS.SUPERVISOR` gains `request.decide: OWN_CREW` narrowed to `VEHICLE_SWITCH` (type-check in the service, like other narrowings); approvals list filtered by type for this role; RBAC snapshot test update.

## SUP-7 — Act on behalf of his drivers

**Client:** "everything a driver can do, the supervisor can do on the driver's behalf — EXCEPT the driver's fuel-received entry" (that stays driver-only so the diesel two-side match remains honest).

Specifically requested:
- **Raise a damage report** for a crew vehicle (driver's damage form, usable by the supervisor).
- **Vehicle allotment:** reassign vehicles among his drivers (driver X → driver Y / put driver Z on a vehicle) — **auto-approved when he does it** (a direct assignment action, not a pending request). Client noted he currently can't even see vehicle-change options properly (his requests screen usually shows "no vehicles in scope").
- Also raise vehicle-change requests where approval IS needed (other-type vehicle etc.).

**Today:** none of this exists — his requests screen is self-only VEHICLE_SWITCH with an empty fleet, no damage form, no assignment power.

**Implication:** supervisor needs vehicle visibility over his crew's vehicles (scope exists in `loadScope` already), a damage form page/section, and a direct "assign driver↔vehicle" action (service-gated to his crew + site; notify SM/driver). Overlaps the DRIVER file (DRV-3/DRV-5).

## SUP-8 — Progress page

Remove the site picker (SUP-2). Date: **today + yesterday only**. Everything else fine as-is.

## SUP-9 — Expense page

**Requested:**
- Remove the site picker (SUP-2). Date: **today + yesterday only**.
- **Category "Other" → remark:** when the "other"-type category is chosen, open/require a remark describing it.
- **Two-tier money flow (replaces Round 2's supervisor-₹0 rule):**
  - **Below his limit** (the per-site supervisor limit the SM already configures in SM-settings): entry is **auto-approved/booked immediately** into his expense history — but still needs the **accountant's verify tick** (normal two-tick) to become permanent.
  - **Above his limit:** needs the **accountant's approval** first (the request routes to the accountant — not the SM).
  - Client: "Every request goes through accountant."
- **Vendor credit must be visible:** client can't see the "on credit at shop" option anywhere on this page. Verified cause: the paid-via selector renders only when the site's `expenseFormConfig.fields.vendor` toggle is on AND that site has ≥1 vendor. Requirement: buying on a registered vendor's khata (not deducted from his cash) must be reliably available in the supervisor's expense form — default the toggle on / surface org-wide vendors.

**Implication (⚠️ contracts + behavior):** reinstates limit-based branching for SUPERVISOR (`directLimitPaise` currently hard-coded `0` in `expense-screen.tsx`; the per-site override field already exists in SM settings + org config). Below-limit direct booking already lands in the accountant's verify queue (two-tick) — so the main new work is (a) restoring the client-side branch, (b) routing above-limit requests to the accountant as decider, (c) un-deprecating the supervisor limit config. RBAC/decider changes need a PERMISSIONS look (accountant already holds `request.decide`).

## SUP-10 — Dashboard cleanup

**Requested:**
- **Remove the "Crew card"** (today's attendance summary — on-site/total + PRESENT/HALF_DAY/ABSENT counts). "Not needed for the supervisor."
- **Remove the "crew today" strip** — client tapped it and hit the dead link (`/supervisor/insights` doesn't exist; known gap from the audit map).
- Client: "same as earlier, store this data — we will implement this thing later on" → keep capturing the underlying data server-side; this is a UI removal only (see Q4).
- Keep: khata card, approvals-pending callout (now vehicle-change-only per SUP-6), today's-progress banner, contacts, site label.

---

## Open questions (resolve before the final build pass)

- **Q1 — Complaint-ID format:** plain per-org numeric `#101, #102…` (recommended) or alphanumeric (`F3`-style)? Numeric sorts/searches cleanest.
- **Q2 — Supervisor vehicle allotment:** notify the SM and/or the affected drivers? Log-only (like the driver's allowed-type self-switch) or an audit trail entry too?
- **Q3 — Data hygiene for single-site:** a crew driver whose vehicle is assigned to another site currently leaks that site into supervisor scope — when we enforce one-site, should such assignments be blocked at write time?
- **Q4 — "Store this data, implement later":** confirm this means keep the attendance/crew tables + capture paths intact and only remove the supervisor dashboard UI.
- **Q5 — Above-limit path:** accountant becomes the decider for supervisor expense requests — can the Owner still decide/override as today? SM fully out of that loop?
- **Q6 — Diesel/materials/progress/expense "today+yesterday":** enforce server-side too (supervisor backdate window 7→1) or client-only?

---

**Cross-file overlaps:** SUP-2 single-site rule also affects the DRIVER pages (fuel/damage) and, per the client's phrasing, SM + Accountant screens — expect matching items in their upcoming review files. SUP-7 overlaps DRV-2/DRV-3 (vehicle + damage pages).
