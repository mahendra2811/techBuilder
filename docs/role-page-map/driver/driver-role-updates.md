# DRIVER role — client review updates (round: role-by-role audit)

> **✅ BUILT (frozen.10, 2026-07-18).** Post-audit additions (client requests, 2026-07-18 late evening, built separately on top of frozen.10 — all UI-only, no contracts change):
> 1. **`/driver/meter` page** — Start-of-day + End-of-day forms moved off the dashboard; each section shows a green ✓ once filled; dashboard keeps the three status chips as a compact strip that links to `/driver/meter`; "Meter / मीटर" nav entry.
> 2. **Requests page dissolved**: the vehicle-change request form + its history moved onto `/driver/vehicle` (nav renamed "Vehicle/Fuel" → **"Vehicle / वाहन"**, driver only — SM's label untouched); the expense request form + history became the new **`/driver/expense`** page (nav "Expense"); `/driver/requests` route deleted, deep-links re-pointed.

> **Status: 📋 PENDING — DO NOT BUILD YET.**
> This is the change log from the client's role-by-role review (2026-07-18, DRIVER role). The client is auditing every role one at a time; each role gets a file like this in `docs/role-page-map/<role>/`. **All roles' changes get implemented together in ONE build pass at the end** (client instruction — avoids rework).
>
> Current-state facts below are code-verified against `web/src/components/screens/driver-dashboard-screen.tsx`, `fuel-screen.tsx`, `vehicle-switch-screen.tsx`, and `shared/src/dto.ts` / `db/schema.ts` as of contracts `frozen.9`. The full current-page inventory is in `../techBuilder-Role-Page-Section-Map.md` (§ DRIVER + its frozen.9 update banner).

---

## DRV-1 — Dashboard "My vehicle" card: readings OUT, day-log status chips IN

**Today:** the vehicle snapshot card shows reg no/name/status chip, **current reading vs yesterday reading** (two-column readout), and a pending vehicle-switch chip. The morning/evening day-log forms sit below it on the dashboard.

**Requested:**
- **Remove** the current-reading / yesterday-reading display entirely. Keep the vehicle identity (reg no, name, status) — nothing else.
- **Add three day-log status indicators** to the card:
  1. **Yesterday night (evening) entry**
  2. **Today morning entry**
  3. **Today evening/night entry**
- Color logic (traffic light):
  - **Green (✓ success)** — that form was filled.
  - **Yellow (pending)** — not filled yet but still fillable / not yet due (e.g., it's afternoon → today-evening is yellow).
  - **Red (missed)** — the window passed without filling (e.g., yesterday night was never filled → red).
- Client's worked example: "now is today afternoon → morning filled = green, today evening = yellow, yesterday night not filled = red."

**Implementation implications (for the final build pass):**
- Needs yesterday's vehicle-log fetch too (today the snapshot exposes `currentReading`/`previousReading`; we'd need yesterday's log **row completeness** — whether `endReading` was set — not just the reading). Likely extend the `vehicleSnapshot` read model or fetch `GET /records/vehicle-log?from=yesterday&to=today`.
- Yellow→red boundary presumably follows the org business-day cutoff (20:00 IST) — **open question Q2**.

---

## DRV-2 — Split the combined `/driver/vehicle` page: separate **Vehicle** and **Fuel** pages

**Today:** `/driver/vehicle` stacks THREE things on one page: vehicle switch (log-only switch + needs-approval list), report-damage form + damage history, and the fuel entry form + recent fuel list.

**Requested:**
- **Fuel becomes its own page** — "today's fuel update": the fuel-received form (see DRV-4) plus his fuel history below it.
- Vehicle page keeps the vehicle-switch functionality.
- (Damage also moves out — see DRV-3, leaving `/driver/vehicle` = switch only.)

**Implementation implications:** new route `/driver/fuel` (nav item "Fuel/डीज़ल"), `/driver/damage` (see DRV-3); `/driver/vehicle` slims to the switch screen. Driver nav grows from 4+profile to ~7 items — check `nav.ts` `vehicleLog.enter` mapping (it currently points the "Vehicle/Fuel" label at `/vehicle`; will need separate entries).

---

## DRV-3 — Separate **Report damage** page

**Today:** the damage form + damage timeline live inside the combined `/driver/vehicle` page.

**Requested:** a dedicated page: the **damage form on top**, and **all his previously reported damages listed below it** (the existing 180-day `DamageTimeline` fits).

---

## DRV-4 — Fuel form rework (the big one)

**Today (code-verified):** vehicle picker (fixed row if 1 vehicle, select if more) · odometer reading (required) · litres (required) · **amount ₹ (REQUIRED — zod `.min(1)` positive)** · **date picker with the role's backdating window** · receipt photo (already optional).

**Requested:**
- **Vehicle:** locked to his currently-assigned vehicle only (no picking others).
- **Odometer reading at fill time:** required (unchanged).
- **Litres:** required, exact litres — the primary field (this feeds the supervisor's diesel-match).
- **Amount: OPTIONAL and HIDDEN by default.** ~95% of the time the driver takes diesel from the site store / on the vendor's khata and pays nothing. UI: a **tick mark ("I paid money / मैंने पैसे दिए")** — only when ticked does the amount field appear. When unticked, record that it was taken from the store/ledger (no amount).
- **Date: locked to TODAY.** No date picker for the driver's fuel form at all — he files it the day it happens.
- **Receipt photo:** optional (unchanged).

**Implementation implications (⚠️ contracts + DB change → next bump `frozen.10`):**
- `shared/src/dto.ts` `CreateFuelLogInput.amountPaise` is **required** and `shared/src/db/schema.ts` `fuel_logs.amount_paise` is **NOT NULL** — making amount truly optional needs the column nullable (or a 0-with-flag convention) + DTO/zod updates + backend validation + a migration. Decide whether to add a `paidBy`/`fromStore` marker so reports can distinguish "free from store" from "₹0 typo".
- Date-lock is driver-only — the SM variant of the same `fuel-screen.tsx` keeps its backdating window.
- Reports/exports and the vehicle-detail Fuel sections must render a missing amount gracefully (show "—", exclude from ₹ totals).
- Supervisor diesel-match is litres-based (`fuel-match.ts`) — unaffected.

---

## DRV-5 — Dashboard composition + the driver's complete forms inventory

**Requested dashboard content:** My vehicle card (per DRV-1, with the 3 status chips) + the **emergency/contact detail** section (already exists — `ContactPanel`). That's the core; readings and inline detail move off.

**Client's canonical list of ALL forms the driver role has** (scoping statement — nothing more):
1. Fuel form (DRV-4, own page)
2. Damage form (DRV-3, own page)
3. Vehicle change form (exists — `/driver/vehicle` switch + VEHICLE_SWITCH request)
4. Expense form (exists — `/driver/requests` expense reimbursement request)
5. Guardian detail addition (exists since frozen.9 — one-time add on `/driver/profile`)

---

## Open questions (resolve before the final build pass)

- **Q1 — Where do the morning/evening day-log forms live** once the dashboard card only shows status chips? Most natural: tapping a yellow/red chip opens that form (inline expand or a small dedicated page). Client didn't specify.
- **Q2 — Yellow→red boundary:** does "today evening" turn red after the org's 20:00 business-day cutoff, or only once the calendar day changes?
- **Q3 — Can a missed (red) entry be back-filled?** Currently the evening form exists only for TODAY's log — there is no way to fill yesterday's missed evening entry. If red is purely informational, fine; if it should be fixable, that's new backend surface.
- **Q4 — Recent-fuel list + khata card on the dashboard:** not mentioned. Assumption: khata card stays; the recent-fuel list moves to the new `/driver/fuel` page. Confirm.
- **Q5 — "Amount from store" marker:** when the tick is off, do we store a flag/note ("taken from store / on khata") for the accountant's reconciliation, or store nothing?

---

## Cross-role audit tracker

Moved to [`../ROLE-AUDIT-TRACKER.md`](../ROLE-AUDIT-TRACKER.md) (single source for all roles + the accumulating contracts/DB change list).
