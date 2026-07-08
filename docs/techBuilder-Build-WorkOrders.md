# techBuilder — Build Work Orders (Client Plan → Code)

> **What this is:** the gap analysis between `docs/techBuilder-Client-Plan.html` (the client-approved plan, quotable codes W/D/T/S/O/M/V/N/SUG) and the code as of 2026-07-04 — turned into **numbered work orders (WO-0 … WO-15)** sized for execution by Sonnet subagents, with the few Opus-tier items marked. Full design rationale lives in `docs/techBuilder-Role-Customization-Plan.md`; this doc is the build checklist.
>
> ## ✅ BUILD COMPLETE (2026-07-08) — ALL WORK ORDERS SHIPPED & GATED
> **Final gate:** backend typecheck clean · **39/39 unit** · **54/54 integration** (incl. the WO-15 sealed-box audit: SM-A vs site-B FORBIDDEN across insights/vendors/vehicle-detail/issue-resolve/site-config; driver fleet list site-bounded; TH-deactivate blocked; TH crew-slice positive check) · web typecheck+lint clean · production build green. Contracts at `1.0.0-frozen.4`, migrations 0001+0002 live on Neon.
> **Everything from the client plan is live:** expense requests + caps/windows/threshold ladder + materialize-on-approve · TH/SM direct expense w/ over-limit conversion · driver day (AM compulsory/PM optional) · vehicle switch + damage lifecycle · fleet drill-downs + analytics · progress split + covered-banner · SM settings (limits/categories/form-toggles/contacts) · contacts footer · **money ledger (khata + give/return + rollup)** · **vendors/udhaar (credit purchases + shop ledger)** · date-wise insights (day/period/person) · T-5 + S-8 enforced.
> **Parking lot (phase 2 / blocked):** R2 keys → real photo/voice storage + media display · D7 push reminders · SUG-4 album / SUG-5 PDF / SUG-6 doc alerts · N-4 material workshop · client answers pending (M-4 confirm-tap & negative-balance policy, ₹25k bless, SUG-1/2) · per-vehicle expense linkage (needs a vehicleId column on expenses — flagged) · refresh `docs/techBuilder-Role-Blueprint.html`.
>
> **BUILD STATUS (2026-07-08):** ✅ **WO-0 DONE** — contracts `1.0.0-frozen.3` + Neon migration `0001_amazing_inertia` applied & verified (RLS forced on 2 new tables, 11 new cols, EXPENSE_ADD enum live; 31/31 backend tests; web build green). ⚠️ gotcha: run drizzle migrations with `DATABASE_URL=$DATABASE_URL_ADMIN` — the default env var is the app role and drizzle-kit fails silently. ✅ **WO-1 DONE** (Haiku — attendance/wages/leave/material trimmed; nav split deferred to WO-6/WO-14 so no dead links). ✅ **WO-2 DONE** (Sonnet — `PhotoMultiField`, `VoiceField`, `uploadPhotos`/`uploadVoice`, MEDIA_UI i18n; Safari falls back to audio/mp4). ✅ **WO-4 DONE** (Sonnet — GET /me/contacts beside /me in the prefix-less MeController, zero module rewiring; `<ContactPanel>` tap-to-call mounted on worker+driver dashboards; CONTACTS_UI i18n). ✅ **WO-3 DONE** (main session) — the money engine, **32/32 integration tests vs live Neon**: EXPENSE_ADD submit validation (worker/driver cap + 3-day window + site derived server-side + worker type-restriction), TH may decide crew expense requests (drivers naturally route past TH to SM — no crewId), reject-needs-reason, **approve materializes the booked expense in the same tx** (expense.id = request.id, enteredBy = spender, decider's categoryOverride wins), APPROVAL_REQUESTED/APPROVAL_DECIDED notifications, TH direct window 2d→7d, per-entry direct limits in records.createExpense (TH ₹25k / SM ₹1L → `fields.amountPaise='OVER_DIRECT_LIMIT'`), SM >₹1L decidable only by Owner (proven by construction). **Fixed a pre-existing hole:** assertDecideScope ignored vehicle-derived sites, so SMs could never decide ANY driver request — now falls back to the requester's vehicle sites. ✅ **Batch B DONE & GATED** (4× Sonnet + orchestrator integration; gate: tc ×3 clean, 31/31 unit, 32/32 integration, web build green): **WO-5** expense-request screen (config-driven fields/cap/categories, dynamic 3-day date select, PhotoMultiField+VoiceField, my-requests cards w/ rejection reason; mounted /worker/requests + worker dashboard summary + stacked on driver requests page). **WO-6** expense-screen for TH/SM (/team-head/expense, /site-manager/expense; limit hint + over-limit auto-routes to request + server-fallback "send for approval instead" on OVER_DIRECT_LIMIT/FORBIDDEN). **WO-7** GET /vehicles/my-snapshot + driver dashboard rebuild (vehicle card w/ readings + pending-switch chip; compulsory morning form w/ required meter photo; optional evening form w/ ≥start check, hours/loads/note upserting same-day log). **WO-8** PATCH /sites/:id/config (owner/SM-own-site; SM can't set smDirectLimitPaise) + SM settings screen (limits/categories/field-toggles/emergency-contacts) at /site-manager/settings. **Orchestrator fixes during integration:** records.controller zod schemas were silently STRIPPING hoursWorked/loadsCount/note + paidVia (added); SM config save no longer wipes an Owner-set smDirectLimitPaise override (server carries it forward); nav wired — Expense entry (record.enter → /expense, testId nav-expense) + SM-only Settings entry (roles filter added to NavDef) + NAV_LABELS.expense both catalogs. **Follow-up captured:** direct-expense path cannot persist `remark` (no expenses.note column) — needs a tiny additive contract bump (fold into WO-9/10 window). ⏭️ next: WO-9 ledger (Opus core + Sonnet UI) + WO-10 vendors (Sonnet), then batch C (11/12/14) → 13 → 15.
>
> **Verified against code** (not assumed): single-photo upload exists (`web/src/lib/media-upload.ts` + `PhotoField`, degrades gracefully without R2); approvals backend handles only VEHICLE_SWITCH/LEAVE/MATERIAL; **no voice recorder, no multi-photo, no EXPENSE_ADD, no vendors module, no cash-ledger, no thresholds, no insights rollups**; settings screen read-only.

## Status legend
✅ exists · 🟠 partial (exists but must change) · ❌ not built

---

## 1 · GAP TABLE — every client-plan code vs the code today

| Code | Feature | Status | Gap in one line |
|---|---|---|---|
| W-1 | Worker home (ID + my requests) | 🟠 | ID card exists; **attendance list must be hidden**; "my requests" list ❌ |
| W-2 | Emergency contacts footer | ❌ | No storage, no `/me/contacts`, no component |
| W-3 | Worker expense request form | ❌ | Worker has zero write ability today (RBAC + form + flow all new) |
| W-4 | Worker restrictions | ✅ | Already SELF-scoped; nothing to do beyond W-1 hide |
| D-1 | Driver home (vehicle card + readings) | 🟠 | Dashboard exists; readings card + request-status chips ❌ |
| D-2 | Morning form (compulsory) | 🟠 | `vehicleLogCreate` endpoint exists; photo-proof form + compulsory UX ❌ |
| D-3 | Evening form (optional, current reading, hours/trips/loads/note) | ❌ | New vehicle_logs columns + form + skip logic |
| D-4 | Driver expense request (custom form) | ❌ | Shares W-3 + site-config-driven fields/categories |
| D-5 | Vehicle switch (self + request + notify SM) | 🟠 | VEHICLE_SWITCH approval exists; **self-switch endpoint + ASSIGNMENT_CHANGED notify** ❌ |
| D-6 | Damage report + lifecycle + history | 🟠 | `issues` table/endpoint exist; resolve/close remarks, voice, per-vehicle timeline ❌ |
| D-7 | Driver restrictions | ✅ | Scope already OWN_VEHICLE |
| T-1 | TH per-person insights | ❌ | No person rollup read, no drill-down screen |
| T-2 | TH direct expense (₹25k/entry, 7d, camera+gallery+voice) | 🟠 | Expense entry exists in records-screen; **threshold routing, gallery+camera choice, voice, split nav** ❌ |
| T-3 | Progress form (2×/day, ~20 photos, voice, coverage) | 🟠 | `progressCreate` exists (text+ids); multi-photo, voice, coverage rule, "no progress" ❌ |
| T-4 | TH approvals (worker EXPENSE_ADD) | ❌ | Backend hard-blocks TH to VEHICLE_SWITCH only (`approvals.service.ts:131`); EXPENSE_ADD type ❌ |
| T-5 | TH people (create, NO deactivate) | 🟠 | Create exists; **deactivate must be denied for TH** (today allowed by cascade) |
| T-6 | TH removals | ❌ | Attendance/leave/material still in TH nav |
| S-1 | Day-wise dashboard + full Insights page | ❌ | No day/period rollup read, no insights page, no date presets |
| S-2 | SM expense ≤₹1L instant, >₹1L → Owner | 🟠 | Direct entry exists; threshold → Owner-approval routing ❌ |
| S-3 | SM progress (shared form) | 🟠 | Same as T-3 |
| S-4 | SM approval center (all new types) | 🟠 | Screen exists for old types; EXPENSE_ADD render+finalize, damage close ❌ |
| S-5 | Fleet drill-down + vehicle photos + analytics | 🟠 | Fleet list exists; vehicle/driver detail pages, 1–2 photos, 7/30/90d analytics ❌ |
| S-6 | SM people incl. deactivate | ✅ | Exists (keep; only TH loses it) |
| S-7 | SM settings (limits, categories, form fields, contacts) | ❌ | Settings screen is READ-ONLY; no per-site config storage or update endpoint |
| S-8 | One-site isolation | 🟠 | Scope checks exist (WP-1) but **must be audited per-read + regression-tested** for the hard "sealed box" promise |
| O-1 | Owner sees all + drill-downs | 🟠 | Dashboards exist; new drill-downs/insights mount at org scope |
| O-2 | Excel + org defaults | 🟠 | Excel exists; org-defaults editor ❌ |
| M-1…M-4 | Money ledger (give/return, balances, khata, rollup) | ❌ | Entirely new (table, module, forms, cards, rollup) |
| V-1…V-3 | Vendors (per-site list, credit purchases, ledger) | ❌ | `vendors` table + `expenses.vendorId` exist in schema; module/screens/payments/`paidVia` ❌ |
| N-1/N-2/N-3 | Attendance/Wages/Leave removals | ❌ | Nav + screens still live for all roles — must be commented out |
| N-4 | Material design workshop | — | Awaiting client input (not code) |
| N-5, SUG-4/5/6 | Reminders, album, PDF, doc alerts | — | Phase 2 — parked, no work now |
| — | **Voice notes (cross-cutting)** | ❌ | No recorder component anywhere; media kind VOICE exists in contracts |
| — | **Multi-photo (cross-cutting)** | ❌ | Only single `PhotoField`; plan needs 2–3 (requests) and ~20 (progress) |
| — | **R2 media storage** | 🟠 | Presign is a local stub; real uploads need `R2_*` keys (BLOCKER for photo/voice going live; UI degrades gracefully meanwhile) |

---

## 2 · WORK ORDERS — dependency-ordered, with brief plans

> Model tiers per `.claude/rules/build-strategy.md`: **[OPUS]** = contracts/money/approvals/scope (errors propagate); **[SONNET]** = mechanical against a frozen spec. Sonnet WOs must NOT touch `shared/`, `app.module.ts`, or another WO's folders; the orchestrator wires and typechecks centrally.

### WO-0 · Contracts bump + migration — THE FOUNDATION [OPUS] ⚠ do first, alone
Covers: enables every other WO.
- `shared/src/enums.ts`: `APPROVAL_TYPES += 'EXPENSE_ADD'`; `PAYMENT_MODES = ['CASH','VENDOR_CREDIT']`; `CASH_TRANSFER_KINDS = ['GIVE','RETURN']`.
- `permissions.ts`: `WORKER['request.submit'] = 'SELF'`.
- `db/schema.ts`: `sites` += `emergencyContacts jsonb`, `expenseFormConfig jsonb` (field toggles + category subset/labels + workerCapPaise + thExpenseLimitPaise + smExpenseLimitPaise override); `vehicle_logs` += `hoursWorked`, `loadsCount`, `note`; `expenses` += `paidVia`, (vendorId exists); `issues` += `resolutionNote`, `closingNote`, `resolvedBy`; `vendors` += `siteId`; **new tables** `cash_transfers` (fromUserId, toUserId, amountPaise, kind, businessDate, note) and `vendor_payments` (vendorId, amountPaise, businessDate, note) — both `...base()`, both in `TENANT_TABLES` + `rls.sql` policy blocks.
- `dto.ts`/`domain.ts`: ExpenseRequestPayload, CashTransfer, VendorPayment, VendorLedger, ContactPanel, PersonInsights, VehicleSnapshot/Analytics, DayInsights types. `config.ts`: org-default thresholds (worker cap ₹2,000? TH ₹25,000, SM ₹1,00,000), windows (worker/driver 3d, TH 7d).
- `api.ts`: endpoints — meContacts, requests (reuse approvals paths), cashTransfer create/list/balance, vendors CRUD/payments/ledger, insights (person/day/vehicle), site-config PATCH, issue resolve/close, vehicle self-switch.
- Bump `1.0.0-frozen.N+1` · `npm run build` + typecheck ×3 · `db:generate && db:migrate && db:rls`.
- **DoD:** all 3 workspaces typecheck; migration applied on Neon; note in PROJECT_AI_CONTEXT §0.

### WO-1 · Web removals + nav restructure [SONNET]
Covers: N-1/2/3, T-6, S-0, W-1(hide).
- `web/src/lib/nav.ts`: comment out attendance/wages entries; **split records → `Expense` + `Progress`** entries (both under `record.enter`).
- Remove LEAVE/MATERIAL from requests/approvals screens' type lists (comment, don't delete). Delete-route no: keep pages but unlink; add redirects if linked anywhere.
- Worker dashboard: remove attendance card (comment out), keep ID card.
- **DoD:** every role's nav shows only plan surfaces; `npm run build` green; no 404 from remaining links.

### WO-2 · Media kit: multi-photo + camera/gallery + voice recorder [SONNET]
Covers: cross-cutting (W-3, D-2/3/6, T-2/3).
- `web/src/components/entry/photo-multi-field.tsx`: n-photo picker (configurable max 3/20), each via existing `uploadPhoto`; camera (`capture="environment"`) AND gallery inputs as two buttons.
- `web/src/components/entry/voice-field.tsx`: MediaRecorder → webm/opus blob → upload via presign (`kind:'VOICE'`); record/stop/play/delete; hidden when `features.voiceNotes` off; degrades like photos (never blocks save).
- Extend `media-upload.ts` with `uploadVoice` (skip downscale path).
- **DoD:** components typecheck + storybook-style test page works; save-without-R2 shows non-blocking notice (existing pattern).

### WO-3 · Approvals core: EXPENSE_ADD end-to-end [OPUS]
Covers: W-3 backend, D-4 backend, T-4, S-4, S-2/T-2 threshold routing.
- `backend/src/approvals/approvals.service.ts`: accept `EXPENSE_ADD` submit (payload zod: siteId derived server-side, category, amountPaise, businessDate, paidVia, vendorId?, mediaIds, remark); validate per-role: worker/driver ≤ site cap & ≤3d; TH >₹25k or >7d routes here; SM >₹1L routes here with **Owner as decider tier**; lift the TH `:131` hard-block → TH may decide worker EXPENSE_ADD only.
- **On approve (single tx):** insert `expenses` row (decider's category wins, attribution kept, paidVia carried) + notification to requester. On reject: comment required.
- Decide-scope: TH=own-crew workers; SM=own site; Owner=SM requests. Requester≠decider reused.
- Integration tests: cap reject, window reject, threshold routing (TH/SM), materialize idempotency, worker cannot submit other types.
- **DoD:** `npm test` + `test:integration` green with new cases.

### WO-4 · Contacts: /me/contacts + ContactPanel + SM editor [SONNET]
Covers: W-2, D-1(footer), S-7(4).
- Backend: `GET /me/contacts` (users module) — resolve SM (site.siteManagerId), TH (crew.teamHeadUserId), site `emergencyContacts`; SELF-safe.
- Web: `<ContactPanel>` (tel: rows, grouped People/Emergency) mounted on worker+driver dashboards; SM settings tab: contacts editor (list CRUD → site PATCH from WO-8).
- **DoD:** worker/driver see live panel; SM edit round-trips to Neon.

### WO-5 · Expense request form + "my requests" [SONNET]
Covers: W-1(list), W-3, D-4 web.
- `components/screens/expense-request-screen.tsx`: amount (client-side cap check w/ friendly block), date (3d window), category (from site config), bill photo + extra photos (WO-2), remark, voice; driver variant adds vehicle categories; field visibility from `expenseFormConfig` toggles.
- `app/worker/requests/page.tsx` + driver mount; "my requests" status list (PENDING/APPROVED/REJECTED+reason) card on both dashboards.
- **DoD:** worker+driver submit → lands PENDING in Neon; over-cap blocked with message; i18n both catalogs.

### WO-6 · TH/SM direct expense screen + history [SONNET]
Covers: T-2, S-2 web, split-nav Expense destination.
- `components/screens/expense-screen.tsx`: direct entry (camera OR gallery, remark, voice); client mirrors thresholds/windows → shows "will go for approval" banner when routing to request; history list (crew-scope TH / site-scope SM) w/ filters; paidVia + vendor selector (reads WO-10 vendors; degrade to CASH-only if none).
- **DoD:** TH ≤₹25k/≤7d books instantly; >limits visibly converts to request; history matches Neon.

### WO-7 · Driver day: D-2/D-3 forms + vehicle card [SONNET]
Covers: D-1, D-2, D-3.
- Backend: vehicle-log upsert accepts new fields + media attach; "my vehicle snapshot" read (current+yesterday reading via latest logs, status, pending switch).
- Web: morning section (meter photo required, start reading, optional photos; compulsory = persistent banner until filled); evening section (optional; current reading ≥ start check, hours/trips/loads/note); dashboard vehicle card.
- **DoD:** two sessions same day roll into one row; skip-evening closes via next morning; TH/SM/Owner can read logs.

### WO-8 · Site config storage + SM settings screen [SONNET after WO-0]
Covers: S-7 (all four), O-2 defaults, D-4 form config source.
- Backend: `PATCH /sites/:id/config` — SM-scoped (own site) narrow update of `expenseFormConfig` + `emergencyContacts` (NOT full site.manage); org-defaults read stays from OrgConfig.
- Web: settings screen tabs — Limits (worker/driver cap, TH limit; SM's own ₹1L visible read-only "set by Owner"), Categories (enable/rename hi+en), Form fields (toggles), Contacts (WO-4 editor). Owner variant edits org defaults (+ per-site SM limit).
- **DoD:** SM edits persist + instantly shape W-3/D-4 forms; limit-edit rule enforced server-side (one-level-above).

### WO-9 · Money ledger (M-1…M-4) [OPUS core + SONNET UI]
- Backend [OPUS]: `cash-transfers` module (create GIVE/RETURN — giver records; validate down-chain give / up-chain return), `GET /me/balance` (received − given − approved CASH expenses), `GET /ledger/rollup` (owner/SM: per-person, per-category). Hook: WO-3 approve deducts (paidVia=CASH). Unit-test the math (hand-computed fixtures, like wage-calc).
- Web [SONNET]: khata card (received/spent/left) on ALL dashboards; give/return money form (Owner/SM); owner rollup view ("where did my ₹1L go").
- **DoD:** ledger math tests green; give→spend→approve→balance E2E correct in Neon.

### WO-10 · Vendors (V-1…V-3) [SONNET, sites/-pattern module]
- Backend: `vendors` module (per-site CRUD, `vendor_payments` create, ledger read: purchased/paid/balance by month) — copy `sites/` pattern exactly.
- Web: shop list + shop detail (ledger) screens (SM; Owner org-wide); payment record form; wire vendor+ON-CREDIT option into WO-5/WO-6 forms (credit skips balance deduction — coordinate contract w/ WO-9).
- **DoD:** credit expense → site expense + vendor outstanding, NOT balance; payment reduces balance; month grouping correct.

### WO-11 · Switch + damage lifecycle [SONNET]
Covers: D-5, D-6, S-4 (those types).
- Backend: `POST /vehicles/switch` self-switch (type ∈ allowed → reassign + free old + `ASSIGNMENT_CHANGED` notification to SM); issue `resolve` (SM: status+resolutionNote) + `close` (driver: closingNote) endpoints.
- Web: switch form (shows which vehicles are instant vs request); damage form (severity/desc/photos/voice via WO-2); per-vehicle damage timeline; SM approval-center rendering for switch+damage.
- **DoD:** self-switch notifies SM in-app; lifecycle states walk end-to-end.

### WO-12 · Fleet drill-down + vehicle analytics [SONNET]
Covers: S-5, D-1 analytics source, O-1 reuse.
- Backend: per-vehicle aggregate read (readings history, fuel litres+₹, expenses total/by-cat, trips/loads, damage list) + per-driver aggregate + analytics calc (7/30/90d avg run, monthly cost) — pure functions + unit tests.
- Web: register-vehicle (+1–2 photos via WO-2), vehicle-detail page, driver-detail page; mounted SM (site) + Owner (org).
- **DoD:** numbers reconcile with raw Neon rows on a seeded fixture.

### WO-13 · Insights (T-1, S-1, O-1) [SONNET; read shapes from WO-0]
- Backend: day/period rollup endpoints — person-scoped (TH crew), site-scoped (SM), org-scoped (Owner): progress+expenses+requests grouped by day, with today/week/month totals.
- Web: full Insights page (date presets: yesterday/day-before/last-7/last-30/any date; per-day blocks: progress w/ photos+voice inline, expenses w/ who, request cards w/ outcome); person drill-down page from People/T-1; dashboards embed the summary variant.
- **DoD:** same component three scopes; "NO PROGRESS TODAY" days visibly flagged (uses WO-14 coverage).

### WO-14 · Progress form + coverage rule [SONNET]
Covers: T-3, S-3.
- Backend: progress create accepts many mediaIds + voice; coverage = TH-or-SM note exists per site/day (completeness SITE reuse); expose in insights read.
- Web: `progress-screen` — multi-photo (~20, WO-2), voice, text, bill photos; 2–3/day allowed; mounted TH+SM.
- **DoD:** either role filing covers the day; zero-notes day shows the red flag in S-1/O-1.

### WO-15 · Isolation audit + final verify [OPUS]
Covers: S-8, T-5 gating, whole-plan DoD.
- `users.service.ts`: exclude TEAM_HEAD from deactivate. Audit EVERY SM/TH read incl. all new endpoints for site/crew scoping (RLS is org-only!); add integration tests: SM-A sees zero of site B across expenses/progress/vehicles/requests/vendors/ledger; threshold matrix tests; TH-deactivate-denied test.
- Full gate: typecheck ×3, backend `npm test` + `test:integration`, web build+lint, per-role E2E click-through, Neon row verification. Refresh `docs/techBuilder-Role-Blueprint.html` to match.
- **DoD:** everything green; blueprint HTML current; PROJECT_AI_CONTEXT §0 updated.

---

## 3 · EXECUTION MAP

```
WO-0 (contracts+migration, OPUS, solo)
 ├─► WO-1 removals ─┐            (parallel Sonnet batch A: WO-1, WO-2, WO-4)
 ├─► WO-2 media kit ┤
 ├─► WO-4 contacts  ┘
 ├─► WO-3 approvals core (OPUS)
 │     ├─► WO-5 request form ┐   (parallel batch B: WO-5, WO-6, WO-7, WO-8)
 │     ├─► WO-6 direct expense┤
 │     ├─► WO-7 driver day    ┤
 │     └─► WO-8 site config   ┘
 ├─► WO-9 ledger (OPUS core → Sonnet UI)   depends on WO-3
 ├─► WO-10 vendors                          depends on WO-3, coord WO-9
 ├─► WO-11 switch+damage ┐  (parallel batch C: WO-11, WO-12, WO-14)
 ├─► WO-12 fleet detail  ┤
 └─► WO-14 progress      ┘
        └─► WO-13 insights (needs 7/9/10/14 data live)
              └─► WO-15 audit + verify (OPUS, last, solo)
```
Disjoint-folder rule per batch; orchestrator owns `app.module.ts`, `nav.ts` merges, and the central typecheck after each batch.

## 3b · MODEL ASSIGNMENT (final)
| Model | Owns | Rationale |
|---|---|---|
| **Fable (main session)** | WO-0 · WO-3 · WO-15 · all orchestration (wiring `app.module.ts`/`nav.ts`, central typecheck gate after each batch, diff review, seam fixes) | Highest error-propagation: contracts, money engine, isolation audit, integration |
| **Opus (subagent)** | WO-9 backend core (ledger math + hand-computed fixtures); escalation target if any Sonnet WO comes back flaky (esp. WO-2 voice) | Money math = wage-calc tier |
| **Sonnet (parallel subagents, disjoint folders)** | WO-2, 4, 5, 6, 7, 8 · WO-9 UI · WO-10, 11, 12, 13, 14 | Mechanical against frozen shapes — the proven 42-files/3-fixes pattern |
| **Haiku** | WO-1 (nav comment-outs) · i18n catalog filling | Trivial, zero design decisions |

Gate discipline: after every Sonnet batch → typecheck ×3 + build + review by the main session BEFORE the next batch launches. Sonnet agents never touch `shared/`, `app.module.ts`, `nav.ts`, or another WO's folders.

## 4 · BLOCKERS & OPEN INPUTS (resolve before/while building)
1. **R2 keys** (`backend/.env R2_*`) — photos/voice save-path works without them (graceful degrade) but nothing is actually stored. Needed before pilot. **← user**
2. **Client answer M-4** — receiver "received ✓" tap? negative balance allowed or blocked? (WO-9 builds derivation either way; the submit-guard flips on this.) **← client**
3. **₹25,000 TH default** — dev-picked, confirm with client. **← client**
4. **SUG-1 / SUG-2** — WhatsApp digest & budget alert: awaiting client yes/no (not blocking anything).
5. **N-4 material workshop** — collect client's current process (parallel, not blocking).
