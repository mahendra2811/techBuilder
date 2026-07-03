# @techbuilder/web — Web Portal (Phase 1: auth + role routing skeleton)

Next.js (App Router) frontend for techBuilder, talking to the **existing, untouched**
NestJS backend. Built on the frozen `@techbuilder/contracts` workspace package —
every enum, type, DTO, endpoint path and the error envelope are **imported**, never
redefined.

## Stack
Next.js 16 (App Router, `src/proxy.ts` instead of the deprecated middleware) ·
TypeScript strict · Tailwind CSS v4 · shadcn/ui · TanStack Query · react-hook-form + zod.
Mobile-first responsive.

## Run
```bash
# from repo root (npm workspaces — web is the 4th workspace)
npm install
(cd shared && npm run build)                      # contracts dist consumed by web
(cd backend && npm run build && npm start)        # backend on :4000 (uses backend/.env)
(cd web && npm run dev)                           # web on :3000
```

## Environment (`web/.env.local`, see `.env.example`)
| Var | Default | Meaning |
|---|---|---|
| `BACKEND_ORIGIN` | `http://localhost:4000` | Backend **origin only** — the `/api/v1` prefix comes from the contracts' `API_BASE`. Server-side only; the browser never talks to the backend directly. |

## Auth architecture (httpOnly cookies — tokens never reach client JS)
- `POST /api/auth/login` — Route Handler calls the backend login **server-side**, sets
  `tb_access` (15 min) + `tb_refresh` (30 d) + `tb_device` (stable per-browser device id)
  as httpOnly/sameSite=lax/secure-in-prod cookies, returns only `{user, org}`.
- `POST /api/auth/refresh` — rotates the cookie pair (backend revokes the old refresh
  token, so rotation is always persisted). `POST /api/auth/logout` — best-effort backend
  logout + clears cookies.
- `/api/proxy/[...path]` — the ONLY channel for authenticated browser calls. Attaches
  the Bearer token from the cookie; on 401 `TOKEN_EXPIRED`/`UNAUTHENTICATED` it
  refreshes **once**, retries, and persists the rotated cookies. `auth/login|refresh|logout`
  are denylisted here (their responses carry raw tokens).
- `src/proxy.ts` (Next 16 middleware) — protects `/`, `/change-password` and the 5 role
  areas: no cookies → redirect `/login`; access cookie aged out (cookie TTL ≈ token TTL)
  → refresh-and-rotate before render, since Server Components can't set cookies.
- Role layouts call `requireRole(role)` (server-side `GET /me`) — the authoritative
  check: bounces to `/login`, enforces the `mustChangePassword` gate, and sends users
  who wander into another role's area back to their own home.

## Routes
`/login` → `/change-password` (forced when `user.mustChangePassword`) →
`/owner` · `/site-manager` · `/team-head` · `/driver` · `/worker` (distinct shells;
feature screens arrive in later phases).

## Layout of `src/`
```
src/
  proxy.ts                     # route protection + pre-render token refresh
  app/
    api/auth/{login,logout,refresh}/route.ts
    api/proxy/[...path]/route.ts
    login/  change-password/   # public + gate pages
    owner/ site-manager/ team-head/ driver/ worker/   # role areas (layout+page)
    layout.tsx  page.tsx  providers.tsx
  components/ role-shell.tsx logout-button.tsx role-home-placeholder.tsx ui/*
  lib/
    api-client.ts              # client → Next server wrapper (envelope-aware errors)
    roles.ts messages.ts       # role↔slug map · i18n-ready message catalog
    server/ backend.ts cookies.ts require-session.ts
```
