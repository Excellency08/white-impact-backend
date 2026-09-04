ALTER TABLE contact_submissions
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE newsletter_subs
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

UPDATE newsletter_subs
SET created_at = COALESCE(created_at, subscribed_at, NOW())
WHERE created_at IS NULL;
