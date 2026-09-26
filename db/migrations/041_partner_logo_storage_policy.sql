/* Allow CMS partner logos to use the existing content-images bucket. */

BEGIN;

CREATE POLICY storage_content_images_cms_partners_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-images'
    AND name ~ '^cms/[0-9]+/partners/[^/]+\.(jpg|jpeg|png|webp|gif)$'
    AND public.is_content_manager()
  );

CREATE POLICY storage_content_images_cms_partners_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-images'
    AND name ~ '^cms/[0-9]+/partners/[^/]+\.(jpg|jpeg|png|webp|gif)$'
    AND EXISTS (
      SELECT 1
      FROM public.cms_pages
      WHERE cms_pages.id = split_part(storage.objects.name, '/', 2)::integer
    )
    AND public.is_content_manager()
  );

CREATE POLICY storage_content_images_cms_partners_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'content-images'
    AND name ~ '^cms/[0-9]+/partners/[^/]+\.(jpg|jpeg|png|webp|gif)$'
    AND public.is_content_manager()
  )
  WITH CHECK (
    bucket_id = 'content-images'
    AND name ~ '^cms/[0-9]+/partners/[^/]+\.(jpg|jpeg|png|webp|gif)$'
    AND EXISTS (
      SELECT 1
      FROM public.cms_pages
      WHERE cms_pages.id = split_part(storage.objects.name, '/', 2)::integer
    )
    AND public.is_content_manager()
  );

COMMIT;
