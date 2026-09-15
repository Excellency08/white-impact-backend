/*
 * Preserve trusted application-user attribution for direct Programs writes.
 * The browser never supplies updated_by; the mapped Supabase identity does.
 * Server-side legacy/import writes without auth.uid() retain their explicit
 * value and remain compatible with the existing Express path.
 */

CREATE OR REPLACE FUNCTION public.set_program_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := public.get_current_application_user_id();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_program_updated_by() FROM PUBLIC;

DROP TRIGGER IF EXISTS programs_set_updated_by ON public.programs;
CREATE TRIGGER programs_set_updated_by
BEFORE INSERT OR UPDATE ON public.programs
FOR EACH ROW
EXECUTE FUNCTION public.set_program_updated_by();
