/* Direct volunteer review writes derive reviewer identity from auth.uid(). */

CREATE OR REPLACE FUNCTION public.set_volunteer_review_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.reviewed_by := public.get_current_application_user_id();
    IF NEW.status IN ('approved', 'rejected', 'reviewed') THEN
      NEW.reviewed_at := COALESCE(OLD.reviewed_at, NOW());
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_volunteer_review_attribution() FROM PUBLIC;

DROP TRIGGER IF EXISTS volunteer_applications_set_review_attribution ON public.volunteer_applications;
CREATE TRIGGER volunteer_applications_set_review_attribution
BEFORE UPDATE ON public.volunteer_applications
FOR EACH ROW
EXECUTE FUNCTION public.set_volunteer_review_attribution();

CREATE OR REPLACE FUNCTION public.set_submission_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_submission_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_submission_updated_at() TO authenticated;

DROP TRIGGER IF EXISTS contact_submissions_set_updated_at ON public.contact_submissions;
CREATE TRIGGER contact_submissions_set_updated_at
BEFORE UPDATE ON public.contact_submissions
FOR EACH ROW
EXECUTE FUNCTION public.set_submission_updated_at();

DROP TRIGGER IF EXISTS newsletter_subs_set_updated_at ON public.newsletter_subs;
CREATE TRIGGER newsletter_subs_set_updated_at
BEFORE UPDATE ON public.newsletter_subs
FOR EACH ROW
EXECUTE FUNCTION public.set_submission_updated_at();
