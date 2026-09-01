CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at
  ON contact_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_status
  ON contact_submissions (status);

CREATE INDEX IF NOT EXISTS idx_newsletter_subs_is_active
  ON newsletter_subs (is_active);

CREATE INDEX IF NOT EXISTS idx_donations_created_at
  ON donations (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_donations_status
  ON donations (status);

CREATE INDEX IF NOT EXISTS idx_donations_program_area
  ON donations (program_area);

CREATE INDEX IF NOT EXISTS idx_team_members_display_order
  ON team_members (display_order ASC);

CREATE INDEX IF NOT EXISTS idx_team_members_is_active
  ON team_members (is_active);
