# techBuilder — Engine + Per-Merchant Fork Plan

> **What this is:** the plan for building techBuilder the same way Primathon builds storefronts —
> one reusable **engine** + a thin **per-merchant fork** — adapted for a **Phase-1 Android app**
> (Expo/React Native), single-tenant per merchant. Derived from a deep read of the storefront-builder
> docs and how real merchants (aqualogica, weryze, wellversed) consume it.

---

## 1. What we copied from storefront — and what we deliberately did NOT

The storefront builder = **one Next.js engine renders N brands**. ~90% shared, ~10% per-merchant. The transferable ideas, ranked by value for techBuilder:

| Storefront pattern | Adopt for techBuilder? | Why |
|---|---|---|
| **Engine vs thin-merchant split** (fork + submodule) | ✅ **Core of the plan** | This is exactly your ask. Build the hard parts once. |
| **Adapter pattern** (UI → `CommerceClient` interface, never the backend directly) | ✅ **High** | Lets us start with a mock/thin API and swap/grow the real backend later **without touching any screen**. Same trick that let storefront migrate Shopify→GoKwik with zero widget rewrites. |
| **Config-driven enablement** (`theme.json` + `MERCHANT_NAME` selects look/behavior) | ✅ **High (simplified)** | A new merchant = a config file + assets, not new code. |
| **Shared design-system + role shells in the engine** | ✅ **High** | The 5 role shells, bottom-navs, shared screens (S1–S7), cards/forms live once in the engine. |
| **Record/screen registry** (lighter cousin of their widget registry) | ✅ **Medium** | So a merchant can enable/disable/reorder *record types* by config — the "optimize over time" lever. |
| **Full page-builder** (templates + widget registry + declarative `dataSources` + visual editor submodule) | ❌ **Skip in Phase 1** | This exists because storefront is a *visual marketing* product (aqualogica has 70+ campaign page templates). techBuilder Phase 1 is a **records + visibility** tool — **screens are identical across construction companies**. Building a JSON page-builder now is over-engineering. Revisit only if a merchant ever needs bespoke screen *layouts*. |
| **Redis multi-level cache, ISR, CDN** | ❌ Phase 1 | Mobile app + simple API. Add server caching when the backend grows. |
| **`.perf` CWV governance** | ⚠️ Later | Add a lightweight lint/size gate once multiple people contribute. |

**The honest headline:** techBuilder's per-merchant surface is **even thinner** than storefront's. Storefront varies by *look* (heavy theming). techBuilder varies by **config + seed data**, barely by code. That makes "first merchant fast, then optimize" very achievable.

---

## 2. The structure: one engine + ONE app codebase (NOT code forks)

> **Decided:** techBuilder is a **managed/agency** product (you onboard each construction company; owner creates staff logins; no self-signup or billing in Phase 1). And it ships as an **Android app**.
> Those two facts kill the code-fork idea: forking the *code* per merchant means N APKs / N Play-Store listings, and every engine fix = rebuild + re-submit every client's app to Google review. Pain at 3 clients, brutal at 10.
> **So we do NOT fork code.** One engine + one app codebase. Per-client variation comes from **runtime config** and (only if a client wants their own branded APK) a **parameterized build** — never a forked codebase.

```
techbuilder/                     ← one repo (or engine as a submodule of the app — see §6)
  packages/engine/   (or git submodule)   the reusable engine — IDENTICAL for every client
  app/                                     one Expo/Android app; loads org brand+config after login
  merchants/                               per-client CONFIG + assets only (no code):
    acme-build/    config.ts + logo/colors/app-icon
    rao-infra/     config.ts + logo/colors/app-icon
```

**Two ways a client differs — neither is a code fork:**
1. **Runtime (default, one APK for all):** after the owner logs in, the app loads *that org's* brand (logo, colors, name) + enabled records/roles from config. Light in-app white-label.
2. **Build-time (only for a premium "own-branded app" client):** produce a white-label APK from the **same codebase** by swapping `app.json` (app name, icon, package id) + brand assets via an **EAS build profile**. A parameterized build, not a forked codebase — engine fixes still land in one place.

**Tenant-aware from day one:** every data model carries `orgId`/`tenantId` and every query is org-scoped, even with a single org. This is cheap insurance: if the business ever moves to self-serve SaaS, you add a registration→org-creation screen + a multi-tenant adapter — **no rewrite**, because the screens already speak the adapter interface and the data is already org-scoped.

### 2.1 `techbuilder-engine/` — what lives in the engine (the ~90%)

```
techbuilder-engine/
  package.json                 # name: "techbuilder-engine"
  src/
    config/
      merchant-config.ts        # MerchantConfig type + defaults + validation (zod)
      feature-flags.ts          # role/record/feature toggles
      loader.ts                 # reads the active org's config (from merchants/<id>/config.ts or backend)
    auth/
      login.ts  session.ts      # username+password (no OTP in P1), JWT/session
      role-router.tsx           # logs in → routes to the role's home + bottom-nav
      change-password.ts
    backend/                    # ← THE ADAPTER LAYER (crown jewel)
      RecordsClient.ts          # interface: createRecord, listRecords, getDashboard,
                                #            users, sites, vehicles, upload, notifications…
      registry.ts               # holds the active adapter; chosen by env/config
      adapters/
        mock/                   # in-memory/seed adapter — build screens before the API exists
        rest/                   # talks to the techBuilder API (Phase B+)
      models/                   # normalized DTOs: Site, Vehicle, User, Record, Issue, Photo…
    sync/
      offline-queue.ts          # writes go local-first, flush when online (records + photos)
      net-state.ts
    media/
      camera.ts  gps.ts         # in-app camera + GPS capture
      watermark.ts  compress.ts # burn date/time/GPS/site/name; 4MB→~300KB
      upload-queue.ts           # background upload w/ retry+backoff (R2/API)
    records/
      record-registry.ts        # record TYPE → {form, list, validation, roles allowed}
      types/                    # headcount, spend, fuel, issue, photo, material, vehicle-log,
                                #   daily-note, progress, material-request, maintenance…
    screens/
      shared/                   # S1–S7: Splash, Login, ChangePassword, Profile,
                                #        Notifications, Settings, Help
      roles/
        owner/                  # O1–O16 (dashboard, sites, fleet, analytics, exports…)
        site-manager/           # SM1–SM12
        team-head/              # TH1–TH8
        driver/                 # D1–D10
        worker/                 # W1–W2 (view-only)
      _shells/                  # bottom-nav shells per role
    ui/                         # design system: Button, Card, KpiCard, ActionCard,
                                #   ListRow, RecordForm, EmptyState, BottomNav, Header…
    i18n/                       # HI/EN engine + shared strings
    analytics/                  # optional event bus (PostHog later)
    reports/                    # PDF/Excel export builders (shared)
```

**Everything above is identical for every merchant.** None of it is touched during onboarding.

### 2.2 The app + per-client config (the ~10%, and it's NOT code)

```
techbuilder/
  engine/                      # the engine (submodule, pinned) — or packages/engine in-repo
  app/                         # ONE Expo Router app — thin: mounts engine role-router
    _layout.tsx                # wraps engine providers (auth, sync, i18n, theme)
    index.tsx                  # → engine Splash → Login → org resolved → role home
  merchants/
    acme-build/
      config.ts                # ★ org config (see §3)
      assets/                  # logo, brand color, (app icon if white-label build)
    rao-infra/
      config.ts
      assets/
  app.json / eas.json          # default app id/name/icon + per-client white-label build profiles
  .env                         # API_BASE_URL, R2/keys (NOT a single merchant id — org from login)
  metro.config.js              # watchFolders → ./engine (Metro compiles engine source)
  package.json                 # deps + "techbuilder-engine": "file:./engine"
```

**Onboarding a client adds a folder under `merchants/`, never a code branch.** The owner logs into the one app; the backend tells the app which org they belong to; the engine loads that org's `config.ts` + assets.

**Metro note (practical):** RN can't `npm install` a submodule the way web does. Wire it as a local path package + add `./engine` to Metro `watchFolders` and `resolver.nodeModulesPaths`. The submodule is *source*, compiled by the app's Metro. (This is the one real plumbing task; everything else is config.)

**White-label APK (optional, per premium client):** an EAS build profile overrides `app.json` (name/icon/package id) + points at that client's `merchants/<id>/assets`. Same code, different build output. Default clients all share one "techBuilder" APK.

---

## 3. `merchants/<id>/config.ts` — the whole "onboarding surface" in one file

This is techBuilder's equivalent of storefront's `theme.json` + `MERCHANT_NAME` + env, collapsed into one typed object. Onboarding a client is mostly **writing this file + dropping in a logo** (plus creating the org + owner login on the backend). In the agency model the org is provisioned by *you*, so `id` here matches the org you created server-side.

```ts
import type { MerchantConfig } from 'techbuilder-engine/config';

export const config: MerchantConfig = {
  id: 'acme-build',                 // matches the orgId you provisioned on the backend
  name: 'Acme Builders Pvt Ltd',
  brand: {
    logo: require('./assets/logo.png'),
    primaryColor: '#1A5276',
    splash: require('./assets/splash.png'),
  },
  languages: ['hi', 'en'],          // hi default
  defaultLanguage: 'hi',

  // which of the 5 roles this merchant uses (Phase 1: all, but toggleable)
  roles: ['owner', 'site-manager', 'team-head', 'driver', 'worker'],

  // which RECORD TYPES are enabled, and per-role overrides — the "optimize" lever
  records: {
    headcount: true,
    sitePhotos: true,
    dailyReport: true,
    spend: true,
    fuel: true,
    materialUsage: true,
    materialRequest: true,
    issues: true,
    vehicleLog: true,
    maintenance: true,
    teamHeadSpend: false,           // open question #2 in the Android plan — config, not code
  },

  vehicles: {
    types: ['km', 'hours'],         // KM-type vs Hours-type behavior
  },

  backend: 'mock',                  // 'mock' | 'rest' — the adapter selector
  features: {
    breakdownAlerts: true,
    reportsExport: true,
    workerLogin: true,              // open question #3 — config, not code
  },
};
```

Add a record type, turn a role off, change vehicle rules, swap the backend — **all config, zero engine edits, zero code fork.**

---

## 4. Onboarding playbook — merchant #1 (fast path) and merchant N (optimized)

### 4.1 Merchant #1 — build the engine *through* the first delivery

You don't build the whole engine up front. You build merchant #1, and **everything reusable you write gets pushed down into the engine as you go.** This is the storefront lesson (aqualogica was Gen-1; the reusable parts were extracted into the framework afterward) and matches your existing mahiNest "reflect & promote learnings" loop.

1. **Scaffold once:** create `techbuilder-engine` (empty shells) + the `techbuilder` app (Expo Android, engine wired via submodule + Metro watchFolders, tenant-aware models with `orgId`).
2. **Provision Acme:** create the org + owner login on the backend; add `merchants/acme-build/config.ts` + `assets/logo`.
3. **Build with the `mock` adapter first** — implement the 55 screens against seed data, org-scoped by `orgId`. No backend dependency; screens get done fast. (Storefront did the same: UI never imports the backend, only the interface.)
4. **As you build, place code correctly:** anything generic → `engine/`. Anything truly Acme-only (rare in P1) → guard it behind a config flag, don't fork.
5. **Swap adapter `mock → rest`** when the API is ready — screens don't change.
6. **Seed Acme's data** (sites, vehicles, users) via the Owner setup screens (O4/O6/O8) — this is **data, not code**.
7. **EAS build the APK** (shared "techBuilder" build, or Acme white-label profile if they want their own), hand it to the Owner, who creates logins for staff.
8. **Reflect:** after delivery, sweep for anything reusable and promote it UP into `engine`. The engine is now better for merchant #2.

### 4.2 Merchant #2…N — the optimized path

1. Provision Rao's org + owner login on the backend.
2. Add `merchants/rao-infra/config.ts` + assets. Seed data via Owner screens.
3. Owner installs the **same shared APK** (or you cut a white-label build if requested). **Target: hours, not weeks** — the custom surface is config + assets only, and the engine is already fitter from merchant #1.
4. If merchant N truly needs a bespoke screen, add it behind a config flag in the engine (or a small `merchants/<id>/screens` slot); if it's generally useful, fold it into the engine. Each onboarding makes the engine fitter — exactly the loop you described.

### 4.3 Propagating engine improvements to existing clients

- Engine fix lands in `techbuilder-engine` → bump the submodule pin in the app → **one EAS rebuild ships it to every client** (shared APK), or rebuild each white-label profile.
- Because it's one codebase (not N forks), there's **no cherry-picking across merchants** — the storefront Gen-1 pain we deliberately avoided.

---

## 5. Direct answer: can we implement techBuilder this way?

**Yes — and it fits techBuilder better than it fits storefront.** Reasoning:

- The model is "build the hard parts once, new client = thin config." techBuilder's hard parts (offline queue, camera/GPS/watermark pipeline, role-router, record sync, the 5 role shells, PDF/Excel export, HI/EN) are **the same for every construction company**. The variation between Acme and Rao is brand + which records are on + seed data — almost no code.
- The **adapter pattern** is the single most valuable steal: build all 55 screens against a `mock` adapter now, switch to `rest` when the API lands, never rewrite a screen. It also de-risks Phase B.
- **Skip the page-builder/widget-registry/visual-editor.** That machinery pays off when each client needs a *different visual layout per page* (marketing). Construction merchants want the *same* reliable screens. A lightweight **record-registry + merchant.config** gives you the per-merchant flexibility you actually need without the complexity.

**Net:** adopt the storefront *spine* (engine + adapter + config-driven), drop the storefront *marketing machinery* (page-builder + editor + heavy theming) **and** drop code-forking (wrong for Android distribution). Your reusable engine holds ~95% of the code; per-client is config, assets, and (rarely) one config-gated screen.

### 5.1 Why single-codebase beats code-forks here (agency + Android)
- **Agency model** = *you* provision each org + owner login. No self-signup needed → no reason to bake identity into a build → no reason to fork.
- **Android distribution** = code-forks would mean N APKs / N Play listings / re-submit-all-on-every-fix. One codebase = one rebuild ships to all.
- **White-label** (a client wanting their own branded app) is still possible — via a *build profile*, not a code fork.
- **Future-proof** = `orgId` in the models from day one means flipping to self-serve multi-tenant SaaS later is *additive* (registration screen + multi-tenant adapter), not a rewrite.

---

## 6. Decisions — RESOLVED

1. **Engine wiring:** ✅ **git submodule** + Metro `watchFolders` source-compile. Engine is its own repo; the app pins a version.
2. **Engine stack:** ✅ **Expo SDK 55 + Expo Router + NativeWind**, package manager **npm**. The existing `proj/apps/web` Next.js scaffold is a *later-phase* Owner web dashboard — **not** the Phase-1 Android build. *(Full toolchain: `techBuilder-Tech-Stack.md`.)*
3. **Backend:** ✅ **Built properly in Phase 1** — **NestJS + Drizzle + PostgreSQL (Neon) + R2**, shared-schema multi-tenant + RLS. Dev against the `mock` adapter; swap to `rest` (zero screen changes). *(Full spec: `techBuilder-Backend-and-Database.md`.)*
4. **White-label:** ✅ Default = one shared "techBuilder" APK with in-app org branding; a client wanting their own branded APK gets an **EAS build profile** (name/icon/assets), **not** a code fork.
5. **Product open-questions** (Team-Head spend, overlapping records, Worker login): ✅ all settled — see Screen-Plan §11/§12. Team-Head logs expenses; TH=crew / SM=site scope; Worker stays view-only.
6. **Attendance:** ✅ per-person present/absent/half-day + multi-day leave, **marked by Team Head / Site Manager only — no clock-in/out, no GPS.**

---

## 7. Phase-1 build scope (LOCKED) — one merchant, post-login functionality

**Directive:** design/UI is not negotiated with merchants — **functionality is the only goal**. Auth + payment are **manual and out of scope**: you provision each company by hand (take payment offline, create the org + owner login, hand it over). Build **everything that happens *after* login**, for **one organization**, and complete it fully. All merchants are construction companies, so completing #1 covers most of #2…N.

### 7.1 In / Out for Phase 1
**OUT (manual / deferred, stubbed behind interfaces):** signup, OTP, forgot-password, password-reset self-serve, payment/subscription/billing, multi-org self-registration, real-time live tracking, wages/payouts.

**IN:** manual login → role routing; **self-service org management** (Owner→Site Manager→Team Head create accounts + run the org); RBAC with scopes; type-driven vehicles + driver-compatibility + request/approval (vehicle-switch, leave, material); **per-person attendance + multi-day leave**; per-role daily **records** (expense/fuel/trip/material-movement/photo/issue…); capture (camera/scanner/GPS); roll-up to Owner; Excel export + windowed import/export + backups; HI/EN; offline-first; shared screens.
**→ Full domain model, RBAC matrix & workflows: `techBuilder-Domain-Model-and-Permissions.md`.**

### 7.2 The auth stub (swappable later)
- `AuthClient` interface in the engine adapter layer: `login(username, password) → { user, org }`, `changePassword()`.
- Phase-1 impl: validates against seeded/owner-created users (mock adapter, then thin REST). **No signup/OTP/forgot/payment.**
- Flag `features.auth = 'manual'`. Later `'otp'` is a new adapter impl — **screens unchanged**.
- Payment never enters the app: access = "org + owner login exists" (you created it after taking payment offline).

### 7.3 Org & people data model (the backbone — all `orgId`-scoped)
```
Org      { id, name, brand, languages }
User     { id, orgId, name, phone, photo,
           role: owner | site-manager | team-head | driver | worker,
           username, password, mustChangePassword,
           assignedSiteId?, assignedVehicleId?, teamHeadId?,   // allocations
           dailyWage?, emergencyContact?, active }
Site     { id, orgId, name, address, lat, lng, startDate, expectedEndDate, budget, status, siteManagerId }
Vehicle  { id, orgId, name, type: km|hours, plate, assignedSiteId?, assignedDriverId?, docs[], status }
```
**Owner setup flow that turns an empty org into a running one:**
1. Owner creates **Sites** (O4) + **Vehicles** (O8).
2. Owner creates **Users** w/ role + temp password (O6); assigns Site Manager→site, Driver→vehicle.
3. **Site Manager** allocates Workers/Drivers under each **Team Head** (SM10 — crews).
4. Records then flow **up**: Driver / Team-Head / Site-Manager log → Owner consumes.

### 7.4 Build order (each step leaves the app demonstrably working)
1. **Engine skeleton + manual-login stub + role router** (login → correct role home).
2. **Org & people foundation** — Owner screens: Sites (O2/O4), People (O5/O6), Fleet (O7/O8). Owner can fully populate the company.
3. **Allocation** — SiteManager↔site, Worker/Driver↔TeamHead (SM10), Vehicle↔site/driver.
4. **Record entry** — per-role daily records (driver logs, headcount, photos, spend, fuel, issues, materials…).
5. **Roll-up / consumption** — role dashboards, analytics, activity feed, gallery.
6. **Reports / export** (PDF/Excel).
7. **Shared** — profile, notifications, settings, help; then HI/EN + offline-queue + empty/loading/error polish.

> Identity → populate org → allocate people → records → roll-up → reports.

---

*End of plan. Next step on your go-ahead: scaffold `techbuilder-engine` + the single `techbuilder` Expo app (tenant-aware, manual-login stub, engine submodule wired) and build step 1–2 of §7.4 against the mock adapter.*
