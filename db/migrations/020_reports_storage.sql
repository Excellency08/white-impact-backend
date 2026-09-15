/* Phase 10D: Reports storage metadata, RLS, and dedicated Storage bucket. */

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS storage_path VARCHAR(500),
  ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255),
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120);

DROP POLICY IF EXISTS rbac_reports_finance_select ON public.reports;
DROP POLICY IF EXISTS rbac_reports_finance_insert ON public.reports;
DROP POLICY IF EXISTS rbac_reports_finance_update ON public.reports;
DROP POLICY IF EXISTS rbac_reports_finance_delete ON public.reports;

CREATE POLICY rbac_reports_manager_select
  ON public.reports FOR SELECT TO authenticated
  USING (public.is_content_manager() OR public.is_finance_manager());

CREATE POLICY rbac_reports_manager_insert
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (public.is_content_manager() OR public.is_finance_manager());

CREATE POLICY rbac_reports_manager_update
  ON public.reports FOR UPDATE TO authenticated
  USING (public.is_content_manager() OR public.is_finance_manager())
  WITH CHECK (public.is_content_manager() OR public.is_finance_manager());

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'reports',
  'reports',
  TRUE,
  26214400,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_reports_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_reports_select
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'reports'
        AND name ~ '^reports/[0-9]+/[^/]+\.pdf$'
        AND (public.is_content_manager() OR public.is_finance_manager())
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_reports_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_reports_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'reports'
        AND name ~ '^reports/[0-9]+/[^/]+\.pdf$'
        AND EXISTS (
          SELECT 1 FROM public.reports r
          WHERE r.id = (split_part(name, '/', 2))::integer
        )
        AND (public.is_content_manager() OR public.is_finance_manager())
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_reports_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_reports_update
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'reports'
        AND name ~ '^reports/[0-9]+/[^/]+\.pdf$'
        AND EXISTS (
          SELECT 1 FROM public.reports r
          WHERE r.id = (split_part(name, '/', 2))::integer
        )
        AND (public.is_content_manager() OR public.is_finance_manager())
      )
      WITH CHECK (
        bucket_id = 'reports'
        AND name ~ '^reports/[0-9]+/[^/]+\.pdf$'
        AND EXISTS (
          SELECT 1 FROM public.reports r
          WHERE r.id = (split_part(name, '/', 2))::integer
        )
        AND (public.is_content_manager() OR public.is_finance_manager())
      )
    $policy$;
  END IF;
END;
$$;
