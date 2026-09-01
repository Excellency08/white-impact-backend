CREATE TABLE IF NOT EXISTS contact_submissions (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  message TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS newsletter_subs (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  subscribed_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS donations (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  amount_kobo BIGINT,
  amount_naira INT,
  program_area VARCHAR(255),
  message TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  paystack_data JSONB,
  receipt_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP
);

ALTER TABLE donations ADD COLUMN IF NOT EXISTS receipt_url VARCHAR(500);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255),
  role VARCHAR(255),
  bio TEXT,
  photo_url VARCHAR(500),
  display_order INT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);

