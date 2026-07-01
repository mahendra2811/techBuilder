# techBuilder — Phase 1 Tech Stack (Android app)

> The locked toolchain for the Phase-1 Android app (Expo engine + single codebase, agency model, offline-first).
> **Versions are pinned at scaffold time via `ctx7`/find-docs** (per repo `AGENTS.md` — don't trust training-data versions). This file is the *selection + rationale*.
> Package manager: **npm**.

---

## Locked decisions (resolved)
| Decision | Choice | Why |
|---|---|---|
| Camera | **expo-camera** (not vision-camera) | Watermark is burned **after** capture, so we don't need vision-camera's real-time frame processors. expo-camera has built-in QR/barcode scan, is pure-Expo (no native-build pain), smoother EAS. |
| Offline DB | **expo-sqlite + custom outbox** (not PowerSync) | Agency + single-merchant + **end-of-day** entry doesn't need a paid real-time sync engine. Lighter, no lock-in. |
| Export | **Client-side: SheetJS (Excel) + expo-print (PDF)** (no Puppeteer/server in P1) | No full Hindi PDFs — only Hindi *remarks*. Excel handles Unicode fine; expo-print renders PDF via the phone's OS browser engine, which **shapes Devanagari correctly**. Works offline. |
| Package manager | **npm** | RN-safe; avoids pnpm/Metro hoisting friction. |
| Engine wiring | **git submodule + Metro `watchFolders`** | Engine is its own repo; app pins a version. |

---

## 1. Core framework
- **Expo SDK** (latest stable; doc baseline SDK 55) + **React Native** + **React 19** — managed workflow, Continuous Native Generation (config plugins, no eject).
- **Expo Router** — file-based routing; role-group routing (owner / site-manager / team-head / driver / worker).
- **TypeScript (strict)** — shared types across engine + app; no `any`.
- **EAS Build / Update / Submit** — Android APK/AAB, OTA JS updates, per-client white-label build profiles.

## 2. UI & styling
- **NativeWind** (Tailwind for RN) — matches web Tailwind familiarity.
- **Engine `ui/` primitives** — custom Button / Card / ListRow / KpiCard / RecordForm on RN core + NativeWind (mirrors storefront `src/ui`; no heavy UI-kit lock-in).
- **@shopify/flash-list** — perf lists (rosters, records, activity feed).
- **@gorhom/bottom-sheet** — pickers, action menus, forms.
- **lucide-react-native** — icons.
- **react-hook-form + zod** — forms + validation; zod schemas shared with adapter DTOs.

## 3. State & data
- **Zustand** — UI/session state: current user, org, language, nav, offline status, the `can()` permission context.
- **TanStack Query** — server-state reads through the adapter (cache, refetch, optimistic, persisted offline cache).
- **Custom mutation outbox** — offline writes: local → queue → flush when online (records + media).

## 4. Local storage & offline
- **react-native-mmkv** — fast KV (session, flags, current user, queue metadata).
- **expo-sqlite** — local DB: records cache + offline outbox.
- **expo-network / @react-native-community/netinfo** — connectivity → drives the flush.
- ~~PowerSync~~ — **deferred** (see locked decisions).

## 5. Backend adapter (the key abstraction)
- **Custom `RecordsClient` / `AuthClient` interfaces** — screens never touch the backend directly.
- **`mock` adapter** — in-memory + seed JSON, persisted to expo-sqlite. Build ALL screens with no backend.
- **`rest` adapter** — thin fetch wrapper (or `ky`) + **zod** validation at the boundary. Phase-B swap, zero screen changes.

## 6. Capture pipeline (core feature)
- **expo-camera** — in-app photo capture + QR/barcode **scanner**.
- **@shopify/react-native-skia** *or* **react-native-view-shot** — burn watermark (date/time/GPS/site/name) post-capture.
- **react-native-compressor** *(or expo-image-manipulator)* — 4–5 MB → ~300 KB.
- **expo-location** — GPS geotag for **photos/records only — NOT attendance**.
- **expo-image** — fast image display + caching.

## 7. Media storage
- **Cloudflare R2** (S3-compatible, presigned URLs) — zero egress. Phase-1 mock stores locally; `rest` adapter uploads via the upload-queue.
- **expo-file-system** — local files, upload queue, backups.

## 8. i18n (Hindi default + English)
- **i18next + react-i18next** + **expo-localization** — runtime language switch, plurals; same JSON message style as web's next-intl.

## 9. Reports / export & backups (core feature)
- **SheetJS (`xlsx`)** — client-side Excel export (Hindi cells fine, works offline).
- **expo-print** — client-side PDF when needed; renders Hindi remarks correctly via the OS engine (no Puppeteer).
- **expo-sharing + expo-file-system** — save/share files; windowed (7/30-day) import/export + local backup.
- *(Server-side ExcelJS/Puppeteer only if datasets get huge — not Phase 1.)*

## 10. Notifications
- **Expo Notifications + FCM** — breakdown alerts, approvals. Phase 1 may start with the in-app Notification Center; push wired when needed.

## 11. Quality & tooling
- **ESLint + Prettier + Husky + lint-staged** — matches existing conventions.
- **Jest (jest-expo) + @testing-library/react-native** — unit/component tests.
- **Maestro** — mobile E2E flows (login → create user → mark attendance).
- **@sentry/react-native** — crash/error monitoring.
- **npm** package manager; engine via git submodule + Metro `watchFolders`.

## 12. Backend & database — first-class (built properly in Phase 1)
**NestJS + Drizzle + PostgreSQL (Neon) + Cloudflare R2.** One backend + one Postgres, **shared-schema multi-tenant with RLS** (`org_id` on every table), JWT manual login, **server-side RBAC guards** mirroring the engine's `can()`. No Redis/BullMQ, no Socket.io, no Puppeteer in P1 (keeps it ~₹0–500/mo). Exports stay client-side (§9). The frontend reaches it via the `rest` adapter (swap from `mock`, zero screen changes).
**→ Full schema (~20 tables), RLS, API surface, hosting & budget: `techBuilder-Backend-and-Database.md`.**
