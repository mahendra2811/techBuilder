# 30–40 Day Operating Plan

References the other `docs/deployment/*.md` files at each step — this is the sequencing, not a
duplicate of their content.

## Day 0–3 — Repository audit + infra creation + backend deployment

- [x] **Repository audit** — done (this pass). See `ARCHITECTURE.md` for the findings that shaped every choice below.
- [ ] AWS billing safeguards (`AWS_SETUP_GUIDE.md` Part A) — budgets, IAM user + MFA, tags.
- [ ] VPC/SG/EC2/RDS creation (`AWS_SETUP_GUIDE.md` Parts B–D).
- [ ] Reachability verification (`AWS_SETUP_GUIDE.md` Part E) — RDS reachable from EC2 only.
- [ ] First connect + OS-level setup on the new instance (`EC2_INITIAL_CONNECT_AND_SETUP.md` — SSM/SSH, updates, swap file, basic hardening).
- [ ] Backend deployed to EC2 (`PRODUCTION_DEPLOYMENT.md`'s one-time setup + first `scripts/deploy-backend.sh --app backend` run) — **pointed at Neon still**, just proving the EC2/Caddy/systemd path works end-to-end before touching the database.

## Day 4–7 — Database migration + Vercel testing deployment + domain/HTTPS + auth/CORS testing

- [ ] Database migration (`DATABASE_MIGRATION.md`, all 6 steps + validation checklist).
- [ ] Flip `backend/.env` on EC2 to the RDS values; re-verify `scripts/verify-production.sh` passes.
- [ ] Vercel project created, `web/vercel.json`'s `bom1` region deploy verified (`VERCEL_TESTING_GUIDE.md`).
- [ ] Domain + HTTPS: `api.example.com` → EC2 via Caddy (auto-HTTPS); Vercel's own domain/HTTPS for the frontend at this stage.
- [ ] Auth/CORS round-trip tested end-to-end: Vercel-hosted web → EC2-hosted API → RDS, full login flow for all 5 seeded roles.

## Week 2 — RLS/role testing, mobile/slow-network testing, backup/restore drill, error monitoring

- [ ] Re-run `npm run test:integration` against the RDS instance specifically (not just at migration time — confirm it stays green as real usage accumulates).
- [ ] Manual RLS spot-check: two different `orgId`s, confirm zero cross-tenant leakage via the actual web UI, not just the test suite.
- [ ] Mobile browser testing (Android — this app's actual user base): confirm httpOnly cookies, `proxy.ts` refresh flow, and slow-3G-like network behavior all work — throttle via Chrome DevTools mobile emulation at minimum.
- [ ] **Backup/restore drill** (`BACKUP_AND_RESTORE.md`) — the "one real restore test before merchant onboarding" the brief calls for. Do it now, not in week 3, so there's time to fix anything broken.
- [ ] Error monitoring: `WP-11 Sentry` is explicitly deferred per this repo's own `CLAUDE.md`/`docs/PENDING-AND-DEFERRED.md` — **do not raise it** unless the user brings it up; `journalctl` + the readiness endpoint (`GET /api/v1/health/ready`, added in this pass) are the interim signal.

## Week 3 — Merchant-like staging data, E2E testing, performance validation, runbook review

- [ ] Seed a realistic-scale dataset (use `backend/scripts/seed-merchant.ts` against a **non-production** org code, or a second throwaway RDS instance if you want full isolation from the eventual real merchant's org).
- [ ] End-to-end testing across all 5 roles' full nav surface (per `CLAUDE.md`'s "29/29 routes" note — re-verify against the RDS-backed deployment specifically, since that check was originally done against Neon).
- [ ] Performance validation — measure from India (see "Performance measurement" below), compare against the `docs/perf/techBuilder-Performance-Report.md` Neon baseline.
- [ ] Review `PRODUCTION_DEPLOYMENT.md` + `ROLLBACK.md` end-to-end once as a "could I actually execute this at 2am" gut check.

## Before merchant onboarding

- [ ] **Decide: move frontend to EC2 now, or stay on Vercel a bit longer?** Staying on Vercel Hobby past this point is **not acceptable for a paying merchant** (non-commercial terms) — either move to EC2 (`PRODUCTION_DEPLOYMENT.md` Phase 2) or upgrade to a paid Vercel plan. Document whichever you pick.
- [ ] Final production backup (`COST_AND_SHUTDOWN_CHECKLIST.md`'s Path-2 step 1, run **without** proceeding to the rest of that checklist — just the backup step, as a pre-onboarding safety snapshot).
- [ ] Final RLS isolation test (repeat the Week-2 spot-check once more against whatever's about to become the real production DB).
- [ ] Restore test completed (confirm the Week-2 drill is still recent/valid; re-run if more than ~2 weeks old).
- [ ] Billing alerts confirmed still active (`AWS_SETUP_GUIDE.md` Part A4).
- [ ] Rollback procedure confirmed (`ROLLBACK.md`) — at minimum, know which section applies to which failure before you need it under pressure.
- [ ] Production domain verified — `curl -sI https://app.example.com` and `https://api.example.com` both return valid certs, correct `x-vercel-id`/response headers as appropriate.

## After 30–40 days — two paths

See `COST_AND_SHUTDOWN_CHECKLIST.md`'s two-path section:
1. **Continue running production** — first merchant is live, keep operating per `PRODUCTION_DEPLOYMENT.md`.
2. **Shut down safely** — if the pilot doesn't convert, follow the shutdown checklist exactly, in order, before it's forgotten and starts silently billing.

---

## Performance measurement (India) — what to actually capture at Week 3

- **DNS time, TLS time:** `curl -w` timing breakdown:
  ```bash
  curl -o /dev/null -s -w 'dns:%{time_namelookup} connect:%{time_connect} tls:%{time_appconnect} ttfb:%{time_starttransfer} total:%{time_total}\n' https://api.example.com/api/v1/health
  ```
- **Frontend response time:** same `curl -w` pattern against the Vercel/EC2 frontend URL, plus a real-browser Lighthouse run from an India-located machine/VPN.
- **API response time / DB-heavy endpoint:** time the dashboard endpoint specifically (the one measured at 6.2s warm on Neon in the perf report) — same curl-timing approach, or the browser Network tab.
- **SSR response time:** time-to-first-byte on a Server-Component page load (not a Route Handler JSON call) — the Network tab's "Waiting (TTFB)" for the document request.
- **Cold vs warm:** first request after a period of idleness (Lambda-style cold start doesn't apply here — this is a systemd/EC2 process, always warm — but Vercel's own function cold-starts still apply on the frontend side) vs a repeated request.
- **p50/p95:** if you want this rigorously, a simple loop of 20–50 requests with the `curl -w` line above, piped through `sort`/`awk` for percentiles — not worth standing up a full load-testing tool at this user scale.
- **Confirm same-region communication:** `psql`'s own connection time from the EC2 box to RDS should be single-digit milliseconds (`\timing` in `psql`, run `select 1;`) — this is the number that directly replaces the ~250–300ms Neon cross-region round-trip the perf report measured.
