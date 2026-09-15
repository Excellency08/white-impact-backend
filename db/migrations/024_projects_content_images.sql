/*
 * Phase 13 Projects Storage and trusted attribution foundation.
 * Existing Express routes, local assets, and media records remain intact.
 */

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_content_images_projects_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_content_images_projects_select
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'content-images'
        AND name ~ '^projects/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_content_images_projects_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_content_images_projects_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'content-images'
        AND name ~ '^projects/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND EXISTS (
          SELECT 1 FROM public.projects
          WHERE id = split_part(name, '/', 2)::integer
        )
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_content_images_projects_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_content_images_projects_update
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'content-images'
        AND name ~ '^projects/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND public.is_content_manager()
      )
      WITH CHECK (
        bucket_id = 'content-images'
        AND name ~ '^projects/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND EXISTS (
          SELECT 1 FROM public.projects
          WHERE id = split_part(name, '/', 2)::integer
        )
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_content_images_projects_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_content_images_projects_delete
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'content-images'
        AND name ~ '^projects/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;
END;
$$;
