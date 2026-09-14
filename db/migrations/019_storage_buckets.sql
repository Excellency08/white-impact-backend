/*
 * Phase 6.4 Storage foundation.
 *
 * These buckets replace only the three upload classes that exist in the
 * current Express application. Existing local files and database references
 * are intentionally not migrated by this change.
 *
 * Donation receipts remain private and have no browser INSERT policy. The
 * current public receipt flow remains Express-backed until its validation,
 * ownership, and privileged processing are moved to a verified Edge Function.
 */

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'team-photos',
    'team-photos',
    TRUE,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'media-library',
    'media-library',
    FALSE,
    104857600,
    ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'video/mp4', 'video/webm', 'video/quicktime'
    ]::text[]
  ),
  (
    'donation-receipts',
    'donation-receipts',
    FALSE,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
  )
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_team_photos_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_team_photos_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'team-photos'
        AND name LIKE 'uploads/team/%'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_team_photos_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_team_photos_update
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'team-photos'
        AND name LIKE 'uploads/team/%'
        AND public.is_content_manager()
      )
      WITH CHECK (
        bucket_id = 'team-photos'
        AND name LIKE 'uploads/team/%'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_team_photos_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_team_photos_delete
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'team-photos'
        AND name LIKE 'uploads/team/%'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_media_library_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_media_library_select
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'media-library'
        AND name LIKE 'uploads/media/%'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_media_library_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_media_library_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'media-library'
        AND name LIKE 'uploads/media/%'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_media_library_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_media_library_update
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'media-library'
        AND name LIKE 'uploads/media/%'
        AND public.is_content_manager()
      )
      WITH CHECK (
        bucket_id = 'media-library'
        AND name LIKE 'uploads/media/%'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_media_library_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_media_library_delete
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'media-library'
        AND name LIKE 'uploads/media/%'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_donation_receipts_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_donation_receipts_select
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'donation-receipts'
        AND name LIKE 'uploads/receipts/%'
        AND public.is_finance_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_donation_receipts_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_donation_receipts_delete
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'donation-receipts'
        AND name LIKE 'uploads/receipts/%'
        AND public.is_finance_manager()
      )
    $policy$;
  END IF;
END;
$$;
