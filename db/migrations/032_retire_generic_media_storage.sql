-- Phase 18: retire the Generic Media Storage policies after proving the bucket is empty.
-- Bucket removal must use the supported server-side Supabase Storage API.
-- Historical media_assets rows and local /uploads/media files remain untouched.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'media-library'
  ) THEN
    RAISE EXCEPTION 'media-library must be empty before retirement';
  END IF;
END;
$$;

DROP POLICY IF EXISTS storage_media_library_select ON storage.objects;
DROP POLICY IF EXISTS storage_media_library_insert ON storage.objects;
DROP POLICY IF EXISTS storage_media_library_update ON storage.objects;
DROP POLICY IF EXISTS storage_media_library_delete ON storage.objects;

COMMIT;
