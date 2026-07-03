# techBuilder

Hindi-first web portal for running an Indian construction SMB's daily field operations (records + visibility logbook). Monorepo: `shared` (frozen contracts) → `backend` (NestJS + Neon Postgres) → `web` (Next.js portal). See `CLAUDE.md` for full project context; see `docs/techBuilder-Web-Local-Dev-Startup.md` for the detailed version of this guide (troubleshooting, verification curls, etc).

## Start the full project locally (2 terminals)

One-time, if you haven't already: `npm install` from repo root, and confirm `backend/.env` + `web/.env.local` exist (copy from their `.env.example` if not — `backend/.env` needs the real Neon `DATABASE_URL`).

**Terminal 1 — build contracts, then build + start the backend (this is what links to Neon):**
```bash
cd ~/Documents/p_project/techBuilder
(cd shared && npm run build) && (cd backend && npm run build && npm start)
```
Wait for `techBuilder API on :4000/api/v1`. Leave it running.

**Terminal 2 — start the web frontend:**
```bash
cd ~/Documents/p_project/techBuilder
(cd web && npm run dev)
```
Wait for `Ready` on `http://localhost:3000`.

**Open** [http://localhost:3000](http://localhost:3000) → log in with any seeded dev account (password always `changeme123`, or use the quick-fill buttons on the login page):

| Username | Role |
|---|---|
| `owner` | Owner |
| `sm1` | Site Manager |
| `th1` / `th2` | Team Head |
| `driver1` / `driver3` | Driver |
| `worker1` | Worker |

## Quick sanity checks
```bash
curl -s http://localhost:4000/api/v1/health          # backend alive
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"orgCode":"devco","username":"owner","password":"changeme123","deviceId":"cli-check"}'
# a JSON body with user/org/accessToken means the backend is really reading from Neon
```

## Stopping
`Ctrl+C` in each terminal.

## More
- `CLAUDE.md` — project memory, build status, architecture, frozen conventions.
- `docs/techBuilder-Web-Local-Dev-Startup.md` — this guide with full detail + troubleshooting.
- `docs/techBuilder-Web-Pivot-Plan.md` — why the frontend is Next.js, not the frozen `app/` (Expo).
