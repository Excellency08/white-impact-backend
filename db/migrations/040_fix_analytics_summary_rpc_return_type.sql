/*
 * Keep the analytics summary RPC contract stable for PostgREST/Supabase.
 * analytics_events.event_key may be stored as a varchar/text-compatible
 * column, so cast it explicitly to match RETURNS TABLE (event_key TEXT).
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
      analytics_events.event_key::TEXT,
      COUNT(*)::INTEGER AS count
    FROM public.analytics_events
    WHERE analytics_events.created_at >= NOW() - (safe_days * INTERVAL '1 day')
    GROUP BY analytics_events.event_key
    ORDER BY count DESC, analytics_events.event_key ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_summary(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_analytics_summary(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_analytics_summary(INTEGER) TO authenticated;
