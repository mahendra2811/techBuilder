# techBuilder — Local Testing & Setup Guide (free, on your Android phone)

> Goal: run the **real app on your phone** against the **real backend + Neon DB**, log in, create data, and see it — all on free tiers, no cloud host. Written for: laptop (has the repo + Node) + one Android phone with **Expo Go** installed.

**Current state:** DB is already provisioned + seeded on Neon; backend verified end-to-end (RLS 5/5, live HTTP E2E). You just need to run the backend locally + load the app on your phone.

---

## 0. One-time: how the phone reaches the backend
The backend runs on your **laptop** (`:4000`). The phone must reach it. Two options — pick one:

| | **WiFi (LAN)** | **USB cable (adb reverse)** — most reliable |
|---|---|---|
| Setup | phone + laptop on the **same WiFi** | plug phone in, USB debugging on, run `adb reverse tcp:4000 tcp:4000` |
| App API URL | `http://<laptop-LAN-IP>:4000` (find IP with `ip addr`/`hostname -I` → e.g. `192.168.1.5`) | `http://localhost:4000` |
| When to use | default, easy | if WiFi blocks device↔laptop, or IP keeps changing |

> `adb` comes with Android Studio platform-tools. `adb reverse` makes the phone's `localhost:4000` tunnel to your laptop — the cleanest option.

---

## 1. Install dependencies (once)
Versions are intentionally left loose in `app/package.json` so **Expo pins the coherent SDK set** (root `.npmrc` has `legacy-peer-deps=true` so RN's strict peers don't block install):
```bash
cd ~/Documents/p_project/techBuilder/app
npm install                # installs (peer conflicts tolerated via .npmrc)
npx expo install --fix     # ← Expo rewrites react / react-native / expo-* to the exact SDK 54 versions
```
If `npm install` still complains, `npm install --legacy-peer-deps` explicitly. After `--fix`, versions are coherent.
*(expo-camera / expo-image were removed for now — they get added by the capture pipeline step.)*

## 2. Build + start the backend (Terminal 1)
```bash
cd ~/Documents/p_project/techBuilder
(cd shared && npm run build)     # compile @techbuilder/contracts → dist (backend needs this)
(cd backend && npm run build)    # compile backend → dist/main.js
(cd backend && npm start)        # → "techBuilder API on :4000/api/v1"
```
Leave it running. (`backend/.env` already has the Neon URLs + JWT secrets.)

**Quick check it's alive:**
```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"username":"acme_owner","password":"changeme123","deviceId":"pc"}' | head -c 200
```
You should see a JSON `{ "data": { ... "accessToken" ... } }`.

## 3. Point the app at the backend
```bash
cd app
cp .env.example .env
# then edit app/.env:
#   EXPO_PUBLIC_ADAPTER=rest
#   EXPO_PUBLIC_API_URL=http://localhost:4000       (USB) — or http://<laptop-LAN-IP>:4000 (WiFi)
```
If using **USB**, in another terminal: `adb reverse tcp:4000 tcp:4000`.

## 4. Run the app on your phone (Terminal 2)
```bash
cd app
npx expo start            # add --tunnel if QR/LAN won't connect on your network
```
Open **Expo Go** on the phone → scan the QR. The app loads over-the-air (no APK build).

## 5. Log in + use it
- **Owner:** `acme_owner` / `changeme123` (seeded).
- You land on the Owner home → **Dashboard** (live KPIs), **Sites** (create one), **People** (create a Site Manager — the cascade), **Fleet** (add a vehicle).
- Everything you create is written to **Neon**, RLS-scoped to your org.

## 6. See the data
- **In the app:** Owner Dashboard + the list screens.
- **In the DB directly:** Neon Console → SQL editor → e.g. `select name, code, status from sites;` (or `select username, role from users;`).
- **Pure-UI mode (no backend):** set `EXPO_PUBLIC_ADAPTER=` (empty) in `app/.env` → the app runs on seeded **mock** data offline. Good for quick UI checks.

## 7. Is it free?
**Yes, entirely** for this testing setup: Neon (free tier), backend on your laptop (₹0), Expo Go (free), your phone. No cloud host, no Play Store, no paid services needed to test.

---

## Troubleshooting
- **Phone can't reach API** → use USB + `adb reverse tcp:4000 tcp:4000` and `EXPO_PUBLIC_API_URL=http://localhost:4000`. Or `npx expo start --tunnel`.
- **"Network request failed" on login** → backend not running, wrong IP, or `.env` not picked up (restart `expo start` after editing `app/.env`).
- **Metro can't resolve `@techbuilder/contracts`** → ensure `(cd shared && npm run build)` ran and root `npm install` created the workspace symlink; restart Metro with `npx expo start -c` (clears cache).
- **A native module error in Expo Go** → run `npx expo install --fix`; if a module truly isn't in Expo Go, make a dev build: `npx expo run:android` (needs Android SDK) — still free.
- **Reset the DB** (⚠️ wipes data): re-run migrations/seed using the **admin** URL — ask Claude; don't re-run `npm run seed` twice (the `acme` org code is unique → duplicate error).

---

## ✅ What works today (verified)
- Backend: all 16 modules, RLS tenant isolation (5/5), auth/JWT/RBAC, dashboards, cascade user creation — **live on Neon**.
- App: 35 screens across all 5 roles + shared, on the mock adapter; `rest` adapter wired (flip via env).

## ⏳ Pending (what's left to build — roughly in order)
**You/setup:**
1. Run `npm install` + `npx expo install --fix` on your machine (Expo tree not installed in the sandbox).
2. First on-device run — shake out any Metro/runtime issues (report them and I'll fix).

**Code (Claude builds next):**
3. **Wire screens through the offline outbox** — screens currently call the adapter directly; route writes via `Outbox` + `SqliteOutboxStore` so offline-first + sync actually kicks in. *(STEP 5 hardening.)*
4. **Capture pipeline** — camera (photos), QR/barcode scanner, voice notes, GPS geotag + watermark + compression; then real **R2 upload** (presign is wired server-side; the app doesn't upload the file yet).
5. **Reports/Excel export** (SheetJS) + WhatsApp share screen (Owner/SM).
6. **Kiosk / shared-device mode** for attendance.
7. **Hindi catalog fill** — role-screen strings currently use `t('key','English default')`; populate `hi.json` (+ the owner keys already in `en/hi.json`).
8. **Full-app RN typecheck** — `cd app && npm run typecheck:app` on your machine (needs the installed Expo tree) → fix any RN type errors the sandbox couldn't see.
9. **Tests** — Vitest/Jest unit (wage calc, RBAC, sync) + Maestro E2E (login → create → mark attendance).

**Infra (only for a real pilot beyond your laptop):**
10. **Host the backend** — Railway / Render / Fly.io (free/hobby) so the phone works off your WiFi; point `EXPO_PUBLIC_API_URL` at it.
11. **Cloudflare R2** — bucket + keys → backend `R2_*` (for media, once #4 is built).
12. **FCM** (push) — optional; in-app notifications work without it.
13. **EAS build** → signed APK for the Owner's staff; **Google Play** (₹2,100 one-time) only if publishing. **✅ EAS is configured** — `app.json` has the projectId (`e397db98-…`), `eas.json` has `development`/`preview`/`production` profiles. On your machine: `npm i -g eas-cli` → `eas login` → `eas build -p android --profile preview` (installable APK) or `--profile development` (dev client). *(A standalone APK can't reach `localhost` untethered — set `EXPO_PUBLIC_API_URL` to a hosted backend in the profile's `env`, or keep USB + `adb reverse` while testing.)*

## EAS (optional — not needed for Expo Go testing)
EAS is only for **standalone/dev-client APKs + OTA updates**; for day-to-day testing, **Expo Go (§4) is faster and needs no build**. When you do want a build:
```bash
npm install --global eas-cli
cd app
eas login                                   # interactive (browser) — your account that owns the projectId
eas build -p android --profile preview      # → installable APK link (share/sideload)
# or: eas build -p android --profile development   (dev client, for USB + expo start --dev-client)
```
`eas init --id e397db98-6573-44c2-b22b-53536eac3904` isn't needed now — the projectId is already in `app.json`; running it will just confirm the link.
**API URL for a standalone APK:** set `EXPO_PUBLIC_API_URL` in the chosen profile's `env` (in `eas.json`) to a **hosted** backend (Railway/Render/Fly), OR keep the phone on USB with `adb reverse tcp:4000 tcp:4000` (works for standalone apps too) pointing at `http://localhost:4000`.

**Then:** STEP 5 Hardening & QA → STEP 6 first-merchant pilot → STEP 7 ship.

---
*Backend commands recap:* `(cd shared && npm run build)` → `(cd backend && npm run build && npm start)`. App: `cd app && npx expo start`. DB is on Neon (`backend/.env`).
