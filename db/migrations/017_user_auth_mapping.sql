/*
 * Phase 63 identity bridge.
 * Existing public.users IDs remain unchanged. This table is populated only by
 * an explicit, verified Supabase Auth linking operation.
 */

CREATE TABLE IF NOT EXISTS public.user_auth_mapping (
  user_id INTEGER PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  auth_user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_auth_mapping ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_auth_mapping_auth_user_id
  ON public.user_auth_mapping (auth_user_id);

