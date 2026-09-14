/*
 * Phase 62 public-read boundary.
 *
 * RLS is already enabled on the schema. These policies expose only the
 * active/published records used by public pages. No submission, admin, auth,
 * payment, audit, or storage write policy is created here.
 */

CREATE POLICY public_read_programs
  ON programs FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY public_read_projects
  ON projects FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY public_read_stories
  ON stories FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY public_read_news_posts
  ON news_posts FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY public_read_reports
  ON reports FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY public_read_cms_pages
  ON cms_pages FOR SELECT TO anon, authenticated
  USING (is_active = TRUE AND status = 'Published');

CREATE POLICY public_read_team_members
  ON team_members FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY public_read_media_assets
  ON media_assets FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY public_read_impact_metrics
  ON impact_metrics FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY public_read_impact_metric_history
  ON impact_metric_history FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM impact_metrics
      WHERE impact_metrics.id = impact_metric_history.metric_id
        AND impact_metrics.is_active = TRUE
    )
  );

CREATE POLICY public_read_impact_program_outcomes
  ON impact_program_outcomes FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY public_read_impact_geographies
  ON impact_geographies FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY public_read_impact_stories
  ON impact_stories FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY public_read_program_beneficiaries
  ON program_beneficiaries FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM programs
      WHERE programs.id = program_beneficiaries.program_id
        AND programs.is_active = TRUE
    )
  );

CREATE POLICY public_read_program_locations
  ON program_locations FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM programs
      WHERE programs.id = program_locations.program_id
        AND programs.is_active = TRUE
    )
  );

CREATE POLICY public_read_program_timeline
  ON program_timeline FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM programs
      WHERE programs.id = program_timeline.program_id
        AND programs.is_active = TRUE
    )
  );

CREATE POLICY public_read_program_gallery
  ON program_gallery FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM programs
      WHERE programs.id = program_gallery.program_id
        AND programs.is_active = TRUE
    )
  );

CREATE POLICY public_read_program_impact_metrics
  ON program_impact_metrics FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM programs
      WHERE programs.id = program_impact_metrics.program_id
        AND programs.is_active = TRUE
    )
  );

CREATE POLICY public_read_program_stories
  ON program_stories FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM programs
      WHERE programs.id = program_stories.program_id
        AND programs.is_active = TRUE
    )
    AND EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = program_stories.story_id
        AND stories.is_active = TRUE
    )
  );

CREATE POLICY public_read_program_reports
  ON program_reports FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM programs
      WHERE programs.id = program_reports.program_id
        AND programs.is_active = TRUE
    )
    AND (
      program_reports.report_id IS NULL
      OR EXISTS (
        SELECT 1 FROM reports
        WHERE reports.id = program_reports.report_id
          AND reports.is_active = TRUE
      )
    )
  );

CREATE POLICY public_read_partners
  ON partners FOR SELECT TO anon, authenticated
  USING (TRUE);

CREATE POLICY public_read_program_partners
  ON program_partners FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM programs
      WHERE programs.id = program_partners.program_id
        AND programs.is_active = TRUE
    )
  );

