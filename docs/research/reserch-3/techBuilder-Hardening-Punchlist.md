# techBuilder — Hardening Punchlist (pre-pilot, AUTHORITATIVE work order)

> **What this is:** the complete, ordered fix list that must be green **before** the first merchant pilot.
> Source: `techBuilder-SecondOpinion-Review.md` (2026-07-02), accepted in full with noted nuances.
> **For Claude CLI:** execute work packages **top to bottom**. Do not start a lower-priority tier until the tier above is green. Every package has an **Acceptance** block — implement, then prove it (test or command output). Follow the locked conventions in `techBuilder-Build-Readiness-Spec.md` §1 verbatim (UUIDv7, integer paise, business-date Asia/Kolkata w/ org EOD cutoff default 20:00, soft-delete + `version`, error envelope, adapter boundary). Where this doc conflicts with any older doc, **this doc + the Build-Readiness Spec win.**

---

## Tier P0 — Trust & correctness (the product's promise; nothing else until green)

### WP-1. RBAC scope enforcement (Review B5 — the critical finding)
**Problem:** `shared/src/permissions.ts` defines scopes (`ORG / OWN_SITE / OWN_CREW / OWN_VEHICLE / SELF`) but `backend/src/common/rbac.guard.ts` checks only the boolean `can(role, action)`. `scopeFor()` is imported nowhere in the backend; no service filters by `assignedSiteId` / `crewId` / self. Verified holes: Worker token reads org-wide expenses/attendance/dashboards; Site Manager sees the other site + org-wide wage summary; Team Head can write attendance for any person/site/date.

**Goal:** every read and write is filtered/validated by the caller's scope, **server-side**, on every path — matching what Spec §4 and Domain-Model §3 already promise.

**Files:** `backend/src/common/rbac.guard.ts`, a new `backend/src/common/scope.util.ts` (or equivalent), every service with list/read/write endpoints (attendance, expenses/records, dashboards, wage summary, fuel, materials, sites, users), `shared/src/permissions.ts` (source of scope truth — do not redefine).

**Tasks:**
1. Create one scope-enforcement helper, e.g. `applyScope(ctx, action)` → returns the WHERE constraints (siteId ∈ user's sites / personId ∈ user's crew / userId = self / vehicleId = assigned) derived from `scopeFor(role, action)` in the shared package. **Derive the user's site/crew/vehicle from the DB (fresh), not from JWT claims.**
2. Wire it into every list/read service: Worker (`SELF`) sees only own rows; Site Manager (`OWN_SITE`) only their site (incl. dashboards + wage summary — SM must NOT see the org-wide wage summary); Team Head (`OWN_CREW`) only their crew; Driver (`OWN_VEHICLE`) only their vehicle's logs.
3. Wire it into every write: attendance upsert rejects persons outside the marker's scope; records/fuel/expense writes reject out-of-scope site/vehicle/person.
4. Keep the existing boolean `can()` check; scope is an **additional** layer. Do not touch the role-creation cascade in `users.service.ts` (`CAN_CREATE`) — it is verified correct.
5. Return the standard error envelope (`FORBIDDEN_SCOPE` or similar code) on scope violations.

**Acceptance (automated tests, one per hole):**
- Worker token → `GET` org-wide expenses/attendance/dashboard → **403/empty-scoped**, never other users' rows.
- SM(site A) token → site B data + org-wide wage summary → **denied**; site A unchanged.
- TH token → mark attendance for a person **not in their crew** → **rejected**; own crew → succeeds.
- Driver token → another vehicle's logs → **denied**.
- All previously-green E2E + RLS cross-tenant tests still pass (5/5).

### WP-2. Self-approval guard (Review B5.4)
**Problem:** `decideRequest` (`backend/src/.../approvals.service.ts:44`) has no requester≠decider check and no scope check → a TH can approve their own leave.
**Tasks:** reject decisions where `request.requestedBy === ctx.userId` (error code e.g. `SELF_APPROVAL_FORBIDDEN`); apply WP-1 scope so deciders only act on requests inside their scope (TH → own crew, SM → own site, Owner → org). Per Spec conventions, approvals remain **REJECT-on-conflict** (never LWW).
**Acceptance:** test — TH raises leave, same TH decides → rejected; their SM decides → succeeds; SM of the *other* site decides → rejected.

### WP-3. Record edit/void ownership + time window (Review B5.5)
**Problem:** `updateRecord` (`records.service.ts:261`) and `voidRecord` (`records.service.ts:355`) have **no ownership check and no time window** — any record-entry role can edit/void anyone's records at any date. Spec §5 promises: *creator may edit own record until business-day +1; edits audited.*
**Tasks:**
1. Enforce: only the **creator** may edit/void their record, and only until **end of business-day +1** (business date per Spec §1: Asia/Kolkata, org EOD cutoff default 20:00).
2. Beyond that window (or non-creator): **Owner only** (audited override).
3. Every edit/void bumps `version`, writes `updated_by`, and (financial entries) uses **void status**, never hard delete.
4. Emit audit fields the UI can render ("edited by X at HH:MM" — consumed in Pilot Playbook WP-P4).
**Acceptance:** tests — creator edits own record same day → ok; next day within window → ok; day+2 → rejected; non-creator TH voids SM's expense → rejected; Owner override → ok + audited.

### WP-4. Backdated-correction policy for attendance (Review B6) — *fold into Spec §5, then implement*
**Problem:** correcting yesterday's attendance is a daily real-world event; today the Spec allows almost nothing while the code allows everything.
**Policy to adopt (write into `techBuilder-Build-Readiness-Spec.md` §5 verbatim):**
- **Team Head:** may correct **own-crew** attendance up to **48 h** back.
- **Site Manager:** may correct **own-site** attendance up to **7 days** back.
- **Older than 7 days:** **Owner only.**
- All corrections audited (`marked_by`, `updated_by`, `version`) and **flagged in Excel exports** (a "corrected" marker column).
**Tasks:** implement in the attendance upsert path (stacks on WP-1 scope); add the corrected-flag to the export dataset.
**Acceptance:** tests — TH corrects own-crew yesterday → ok; 3 days back → rejected; SM 3 days back own site → ok; 10 days → rejected; Owner 10 days → ok; export row carries corrected flag.

### WP-5. Unit tests for the money-facing math (Review B9.6)
**Problem:** zero tests on the numbers that win or lose owner trust.
**Tasks:** unit-test (per Spec/Layer-14):
- **Wage calc:** daily rate × presence (present=1, half=0.5, absent/leave=0) + OT = ot_hours × (daily/8 × otMultiplier) − advances (peshgi). Integer-paise arithmetic only; assert no float anywhere.
- **Completeness rule:** "today complete" = attendance marked + (progress note OR explicit nothing-to-report) per active site/working day; respect site weekly-off + holidays.
- **EOD cutoff:** an entry at 21:30 with cutoff 20:00 → assigned to the correct business date (decide + test: it belongs to the **next** business date); a backdated correction flips yesterday's completeness → recomputed (decide + test: yes, recompute).
- **RBAC:** `can()` matrix snapshot + the WP-1 scope tests.
**Acceptance:** `npm test` green with these suites; wage figures verified against 3 hand-computed fixtures (incl. half-day + OT + advance in one).

### WP-6. Honest sync posture (Review B9.1) — code + wording
**Problem:** `sync.service.ts:76` pull returns `{changes: [], cursor}` (stub); outbox not wired to screens; yet Roadmap gate claims "works 100% offline; syncs reliably."
**Tasks:**
1. Wire the existing outbox (`Outbox` + `SqliteOutboxStore`) for **exactly three loss-critical writes: attendance, expense, fuel.** All other writes = online-required with a clean queued-retry/offline toast. **Do not build the pull/change-feed in Phase 1.**
2. Reads = refetch-on-focus: **verify every pilot list/dashboard screen refetches on focus** (add where missing).
3. Rewrite `techBuilder-Roadmap.md` final gate #2 to: *"The three loss-critical writes (attendance, expense, fuel) queue offline and sync idempotently (UUIDv7, LWW, backoff); all other writes require connectivity with graceful retry; reads refresh on focus. Server change-feed: Phase 2."*
**Acceptance:** airplane-mode test — mark attendance + add expense + add fuel offline → reconnect → exactly one row each on server (idempotent); a non-critical write offline → clear toast, no crash; focus-refetch verified on the pilot screens.

---

## Tier P1 — Pilot infrastructure (start only when P0 is green)

### WP-7. Hosted backend
Deploy NestJS to **Railway or Render** (free/hobby tier); env per `TESTING-AND-SETUP.md` (`DATABASE_URL` app-role non-superuser non-BYPASSRLS, JWT secrets, `R2_*`, `SENTRY_DSN`). Accept Neon scale-to-zero ⇒ ~1–2 s first-morning wake (document it, don't fight it).
**Acceptance:** all E2E green against the hosted URL from a phone **off** your WiFi.

### WP-8. Backups (Review B9.5) — ⏸️ PAUSED 2026-07-03, resume before pilot (see `docs/PENDING-AND-DEFERRED.md`)
Nightly `pg_dump` of Neon → Cloudflare R2 (scheduled job on the host or GitHub Actions cron), 14-day retention; **one documented restore drill actually performed once.** Add a short "Backups" paragraph to `techBuilder-Backend-and-Database.md`.
**Acceptance:** a dump exists in R2 from the scheduler (not run by hand); restore drill produced a working DB copy.
**Status:** script (`backend/scripts/backup-db.sh`) + workflow (`.github/workflows/backup.yml`) built, Docker-based (`postgres:18` image) to sidestep apt/PGDG version drift. Still failing in CI as of pause — full diagnostic trail + exact next steps in `docs/PENDING-AND-DEFERRED.md`. Not blocking local functional development; revisit before the real pilot.

### WP-9. EAS APK as the ONLY pilot channel (Review A3/B9.3)
`eas build -p android --profile preview` with `EXPO_PUBLIC_API_URL` in the profile env → hosted backend (config already in `eas.json`, projectId in `app.json`). **Expo Go is banned for the pilot** (single-SDK auto-update breakage) — note this in `TESTING-AND-SETUP.md`.
**Acceptance:** APK installs on a low-end (₹8–10K) Android, cold-starts ≤4 s, full flow works untethered.

### WP-10. Bulk merchant seed (Review A4/C14.2)
Dev-side **CSV → seed script** per merchant: sites, vehicle_types + vehicles, person/labour master + wage_rates, crews + crew_members, users (temp passwords, `mustChangePassword`), assignments. No Owner-screen tapping for initial data.
**Acceptance:** running the script against a CSV of the real customer's data (2–3 sites, fleet, staff) produces a fully-populated org; Owner login sees it all correctly scoped.

### WP-11. Sentry wired (frontend + backend)
DSNs in env; verify one deliberate test error arrives from each side.

---

## Tier P2 — Pilot-surface code (see `techBuilder-Pilot-Playbook.md` for the product spec)
- **WP-P1. Feature flags:** `OrgConfig`-driven flags hiding non-pilot screens (list in Playbook §2). Hide, don't delete.
- **WP-P2. Capture pipeline, simplified (Review D19):** expo-camera → expo-image-manipulator (≤300 KB, long-edge ≤1600 px) → presigned PUT to R2 → media row with GPS + timestamp + user. **Watermark burning DEFERRED** — render an overlay chip (time/GPS/user) when viewing in-app. Update Spec §1's media line: *"watermark burn deferred to post-pilot; metadata + view-overlay in Phase 1."* Skip QR + voice in the pilot.
- **WP-P3. WhatsApp digest button (Review C14.3):** Owner dashboard "Share today's summary" → client-side composed text (per-site headcount, expense, fuel, completeness) → WhatsApp share intent.
- **WP-P4. Audit chip (Review C14.6):** "edited by X at HH:MM" on corrected/edited records (consumes WP-3/WP-4 audit fields).
- **WP-P5. Hindi gate (nuance on Review C13):** the **TH + Driver pilot screens must be Hindi-complete before the pilot** (populate `hi.json` for those flows first). Owner screens may remain English-first. This is a pilot **gate**, not a nice-to-have.
- **WP-P6. ≤30 s entry check:** stopwatch the TH attendance roster and Driver fuel entry on a real low-end phone; if >30 s, cut taps until under.

---

## Tier P3 — Doc reconciliation (Review E20.3 — cheap, do last, do fully)
1. `techBuilder-Domain-Model-and-Permissions.md` §3 → replace the matrix with a pointer: *"RBAC matrix: see Build-Readiness Spec §4 (single source of truth)."* Resolve the known conflicts in the Spec's favor (incl. attendance marked by TH/SM only).
2. `techBuilder-Backend-and-Database.md`: `app.current_org` → **`app.org_id`**; add the Backups paragraph (WP-8).
3. `techBuilder-Phase1-Android-Screen-Plan.md` §12.7: perform the 55→35 re-tally; list what was descoped **deliberately** (O9/O10/O12–O15, D9/D10, SM8, S5, W1/W2 …) and mark each `deferred` or `flag-hidden`.
4. `PROJECT_AI_CONTEXT.md` doc table: stamp `The_Definitive_2026_Tech_Stack...pdf` row **"SUPERSEDED — historical rationale only (multi-tenant future-state; do not adopt from here)."** Also correct SDK 55→54 / VisionCamera→expo-camera anywhere they linger.
5. `techBuilder-Roadmap.md` gate #2 wording (done in WP-6.3 — verify).
6. `TESTING-AND-SETUP.md`: add the "Expo Go ≠ pilot channel" warning (WP-9).

---

## Done = pilot-ready
All P0 tests green · hosted backend serving a phone off-WiFi · nightly backup verified · signed preview APK on a low-end device · real-merchant seed loaded · pilot flags on · TH/Driver flows in Hindi at ≤30 s · docs reconciled. **Then open `techBuilder-Pilot-Playbook.md` and run the pilot. No new features until the customer has entered real data 5 consecutive days.**
