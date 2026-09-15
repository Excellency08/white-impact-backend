/* Phase 14C: remove exclusive Story database objects after application detach. */

BEGIN;

-- Remove policies whose expressions reference Story records before dropping the tables.
DROP POLICY IF EXISTS public_read_program_stories ON public.program_stories;
DROP POLICY IF EXISTS rbac_content_select_program_stories ON public.program_stories;
DROP POLICY IF EXISTS rbac_content_insert_program_stories ON public.program_stories;
DROP POLICY IF EXISTS rbac_content_update_program_stories ON public.program_stories;
DROP POLICY IF EXISTS rbac_content_delete_program_stories ON public.program_stories;
DROP POLICY IF EXISTS public_read_stories ON public.stories;
DROP POLICY IF EXISTS rbac_content_select_stories ON public.stories;
DROP POLICY IF EXISTS rbac_content_insert_stories ON public.stories;
DROP POLICY IF EXISTS rbac_content_update_stories ON public.stories;
DROP POLICY IF EXISTS rbac_content_delete_stories ON public.stories;

-- Storage policies reference public.stories for ownership validation.
DROP POLICY IF EXISTS storage_content_images_stories_select ON storage.objects;
DROP POLICY IF EXISTS storage_content_images_stories_insert ON storage.objects;
DROP POLICY IF EXISTS storage_content_images_stories_update ON storage.objects;
DROP POLICY IF EXISTS storage_content_images_stories_delete ON storage.objects;

-- program_stories is Story-only; Programs retain their legacy JSON column for rollback compatibility.
DROP TABLE IF EXISTS public.program_stories;

-- stories is not referenced by any remaining active feature after the Program detach.
DROP TABLE IF EXISTS public.stories;

DROP FUNCTION IF EXISTS public.set_story_updated_by();

-- These policies are exclusive to the removed Story-owned Storage paths.
COMMIT;
