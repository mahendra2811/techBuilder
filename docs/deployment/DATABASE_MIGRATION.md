# Database Migration — Neon (`us-east-1`) → RDS PostgreSQL (`ap-south-1`)

> Assumes `AWS_SETUP_GUIDE.md` Part D is done: RDS is "Available", private, endpoint noted, master
> password saved. **Never overwrites the existing local database** (there isn't one — the only
> current DB is Neon, kept running and untouched throughout this doc; this is a copy, not a move,
> until you explicitly cut over).

## Pre-migration checklist

- [ ] RDS instance is `Available`, `Public access: No` confirmed (Part E of the setup guide).
- [ ] You have the RDS master password and endpoint.
- [ ] You have `backend/.env`'s current Neon `DATABASE_URL_ADMIN` (the `neondb_owner` role — needed for a consistent dump).
- [ ] `docker --version` works locally or on the EC2 box (dumps run via the official `postgres` image to avoid client/server version mismatches — same approach this repo already uses for its Neon↔R2 backup scripts).
- [ ] You've picked the RDS engine version in the console and know it (e.g. `17.x`) — compare against Neon's `18.4` (confirmed in `docs/PENDING-AND-DEFERRED.md`). If RDS's newest offering is older than 18, that's a **downgrade**, not an upgrade — `pg_dump`/`pg_restore` handle major-version downgrades fine for standard SQL/DDL, but **run the validation checklist below before trusting it**, since nothing was proven against an older major version yet.

## Step 1 — Schema-only backup (sanity check first, cheap and fast)

```bash
NEON_ADMIN_URL="<paste backend/.env's current DATABASE_URL_ADMIN>"
PG_MAJOR=18   # matches Neon's actual version — see docs/PENDING-AND-DEFERRED.md

docker run --rm "postgres:${PG_MAJOR}" pg_dump "$NEON_ADMIN_URL" --schema-only --no-owner --no-privileges > techbuilder-schema-only.sql
wc -l techbuilder-schema-only.sql   # sanity: should be nonzero, roughly matches the 4 drizzle migration files' combined size
```

Read through it once — confirm it's the `techbuilder` schema you expect (29 tenant tables + `orgs`), not empty/truncated.

## Step 2 — Full data + schema dump (custom format — directly restorable with `pg_restore`)

```bash
TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
docker run --rm -v "$(pwd)":/workdir -w /workdir "postgres:${PG_MAJOR}" \
  pg_dump "$NEON_ADMIN_URL" --format=custom --no-owner --no-privileges --file="techbuilder-migration-${TIMESTAMP}.dump"
```

`--no-owner --no-privileges`: RDS's `postgres` master role has a different internal role ID than Neon's `neondb_owner` — restoring without owner/privilege statements avoids `role "neondb_owner" does not exist` errors on the target. You'll (re-)apply the correct grants explicitly in Step 4, which is more precise than trying to preserve Neon-specific role names anyway.

**Large objects:** this schema has no `bytea`/large-object columns (media is stored by reference —
`r2Key` string — not as DB blobs), so there's nothing large-object-specific to handle here. If that
ever changes, add `--blobs` to the `pg_dump` invocation.

**Sequence values:** this schema uses **client-generated UUIDv7 IDs** (see `CLAUDE.md` §6 — no
`serial`/auto-increment columns), so there are no sequence-currval issues to worry about on restore —
another advantage of the ID convention already in place.

## Step 3 — Restore into RDS

```bash
RDS_ADMIN_URL="postgresql://postgres:<MASTER_PASSWORD>@<RDS_ENDPOINT>:5432/techbuilder"

docker run --rm -v "$(pwd)":/workdir -w /workdir "postgres:${PG_MAJOR}" \
  pg_restore --dbname="$RDS_ADMIN_URL" --no-owner --no-privileges "techbuilder-migration-${TIMESTAMP}.dump"
```

If `PG_MAJOR` (Neon's dump version) is newer than what the `postgres:<tag>` image / RDS engine
supports, use the RDS engine's own major version for the **restore** image tag (e.g.
`postgres:17` if RDS offers 17.x) — `pg_restore` from a newer client against an older server dump
format usually works for standard DDL/data; if it errors on a specific feature, fall back to
**Step 1's schema-only SQL file** applied via `psql` instead, then load data with `\copy` per table,
which is more forgiving across major versions than a binary-format custom dump.

## Step 4 — Roles, grants, RLS (mirrors what's already running on Neon — see `shared/src/db/rls.sql`)

Connect as master:

```bash
psql "$RDS_ADMIN_URL"
```

```sql
-- 1) The restricted runtime role — the app NEVER connects as `postgres` (master).
CREATE ROLE techbuilder_app LOGIN PASSWORD '<pick a new APP_PASSWORD, different from master>' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- 2) Grants (tables already exist from the restore — this is the part shared/src/db/rls.sql
--    leaves as a comment, deliberately run by hand once per database):
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO techbuilder_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO techbuilder_app;
GRANT USAGE ON SCHEMA public TO techbuilder_app;

-- 3) Revoke PUBLIC's default CREATE on the public schema (defense-in-depth — nobody but the
--    master/migration role should be able to create objects):
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
```

Then apply the frozen RLS + auth SQL (idempotent — safe to re-run):

```bash
cd backend
DATABASE_URL_ADMIN="$RDS_ADMIN_URL" npm run db:rls
```

Then grant the `auth_lookup()` execute permission (the one line `backend/sql/auth.sql` deliberately
leaves commented, since it depends on the app role's exact name — same step the earlier dev-only
plan documented, still correct):

```sql
GRANT EXECUTE ON FUNCTION auth_lookup(text) TO techbuilder_app;
```

## Step 5 — Point the app at RDS

Edit `backend/.env` (never commit it):

```bash
DATABASE_URL=postgresql://techbuilder_app:<APP_PASSWORD>@<RDS_ENDPOINT>:5432/techbuilder?sslmode=require
DATABASE_URL_ADMIN=postgresql://postgres:<MASTER_PASSWORD>@<RDS_ENDPOINT>:5432/techbuilder?sslmode=require
```

Keep the old Neon values commented out below, not deleted, until Step 6's validation passes —
instant rollback is just uncommenting them back in (see `ROLLBACK.md`).

## Step 6 — Validation (do not skip any of these)

Run from `backend/`:

```bash
npm run build && npm start
# separately:
curl -s http://localhost:4000/api/v1/health          # liveness
curl -s http://localhost:4000/api/v1/health/ready     # NEW readiness check added in this pass — proves DB reachable
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"orgCode":"devco","username":"owner","password":"changeme123","deviceId":"cli-check"}'
```

1. **Migration role works** — `npm run db:migrate` against `DATABASE_URL_ADMIN` succeeds with no pending migrations (proves the restore already applied everything the 4 migration files describe).
2. **Runtime role cannot run privileged DDL:**
   ```sql
   -- connect as techbuilder_app, confirm this FAILS with a permission error:
   psql "postgresql://techbuilder_app:<APP_PASSWORD>@<RDS_ENDPOINT>:5432/techbuilder" -c "CREATE TABLE should_fail (id int);"
   ```
3. **Runtime role cannot bypass RLS:**
   ```sql
   -- as techbuilder_app, with NO app.org_id set:
   psql "postgresql://techbuilder_app:...@<endpoint>/techbuilder" -c "SELECT count(*) FROM users;"
   -- expect 0 rows (default-deny — app_current_org() returns NULL, no policy matches)
   ```
4. **One tenant cannot read another's records + 5) `SET LOCAL` disappears after commit/rollback + 6) pooling doesn't leak tenant state + 7) queries without tenant context return no data** — all already proven by this repo's existing test suite, re-run it against RDS to reprove on the new DB:
   ```bash
   npm run test:integration
   ```
   This runs all 19 integration tests including the RLS cross-tenant regression test — re-running it here is exactly the "prove it again on the new DB" step, not a new test to write.
5. **The app does not use the RDS master account** — confirmed by inspection: `backend/.env`'s `DATABASE_URL` (used by `DbService` at runtime, see `backend/src/db/db.service.ts`) is `techbuilder_app`, never `postgres`. `DATABASE_URL_ADMIN` is only read by `drizzle.config.ts` (migrations) and `backend/scripts/apply-sql.ts` (one-off SQL application) — never by the running server process.
6. **Full application smoke test** — log in via the web app as each of the 5 seeded roles (`owner`/`sm1`/`th1`/`driver1`/`worker1`, password `changeme123`), confirm dashboards load and match what you saw against Neon.
7. **Latency actually improved** — compare against the baseline numbers in `docs/perf/techBuilder-Performance-Report.md` (dashboard was 6.2s warm on Neon `us-east-1`). Expect a large drop now that the DB round-trip is India-internal instead of crossing to the US.

## Rollback if restore fails

See `ROLLBACK.md` §3 "Database snapshot/restore rollback" — in short: **the Neon DB is never touched
by this process**, so rollback is just reverting `backend/.env`'s `DATABASE_URL`/`DATABASE_URL_ADMIN`
back to the commented-out Neon values from Step 5 and restarting the backend. Nothing destructive
happens to Neon at any point in this migration.

## Post-migration

- Update `CLAUDE.md` §4 build status + `docs/PROJECT_AI_CONTEXT.md` §0 with: RDS Mumbai live, measured before/after latency, and that `backend/.env` now points at RDS by default.
- Update the `techbuilder-web-perf-diagnosis` auto-memory once you've actually measured the fix (it currently says "fix tiers agreed, not yet implemented").
- Leave Neon running (not deleted) for at least one full backup/restore cycle on RDS (`BACKUP_AND_RESTORE.md`) before considering it safe to delete/downgrade the Neon project — see `COST_AND_SHUTDOWN_CHECKLIST.md`.
