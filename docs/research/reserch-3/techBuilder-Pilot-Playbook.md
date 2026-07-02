# techBuilder — Pilot Playbook (first merchant, Phase 1)

> **What this is:** the operating manual for the first-merchant pilot — the exact pilot surface, the day-by-day plan, adoption tactics, support runbook, and the scope-control ritual.
> **Precondition:** every gate in `techBuilder-Hardening-Punchlist.md` is green. Do not start the pilot before that.
> **Prime directive:** the pilot's job is to form the **daily-entry habit** (Review E21 — the single biggest risk). Every choice below serves that.

---

## 1. Pilot surface — the ~8 active screens

Everything else built stays built but is **flag-hidden** (§2). The customer is trained on ONLY these:

| # | Role | Screen | Job |
|---|---|---|---|
| 1 | Owner | **Dashboard** — today's headcount, today/week expense, per-site completeness, week's fuel + **"Share today's summary" (WhatsApp)** | Daily pull; the habit-forming pressure |
| 2 | Owner | **Excel export** — attendance sheet + expense ledger (7/30-day), corrected-flag column, WhatsApp share | The weekly deliverable he already understands |
| 3 | SM/TH | **Attendance roster** — bulk "all present" + per-person adjust (present/absent/half/leave), ≤30 s | The core record; feeds wages later |
| 4 | SM/TH | **Expense entry** — amount, category, receipt photo | The ₹-leak record |
| 5 | SM/TH | **Progress note + photo** — text (or "nothing to report") + site photo | Completeness + the WhatsApp-evening-message replacement |
| 6 | Driver | **Fuel + odometer entry (one screen)** — reading + meter photo, liters + ₹ + receipt photo | The diesel leak — lead story for this fleet-heavy customer |
| 7 | All | **Login / change-password** | Entry point |
| 8 | Owner | **Site drill-in** — one site's records list (read-only) | The "let me check" screen behind the dashboard |

**Explicitly hidden in the pilot** (flags, §2): approvals inbox & request flows, materials, trips/vehicle-day beyond fuel, issues, advances, kiosk mode, voice notes, notification center, Worker role screens (W1/W2 — zero owner value), Owner analytics suite (O9/O10/O12–O15), vehicle documents (D9), maintenance log (D10), milestones (SM8), windowed **import** (export only).

---

## 2. Feature-flag list (`OrgConfig.features`)

```
pilot: {
  approvals: false, materials: false, trips: false, issues: false,
  advances: false, kiosk: false, voice: false, notifications: false,
  workerApp: false, analyticsSuite: false, vehicleDocs: false,
  maintenanceLog: false, milestones: false, import: false
}
```
Flags gate **navigation + route access** (not just tab visibility). Flipping one on later = config change, no build. This is also the Phase-2 upsell lever: "you asked for materials tracking — turning it on."

---

## 3. Onboarding (Day 0, on-site)

1. **Seed first** (Punchlist WP-10): collect the customer's real sites, vehicles + types, staff list + roles + wage rates, crews as a CSV → run the seed. The Owner's first login shows **his company, populated.** Never an empty app.
2. Install the **EAS preview APK** on: Owner's phone, each SM's phone, each TH's phone, each Driver's phone. (Sideload; no Play Store.)
3. Hand out credentials (temp passwords; forced change on first login).
4. **Train per role, 10 minutes each, on their own phone:** TH → roster + progress note; Driver → fuel screen; SM → same as TH + expense; Owner → dashboard + share button + export. Stopwatch the TH and Driver flows live (≤30 s or fix on the spot).
5. Note who the customer appointed as TH users. **If any TH is non-literate, SM proxy-entry becomes the plan for that crew, not the fallback.**
6. Sign the **pilot scope agreement** (§6).

## 4. The 2-week plan

| Day | Beat |
|---|---|
| 0 | On-site onboarding (§3). First attendance marked live in training. |
| 1–2 | You check the DB every evening. Call the SM if any site missed attendance. Fix friction same-day (OTA via EAS Update). |
| **3** | **Value beat 1:** sit with the Owner, open his dashboard — live headcount + spend across sites. Show the WhatsApp share button; he sends today's digest to himself. |
| 4–6 | Habit watch: is every site complete by 20:30 daily? If a TH is skipping, switch that crew to SM proxy-entry. |
| **7** | **Value beat 2:** first weekly **Excel lands in his WhatsApp** — attendance + expense ledger. Walk him through the corrected-flag column ("every change is tracked — your mistri cannot silently rewrite hazri"). |
| 8–11 | Keep the streak. Log every feature ask in the Phase-2 list (§6) — build nothing. |
| **14** | **Value beat 3:** the first **fuel-variance conversation** — week's diesel ₹ + liters per vehicle vs KM/hours run. This is the fleet-heavy customer's "oh." Review the pilot: what stuck, what didn't, what he'd pay for next. |

**Success gate:** every active site has attendance + (note or nothing-to-report) for **5 consecutive days**, and the Owner has opened the dashboard or received the digest ≥5 of 7 days in week 2. Until then: **no new features** — only friction fixes.

## 5. Adoption tactics (habit formation)
- **Owner-pull, not TH-push:** the WhatsApp digest makes the Owner ask "where's today's summary?" — that question, not your reminders, forms the TH habit.
- **≤30 s or it dies:** any entry flow over 30 s on the TH's own phone gets taps cut immediately.
- **SM proxy-entry is first-class,** not shameful fallback — say so in training.
- **Visit weekly** for the first month; watch a real 6 pm entry happen at least twice.
- **Never let the app embarrass a user in front of the crew:** any error a TH hits on-site is a same-day OTA fix.

## 6. Scope-control ritual (Review C14.5)
One-page agreement signed Day 0: *"Pilot = the 8 screens in §1, for N weeks, at ₹X. Every new idea goes on the Phase-2 list — we review that list together at the Day-14 meeting and price it there."* When an ask arrives mid-pilot: write it on the list **in front of him**, say "captured for Day 14," move on. The list is the pressure valve that protects a solo dev from a paying customer's (legitimate) enthusiasm. Exceptions: only bugs and blockers.

## 7. Support runbook
- **Line 1:** SMs/THs call the **Owner's designated app person**; only the Owner/that person calls you (one WhatsApp thread).
- **You see errors** via Sentry (both sides) — check every evening during the pilot.
- **Bad data:** fix via the Owner-override edit path (audited) — never raw SQL against prod; if SQL is unavoidable, snapshot first (backups exist per WP-8).
- **App updates:** JS fixes → **EAS Update** (OTA, same day). Native changes → new preview APK, reinstall on next visit.
- **Morning slowness:** first request after idle wakes Neon (~1–2 s) — known, harmless, tell users once.
- **Kill switch:** if a screen misbehaves in the field, flag it off remotely (§2) rather than shipping a rushed fix at night.

## 8. What "pilot success" unlocks (in order)
1. Turn on the next most-asked flag from the Phase-2 list (likely materials or approvals).
2. Price + collect for Phase 2.
3. Then, and only then: watermark burn (if a dispute happened), notifications/FCM, kiosk, worker app, analytics suite, OTP auth, Razorpay, multi-org self-signup — each pulled by demand, never pushed.

---
*Companion doc: `techBuilder-Hardening-Punchlist.md` (must be green first). Owner-facing overview: `techBuilder-roles-for-merchant.html`.*
