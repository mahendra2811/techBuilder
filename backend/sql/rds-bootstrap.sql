-- techBuilder — RDS role/grant bootstrap. Idempotent (safe to re-run).
-- Run this ONCE per new database, connected as the RDS master user, AFTER drizzle migrations
-- have created the tables (grants need existing tables to target) and BEFORE applying
-- shared/src/db/rls.sql + backend/sql/auth.sql. See docs/deployment/DATABASE_MIGRATION.md for the
-- full ordered sequence this fits into.
--
-- No extensions are required — this schema uses client-generated UUIDv7 IDs, never
-- gen_random_uuid()/uuid-ossp/pgcrypto (see CLAUDE.md §6 "Identity & data").
--
-- Placeholders to replace before running: <APP_ROLE_NAME> (default techbuilder_app),
-- <APP_PASSWORD>, <DB_NAME> (default techbuilder).

-- 1) The restricted runtime role. NEVER superuser, NEVER BYPASSRLS — RLS is silently ignored for
--    either of those. NOCREATEDB/NOCREATEROLE: this role only ever reads/writes rows, never
--    provisions new databases or roles.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '<APP_ROLE_NAME>') THEN
    CREATE ROLE "<APP_ROLE_NAME>" LOGIN PASSWORD '<APP_PASSWORD>'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- 2) Table-level grants — SELECT/INSERT/UPDATE/DELETE only, no DDL. Run again any time a new
--    migration adds a table; ALTER DEFAULT PRIVILEGES only covers tables created AFTER this line
--    runs, by the role that ran it (the master/admin role) — re-run this whole block after any
--    migration that adds tables, to be safe, rather than assuming DEFAULT PRIVILEGES caught it.
GRANT USAGE ON SCHEMA public TO "<APP_ROLE_NAME>";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "<APP_ROLE_NAME>";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "<APP_ROLE_NAME>";

-- 3) auth_lookup() execute grant — the one line backend/sql/auth.sql deliberately leaves
--    commented (it depends on the app role's exact name, which varies per deployment). Apply the
--    frozen auth.sql FIRST (creates the function), then run this line:
-- GRANT EXECUTE ON FUNCTION auth_lookup(text) TO "<APP_ROLE_NAME>";
--    (kept commented here too, on purpose — uncomment only after confirming auth.sql has been
--    applied, so this statement doesn't fail on a function that doesn't exist yet)

-- 4) Defense-in-depth: nobody but the master/admin role should be able to create objects in the
--    public schema (this restricted role already can't, via omission above — this closes the gap
--    for any OTHER non-superuser role that might exist, including Postgres's implicit PUBLIC grant
--    that some Postgres versions still apply to the public schema by default).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 4b) Audit log is APPEND-ONLY. The blanket grant in step 2 handed the app role
--     UPDATE + DELETE on every table, which would let the runtime role rewrite or erase its own
--     org's audit trail (the trail is supposed to be tamper-evident). Nothing in the backend ever
--     updates or deletes audit_logs — it only INSERTs — so take those rights back. Re-run this
--     after step 2 any time step 2 is re-run (step 2's blanket GRANT re-adds them).
REVOKE UPDATE, DELETE ON audit_logs FROM "<APP_ROLE_NAME>";

-- 5) Verification queries — run these as <APP_ROLE_NAME> (a separate psql connection) to prove
--    the grants are exactly as intended, not broader:
--
--   -- should FAIL with a permission error:
--   CREATE TABLE should_fail (id int);
--
--   -- should FAIL (no CREATEDB):
--   CREATE DATABASE should_also_fail;
--
--   -- should succeed (this is what the grants are FOR):
--   SELECT count(*) FROM users;   -- returns 0 with no app.org_id set (RLS default-deny), not an error
