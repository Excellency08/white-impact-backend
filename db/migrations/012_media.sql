CREATE TABLE IF NOT EXISTS media_assets (
  id SERIAL PRIMARY KEY,
  asset_key VARCHAR(120) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(80) NOT NULL DEFAULT 'image',
  usage_type VARCHAR(80) NOT NULL DEFAULT 'general',
  alt_text VARCHAR(255),
  caption TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_url VARCHAR(500) NOT NULL,
  file_name VARCHAR(255),
  storage_path VARCHAR(500),
  storage_provider VARCHAR(50) NOT NULL DEFAULT 'local',
  mime_type VARCHAR(120),
  file_size BIGINT DEFAULT 0,
  file_extension VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'Draft',
  display_order INT NOT NULL DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_category
  ON media_assets (category, display_order ASC);

CREATE INDEX IF NOT EXISTS idx_media_assets_status
  ON media_assets (status, is_active);

CREATE INDEX IF NOT EXISTS idx_media_assets_usage_type
  ON media_assets (usage_type, display_order ASC);
