# techBuilder — Pending & Deferred Work

> **Purpose:** things that are known-incomplete or known-broken, deliberately deferred so we can focus on
> **functionality first** (single-dev priority, decided 2026-07-03). Nothing here blocks local development.
> Revisit this list before the real pilot (Tier P1 in `docs/research/reserch-3/techBuilder-Hardening-Punchlist.md`).

---

## 1. WP-8 — Nightly DB backup (paused, unresolved)

**Goal:** nightly `pg_dump` of Neon → Cloudflare R2, 14-day retention, documented restore drill.

**Built:**
- `backend/scripts/backup-db.sh` — dumps via `docker run postgres:18 pg_dump ...` (Docker, not apt, to get an
  exact version match to Neon's server — Neon runs **Postgres 18.4**).
- `backend/scripts/restore-db.sh` — same Docker approach for `pg_restore`; deliberately has no default
  `--target` (always pass an explicit connection string — use a throwaway Neon branch for the drill, never prod).
- `.github/workflows/backup.yml` — nightly cron (`0 20 * * *` UTC) + manual `workflow_dispatch` trigger.
- Cloudflare R2 bucket + API token created; 5 GitHub Actions repo secrets added
  (`DATABASE_URL_ADMIN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`); a
  14-day lifecycle rule added on the `backups/` prefix in the R2 bucket.

**Diagnostic trail (what's been ruled out):**
1. ~~Missing `DATABASE_URL_ADMIN` secret~~ — fixed, secret added.
2. ~~apt/PGDG installed `postgresql-client-16` instead of `-18`, causing a server/client version
   mismatch~~ — fixed by switching to the Docker `postgres:18` image (verified locally:
   `docker run --rm postgres:18 pg_dump --version` → `pg_dump (PostgreSQL) 18.4`, exact match).
3. **Still open as of pause:** a workflow run AFTER the Docker-based fix was pushed (confirmed via
   `git fetch` that `origin/main` has the fix) showed the *same old* "server version mismatch...
   pg_dump version: 16.14" error. This is contradictory — either (a) the run tested was still a stale
   one from before the push (timing confusion, not re-verified), or (b) something is still resolving to
   the old script/behavior. **Not yet root-caused.**
4. **Separate suspected issue, not yet confirmed:** in the GitHub Actions debug log, `R2_SECRET_ACCESS_KEY`
   printed as `'*** '` (trailing space) while the other 4 secrets printed as `'***'` (no space) — suggests
   a possible trailing space/newline in that one secret's value from copy-paste. Worth re-pasting it
   carefully (select just the key, no trailing whitespace) whenever this work resumes.
5. **Local Docker test environment note:** running the dump locally via Docker in the dev sandbox was slow/
   flaky for large catalog-scan queries (worked eventually with a long timeout) — likely a nested-
   virtualization network quirk of that specific sandbox, not expected to affect GitHub Actions' runners
   (plain VMs) or the user's own machine. `psql "$DATABASE_URL" -c "select 1"` and basic TCP/DNS reachability
   to Neon all confirmed fine from inside a container in that environment.

**Next steps when resumed:**
1. Re-paste `R2_SECRET_ACCESS_KEY` cleanly (rule out trailing whitespace).
2. Trigger a fresh `workflow_dispatch` run, confirm it's actually running the current commit (check the
   run's commit SHA in the GitHub UI against `git rev-parse origin/main`).
3. If it still shows the old pg_dump-16.14 error, that means Nixpacks/Actions is somehow not using the
   updated script — inspect the raw job log's checked-out commit SHA and the exact script content GitHub
   Actions used (e.g., add a `cat backend/scripts/backup-db.sh` debug step temporarily).
4. Once a dump lands in R2, perform the restore drill against a throwaway Neon branch (Neon console →
   Branches → New Branch) using `restore-db.sh`, then delete the branch.

---

## 2. WP-9 — EAS preview APK (not started)

Deferred until multi-device / pilot testing is actually needed. Expo Go remains fine for solo local iteration.
When resumed: `eas login` (needs user's Expo account), `eas build -p android --profile preview`, install on a
real low-end Android device, run the airplane-mode outbox acceptance test (attendance/expense/fuel queue
offline → sync on reconnect) that was deferred from WP-6.

## 3. WP-11 — Sentry (not started)

Deferred until pilot. Needs a free sentry.io account + two DSNs (frontend + backend).

## 4. Railway hosted backend — done, but not the active target

`https://techbuilder-production.up.railway.app` is live and was fully E2E-verified (login/JWT/RBAC/dashboard,
from outside the network). It's **not being used for day-to-day development right now** — `app/.env` points
at a local backend instead (laptop + phone on the same WiFi) for faster solo-dev iteration. Railway stays
available and working for whenever multi-device/remote testing is needed again — just flip
`EXPO_PUBLIC_API_URL` back to the Railway URL.

---

*Current focus instead: functionality first — see `CLAUDE.md` §4 "RESUME HERE" for the active local-dev plan
(all 5 roles working against a laptop-hosted backend with synced data).*
