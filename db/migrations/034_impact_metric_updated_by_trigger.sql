/* Preserve mapped application-user attribution for direct Impact metric writes. */

CREATE OR REPLACE FUNCTION public.set_impact_metric_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := public.get_current_application_user_id();
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_impact_metric_updated_by() FROM PUBLIC;

DROP TRIGGER IF EXISTS impact_metrics_set_updated_by ON public.impact_metrics;
CREATE TRIGGER impact_metrics_set_updated_by
BEFORE INSERT OR UPDATE ON public.impact_metrics
FOR EACH ROW
EXECUTE FUNCTION public.set_impact_metric_updated_by();
