CREATE TABLE IF NOT EXISTS news_posts (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  excerpt TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '[]'::jsonb,
  hero_image_url VARCHAR(500),
  hero_image_alt VARCHAR(255),
  author_name VARCHAR(255) NOT NULL,
  author_role VARCHAR(255),
  category VARCHAR(120),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_articles JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(50) DEFAULT 'Draft',
  publication_date DATE,
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

CREATE INDEX IF NOT EXISTS idx_news_posts_publication_date
  ON news_posts (publication_date DESC);

CREATE INDEX IF NOT EXISTS idx_news_posts_status
  ON news_posts (status);
