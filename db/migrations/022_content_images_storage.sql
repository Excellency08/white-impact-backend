/*
 * Phase 12 shared public image storage foundation.
 *
 * This bucket is intentionally limited to Program assets in this phase.
 * Existing local files and legacy media records remain untouched.
 */

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-images',
  'content-images',
  TRUE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_content_images_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_content_images_select
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'content-images'
        AND name ~ '^programs/[0-9]+/(hero|gallery)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_content_images_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_content_images_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'content-images'
        AND name ~ '^programs/[0-9]+/(hero|gallery)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND EXISTS (
          SELECT 1 FROM public.programs
          WHERE id = split_part(name, '/', 2)::integer
        )
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_content_images_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_content_images_update
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'content-images'
        AND name ~ '^programs/[0-9]+/(hero|gallery)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND public.is_content_manager()
      )
      WITH CHECK (
        bucket_id = 'content-images'
        AND name ~ '^programs/[0-9]+/(hero|gallery)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND EXISTS (
          SELECT 1 FROM public.programs
          WHERE id = split_part(name, '/', 2)::integer
        )
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_content_images_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_content_images_delete
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'content-images'
        AND name ~ '^programs/[0-9]+/(hero|gallery)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;
END;
$$;
