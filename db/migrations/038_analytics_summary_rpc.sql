/*
 * Phase 23-25 analytics summary bridge.
 *
 * Keep raw analytics_events closed to browser reads. Authenticated admins and
 * content managers can read only the aggregate dashboard summary through this
 * SECURITY DEFINER RPC, using the existing Supabase Auth -> application role
 * mapping helpers.
 */

CREATE OR REPLACE FUNCTION public.get_analytics_summary(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  event_key TEXT,
  count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 90);
BEGIN
  IF NOT public.is_content_manager() THEN
    RAISE EXCEPTION 'Not authorized to read analytics summary.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      analytics_events.event_key,
      COUNT(*)::INTEGER AS count
    FROM public.analytics_events
    WHERE analytics_events.created_at >= NOW() - (safe_days * INTERVAL '1 day')
    GROUP BY analytics_events.event_key
    ORDER BY count DESC, analytics_events.event_key ASC;
END;
$$;

COMMENT ON FUNCTION public.get_analytics_summary(INTEGER) IS
  'Returns aggregate analytics counts for mapped admin/content-manager users without exposing raw analytics rows.';

REVOKE ALL ON FUNCTION public.get_analytics_summary(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_summary(INTEGER) TO authenticated;
