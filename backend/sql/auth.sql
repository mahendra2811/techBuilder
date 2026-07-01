-- Auth lookup — FROZEN. Applied after rls.sql.
-- Login has no tenant context yet (we don't know the org), but RLS blocks reading `users`.
-- This SECURITY DEFINER function does a SCOPED bypass: it returns ONLY the auth fields needed to
-- verify a password, for an active user, matched by username. Owned by a privileged role.
-- Agency-provisioned usernames are unique in practice; if a username matches >1 org it raises.

CREATE OR REPLACE FUNCTION auth_lookup(p_username text)
  RETURNS TABLE(user_id uuid, org_id uuid, password_hash text, role text, must_change_password boolean)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.org_id, u.password_hash, u.role::text, u.must_change_password
  FROM users u
  WHERE u.username = p_username
    AND u.active = true
    AND u.deleted_at IS NULL;
  IF (SELECT count(*) FROM users u WHERE u.username = p_username AND u.active = true AND u.deleted_at IS NULL) > 1 THEN
    RAISE EXCEPTION 'ambiguous username % across orgs', p_username;
  END IF;
END $$;

-- Lock it down: only the app role may execute; nobody can read the table through it beyond these columns.
REVOKE ALL ON FUNCTION auth_lookup(text) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION auth_lookup(text) TO techbuilder_app;  -- run with your app role name
