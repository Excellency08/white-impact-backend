ALTER TABLE contact_submissions
  ADD COLUMN IF NOT EXISTS source_page VARCHAR(120) DEFAULT 'work-with-us',
  ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE newsletter_subs
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source_page VARCHAR(120) DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS confirmation_token_hash VARCHAR(128),
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS unsubscribe_token_hash VARCHAR(128),
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50) DEFAULT 'bank_transfer',
  ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255),
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS provider_event_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS provider_payload JSONB,
  ADD COLUMN IF NOT EXISTS confirmation_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS verified_by INT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS webhook_verified_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE TABLE IF NOT EXISTS volunteer_applications (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  location VARCHAR(255),
  availability VARCHAR(80),
  experience_level VARCHAR(80),
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  interests JSONB NOT NULL DEFAULT '[]'::jsonb,
  motivation TEXT,
  portfolio_url VARCHAR(500),
  source_page VARCHAR(120) DEFAULT 'work-with-us',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  notes TEXT,
  reviewed_by INT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donation_webhook_events (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(120),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature_valid BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (provider, event_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id INT REFERENCES users(id) ON DELETE SET NULL,
  actor_email VARCHAR(255),
  actor_role VARCHAR(50),
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80),
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(100),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id SERIAL PRIMARY KEY,
  event_key VARCHAR(120) NOT NULL,
  page_path VARCHAR(255),
  referrer VARCHAR(500),
  session_id VARCHAR(120),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_source_page
  ON contact_submissions (source_page);

CREATE INDEX IF NOT EXISTS idx_newsletter_subs_status
  ON newsletter_subs (status);

CREATE INDEX IF NOT EXISTS idx_newsletter_subs_source_page
  ON newsletter_subs (source_page);

CREATE INDEX IF NOT EXISTS idx_volunteer_applications_status
  ON volunteer_applications (status);

CREATE INDEX IF NOT EXISTS idx_volunteer_applications_created_at
  ON volunteer_applications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_donations_payment_status
  ON donations (payment_status);

CREATE INDEX IF NOT EXISTS idx_donations_idempotency_key
  ON donations (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_key
  ON analytics_events (event_key, created_at DESC);
