/*
 * Phase 65/66 Auth-to-application RBAC foundation.
 *
 * Supabase Auth UUIDs resolve through user_auth_mapping to the existing
 * integer users.id and users.role. Empty mappings fail closed. No browser
 * policy is added for users, sessions, tokens, mapping, webhooks, or audit
 * writes.
 */

CREATE OR REPLACE FUNCTION public.get_current_application_user_id()
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT m.user_id
  FROM public.user_auth_mapping AS m
  JOIN public.users AS u ON u.id = m.user_id
  WHERE m.auth_user_id = auth.uid()
    AND u.is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_current_application_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.role
  FROM public.user_auth_mapping AS m
  JOIN public.users AS u ON u.id = m.user_id
  WHERE m.auth_user_id = auth.uid()
    AND u.is_active = TRUE
    AND u.is_email_verified = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_content_manager()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(public.get_current_application_role() IN (
    'super_admin', 'admin', 'content_manager'
  ), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_finance_manager()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(public.get_current_application_role() IN (
    'super_admin', 'admin', 'finance_manager'
  ), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_role_manager()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(public.get_current_application_role() IN (
    'super_admin', 'admin'
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION public.get_current_application_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_application_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_content_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_finance_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_role_manager() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_current_application_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_application_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_content_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_role_manager() TO authenticated;

DO $$
DECLARE
  table_name TEXT;
  content_tables CONSTANT TEXT[] := ARRAY[
    'programs', 'projects', 'stories', 'news_posts', 'cms_pages',
    'team_members', 'media_assets', 'impact_metrics', 'impact_metric_history',
    'impact_program_outcomes', 'impact_geographies', 'impact_stories',
    'program_beneficiaries', 'program_locations', 'program_timeline',
    'program_gallery', 'program_impact_metrics', 'program_stories',
    'program_reports', 'partners', 'program_partners'
  ];
BEGIN
  FOREACH table_name IN ARRAY content_tables LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_content_manager())',
      'rbac_content_select_' || table_name,
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_content_manager())',
      'rbac_content_insert_' || table_name,
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_content_manager()) WITH CHECK (public.is_content_manager())',
      'rbac_content_update_' || table_name,
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_content_manager())',
      'rbac_content_delete_' || table_name,
      table_name
    );
  END LOOP;
END;
$$;

CREATE POLICY rbac_reports_finance_select
  ON public.reports FOR SELECT TO authenticated
  USING (public.is_finance_manager());

CREATE POLICY rbac_reports_finance_insert
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (public.is_finance_manager());

CREATE POLICY rbac_reports_finance_update
  ON public.reports FOR UPDATE TO authenticated
  USING (public.is_finance_manager())
  WITH CHECK (public.is_finance_manager());

CREATE POLICY rbac_reports_finance_delete
  ON public.reports FOR DELETE TO authenticated
  USING (public.is_finance_manager());

CREATE POLICY rbac_contact_select
  ON public.contact_submissions FOR SELECT TO authenticated
  USING (public.is_content_manager());

CREATE POLICY rbac_contact_update
  ON public.contact_submissions FOR UPDATE TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

CREATE POLICY rbac_contact_delete
  ON public.contact_submissions FOR DELETE TO authenticated
  USING (public.is_content_manager());

CREATE POLICY rbac_newsletter_select
  ON public.newsletter_subs FOR SELECT TO authenticated
  USING (public.is_content_manager());

CREATE POLICY rbac_newsletter_update
  ON public.newsletter_subs FOR UPDATE TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

CREATE POLICY rbac_newsletter_delete
  ON public.newsletter_subs FOR DELETE TO authenticated
  USING (public.is_content_manager());

CREATE POLICY rbac_volunteer_select
  ON public.volunteer_applications FOR SELECT TO authenticated
  USING (public.is_content_manager());

CREATE POLICY rbac_volunteer_update
  ON public.volunteer_applications FOR UPDATE TO authenticated
  USING (public.is_content_manager())
  WITH CHECK (public.is_content_manager());

CREATE POLICY rbac_volunteer_delete
  ON public.volunteer_applications FOR DELETE TO authenticated
  USING (public.is_content_manager());

CREATE POLICY rbac_donations_select
  ON public.donations FOR SELECT TO authenticated
  USING (public.is_finance_manager());

CREATE POLICY rbac_donations_update
  ON public.donations FOR UPDATE TO authenticated
  USING (public.is_finance_manager())
  WITH CHECK (public.is_finance_manager());

CREATE POLICY rbac_audit_select
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_role_manager());

