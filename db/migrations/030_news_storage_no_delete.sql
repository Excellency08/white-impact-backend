/* Phase 15 correction: News uses archive/deactivate, not Storage deletion. */

BEGIN;

DROP POLICY IF EXISTS storage_content_images_news_delete ON storage.objects;

COMMIT;
