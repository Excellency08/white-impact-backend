/* Phase 15: News trusted identity and content-image storage policies. */

BEGIN;

CREATE OR REPLACE FUNCTION public.set_news_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
BEGIN
  -- Keep legacy server writes compatible while deriving browser writes from
  -- the mapped Supabase Auth identity whenever one is present.
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := public.get_current_application_user_id();
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_news_updated_by() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_news_updated_by() TO authenticated;

DROP TRIGGER IF EXISTS news_posts_set_updated_by ON public.news_posts;
CREATE TRIGGER news_posts_set_updated_by
BEFORE INSERT OR UPDATE ON public.news_posts
FOR EACH ROW
EXECUTE FUNCTION public.set_news_updated_by();

CREATE POLICY storage_content_images_news_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-images'
    AND name ~ '^news/[0-9]+/(hero|media)/[^/]+\\.(jpg|jpeg|png|webp|gif)$'
    AND public.is_content_manager()
  );

CREATE POLICY storage_content_images_news_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-images'
    AND name ~ '^news/[0-9]+/(hero|media)/[^/]+\\.(jpg|jpeg|png|webp|gif)$'
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
    AND name ~ '^news/[0-9]+/(hero|media)/[^/]+\\.(jpg|jpeg|png|webp|gif)$'
    AND public.is_content_manager()
  )
  WITH CHECK (
    bucket_id = 'content-images'
    AND name ~ '^news/[0-9]+/(hero|media)/[^/]+\\.(jpg|jpeg|png|webp|gif)$'
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
    AND name ~ '^news/[0-9]+/(hero|media)/[^/]+\\.(jpg|jpeg|png|webp|gif)$'
    AND public.is_content_manager()
  );

COMMIT;
