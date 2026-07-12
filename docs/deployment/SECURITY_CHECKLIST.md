# Security Checklist

Grounded in this repo's actual code — each item notes whether it's **already true** (verified during
the audit), or **action needed** (with the exact file/step).

## Account & access

- [ ] Root AWS account has MFA enabled (`AWS_SETUP_GUIDE.md` Part A3).
- [ ] Separate administrative IAM identity used day-to-day, not root (Part A3).
- [ ] No root or IAM-user long-lived access keys used by any running service — EC2 uses an **instance IAM role** (Part C1), never embedded keys.
- [ ] Least-privilege IAM: the EC2 role's inline S3 policy (if added, for backups) scopes to the specific bucket ARN, not `AmazonS3FullAccess` or `*`.

## Network

- [x] **RDS is never publicly accessible** — `AWS_SETUP_GUIDE.md` Part D, step 10, "Public access: No", verified reachable-from-EC2-only in Part E.
- [x] **RDS security group has no `0.0.0.0/0` rule** — only `techbuilder-ec2-sg` by SG-ID (Part D1).
- [ ] Node app ports (3000, 4000) are **not** in any security group's inbound rules — only Caddy's 80/443 are public (`AWS_SETUP_GUIDE.md` Part C3 explicitly omits them).
- [ ] SSH restricted to your IP only, or omitted entirely in favor of SSM Session Manager (Part C2).

## Secrets

- [x] `.env` files are gitignored and confirmed **never committed** (`git ls-files backend/.env web/.env web/.env.local` returned empty during the audit).
- [x] **Fixed in this pass:** `backend/.env` had live Cloudflare R2 credentials sitting in plaintext comments (unused — `R2_*` vars themselves were empty). Removed; replaced with clean empty var declarations. **Recommend rotating those R2 credentials** at Cloudflare regardless, since they were visible in a file (defense-in-depth — they were never actually wired into a running config, but treat any credential that's been visually exposed as tainted).
- [x] JWT secrets are Zod-validated at boot (`backend/src/config/env.ts` — `min(16)`, throws loudly if missing/short) — **fails closed**, not a silent default.
- [ ] Production JWT secrets are freshly generated (not reused from local dev's `backend/.env`) — generate with `openssl rand -hex 32` and store only in the server's chmod-600 `.env` (`PRODUCTION_DEPLOYMENT.md`).
- [ ] Production DB passwords (`techbuilder_app`, `postgres` master) are freshly generated, distinct from any dev/Neon password.

## Database

- [x] **RLS enforced with `FORCE ROW LEVEL SECURITY`** on all 29 tenant tables + `orgs` (`shared/src/db/rls.sql`) — verified this applies even to the table owner, not just non-owner roles.
- [x] Runtime role (`techbuilder_app`) is `NOSUPERUSER NOBYPASSRLS` per the frozen SQL's own comment, with grants limited to `SELECT, INSERT, UPDATE, DELETE` — no DDL, no role creation.
- [x] **Fixed in this pass:** `backend/drizzle.config.ts` now defaults migrations to `DATABASE_URL_ADMIN` (falls back to `DATABASE_URL`) instead of silently trying the restricted role — matches the actual privilege model instead of relying on an undocumented manual env-swap.
- [ ] Confirm in production: `REVOKE CREATE ON SCHEMA public FROM PUBLIC` applied (`DATABASE_MIGRATION.md` Step 4) — extra defense-in-depth beyond the role's own grants.
- [x] `SET LOCAL app.org_id` is transaction-scoped (verified: `DbService.runInTenant` wraps every tenant query in `db.transaction(...)`, and `set_config(..., true)` is the `SET LOCAL` form) — safe under connection pooling, confirmed by reading the actual implementation, not assumed.

## CORS

- [x] **Fixed in this pass:** `backend/src/main.ts` no longer does `origin: true` (reflects any Origin) — now reads an explicit `CORS_ORIGINS` allowlist env var, defaulting to block-all in production if unset (fail closed) and `localhost:3000` in development.
- [ ] Set `CORS_ORIGINS=https://app.example.com` in the EC2 backend's production `.env` (`backend/.env.production.example`, added in this pass).
- Note: this is defense-in-depth, not the primary security boundary — the browser never calls the backend directly in this architecture (see `VERCEL_TESTING_GUIDE.md`'s auth section), so `credentials: true` here has no actual cookie to protect; it's kept because the backend's own JWT-bearer callers could theoretically include a future browser-side integration.

## Cookies (web app)

- [x] `httpOnly: true` on all three auth cookies (`tb_access`/`tb_refresh`/`tb_device`) — confirmed in `web/src/lib/server/cookies.ts`, never exposed to client JS.
- [x] `secure: process.env.NODE_ENV === 'production'` — confirmed already conditional; **verify `NODE_ENV=production` is actually set** in the Vercel project (Vercel sets this automatically for production deployments — confirm, don't assume) and in the EC2 systemd unit (Phase 2).
- [x] `sameSite: 'lax'` — appropriate here (no legitimate cross-site form posts to this app).
- [ ] Cookie `domain` is left unset (defaults to the exact host) — correct for a single-domain app; only set an explicit `domain` if `app.example.com` and `api.example.com` ever need to share a cookie (they don't, in this architecture — see CORS note above).

## CSRF

- Not separately implemented, and **not needed given the architecture**: all state-changing requests go through the Next.js server's own Route Handlers/Server Components (same-origin, `sameSite: 'lax'` cookies), and the actual backend calls use a Bearer token the browser never possesses — there is no cross-site request that could carry the user's session to the backend. Revisit only if a future feature adds a form that posts directly cross-origin.

## Rate limiting / request limits

- [ ] **Not currently implemented** in `backend/src/main.ts` — no `@nestjs/throttler` or equivalent found. Low priority at 10–50 users, but add before broader merchant onboarding — a simple `ThrottlerModule` on the login endpoint specifically (brute-force protection) is the highest-value first step.
- [ ] Body size limits: NestJS/Express defaults (100kb JSON) apply; confirm this is sufficient for the largest expected payload (Excel export requests are read-only/GET-triggered, not large POST bodies) — no change needed unless a future feature posts large payloads.
- [ ] Caddy upload-size limit (`PRODUCTION_DEPLOYMENT.md`'s Caddyfile) should match or exceed whatever the app needs — set generously for future media uploads once R2/S3 is wired.

## Headers

- [ ] No `helmet`-equivalent currently in `backend/src/main.ts` — add basic security headers (`X-Content-Type-Options`, `X-Frame-Options`, etc.) via `@nestjs/helmet` before commercial onboarding. Low urgency: this API is never rendered in a browser context directly (JSON-only, called server-to-server), so header-based browser attacks (clickjacking, MIME-sniffing) have a much smaller surface than a typical public web app — still worth adding as defense-in-depth.
- Caddy adds sane defaults automatically (HSTS via automatic HTTPS) — see `deploy/Caddyfile`.

## Uploads

- File upload (`media.service.ts`) is **not functionally wired to storage yet** (confirmed during audit — presign endpoint constructs a URL/DB row but never calls a real S3/R2 signing API). No upload-validation review is meaningful until this is actually built; flag this doc for a follow-up review once media storage is implemented (content-type allowlist, file-size limits, and virus/malware scanning are the standard follow-ups at that point).

## SQL injection

- [x] All queries go through Drizzle's query builder (parameterized) — confirmed no raw string-concatenated SQL anywhere in the modules reviewed; the one place raw `sql` template literals appear (`set_config('app.org_id', ${orgId}, true)` in `db.service.ts`) uses Drizzle's tagged-template `sql` helper, which parameterizes the interpolated value — not string concatenation.

## Dependency review

- [ ] Run `npm audit` (root, `backend/`, `web/`) before the first production deploy and periodically after — not run as part of this pass (no code changes to dependency versions were made).

## Logging

- [ ] Confirm no secrets are ever logged — a quick grep for `console.log`/`Logger.log` calls that might include `password`/`token`/`secret` variables is worth doing once before the pilot; not exhaustively audited in this pass (the codebase is large — 16 backend modules). The `exports.service.ts` error-notify path (`String(err)`) is the one path this audit specifically checked — it stores an error string in a notification row, not credentials, since the error originates from nodemailer/SMTP failures, not from anything holding a secret in scope at that point.

## Backups

- [ ] RDS automated backups enabled with 7-day retention (`AWS_SETUP_GUIDE.md` Part D, step 12).
- [ ] Logical S3 backups encrypted at rest (`BACKUP_AND_RESTORE.md`) — S3 default SSE-S3 or SSE-KMS, either is fine at this scale.
- [ ] S3 bucket has Block Public Access fully enabled (`BACKUP_AND_RESTORE.md`).
