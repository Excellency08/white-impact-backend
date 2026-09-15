/* Direct Supabase Story writes derive attribution from auth.uid(). */

CREATE OR REPLACE FUNCTION public.set_story_updated_by()
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

REVOKE ALL ON FUNCTION public.set_story_updated_by() FROM PUBLIC;

DROP TRIGGER IF EXISTS stories_set_updated_by ON public.stories;
CREATE TRIGGER stories_set_updated_by
BEFORE INSERT OR UPDATE ON public.stories
FOR EACH ROW
EXECUTE FUNCTION public.set_story_updated_by();
