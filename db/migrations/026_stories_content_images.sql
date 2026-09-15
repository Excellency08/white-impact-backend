/* Phase 14 Story-owned image Storage policies. */

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_content_images_stories_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_content_images_stories_select
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'content-images'
        AND name ~ '^stories/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_content_images_stories_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_content_images_stories_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'content-images'
        AND name ~ '^stories/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND EXISTS (
          SELECT 1 FROM public.stories
          WHERE id = split_part(name, '/', 2)::integer
        )
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_content_images_stories_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_content_images_stories_update
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'content-images'
        AND name ~ '^stories/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND public.is_content_manager()
      )
      WITH CHECK (
        bucket_id = 'content-images'
        AND name ~ '^stories/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND EXISTS (
          SELECT 1 FROM public.stories
          WHERE id = split_part(name, '/', 2)::integer
        )
        AND public.is_content_manager()
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_content_images_stories_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY storage_content_images_stories_delete
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'content-images'
        AND name ~ '^stories/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
        AND public.is_content_manager()
      )
    $policy$;
  END IF;
END;
$$;
