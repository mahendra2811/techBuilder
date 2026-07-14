-- techBuilder RLS migration — FROZEN. Apply AFTER drizzle migrations.
-- Shared-schema multi-tenancy. The NestJS backend sets `app.org_id` per transaction via SET LOCAL.
-- (We do NOT use Neon's auth.user_id()/Data-API pattern — the server owns the tenant context.)

-- 1) The application DB role MUST be non-superuser and MUST NOT have BYPASSRLS,
--    or RLS is silently ignored. Create/own via a privileged migration role; the app connects as this:
--    CREATE ROLE techbuilder_app LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;
--    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO techbuilder_app;
--    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO techbuilder_app;

-- 2) Helper: read the per-transaction tenant GUC. The backend runs `SET LOCAL app.org_id = '<uuid>'`
--    inside every request transaction (pooled connections reuse → MUST be per-transaction, never per-session).
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
-- nullif handles BOTH unset (NULL) and reverted-empty ('') GUC → NULL → policies deny (default-deny, no cast error).

-- 3) Enable + FORCE RLS and a tenant-isolation policy on every tenant table.
--    FORCE makes the policy apply even to the table owner (defense against owner-context leaks).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'people','users','sites','site_holidays','crews','crew_members','refresh_tokens',
    'vehicle_types','vehicles','driver_allowed_types','attendance','leaves','wage_rates',
    'advances','progress_notes','vendors','expenses','cash_transfers','vendor_payments','fuel_logs','vehicle_logs','trips',
    'materials','material_balances','material_txns','issues','media','approval_requests',
    'notifications','audit_logs','completeness',
    -- Round 2 (frozen.8):
    'fuel_stock_purchases','fuel_issuances','complaints','vehicle_documents','vehicle_reminders'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t); -- idempotent re-apply
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (org_id = app_current_org())
        WITH CHECK (org_id = app_current_org());
    $f$, t);
  END LOOP;
END $$;

-- 4) orgs: a user may only see their own org row.
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orgs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_self ON orgs;
CREATE POLICY org_self ON orgs USING (id = app_current_org()) WITH CHECK (id = app_current_org());

-- 5) Reminder for any VIEWS added later: create with WITH (security_invoker = true) so RLS applies (PG15+).
