# techBuilder — Next Steps & Live-Backend Plan

> Written 2026-07-01, after the Expo app opened successfully on the phone (mock mode, Owner view).
> **Decision taken:** do **Milestone A (flip to the real backend)** next, over **WiFi**.
> This doc is the plan only — **no code will change until you say "yes"**.

---

## 0. Where we are right now
- ✅ App runs on your Android phone via **Expo Go (SDK 54)** in **mock mode**.
- ✅ All **35 screens** across the 5 roles exist and navigate.
- ✅ Backend (16 modules) + Neon Postgres are **built and verified** (RLS isolation 5/5, auth/JWT/RBAC, dashboards — all green in earlier E2E).
- ✅ The `rest` adapter is already written — switching mock→real backend is **one env var, zero screen changes**.
- ✅ Mock now has all 5 role logins (mock-only, any password): `acme_owner`, `sm1`, `th1`, `driver1`, `worker1`.

### The key limitation of mock mode
Mock data lives **in memory on one phone** and reseeds each launch. So data entered by one role is **not** shared with others.
Your core requirement — *"whatever the site manager / team head / driver / worker enters is seen by the others at the same time"* — **only works against the real backend.** That is exactly what Milestone A delivers.

---

## 1. MILESTONE A — Flip to the real backend (over WiFi)  ← next

**Goal:** the app on your phone talks to the NestJS backend on your laptop, which reads/writes the live Neon database. Data one role enters is immediately visible to every other role (correctly scoped by RBAC + RLS).

### 1a. Prep work I will do (when you say yes)
1. **Extend the database seed** (`backend/src/seed.ts`) to create a realistic starter dataset in Neon:
   - 1 org (your real company name if you give it, else "Acme Construction").
   - **All 5 role users** with known passwords and `mustChangePassword = false` (so test logins are frictionless).
   - 2 sites, 2 vehicle types (Truck=KM, JCB=Hours), 2 vehicles, ~6 labour persons.
   - A little sample data (a day of attendance, one progress note, one expense) so every role sees something on first login.
   - Correct scoping so roles behave realistically: Site Manager → assigned to Site 1; Team Head → Site 1 crew; Driver → allowed on the Truck type; Worker → linked to a labour person.
2. **Confirm the backend listens on `0.0.0.0`** (all interfaces) so the phone can reach it over WiFi (CORS is already permissive for dev).
3. **Point the app at the laptop:** set `app/.env` → `EXPO_PUBLIC_ADAPTER=rest` and `EXPO_PUBLIC_API_URL=http://192.168.31.15:4000`.

### 1b. The run procedure (you run these; I'll give exact commands)
1. **Terminal 1 — start the backend:**
   ```
   (cd shared && npm run build)
   (cd backend && npm run build && npm start)     # → "techBuilder API on :4000"
   ```
2. **(One-time) reseed** the 5 users + dataset (I'll give the exact command; runs against Neon with the admin URL).
3. **Terminal 2 — start the app** (phone + laptop on the **same WiFi**):
   ```
   (cd app && npx expo start -c --tunnel)          # tunnel = most reliable; LAN also fine
   ```
4. On the phone: reload in Expo Go → the app now hits the real backend.

> **WiFi note:** your laptop's LAN IP is **`192.168.31.15`**. If your WiFi ever changes the IP, we update the one line in `app/.env`. If your network blocks phone↔laptop traffic, the fallback is a USB cable + `adb reverse` (documented in `TESTING-AND-SETUP.md`).

### 1c. Login credentials (against the REAL backend, after reseed)
> Passwords below are the planned test defaults; I'll set them in the seed. All are real DB users.

| Role | Username | Password (planned) | What they see / can do |
|---|---|---|---|
| **Owner** | `acme_owner` | `changeme123` | Full org dashboard (KPIs, headcount, cost rollups), all sites, all people, fleet, approvals, reports. Creates Site Managers. |
| **Site Manager** | `sm1` | `changeme123` | Their site's dashboard, mark attendance, records, approvals, manage the people/crew under them. Creates Team Heads. |
| **Team Head (Mistri)** | `th1` | `changeme123` | Their crew's attendance, daily progress, material use, raise issues + requests (leave/material/vehicle-switch). Expense entry. |
| **Driver** | `driver1` | `changeme123` | Start/end day, fuel log, trips, expenses, raise issues, their own summary — for the vehicle type they're allowed on. |
| **Worker** | `worker1` | `changeme123` | View-only: their own info + attendance. No data entry (by design). |

### 1d. How we'll verify your "shared, real-time" requirement
A concrete cross-role test (two logins, same phone, or two phones):
1. Log in as **Team Head** → add a **daily progress note** + an **expense**.
2. Log out, log in as **Owner** (or **Site Manager**) → the **dashboard KPIs and lists reflect it immediately** (it's in Neon, not device memory).
3. Log in as **Site Manager** → **approve** a request raised by the Team Head → the Team Head sees the decision.
This proves the up-the-chain visibility end to end.

### Milestone A — Definition of Done
- All 5 roles log in against Neon over WiFi.
- Each role sees its correct, RBAC/RLS-scoped screens and data.
- Data entered by a lower role is visible to the roles above, live.

---

## 2. Forward roadmap (after A) — path to production-ready

> Order is a recommendation; we lock priorities as we go. Each milestone has a clear payoff.

### Milestone B — Simple, colorful UI + design system
- One consistent **color palette + color code** (status colors: present/absent/leave, approved/pending/rejected, etc.).
- **Per-role accent color** so each role's app feels distinct but consistent.
- **Company + owner branding** pulled from `OrgConfig` (name, logo, primary color) — so onboarding a new company = a config change, not a code change.
- **Low-literacy-friendly:** large touch targets, icons + Hindi labels, minimal typing.
- Payoff: looks like a real product, not a prototype.

### Milestone C — Offline outbox (field reliability)
- Route writes through the **outbox + expo-sqlite** so drivers/team heads can log entries **with no signal**; auto-syncs when back online (idempotent, backoff).
- Payoff: works on real construction sites with patchy network.

### Milestone D — Capture pipeline
- **Camera photos**, **QR/barcode scanner**, **voice notes**, **GPS geotag** on records → upload to **Cloudflare R2** (server presign is already built).
- Payoff: proof-of-work photos, scanned bills, voice remarks in Hindi.

### Milestone E — Reports & sharing
- **Excel export** (SheetJS) + **PDF** + **WhatsApp share** for Owner / Site Manager (7-day / 30-day windows).
- Payoff: the Owner's real deliverable — data out of the app.

### Milestone F — Hindi fill, kiosk mode, QA → pilot
- Populate the **Hindi catalog** (keys exist, defaults in English today).
- **Kiosk / shared-device mode** for attendance on a single site phone.
- **QA**: offline-sync stress, RLS cross-tenant, low-end Android performance.
- **Pilot** with one real construction company; then ship (EAS APK / Play Store).

---

## 3. What I need from you
- **For Milestone A now:** nothing blocking — you have Neon wired and the WiFi IP is known. Just keep the laptop backend runnable and phone on the same WiFi.
- **Optional (nicer demo):** a **real company name + owner name + 2 site names** to seed instead of "Acme". If you don't give them, I use Acme.
- **Later (pilot only):** decide where to host the backend (Railway/Render/Fly free tier), a Cloudflare R2 bucket, and whether to publish to Play Store.

---

## 4. Definition of "production-ready" (Phase 1)
- One real company fully onboarded; all 5 roles working on the real backend over the internet (hosted, not laptop).
- Offline-first entry + reliable sync; capture (photo/scan/voice/GPS) working; Excel/WhatsApp export working.
- Hindi UI complete; colorful, low-literacy-friendly.
- QA passed (offline stress, RLS isolation, low-end device perf).
- Installable APK in the Owner's staff hands.

---

## 5. Immediate next action
**Say "yes"** and I'll start **Milestone A**: extend the seed for all 5 roles + realistic data, confirm the `0.0.0.0` bind, set `app/.env` to `rest` + your WiFi IP, then hand you the exact 3-terminal run commands and we verify all 5 role logins against live Neon.
