CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  description TEXT,
  category VARCHAR(120),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_url VARCHAR(500) NOT NULL,
  preview_url VARCHAR(500),
  file_type VARCHAR(120),
  publication_date DATE,
  download_count INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Published',
  seo_title VARCHAR(255),
  seo_description TEXT,
  og_image_url VARCHAR(500),
  display_order INT DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  updated_by INT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_publication_date
  ON reports (publication_date DESC);

CREATE INDEX IF NOT EXISTS idx_reports_category
  ON reports (category);

INSERT INTO reports (
  slug, title, summary, description, category, tags, file_url, preview_url, file_type,
  publication_date, download_count, status, seo_title, seo_description, og_image_url,
  display_order, is_featured, is_active
)
SELECT
  'wttc-introduction-to-ai-2024',
  'Introduction to AI',
  'A practical introduction to artificial intelligence and digital transformation.',
  'The 2024 publication introduces AI concepts, use cases, and community-facing opportunities for learning and responsible adoption.',
  'publication',
  '["AI", "Digital Literacy", "2024"]'::jsonb,
  './assets/images/2024-wttc-introduction-to-ai.pdf',
  './assets/images/2024-wttc-introduction-to-ai.pdf',
  'application/pdf',
  '2024-01-01',
  0,
  'Published',
  'Introduction to AI | White Impact Development Initiative',
  'A practical introduction to artificial intelligence and digital transformation.',
  './assets/images/2024-wttc-introduction-to-ai.pdf',
  1,
  TRUE,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM reports WHERE slug = 'wttc-introduction-to-ai-2024'
);

INSERT INTO reports (
  slug, title, summary, description, category, tags, file_url, preview_url, file_type,
  publication_date, download_count, status, seo_title, seo_description, og_image_url,
  display_order, is_featured, is_active
)
SELECT
  'community-outreach-plan-2026',
  'Proposed Plan of Action for 2026 Community Outreach',
  'A forward plan outlining community outreach priorities for 2026.',
  'This publication captures the proposed action plan for community outreach in 2026, including the scope of engagement and delivery focus areas.',
  'plan',
  '["Community Outreach", "2026", "Planning"]'::jsonb,
  './assets/images/PROPOSED PLAN OF ACTION FOR 2026 COMMUNITY OUTREACH (1).pdf',
  './assets/images/PROPOSED PLAN OF ACTION FOR 2026 COMMUNITY OUTREACH (1).pdf',
  'application/pdf',
  '2026-01-01',
  0,
  'Published',
  'Proposed Plan of Action for 2026 Community Outreach | White Impact Development Initiative',
  'A forward plan outlining community outreach priorities for 2026.',
  './assets/images/PROPOSED PLAN OF ACTION FOR 2026 COMMUNITY OUTREACH (1).pdf',
  2,
  TRUE,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM reports WHERE slug = 'community-outreach-plan-2026'
);
