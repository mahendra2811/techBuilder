# techBuilder — Local Dev Startup (Web Portal + Backend + Neon DB)

> Current stack (post web-pivot, see `techBuilder-Web-Pivot-Plan.md` + `CLAUDE.md` §1 banner): **`web/`** (Next.js) talks to **`backend/`** (NestJS) which is linked to a real **Neon Postgres** DB via `backend/.env`. No mobile/Expo steps here — that flow (`app/`) is frozen; see `TESTING-AND-SETUP.md` if you ever need it.
>
> This doc documents the exact sequence verified working on 2026-07-03: backend boot → DB link check → web boot → full login round-trip (web → backend → Neon, httpOnly cookies set).

---

## 0. Prerequisites (one-time)
- Node 22.x, npm (workspace root `package.json` pins `engines.node: "22.x"`).
- `backend/.env` already exists with real Neon `DATABASE_URL`/`DATABASE_URL_ADMIN` + JWT secrets (copy `backend/.env.example` and fill in if missing/rotated — ask for the Neon connection string, don't invent one).
- `web/.env.local` already exists (copy `web/.env.example` if missing) — only needs `BACKEND_ORIGIN=http://localhost:4000`.
- From repo root, once: `npm install` (hoists the workspace, links `@techbuilder/contracts` into `backend`/`web`).

## 1. Build the frozen contracts (`shared/`)
Both `backend` and `web` consume `@techbuilder/contracts` as a **built** package — rebuild it first whenever `shared/src` changes.
```bash
cd ~/Documents/p_project/techBuilder
(cd shared && npm run build)
```

## 2. Build + start the backend — this is what links to the DB
```bash
(cd backend && npm run build && npm start)
```
`npm start` runs `node --env-file=.env dist/main.js`, so it reads `backend/.env` directly — **this is the DB link step**, there's no separate "connect to DB" command. Look for:
```
[Nest] ... [Bootstrap] techBuilder API on :4000/api/v1
```
Leave this running in its own terminal (or background job).

### Verify the DB link (don't just trust the boot log)
```bash
# 1. liveness
curl -s http://localhost:4000/api/v1/health
# → {"data":{"status":"ok","time":"..."}}

# 2. real proof — a login round-trip hits Neon (users table) and returns a signed JWT
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"orgCode":"devco","username":"owner","password":"changeme123","deviceId":"cli-check"}'
# → {"data":{"user":{...,"name":"Owner Sahab",...},"org":{...,"name":"DevCo Builders",...},"accessToken":"...","refreshToken":"..."}}
```
If step 2 returns a `user`/`org`/`accessToken` payload, the backend is genuinely reading from Neon (not just up). If it fails, check `backend/.env`'s `DATABASE_URL` (Neon may pause idle free-tier projects — the first query wakes it, can take a few seconds) and that `npm run seed` was run at least once against this DB.

## 3. Start the web frontend
```bash
(cd web && npm run dev)
```
```
▲ Next.js 16.2.10 (Turbopack)
- Local: http://localhost:3000
✓ Ready
```
Open `http://localhost:3000` → redirects to `/login` (via `src/proxy.ts`).

### Verify the full round-trip (web → backend → Neon)
```bash
curl -s -i -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"owner","password":"changeme123"}'
```
Expect `HTTP/1.1 200 OK` + three `set-cookie` headers (`tb_access`, `tb_refresh`, `tb_device`, all `HttpOnly`) + a JSON body with `user`/`org` (no tokens — those only live in the cookies). This confirms the web Route Handler reached the backend, which reached Neon.

## 4. Log in via the browser
The login page shows **dev-only quick-fill buttons** (`web/src/app/login/page.tsx`, seeded from `backend/merchants/dev/`) — password is always `changeme123`:

| Username | Role |
|---|---|
| `owner` | Owner |
| `sm1` | Site Manager |
| `th1` / `th2` | Team Head (Greenfield / Sunrise site) |
| `driver1` / `driver3` | Driver |
| `worker1` | Worker |

No org code needed on the web login form — the backend resolves it from the username.

## 5. Full command recap (copy-paste, 2 terminals)
```bash
# one-time per session, terminal 1
cd ~/Documents/p_project/techBuilder
(cd shared && npm run build) && (cd backend && npm run build && npm start)

# terminal 2
cd ~/Documents/p_project/techBuilder
(cd web && npm run dev)
```
Then open `http://localhost:3000`.

## Ports
| Service | Port | URL |
|---|---|---|
| Backend (NestJS) | 4000 | `http://localhost:4000/api/v1` |
| Web (Next.js) | 3000 | `http://localhost:3000` |
| DB | — | Neon (remote, via `DATABASE_URL` in `backend/.env`) |

## Troubleshooting
- **Backend won't start / crashes on boot** → check `backend/.env` exists and `DATABASE_URL` isn't the placeholder from `.env.example`. Rebuild `shared` first if you see a module-resolution error for `@techbuilder/contracts`.
- **Login returns `VALIDATION_FAILED` on the raw backend curl** → the `/api/v1/auth/login` endpoint requires `deviceId` in the body (the web Route Handler adds this automatically; the raw backend API does not).
- **Neon feels slow on the first request** → free-tier Neon projects auto-suspend when idle; the first query after idle wakes it (a few seconds), subsequent ones are fast.
- **Web shows a network/fetch error on login** → confirm the backend is actually up on `:4000` (`curl .../health`) and `web/.env.local`'s `BACKEND_ORIGIN` matches.
- **Port already in use** → something from a previous session is still running; find it with `lsof -i :4000` / `lsof -i :3000` and stop it, or reuse it instead of starting a duplicate.
- **Stop everything** → `Ctrl+C` in each terminal (or kill the background job IDs if started via a tool).

## Related docs
- `techBuilder-Web-Pivot-Plan.md` — why/how the frontend moved from Expo to Next.js.
- `PROJECT_AI_CONTEXT.md` §0 — current build status.
- `TESTING-AND-SETUP.md` — the **old, frozen** Android/Expo phone-testing flow (kept for reference only).
