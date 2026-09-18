/*
 * Phase 21: bounded public download tracking for active reports.
 * The browser receives no table UPDATE capability; this function can only
 * increment the counter for one currently public report selected by its slug.
 */

CREATE OR REPLACE FUNCTION public.record_public_report_download(p_slug TEXT)
RETURNS TABLE (download_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_slug TEXT;
BEGIN
  normalized_slug := regexp_replace(
    regexp_replace(lower(trim(COALESCE(p_slug, ''))), '[^a-z0-9]+', '-', 'g'),
    '(^-+|-+$)',
    '',
    'g'
  );

  IF normalized_slug = '' OR char_length(normalized_slug) > 255 THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.reports
  SET download_count = COALESCE(reports.download_count, 0) + 1,
      updated_at = NOW()
  WHERE reports.slug = normalized_slug
    AND reports.is_active = TRUE
  RETURNING reports.download_count;
END;
$$;

REVOKE ALL ON FUNCTION public.record_public_report_download(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_public_report_download(TEXT) TO anon, authenticated;
