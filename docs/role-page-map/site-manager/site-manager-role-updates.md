# SITE_MANAGER role — client review updates (round: role-by-role audit)

> **✅ BUILT (frozen.10/11) + post-audit round (client testing feedback, 2026-07-18 night):**
> 1. **Materials → 3 sub-pages**: Material types · Add material type (current list shown above the form) · **Material entry** — the supervisor's IN/CONSUME form now shared by SM and OWNER (fallback rule: "whatever the supervisor files, SM/Owner can file"; backend gained an explicit OWNER allowance with an in-org site check).
> 2. **SM never sees a site selector**: removed from fleet add-vehicle, expense, progress, insights, material entry (auto = his one site; Owner keeps pickers).
> 3. **People: "Add login" + "Add worker" merged into one "Add member" form** — workers/drivers always create the person, optional "create app login too" toggle (hidden+forced ON for a SUPERVISOR caller — a person without a login would fall outside his crew scope); staff roles = mandatory login.
> 4. **ID cards**: section renamed "Site team ID cards / साइट टीम ID कार्ड"; tapping a card opens the full detail (incl. NAME); pencil edit now also edits the person's name.
> 5. *(round 2, same night)* **Requests** = form on top + lazy "Request history" (all statuses). **`/site-manager/fuel` replaces `/site-manager/vehicle`** (nav "Fuel"): two sub-pages — Fuel entry (the SM fuel form + recent) · Fuel monitor (stock, day-wise purchases ₹, truck-wise issuances + match chips, 🚩 flags — the accountant diesel monitor generalized). **Progress** (SM) = form on top + "Today's reports" (incl. supervisors') + lazy "Earlier reports". **Dashboard** (SM): inline diesel-check card removed (lives in Fuel monitor); Quick Actions expanded to 8 shortcuts (Fuel, Insights, Khata, People, Fleet, Materials, Reports, Complaints).

> **Status: 📋 PENDING — DO NOT BUILD YET.** Part of the role-by-role client review (2026-07-18); all roles build together in one pass at the end. Tracker: [`../ROLE-AUDIT-TRACKER.md`](../ROLE-AUDIT-TRACKER.md).
>
> Current-state facts code-verified against `complaints-inbox-screen.tsx`, `complaint-screen.tsx`, `sm-settings-screen.tsx`, `ledger-screen.tsx`, `insights-screen.tsx`, `fleet-screen.tsx`, `people-screen.tsx`, `shared/src/db/schema.ts`, `shared/src/config.ts` (contracts `frozen.9`).

---

## SM-0 — Profile: ✅ no change

Shared `ProfileScreen` across all roles is fine as implemented.

## SM-1 — Complaints rework: SM can RAISE to Owner + detail sub-page + load-more (inbox pattern ALSO applies to OWNER)

**Today:** the SM has only the **inbox** variant (`complaints-inbox-screen.tsx`) — list rows with full text inline, "Mark resolved" button, `ShowMore(10)`. He has **no raise form** (raisers today: worker/driver/supervisor/accountant). Owner-target complaints never reach his inbox (server-side).

**Requested:**
- **SM gets a complaint form too** — he can raise a complaint to the **Owner** (target fixed: OWNER; no "to Site Manager" option for himself).
- SM sees **both**: the inbox of complaints raised to him by site workers **and** his own raised-complaints history.
- **Every complaint row opens a detail SUB-PAGE** (client explicitly wants the vendors-screen shop-detail pattern: in-page sub-view, **URL does not change**, a back button at the top returns to the list). The detail shows: who raised it, full text, and every attachment — photo, video, anything attached.
- **Load-more paging:** show ~7–8 complaints, then a "load more" that fetches the next batch (server-side paging, not render-only ShowMore — see implication).
- Resolve action moves into/stays available from the detail sub-page ("all options implemented better way" there).
- **The same detail-sub-page + load-more treatment applies to the OWNER's complaint inbox** — but the Owner gets **no complaint form** (nobody above him).

**Implications:** `COMPLAINT_TARGETS` today = `['OWNER','SITE_MANAGER']` — an SM raising to OWNER fits the enum; the change is allowing role SITE_MANAGER as a raiser (service + UI). `GET /complaints` needs offset/cursor paging params (additive) for true load-more. Attachment display in the detail view hits the known **no-media-read-endpoint** gap (R2 absent) — the sub-page can show counts/placeholders until media lands (note dependency).

## SM-2 — Settings: sub-pages per config area + per-form configuration hub

**Today:** one long `sm-settings-screen.tsx` — Limits, Categories (enable/disable + rename the 6 fixed categories), Request-form fields (5 toggles for the worker/driver expense form only), Emergency contacts. Single save per group.

**Requested:**
- Split into **sub-pages**: Expense categories · Limits · Request-form fields (same in-page sub-view pattern).
- **Expense categories sub-page:** create a NEW subcategory, edit current categories — not just toggle/rename the fixed 6.
- **Per-form configuration hub:** list **every form that exists across all roles** by name (fuel form, damage form, expense forms, progress, materials, diesel, vehicle-change, complaint…). Clicking a form name opens its sub-page where its fields/behavior are configured — generalizing today's single "request-form fields" block to all forms.

**Implications (⚠️ the biggest contracts item of this role):** `expenses.category` is a **Postgres enum column** of the 6 frozen values and the config schema keys are `z.enum(EXPENSE_CATEGORIES)` — free-form new categories cannot be pure config. Recommended: keep the 6 enum values as top-level groups and add **config-driven subcategories** (site/org config array `{key,parent,labelHi,labelEn,enabled}`) + a nullable `expenses.subcategory` text column stamped on entry — reports group by category, drill by subcategory. (Alternative — migrate category to text — riskier for reports/RLS-tested paths; not recommended.) The per-form config hub needs a `formsConfig` block in site config (per-form field toggles), consumed by each form screen; start with the fields the screens already conditionally render.

## SM-3 — Khata sub-pages (mirror of the accountant's ACC-2/ACC-3)

**Requested:** SM's khata splits into sub-pages too — **who holds what** (the existing rollup, work-cash-only), **cash entries** (give/receive), etc. Form shows by default; histories lazy-load (refresh/"show history" tap). Same last-N + "view all" + date-filter full-history pattern as the accountant's file.

## SM-4 — Single-site: remove EVERY site chooser for SM (extends SUP-2)

**Today:** SM screens carry `SitePicker`s (verified on insights; expense/progress/fuel/diesel-flags/reports site-summary all handle multi-site), and the data model lets one SM manage several sites (devco's SM manages 2).

**Requested:** an SM belongs to exactly **one site**. Once assigned site X he sees ONLY site X — he must not even see site Y's **name** anywhere. Remove the site selection from insights, reports, and every other SM screen; everything auto-scopes to his site.

**Implication:** UI drops pickers (auto-use the single site); `loadScope` SM branch effectively single-site; seed/onboarding rule: one SM login per site (devco's 2-site SM needs a second login or reassignment — data migration note). Reports' site-summary section becomes his-site-only.

## SM-5 — Fleet page: sub-pages

**Today:** one stacked page — vehicle list + add-vehicle form + vehicle-types list + add-type form (vehicle DETAIL sub-pages already exist and the client likes them).

**Requested:** organize into sub-pages: **Vehicles** (list → existing detail), **Add vehicle**, **Vehicle types** (list + add). Same in-page sub-view pattern.

## SM-6 — People page: sub-pages + ID-card edit button fix

**Today:** one stacked page — user/login list, create-login form, create-person form, labour-master ID-card list. In the labour-master list the **pencil icon + "Edit ID card" text overflows/gets cut off** (client saw a half-visible label).

**Requested:**
- Sub-pages for: **Logins** (list) · **Add new login** · **Add worker** (labour master) · **Labour-master ID cards**.
- **Fix the cut-off edit button: show ONLY the pencil icon** (drop the "Edit ID card" text label).
- Everything else on this page works fine.

---

## Open questions (resolve before the final build pass)

- **Q1 — SM's own raised complaints:** shown as a separate tab/section next to his inbox, or merged with a "raised by me" filter? (Recommend: two tabs — "Inbox" / "My complaints".)
- **Q2 — Subcategory model:** confirm the recommended enum-category + config-subcategory + `expenses.subcategory` column approach (vs. migrating the category column to free text).
- **Q3 — Per-form config hub scope:** which knobs per form for v1? (Recommend: field show/hide + required toggles only — the pattern the expense-request form already proves; behavior knobs later.)
- **Q4 — Multi-site SMs in existing data:** devco's SM manages 2 sites — split into two logins, or pick one site and hand the other to a new SM? (Onboarding decision, affects the migration step.)
- **Q5 — Complaint detail media:** photos/video display blocked on R2/media-read endpoint — ship the sub-page with counts/placeholders first, or hold SM-1 until media lands?

---

**Cross-file overlaps:** SM-3 khata sub-pages = accountant ACC-2/ACC-3 (build one khata-sub-page framework, mount per role); SM-4 single-site = SUP-2 (one enforcement pass); SM-1's inbox rework explicitly covers the OWNER inbox too (note for the owner review); the sub-page navigation pattern (URL-stable, back button — like the vendor shop detail) is requested across complaints/settings/khata/fleet/people — build ONE reusable sub-page primitive.
