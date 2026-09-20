/* Keep newsletter lifecycle timestamps database-authoritative for direct admin updates. */

CREATE OR REPLACE FUNCTION public.set_submission_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := NOW();

  IF TG_TABLE_NAME = 'newsletter_subs' THEN
    IF NEW.status = 'confirmed' AND OLD.confirmed_at IS NULL THEN
      NEW.confirmed_at := NOW();
    END IF;
    IF NEW.status = 'unsubscribed' AND OLD.unsubscribed_at IS NULL THEN
      NEW.unsubscribed_at := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_submission_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_submission_updated_at() TO authenticated;
