/*
 * Explicitly keep analytics summaries out of anonymous access.
 * Some hosted role setups report inherited function privileges unless the
 * role-specific revoke is present, so lock both PUBLIC and anon down.
 */

REVOKE ALL ON FUNCTION public.get_analytics_summary(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_analytics_summary(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_analytics_summary(INTEGER) TO authenticated;
