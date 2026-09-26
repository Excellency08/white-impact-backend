/* Correct the News content-image filename regex used by Storage policies. */

BEGIN;

DROP POLICY IF EXISTS storage_content_images_news_select ON storage.objects;
DROP POLICY IF EXISTS storage_content_images_news_insert ON storage.objects;
DROP POLICY IF EXISTS storage_content_images_news_update ON storage.objects;
DROP POLICY IF EXISTS storage_content_images_news_delete ON storage.objects;

CREATE POLICY storage_content_images_news_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-images'
    AND name ~ '^news/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
    AND public.is_content_manager()
  );

CREATE POLICY storage_content_images_news_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-images'
    AND name ~ '^news/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
    AND EXISTS (
      SELECT 1
      FROM public.news_posts
      WHERE news_posts.id = split_part(storage.objects.name, '/', 2)::integer
    )
    AND public.is_content_manager()
  );

CREATE POLICY storage_content_images_news_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'content-images'
    AND name ~ '^news/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
    AND public.is_content_manager()
  )
  WITH CHECK (
    bucket_id = 'content-images'
    AND name ~ '^news/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
    AND EXISTS (
      SELECT 1
      FROM public.news_posts
      WHERE news_posts.id = split_part(storage.objects.name, '/', 2)::integer
    )
    AND public.is_content_manager()
  );

CREATE POLICY storage_content_images_news_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'content-images'
    AND name ~ '^news/[0-9]+/(hero|media)/[^/]+\.(jpg|jpeg|png|webp|gif)$'
    AND public.is_content_manager()
  );

COMMIT;
