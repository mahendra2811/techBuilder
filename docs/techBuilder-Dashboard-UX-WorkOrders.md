# Dashboard UX + API-Reduction Work Orders (wave 2)

> **Status: PLAN — approved scope, not yet built.** Written 2026-07-09 from the user's dictated requirements. Executor: Sonnet, one WO at a time, strictly sequential within a priority band. Read `docs/CODEBASE-INDEX.md` first; every file named below exists there.
>
> **Theme:** show less by default, fetch less by default — reveal/expand on demand (eye toggles, accordions, lazy sections, show-more) — while keeping section heights stable (skeletons/`min-h` per the existing owner-dashboard pattern).

## Ground-truth findings (verified in code before planning)

1. `sites.list` and `/completeness` are **already SM-scoped** server-side (`loadScope` → assigned + managed sites; `backend/src/sites/sites.service.ts:52`, `backend/src/dashboards/dashboards.service.ts:15-28`). If sm1 sees both DevCo sites, first suspect the **seed data** (sm1 assigned GF *and* set as `siteManagerId` of ST) — that's correct behavior, not a leak.
2. `ContactPanel` (web) renders nothing on error/empty — safe to mount anywhere. Backend `contacts()` (`auth.service.ts:105`) resolves SM via `users.assignedSiteId → sites.siteManagerId` and TH via `users.crewId → crews.teamHeadUserId`; works partially for TH already, returns near-empty for SM (their own site's SM = themselves).
3. `ApprovalRequest` has **no top-level `siteId`** — only `payload.siteId` (EXPENSE_ADD, some others) or the requester's `assignedSiteId` (via the already-fetched scoped users list). Site tabs are derivable client-side; **no backend change**.
4. No activate or admin-password-reset endpoint exists (`users.controller.ts` has only create/list/deactivate). Both additions ride **one contracts bump → `1.0.0-frozen.7`**.
5. `KhataCard` is ONE component mounted on all 5 dashboards — the eye/lazy change lands everywhere at once.
6. The owner/SM dashboard's per-site attendance queries feed **two** consumers: the "marked today" caption in the completeness strip AND the WhatsApp digest. Only the second `todayDashQ` aggregate is digest-only.

---

## P1 — quick wins, no contracts change

### WO-1 · Khata card: eye-hidden by default + deferred fetch + refresh  [web]
`web/src/components/khata-card.tsx`
- Default state on every load: amounts hidden (banking-app style `••••`), an eye `Button` (lucide `Eye`/`EyeOff`) in the card header.
- The `['me','balance']` query gets `enabled: revealed` — **no fetch until the user taps the eye** (this is the "second-priority API" rule: it never competes with the dashboard's base queries).
- Small refresh icon next to the eye once revealed: `refetch()`; spinner only on the icon (`isFetching`), data stays visible.
- Reserve geometry: same `min-h` whether hidden/loading/shown. New i18n keys (en+hi): reveal/hide aria-labels, hidden placeholder.

### WO-2 · Lazy "Today's summary" (WhatsApp digest)  [web]
`web/src/components/screens/owner-dashboard-screen.tsx` (`DigestCard`, `todayDashQ`)
- Digest card renders collapsed: title + "आज का सार देखें / Show today's summary" button. `todayDashQ` gets `enabled: digestOpen` (currently it auto-runs after the main dashboard settles — that call disappears from default page load).
- Keep `attQs` (per-site attendance) eager — the completeness strip's "X marked today" captions depend on it (finding 6).
- Once open: render digest as today + a refresh button (`invalidateQueries` for `['owner-dashboard', today, today]` only); loader only on the button, previous digest text stays visible.

### WO-3 · "Approvals pending" callout card on dashboards  [web]
- Owner + SM (`owner-dashboard-screen.tsx`): a link-card section (pattern: the existing insights link card) — heading + "X मंज़ूरी बाकी" + chevron → `/owner/approvals` / `/site-manager/approvals`. Count comes from the **already-fetched** `kpis.pendingApprovals` — zero extra API calls. Hide (or show "0") when none.
- TH (`team-head-dashboard-screen.tsx`): TH has no KPI feed; add `useQuery(['requests','PENDING'])` → count client-side of requests TH may decide (reuse the `canDecide` logic shape from approvals-screen: type ∈ VEHICLE_SWITCH/EXPENSE_ADD, not own). Card links to `/team-head/approvals`. This query is cheap and cacheable (staleTime 60s+).

### WO-4 · Contacts panel for Team Head + Site Manager  [backend + web, NO contracts change]
Backend `auth.service.contacts()` — extend within the existing frozen `ContactPanel` shape `{ siteManager, teamHead, emergency }`:
- Resolve the caller's site set from `loadScope` (not just `assignedSiteId`) so a multi-site SM gets the **union of their sites' emergencyContacts** (dedupe by phone).
- Never return the caller as their own contact: if resolved SM/TH id === caller id → null.
- TH: site's SM + site emergency (mostly works today; verify + self-filter). SM: emergency lists of all their sites; `siteManager`/`teamHead` null. Owner: unchanged (panel not mounted for owner).
Web: mount `<ContactPanel />` at the bottom of `team-head-dashboard-screen.tsx` and at the bottom of `owner-dashboard-screen.tsx` **only when `variant === 'SITE_MANAGER'`**. Panel already self-hides when empty.

### WO-5 · Verify SM "daily records — site by site" scoping ✅ VERIFIED CORRECT, no fix needed
- **Checked 2026-07-09**: `backend/merchants/dev/sites.csv` seeds sm1 as `siteManagerUsername` for BOTH `Greenfield Residency` and `Sunrise Towers` — sm1 is genuinely the manager of record for both sites in this dev org. Live `GET /sites` as sm1 confirms: returns exactly those two sites (nothing out of scope). `sites.service.ts:52`'s `loadScope`-based filter is already correct; no server-side bug exists. What looked like a leak is a seed-data artifact of testing with one shared SM across two sites — a real merchant onboarding a dedicated SM per site would only ever see their own. **No code change made.**

### WO-6 · Query-policy tuning (perf report Tier-3, first slice)  [web]
`web/src/app/providers.tsx` + screens:
- Per-class `staleTime`: reference data (`['sites']`, `['vehicles']`, `['users']`, `['people']`, `['me']`) 5–15 min via per-query overrides; dashboards/lists 60–120s; keep global default 30s for anything unclassified. `gcTime` ≥ 30 min.
- `placeholderData: keepPreviousData` on every window/filter-keyed query (dashboard window toggle, insights date ranges, reports pickers) — toggles stop flashing skeletons; data swaps in place.
- Rule stays: skeletons ONLY on `isPending` (no cached data), never on `isFetching`.

---

## P2 — feature work (one contracts bump `frozen.7` covers WO-8 + WO-9)

### WO-7 · Owner approvals page: per-site tabs + accordion rows  [web]
`web/src/components/screens/approvals-screen.tsx`
- **Tabs** (Owner only; reuse `WindowToggle`): `All | <site name>…` from the scoped `GET /sites` (owner = all sites). Filter client-side; a request's site = `payload.siteId` ?? requester's `assignedSiteId` (from the already-fetched users list) ?? bucket "other" (visible under All only).
- **Accordion**: collapsed row = requester name · type label · one-line payload summary · status badge (reuse `request-bits.tsx`). Tap → expand in place: full `PayloadSummary`, category-override select, comment box, Approve/Reject. One expanded at a time (`useState<UUID|null>`). Decided rows stay collapsed-only.
- Keep the existing status filter (PENDING/ALL/…) alongside the site tabs. SM/TH variants keep current layout but gain the accordion (site tabs owner-only).

### WO-8 · Owner reactivates inactive users  [backend + web + contracts]
- `shared/src/api.ts`: `usersActivate: { method: 'POST', path: '/users/:id/activate' }` (part of frozen.7 bump + note in `docs/PROJECT_AI_CONTEXT.md` §0).
- Backend `users.service.activate(p, id)`: **OWNER only** (`forbidScope` otherwise); target must exist, be deleted-null; set `active: true`, audit fields. Controller mirrors `deactivate` shape. Unit test: owner ok / SM+TH forbidden.
- Web `people-screen.tsx`: rows already show inactive state; add "Activate" button for owner when `!u.active` (mirror the deactivate mutation + invalidation). i18n keys both catalogs.

### WO-9 · Admin password reset (Owner + SM)  [backend + web + contracts]
- `shared/src/api.ts`: `usersResetPassword: { method: 'POST', path: '/users/:id/reset-password' }` (same frozen.7 bump).
- Backend `users.service.resetPassword(p, id, { newPassword })`: scope mirrors `deactivate` (Owner: anyone; SM: only roles they may create, inside their scope; TH: forbidden; never yourself — self uses `/auth/change-password`). Sets scrypt hash (`auth/password.ts`), `mustChangePassword: true`, and **revokes the target's refresh tokens** (delete/revoke rows in `refresh_tokens` for that userId) so old sessions die. Zod: password min length matching the change-password rule. Unit tests for the scope matrix.
- Web: affordance in BOTH `people-screen.tsx` (row action) and the person profile (WO-10 header): inline "Reset password" → temp-password input → success notice "अगली बार लॉगिन पर बदलना होगा". Visible to owner + SM (per scope), never on your own row.

### WO-10 · Person profile compaction (`/owner/people/[id]` etc.)  [web]
`web/src/components/screens/person-insights-screen.tsx`
- **Collapsed day cards**: each day renders as a single header row — date + compact badges ("no progress" flag, counts like `2 खर्च · 1 रिपोर्ट · 1 अनुरोध`) + chevron/plus. Lists (`ProgressList`/`ExpenseList`/`RequestList`) render **only when expanded** (default: all collapsed; empty days may be hidden behind a "show empty days" toggle).
- **Show-more**: render first 7 day cards; "और दिन दिखाएँ (X)" reveals the rest (client-side — data is already fetched; this is a render/scroll fix, not an API fix).
- Mount the WO-9 reset-password affordance in the profile header card.

---

## P3 — pattern rollout

### WO-11 · Shared `<ShowMore>` list helper + rollout  [web]
- New `web/src/components/ui/show-more.tsx`: given `items`, `initial={N}`, renders first N + "और देखें (remaining)" button; i18n via catalog.
- Apply to the known growers: approvals list (post-WO-7), ledger history (`ledger-screen.tsx`), vendor month rows, `entry/recent-entries.tsx`, insights day lists (`insights-screen.tsx` — same collapsed-day treatment as WO-10), people list.
- Add a row to `docs/CODEBASE-INDEX.md` §5: "Long list → wrap in `ui/show-more.tsx`; only truly unbounded server reads get real pagination."
- Server-side pagination is explicitly **out of scope** this wave (only `cash-transfers` is capped server-side today; revisit when a real org outgrows client caps).

---

## Cross-cutting execution rules
- i18n: every new string in BOTH `messages.en.ts` + `messages.hi.ts` (Hindi register per the hi file header). Reuse `NAV_LABELS`/`APPROVALS_UI` labels where they exist.
- Layout stability: every newly-lazy section keeps a fixed `min-h` across hidden/loading/shown states (owner-dashboard KPI skeleton is the reference pattern).
- Contracts: exactly ONE bump (`frozen.6` → `frozen.7`) covering `usersActivate` + `usersResetPassword`; no DB migration (both operate on existing columns/tables). Note the bump in `PROJECT_AI_CONTEXT.md` §0 + re-typecheck all three workspaces.
- Verification per WO: workspace typecheck/lint + backend `npm test` (new unit tests for WO-8/WO-9 scope rules) + a live Playwright pass per role touched (owner, sm1, th1, driver1, worker1 as relevant). Finish with the full suite + `next build`.
- Docs: update `CLAUDE.md` §4 build status + `CODEBASE-INDEX.md` entries when done.

## Assumptions recorded (flag if wrong)
1. "mindatha section" = the **Mera Khata card** — WO-1's eye toggle covers both the khata amounts and the "budget shown only when open" ask.
2. Khata hidden state resets on every page load (banking-app convention, safer on shared phones) rather than being remembered.
3. Site tabs on approvals are **Owner-only**; SM/TH keep the flat (accordion) list.
4. Reactivation is for **login users** (`users.active`) — people (labour master) rows have no deactivate flow in-app today.
5. Admin password reset = caller types a temp password (matches the existing create-cascade UX) rather than a server-generated one; target must change it at next login.
