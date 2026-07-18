# ACCOUNTANT role — client review updates (round: role-by-role audit)

> **Status: 📋 PENDING — DO NOT BUILD YET.** Part of the role-by-role client review (2026-07-18); all roles build together in one pass at the end. Tracker: [`../ROLE-AUDIT-TRACKER.md`](../ROLE-AUDIT-TRACKER.md).
>
> Current-state facts code-verified against `vendors-screen.tsx`, `ledger-screen.tsx`, `backend/src/vendors/vendors.service.ts`, `backend/src/cash-transfers/cash-transfers.service.ts` (contracts `frozen.9`).

---

## ACC-1 — Shops/vendors: the accountant CAN add shops

**Today (verified — this is exactly the error the client hit):** `VendorsService.create` allows only OWNER and SITE_MANAGER; an ACCOUNTANT gets `forbidScope("Role ACCOUNTANT cannot add a vendor")` → the "not allowed / outside your scope" error. The web screen even hides the add-shop form for him (`canCreateVendor = role !== 'ACCOUNTANT'` in `vendors-screen.tsx`) as a 403-avoidance — but the client reached the error anyway and wants the capability, not the hiding.

**Requested:** the accountant can add any shop (name etc.) for future reference — no scope error, no date-window error.

**Implication:** backend `create()` gains an ACCOUNTANT branch (his site, mirroring the SM rule — or org-wide `siteId` null; see Q3); un-hide `CreateVendorForm` for the accountant in `vendors-screen.tsx`.

## ACC-2 — Khata page restructure: THREE money sub-pages + lazy, filterable history

**Today:** one combined ledger page — a single give/receive form (frozen.9 added the WORK/SALARY/PERSONAL tag toggle for accountant+owner on this one form), a single transfers-history list (eagerly loaded), and no rollup for the accountant.

**Requested — split the khata into separate sub-pages, each = its own form on top + its OWN lazy history below:**

1. **Give money (work cash)** — hands work cash down for site work. Work cash is the khata flow (drives the person's balance).
2. **Receive money (work cash ONLY)** — money returned back up. Receive has NO salary/personal option — nobody "returns" salary; every incoming amount is work cash by definition.
3. **Give salary (salary/personal)** — the accountant gives salary/personal money to any worker/driver/anyone. **SALARY and PERSONAL count as a SINGLE category** in this UI ("salary/personal" — see Q1). Give-only. Shows on the recipient's Profile as "money taken from the office" (already the frozen.9 behavior — verified draws land on `/profile`); never touches the work-khata balance (already true server-side).

Client's rule restated: personal money must never be mixed into work — if money is given for work it is work cash (khata-negative for the receiver); if it's salary/personal it exists only on the salary page + the person's profile.

**History behavior (per sub-page):**
- **NOT loaded by default** — only the form shows. A refresh / "show history" button fetches it (lazy, like the khata eye-toggle pattern).
- When shown: the **last ~30–50 entries** inline. If more exist → a "view all" action navigates to a **full-history sub-page**.
- **Full-history sub-page:** filter tabs — last 7 days, last 30 days, and a custom date/week picker — so the accountant can track a specific date or week. Fetch only what the filter needs (server-side date-window queries, not client-side slicing of everything).

**Implications (⚠️ contracts, additive):**
- `GET /cash-transfers` currently filters only by `limit`/`from`/`to`. The three sub-pages + full-history filters need **`tag` and `kind`/direction query params** so each page loads only its own slice (`ENDPOINTS` untouched, params additive; service adds WHERE clauses).
- The frozen.9 single-form tag toggle on the accountant's ledger gets superseded by this 3-sub-page layout (Owner's combined form: see Q2).
- Salary/personal merged option: UI presents ONE choice; storage decision in Q1.

## ACC-3 — "Who holds what" sub-page (work money per person)

**Requested:** another khata sub-page listing **which person currently holds what amount of work money** — salary amounts explicitly excluded.

**Today (verified):** this already exists as the **ledger rollup** (`GET /ledger/rollup` — per-person balance = received − given − cash-spent), and its sums are **already WORK-only** (`tag = 'WORK'` filters in `sumTransfers`/`groupTransfers`) — exactly the client's rule. But the service gate is `OWNER`/`SITE_MANAGER` only → FORBIDDEN for the accountant, and the web screen hides the section for him.

**Implication:** allow ACCOUNTANT in the `rollup()` gate (site-scoped to his site(s) like the SM branch — candidate set = users at his sites + himself) + surface it as a khata sub-page for him. Small, mostly-existing feature.

---

## Open questions (resolve before the final build pass)

- **Q1 — Salary/personal as a single category:** UI shows one "Salary / Personal" option. Storage: keep both enum values and always write `SALARY`? Or keep a tiny secondary toggle? (Recommended: always write `SALARY` from this page; `PERSONAL` stays in the enum for existing rows and the Owner's form.)
- **Q2 — Does the OWNER's ledger get the same 3-sub-page split**, or does he keep the current combined form with the tag toggle? (Owner review is still pending — park until then.)
- **Q3 — Shops the accountant adds:** attached to his site (mirrors SM) or org-wide (`siteId` null)? Client said "any shop for future reference" — org-wide reading, but single-site rule (SUP-2) suggests site-attached. Recommend site-attached.
- **Q4 — Full-history page:** also filter by person? (Client mentioned tracking by date/week only, but per-person tracking pairs naturally with "who holds what".)
- **Q5 — "Who holds what" scope:** accountant sees his own site's people only (single-site rule) — confirm.

---

**Cross-file overlaps:** the lazy-history + "last N + view-all + date-filter page" pattern here is the fullest statement of the lazy-history theme (supervisor diesel/materials use the simpler variant) — implement once, reuse. The salary-page behavior is the accountant side of what the worker/driver/supervisor Profile money list already displays (frozen.9).
