/*
 * Phase 1 Supabase-native identity bridge.
 *
 * The function derives identity only from auth.uid() and the managed
 * auth.users row. It never accepts a user ID, Auth UUID, email, or role from
 * the browser and never creates an application user.
 */

CREATE OR REPLACE FUNCTION public.link_current_auth_user()
RETURNS TABLE (
  application_user_id INTEGER,
  application_role TEXT,
  mapping_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_auth_user_id UUID := auth.uid();
  auth_email TEXT;
  auth_email_verified BOOLEAN;
  matching_users INTEGER;
  application_user_id_value INTEGER;
  application_role_value TEXT;
  application_user_active BOOLEAN;
  application_user_verified BOOLEAN;
  mapping_count INTEGER;
  existing_mapping_user_id INTEGER;
  existing_mapping_auth_user_id UUID;
BEGIN
  IF current_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'An authenticated Supabase session is required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    lower(pg_catalog.btrim(u.email)),
    u.email_confirmed_at IS NOT NULL
  INTO auth_email, auth_email_verified
  FROM auth.users AS u
  WHERE u.id = current_auth_user_id;

  IF NOT FOUND OR auth_email IS NULL OR NOT auth_email_verified THEN
    RAISE EXCEPTION 'A verified Supabase email is required before linking.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO matching_users
  FROM public.users AS u
  WHERE lower(pg_catalog.btrim(u.email)) = auth_email;

  IF matching_users = 0 THEN
    RAISE EXCEPTION 'No eligible existing application account matches this verified email.'
      USING ERRCODE = 'P0002';
  END IF;

  IF matching_users > 1 THEN
    RAISE EXCEPTION 'The verified email matches multiple application accounts.'
      USING ERRCODE = 'P0003';
  END IF;

  /* Serialize concurrent attempts for the same existing application user. */
  SELECT u.id, u.role, u.is_active, u.is_email_verified
  INTO application_user_id_value,
       application_role_value,
       application_user_active,
       application_user_verified
  FROM public.users AS u
  WHERE lower(pg_catalog.btrim(u.email)) = auth_email
  FOR UPDATE;

  IF NOT application_user_active OR NOT application_user_verified THEN
    RAISE EXCEPTION 'The existing application account is not eligible for linking.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO mapping_count
  FROM public.user_auth_mapping AS m
  WHERE m.user_id = application_user_id_value
     OR m.auth_user_id = current_auth_user_id;

  IF mapping_count > 1 THEN
    RAISE EXCEPTION 'The identity mapping is not one-to-one.'
      USING ERRCODE = '23505';
  END IF;

  IF mapping_count = 1 THEN
    SELECT m.user_id, m.auth_user_id
    INTO existing_mapping_user_id, existing_mapping_auth_user_id
    FROM public.user_auth_mapping AS m
    WHERE m.user_id = application_user_id_value
       OR m.auth_user_id = current_auth_user_id
    FOR UPDATE;

    IF existing_mapping_user_id = application_user_id_value
       AND existing_mapping_auth_user_id = current_auth_user_id THEN
      RETURN QUERY SELECT
        application_user_id_value,
        application_role_value,
        'already_linked'::TEXT;
      RETURN;
    END IF;

    RAISE EXCEPTION 'The identity is already linked to a different application account.'
      USING ERRCODE = '23505';
  END IF;

  /* Unique constraints on both columns protect the second concurrent path. */
  INSERT INTO public.user_auth_mapping (user_id, auth_user_id)
  VALUES (application_user_id_value, current_auth_user_id)
  ON CONFLICT DO NOTHING;

  SELECT m.user_id, m.auth_user_id
  INTO existing_mapping_user_id, existing_mapping_auth_user_id
  FROM public.user_auth_mapping AS m
  WHERE m.user_id = application_user_id_value
     OR m.auth_user_id = current_auth_user_id
  FOR UPDATE;

  IF existing_mapping_user_id <> application_user_id_value
     OR existing_mapping_auth_user_id <> current_auth_user_id THEN
    RAISE EXCEPTION 'The identity is already linked to a different application account.'
      USING ERRCODE = '23505';
  END IF;

  RETURN QUERY SELECT
    application_user_id_value,
    application_role_value,
    'linked'::TEXT;
END;
$$;

COMMENT ON FUNCTION public.link_current_auth_user() IS
  'Safely links the current verified Supabase Auth identity to one existing application user.';

REVOKE ALL ON FUNCTION public.link_current_auth_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_current_auth_user() TO authenticated;
