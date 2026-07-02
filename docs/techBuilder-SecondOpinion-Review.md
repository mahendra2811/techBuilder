# techBuilder — Second-Opinion Review (Claude Fable 5, 2026-07-02)

> Response to `docs/` review brief. Grounded in the planning docs **and the actual code** (`shared/`, `backend/`, `app/`), which is further along than the brief implies. Verdicts are honest; where I agree I say so and move on.

---

## Meta-verdict (read this first)

The brief asks "before I write more code" questions, but the repo is **past that point**: the backend (16 modules) is built and verified on live Neon (RLS cross-tenant 5/5, HTTP E2E green), 35 screens exist, and the app runs on a phone in mock mode. Several questions (PWA vs native, NestJS vs BaaS, role sequencing) are effectively **moot — re-architecting now would destroy verified work for no customer benefit**.

The real dangers are not architectural. They are:

1. **Spec promises the code doesn't keep** — most seriously in RBAC scope enforcement (see B5), edit/correction rules, and offline sync. "Code-complete" checkmarks are hiding unimplemented trust features.
2. **A pilot surface far bigger than one customer needs** — the plan's 55 screens (35 built) vs the ~8 that will actually get used in week 1.
3. **Doc drift** — the brief itself cites stale facts (SDK 55 → actual is 54; VisionCamera → actual is expo-camera; 55 screens → 35 built, never re-tallied per Screen-Plan §12.7's own instruction). In an AI-assisted workflow the docs are the prompt for every future session; drift becomes future wrong code.

---

## A. Overall approach

**A1. Scope size — PARTIAL AGREE (planned = too big; built = about right; pilot = must be much smaller).**
55 planned screens (Screen-Plan §3) would be badly oversized for a traditional solo 30 hr/wk build. The AI-assisted build delivered 35 — but that 55→35 descope happened **silently**: §12.7 says "final count to be re-tallied during scaffolding" and it never was. Nobody *decided* what fell out. Action: write the descope list deliberately (which of O9/O10/O12–O15, D9/D10, SM8 etc. are out) rather than discovering it later. The remaining cost isn't screens — it's the hardening tail (offline, capture, exports, QA), which is where solo projects die.

**A2. Wedge — PARTIAL AGREE (records+visibility is right; re-weight the pilot toward fuel).**
Keep "records + visibility" as the wedge. But for *this* fleet-heavy customer, put the **fuel log + diesel reconciliation** in the day-1 pilot surface alongside attendance+expense. Diesel is the classic Indian construction leak (research: fuel/material leakage 5–12%), the reconciliation module is already built server-side, and a fuel entry is one screen. Don't restructure the product; reorder the onboarding.

**A3. Native vs PWA — AGREE with the native call, with one hard warning.**
Expo native was right: camera, offline, cheap Androids, installed-icon discoverability for low-literacy users. The warning: **Expo Go is not a pilot channel.** It is single-SDK and auto-updates from the Play Store — the customer's app can break overnight when Expo Go bumps SDKs (you already lived this at SDK 54 vs 57). The pilot must be a sideloaded **EAS APK**. Expo Go is for your own testing only.

**A4. Role sequencing — AGREE on order, DISAGREE on where the "wow" comes from.**
Owner-setup → SM/TH-data-in → Owner-value-out is right. But the wow comes from *seeded real data on day 1*, not rollout order. Problem: Engine-Onboarding-Plan §4.1 step 6 says seeding happens "via the Owner setup screens (O4/O6/O8)" — one-by-one taps. For 2–3 sites + fleet + dozens of workers that's hours of tapping and a terrible first impression. Build a **dev-side bulk seed (CSV → script)** per merchant (Spec §7 mentions "master-data import" but no mechanism exists anywhere). Also: Worker role (W1/W2) adds ~zero owner value — keep it out of the pilot entirely.

---

## B. What's wrong / risky

**B5. RBAC holes — YES, REAL ONES. This is the most important finding in this review, and it's in the code, not the docs.**

The matrix (`shared/src/permissions.ts`) defines scopes (`ORG/OWN_SITE/OWN_CREW/OWN_VEHICLE/SELF`). Three separate places promise scope enforcement: the guard comment ("scope is re-checked in the service"), Spec §4's caption ("scope re-derived from DB"), Domain-Model §3 ("enforced in the engine on every action, not just hidden in the UI"). **None of it is implemented.** `backend/src/common/rbac.guard.ts` checks only the boolean `can(role, action)`; `scopeFor()` is imported nowhere in the backend; no service filters by `assignedSiteId`/`crewId`/self. Verified consequences (single-tenant Phase 1, via direct API access with any valid low-role token):

| # | Hole | Where |
|---|---|---|
| 1 | **WORKER** (`view.all: SELF`) passes the guard for every `view.all` endpoint → can read org-wide expenses, attendance, dashboards, owner KPIs | rbac.guard.ts + every list/dashboard controller |
| 2 | **SITE_MANAGER** (`OWN_SITE`) gets ORG scope on everything — including the other site's data and the **org-wide wage summary** | same |
| 3 | **TEAM_HEAD** can mark/rewrite attendance for **any person, any site, any date** — the upsert (`attendance.service.ts`) has no scope or date-window guard | attendance.service.ts |
| 4 | **Self-approval:** `decideRequest` (`approvals.service.ts:44`) has no requester≠decider check and no scope check → a TH can approve **their own leave request** | approvals.service.ts |
| 5 | **`updateRecord`/`voidRecord`** (`records.service.ts:261,355`) have **no ownership check and no time window** — any `record.enter` role can edit or void anyone's records at any date. This directly violates Spec §5: *"creator may edit own record until business-day +1; edits audited."* | records.service.ts |

For a product whose pitch is **fraud reduction**, "the mistri can void the site manager's expense and rewrite last month's hazri via the API" undermines the core promise. Mitigations that do exist: the UI gates screens via `can()`; single tenant; audit columns make edits attributable; and the **role cascade IS properly enforced** (`users.service.ts` `CAN_CREATE`) — credit where due. The fix is bounded: one scope-enforcement helper + checks on ~6 paths + a self-approval guard. **Do it before the pilot** — it's also literally the demo line to the owner: "your mistri cannot touch your records."

Also: Domain-Model §3's matrix conflicts with Spec §4 (Owner record-entry ✅ vs —; TH approves leave vs vehicle-switch-only; "attendance marked by TH/SM **ONLY**" §4.3 vs Owner ✅ in both matrices). The Spec wins by declaration and the code mostly follows it — delete or fix Domain-Model §3's matrix so there's one truth.

**B6. Manual attendance — AGREE, not scope creep. But corrections are the real gap.**
Per-person manual marking is right: it feeds the wage summary (R1's "single most important gap") and matches actual hazri practice. What's underspecified is **backdated correction** — a daily real-world event (worker arrives after marking; half-day disputes next morning). Today: the Spec allows almost nothing (creator, own record, business-day+1) while the code allows everything (hole B5.3). Neither is right. Define a rule, e.g.: TH corrects own-crew attendance ≤48h back; SM ≤7 days; older = Owner only; all audited and **flagged in Excel exports**. Add it to Spec §5.

**B7. Unnecessary screens — YES, roughly a third of the planned 55.**
From the plan: O9 fleet analytics, O10 spend analytics, O12 materials overview, O13 issues overview, O14 activity feed, O15 gallery — six Owner analysis screens where week-1 needs one dashboard + drill-in. D9 vehicle documents, D10 maintenance log — defer. S5 notification center without push = a screen nobody opens. SM8 milestones drifts toward the PM-tool territory §10 explicitly skips. Three separate driver entry flows (trip / vehicle-log / fuel) should collapse into one "vehicle day card" for a low-literacy driver. Where already built, don't delete — hide behind `OrgConfig` flags.

**B8. Multi-tenancy readiness — AGREE it's done right; this is verified, not aspirational.**
`org_id` everywhere, `FORCE ROW LEVEL SECURITY`, non-superuser runtime role, per-tx `SET LOCAL`, cross-tenant tests 5/5 on live Neon. No retrofit risk. Two nits: Backend-and-Database.md still says `app.current_org` (actual: `app.org_id`) — fix the doc; and don't let the RLS checkmark create false comfort — RLS isolates **orgs**, not roles within an org (that's B5).

**B9. Quiet single points of failure — YES, six:**
1. **Sync pull is a stub.** `sync.service.ts:76` returns `{changes: [], cursor}` — honest in code, but Backend-and-Database.md never designed a change-feed at all, and Roadmap gate #2 claims "works 100% offline; syncs reliably." Reality: outbox isn't wired to any screen and pull doesn't exist. Cross-role "live" visibility is refetch-on-focus — **fine for Phase 1**, but verify every list screen actually refetches on focus, and rewrite the gate so it can't be greenwashed.
2. **Capture pipeline** — least-built, most device-fragile, and it's the differentiator. Simplify deliberately (D19) so it actually lands.
3. **Expo Go as pilot channel** — see A3. EAS APK only.
4. **Laptop backend** — right for Milestone A testing; a real pilot needs Railway/Render + acceptance that Neon free-tier scale-to-zero means a ~1–2 s first-request-of-the-morning wake.
5. **No server-side backup strategy in any doc.** Client zipped-JSON export is designed; Postgres backup isn't mentioned once. One scheduled `pg_dump` → R2 + one doc paragraph answers the owner's "what if you disappear?"
6. **Zero tests, especially wage calc.** Rate×presence + OT − advances is where owner trust is won or lost; one wrong payable number can end the pilot. Unit-test wage + completeness before demoing them.

**B10. Roll-up simplicity — AGREE it's achievable; aggregation is not the hidden complexity.**
Server-side aggregation over typed tables at this scale is trivial. What IS underestimated: (a) backdated corrections flipping yesterday's completeness state — decide if it recomputes; (b) the 20:00 EOD cutoff — an entry at 21:30 belongs to which business date? The config exists; the assignment behavior needs a test.

---

## C. What could be better

**C11. Smallest real-value Phase 1 (the pilot surface) — ~8 active screens:**
- **Owner:** one dashboard (today's headcount, today/week expense, per-site completeness, week's fuel) + Excel export (attendance + expense ledger).
- **SM/TH:** attendance roster (bulk-present + adjust), expense with photo receipt, progress note + photo.
- **Driver:** fuel + odometer entry (one screen).
- **Hidden in pilot** (built stays built, flag off): approvals, materials, trips, issues, advances, kiosk, voice, worker app, notifications.
Value beats: day 3 = owner sees a live dashboard; day 7 = first Excel lands in his WhatsApp; day 14 = first fuel-variance conversation.

**C12. Sequencing —** (note: the brief's "1a/1b/1c" sub-phases don't exist in any doc — the closest is Engine-Onboarding §7.4's build order). Recommended: attendance + expense + **fuel-log** from day 1 (fleet-heavy customer, one screen), then materials, then approvals, then the rest of fleet (trips/switch/reconciliation UI).

**C13. Cut list (things you're likely attached to):** the generic approvals engine as a *pilot-visible* feature (keep the code, don't train users on it in week 1); windowed 7/30-day **import** (export yes — import is a data-integrity trap nobody asked for); voice notes; QR/barcode scanning (what QR exists on this site? unclear job-to-be-done); notification center; cost rollups beyond per-site; kiosk mode (revisit only if the "TH types daily" hypothesis fails); **Hindi catalog completeness** (do TH/Driver screens first; the owner reads numbers and English fine).

**C14. Missing from all docs:**
1. **Backdated-correction policy** (B6) → one section in Spec §5.
2. **Bulk master-data import** for onboarding (A4) → dev-side CSV/seed script per merchant.
3. **Daily WhatsApp digest** — R2 tagged "owner daily digest (nice)"; I'd upgrade to pilot-critical in its cheapest form: a share-to-WhatsApp **text summary** button on the owner dashboard (client-side, near-zero work). Owners live in WhatsApp, and the digest creates the daily owner-asks-for-data pressure that *forms the TH entry habit*.
4. **Support/ops runbook** — who the SM calls, how you see errors (Sentry), how you fix bad data (SQL runbook), how the sideloaded APK gets updated.
5. **A written pilot scope agreement** with the customer — feature asks will start week 1; you need a "goes on the Phase-2 list" ritual, or a paying customer will steer a solo dev into perpetual scope churn.
6. **Audit-trail visibility in the UI** — "edited by X at HH:MM" chip on corrected records. The columns exist; surfacing them IS the trust feature.

---

## D. Tech stack

**D15/D16. Verdict — right-sized *now that it exists and is verified*; the calculus changed when the backend passed RLS+E2E on Neon.**
Starting from zero today, solo, one customer: Supabase (Postgres+RLS+auth+storage) would plausibly have replaced NestJS+custom auth+R2 presign with less to operate. But migrating now discards verified work for zero customer value, and the custom RLS engine *is* the multi-merchant agency thesis. **Keep it — and stop growing it.** 16 modules / 30 tables is already a lot of surface for a support-team-of-one; freeze the backend feature set and harden.

**D17. Offline — AGREE with expo-sqlite + outbox over PowerSync** (the md's rationale holds; the PDF's PowerSync pick assumed ~1,000 concurrent devices). Sharper simplification than the docs imply: wire the outbox for only the **3 loss-critical writes** (attendance, expense, fuel) in the pilot; every other write = online-required with a clean queued-retry toast. Reads = refetch-on-focus. Do **not** build the pull/change-feed in Phase 1 — and fix Roadmap gate #2's wording so "100% offline" stops being a claim the code can't keep.

**D18. PDF stack items actively wrong to adopt now** — each justified in the PDF by 100–1,000-tenant / 25K-MAU / real-time-fleet assumptions Phase 1 explicitly rejects: PowerSync ($49/1,000 conns), Clerk (10–50K MAU), Next.js 16 + Vercel Pro wildcard-subdomain multi-tenant web, Supabase Realtime/Ably fleet telemetry, Mapbox + background GPS, Razorpay UPI AutoPay, MSG91/WhatsApp OTP, Turborepo+pnpm, server-side Puppeteer Hindi PDFs, ExcelJS streaming (SheetJS is fine at your row counts), PostHog (Sentry suffices). The md docs already rejected most of these — **stamp the PDF "superseded — historical rationale"** in PROJECT_AI_CONTEXT so no future session resurrects it. (The brief itself citing "Expo SDK 55" and "VisionCamera" is this exact failure mode in miniature.)

**D19. R2 + capture — R2 yes; the pipeline as documented is over-built for Phase 1.**
Simplify v1 to: expo-camera → expo-image-manipulator resize (~1600 px / ≤300 KB, per R2-C's own spec) → presigned PUT → done. **Defer the watermark burn** (skia/view-shot): store GPS+timestamp+user in the media row (schema already has it) and render an overlay chip when *viewing* the photo in-app. Burning pixels is tamper-theater at this stage — a determined fraudster re-photographs a screen anyway — and metadata+audit delivers ~90 % of the trust at ~20 % of the native-module risk. Add burning later if a dispute actually happens. Skip QR and voice in the pilot.

---

## E. Gut check

**E20. Top 3 changes right now:**
1. **Close the trust gap in the backend** — scope enforcement (B5), ownership + edit-window on update/void, self-approval guard, backdating rule, wage-calc + completeness unit tests. Bounded work, days not weeks, and it is the product's entire promise.
2. **Write the pilot surface down and shrink to it** (C11's ~8 screens; the rest config-flagged off). Then Milestone A → hosted backend → EAS APK, in that order. **No new features until the customer has entered real data 5 consecutive days.**
3. **Reconcile docs to reality** — 55→35 screen re-tally, one RBAC matrix (Spec §4), `app.current_org`→`app.org_id`, honest offline wording in Roadmap gate #2, "superseded" stamp on the PDF. In your AI-assisted workflow, doc drift compounds into future wrong code.

**E21. Biggest non-technical risk: the daily-entry habit never forms.**
A mistri typing at 6 pm after 10 hours of physical labour is the single point of failure for the entire value chain — every dashboard, export, and reconciliation is downstream of it. Mitigations: entry flow ≤30 s (stopwatch it on the real TH's own phone), SM proxy-entry as a first-class fallback, the WhatsApp digest creating daily owner-pull (C14.3), weekly on-site visits for the first month, and paying attention to *who* the customer appoints as TH users — if they're non-literate, kiosk/proxy is the plan, not the fallback. Secondary risk: solo-founder feature-creep from a paying customer with no written scope ritual (C14.5).

---

## What the plan gets right (checked for holes, found none)

RLS implementation quality (verified live), role-cascade enforcement, the frozen conventions (UUIDv7 / integer paise / business-date / soft-delete+version / error envelope), the adapter boundary (screens genuinely import only interfaces — confirmed in code), contracts-first build process, npm-over-pnpm for Metro, expo-camera over VisionCamera, SheetJS client-side over server Excel, no-Redis/no-sockets discipline, and the agency onboarding model itself (validated against Powerplay's economics in R1).

---

## Proposed new files (deliberately only two — more docs is itself scope creep)

1. **`docs/techBuilder-Pilot-Playbook.md`** — the ~8-screen pilot surface, day-by-day 2-week plan, adoption tactics (digest, proxy entry, visit cadence), hidden-feature flag list, support runbook, customer scope-agreement ritual.
2. **`docs/techBuilder-Hardening-Punchlist.md`** — the concrete pre-pilot fix list with file paths: scope guard + per-service checks, ownership/window on update/void, self-approval check, backdating rule, wage/completeness unit tests, refetch-on-focus verification, EAS APK, hosted backend, `pg_dump`→R2 backup, and the doc reconciliations from E20.3.

Fold-not-new-file: correction policy → Spec §5 · single RBAC matrix → point Domain-Model §3 at Spec §4 · "superseded" banner → the PDF's row in PROJECT_AI_CONTEXT's doc table.
