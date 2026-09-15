/*
 * Remove any pre-existing managed-role grants from the Phase 1 mapping RPC.
 * The RPC is intentionally callable only by authenticated browser sessions.
 */

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.link_current_auth_user() FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.link_current_auth_user() FROM service_role;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.link_current_auth_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_current_auth_user() TO authenticated;
