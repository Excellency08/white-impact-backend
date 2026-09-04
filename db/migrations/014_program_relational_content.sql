/* Relational Program CMS content. Legacy JSON columns are retained for rollback. */

CREATE TABLE IF NOT EXISTS program_beneficiaries (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  image_url VARCHAR(500),
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (program_id, title)
);

CREATE TABLE IF NOT EXISTS program_locations (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  country VARCHAR(120),
  state VARCHAR(120),
  city VARCHAR(120),
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (program_id, name)
);

CREATE TABLE IF NOT EXISTS program_timeline (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  milestone_date VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS program_gallery (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  image_url VARCHAR(500) NOT NULL,
  alt_text VARCHAR(255),
  caption TEXT,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (program_id, image_url)
);

CREATE TABLE IF NOT EXISTS program_impact_metrics (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  value VARCHAR(120) NOT NULL,
  description TEXT,
  icon VARCHAR(120),
  category VARCHAR(120),
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (program_id, label)
);

CREATE TABLE IF NOT EXISTS program_stories (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  story_id INT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (program_id, story_id)
);

CREATE TABLE IF NOT EXISTS program_reports (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  report_id INT REFERENCES reports(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_url VARCHAR(500) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partners (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  logo_url VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS program_partners (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  partner_id INT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (program_id, partner_id)
);

CREATE INDEX IF NOT EXISTS idx_program_beneficiaries_program_order ON program_beneficiaries(program_id, display_order);
CREATE INDEX IF NOT EXISTS idx_program_locations_program_order ON program_locations(program_id, display_order);
CREATE INDEX IF NOT EXISTS idx_program_timeline_program_order ON program_timeline(program_id, display_order);
CREATE INDEX IF NOT EXISTS idx_program_gallery_program_order ON program_gallery(program_id, display_order);
CREATE INDEX IF NOT EXISTS idx_program_impact_program_order ON program_impact_metrics(program_id, display_order);
CREATE INDEX IF NOT EXISTS idx_program_stories_program_order ON program_stories(program_id, display_order);
CREATE INDEX IF NOT EXISTS idx_program_reports_program_order ON program_reports(program_id, display_order);
CREATE INDEX IF NOT EXISTS idx_program_partners_program_order ON program_partners(program_id, display_order);

INSERT INTO program_beneficiaries (program_id, title, description, image_url, display_order)
SELECT p.id, item->>'title', item->>'summary', NULLIF(item->>'imageUrl', ''), row_number() OVER (PARTITION BY p.id ORDER BY ordinality) - 1
FROM programs p
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.beneficiaries) = 'array' THEN p.beneficiaries ELSE '[]'::jsonb END) WITH ORDINALITY AS items(item, ordinality)
WHERE NULLIF(item->>'title', '') IS NOT NULL
ON CONFLICT (program_id, title) DO NOTHING;

INSERT INTO program_locations (program_id, name, description, country, state, city, display_order)
SELECT p.id, COALESCE(NULLIF(item->>'name', ''), item->>'title'), item->>'summary', item->>'country', item->>'state', item->>'city', row_number() OVER (PARTITION BY p.id ORDER BY ordinality) - 1
FROM programs p
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.locations) = 'array' THEN p.locations ELSE '[]'::jsonb END) WITH ORDINALITY AS items(item, ordinality)
WHERE COALESCE(NULLIF(item->>'name', ''), NULLIF(item->>'title', '')) IS NOT NULL
ON CONFLICT (program_id, name) DO NOTHING;

INSERT INTO program_timeline (program_id, milestone_date, title, description, display_order)
SELECT p.id, COALESCE(NULLIF(item->>'date', ''), item->>'year', ''), item->>'title', COALESCE(item->>'description', item->>'summary'), row_number() OVER (PARTITION BY p.id ORDER BY ordinality) - 1
FROM programs p
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.timeline) = 'array' THEN p.timeline ELSE '[]'::jsonb END) WITH ORDINALITY AS items(item, ordinality)
WHERE NULLIF(item->>'title', '') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO program_gallery (program_id, image_url, alt_text, caption, display_order)
SELECT p.id, item->>'url', item->>'alt', item->>'caption', row_number() OVER (PARTITION BY p.id ORDER BY ordinality) - 1
FROM programs p
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.gallery) = 'array' THEN p.gallery ELSE '[]'::jsonb END) WITH ORDINALITY AS items(item, ordinality)
WHERE NULLIF(item->>'url', '') IS NOT NULL
ON CONFLICT (program_id, image_url) DO NOTHING;

INSERT INTO program_impact_metrics (program_id, label, value, description, icon, category, display_order)
SELECT p.id, item->>'label', item->>'value', item->>'description', item->>'icon', item->>'category', row_number() OVER (PARTITION BY p.id ORDER BY ordinality) - 1
FROM programs p
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.impact_metrics) = 'array' THEN p.impact_metrics ELSE '[]'::jsonb END) WITH ORDINALITY AS items(item, ordinality)
WHERE NULLIF(item->>'label', '') IS NOT NULL
ON CONFLICT (program_id, label) DO NOTHING;

INSERT INTO program_stories (program_id, story_id, display_order)
SELECT p.id, s.id, row_number() OVER (PARTITION BY p.id ORDER BY s.id) - 1
FROM programs p
JOIN stories s ON s.program_slug = p.slug
ON CONFLICT (program_id, story_id) DO NOTHING;

INSERT INTO partners (name)
SELECT DISTINCT NULLIF(item->>'title', '')
FROM programs p
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.partners) = 'array' THEN p.partners ELSE '[]'::jsonb END) AS items(item)
WHERE NULLIF(item->>'title', '') IS NOT NULL
ON CONFLICT (name) DO NOTHING;

INSERT INTO program_partners (program_id, partner_id, display_order)
SELECT p.id, partners.id, row_number() OVER (PARTITION BY p.id ORDER BY partners.id) - 1
FROM programs p
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.partners) = 'array' THEN p.partners ELSE '[]'::jsonb END) AS items(item)
JOIN partners ON partners.name = NULLIF(items.item->>'title', '')
ON CONFLICT (program_id, partner_id) DO NOTHING;
