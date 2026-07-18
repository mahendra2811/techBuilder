# Role-by-role client audit — tracker

> The client reviewed the roles one at a time (2026-07-18). Each reviewed role has a change file at `docs/role-page-map/<role>/<role>-role-updates.md`. **✅ BUILD COMPLETE (2026-07-18, contracts `1.0.0-frozen.10`)** — the combined pass shipped everything below in one bump; see `COMBINED-BUILD-PLAN.md` (now the as-built record) and `CLAUDE.md` §4 for the landing note.

| Role | Review status | Changes file |
|---|---|---|
| WORKER | ✅ reviewed → **already built** (frozen.9, 2026-07-18 — built same-day before the "batch at the end" process started) | shipped; see `CLAUDE.md` §4 |
| DRIVER | ✅ reviewed → ✅ BUILT (frozen.10, 2026-07-18) | [`driver/driver-role-updates.md`](driver/driver-role-updates.md) |
| SUPERVISOR | ✅ reviewed → ✅ BUILT (frozen.10, 2026-07-18) | [`supervisor/supervisor-role-updates.md`](supervisor/supervisor-role-updates.md) |
| ACCOUNTANT | ✅ reviewed → ✅ BUILT (frozen.10, 2026-07-18) | [`accountant/accountant-role-updates.md`](accountant/accountant-role-updates.md) |
| SITE_MANAGER | ✅ reviewed → ✅ BUILT (frozen.10, 2026-07-18) | [`site-manager/site-manager-role-updates.md`](site-manager/site-manager-role-updates.md) |
| OWNER | ⛔ **no dedicated review (client decision 2026-07-18)** — receives ONLY the changes that cascade from the other roles' items (complaint inbox detail sub-page + load-more from SM-1, ledger salary recording ACC-2/Q2, rollup/who-holds-what parity, etc.); otherwise stays flexible ("make it freely") | — (cascades noted inside the other files) |

## Cross-cutting themes emerging (apply to multiple roles in the final pass)

1. **Single-site rule** (SUP-2): every role below Owner sees exactly ONE site — no site pickers, no cross-site data. Affects supervisor, driver, worker, accountant, SM screens + `scope.util.ts`.
2. **Two-day date windows**: entry forms allow today + yesterday only (worker requests already shipped in frozen.9; supervisor diesel/materials/progress/expense pending; driver fuel = today only).
3. **Lazy history lists**: recent/history sections render only on a refresh-icon tap, not by default (supervisor diesel + materials so far).
4. **Complaint number** (SUP-1): per-org sequential `#101…` — cross-role (all raisers + SM/Owner inboxes) — one schema change.
5. **Accountant as the single money gate**: all money requests route to the accountant (supervisor two-tier limit flow SUP-9; expect matching accountant-side items).

## Pending contracts/DB changes accumulating for the ONE final bump

- `fuel_logs.amount_paise` → nullable (+ optional "from store/khata" marker) — DRV-4
- `complaints.complaint_no` int + unique (org_id, no) + backfill — SUP-1
- `material_txns` remark (or OTHER sentinel) — SUP-4
- `PERMISSIONS.SUPERVISOR` + `request.decide (VEHICLE_SWITCH only)` — SUP-6
- Supervisor limit un-deprecation + accountant-decider routing — SUP-9
- Supervisor backdate window default (7 → 1?) — SUP-3/Q6
- `VendorsService.create` + ACCOUNTANT branch (shop creation) — ACC-1
- `GET /cash-transfers` additive `tag` + `kind` query filters (sub-page histories) — ACC-2
- `rollup()` gate + ACCOUNTANT (site-scoped "who holds what") — ACC-3
- SM as complaint RAISER (to Owner) + `GET /complaints` paging params — SM-1
- Expense SUBCATEGORIES: config array + nullable `expenses.subcategory` column (category enum stays) — SM-2
- Site-config `formsConfig` block (per-form field toggles, all forms) — SM-2
- One-SM-one-site enforcement + devco 2-site SM data migration — SM-4

## Reusable patterns to build ONCE in the final pass

- **Sub-page primitive** (URL-stable in-page detail view w/ top back button — the vendors shop-detail pattern): requested for complaints (SM+Owner), SM settings, khata (SM+accountant), fleet, people.
- **Lazy history** (form-first; refresh/"show history" → last 30–50 → "view all" → filterable full-history sub-page): khata give/receive/salary, who-holds-what, diesel, materials.
- **Load-more paging** for inbox-style lists (complaints first).
