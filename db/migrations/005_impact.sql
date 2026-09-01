CREATE TABLE IF NOT EXISTS impact_metrics (
  id SERIAL PRIMARY KEY,
  metric_key VARCHAR(120) UNIQUE NOT NULL,
  label VARCHAR(255) NOT NULL,
  value NUMERIC(16, 2) NOT NULL DEFAULT 0,
  display_prefix VARCHAR(20) DEFAULT '',
  display_suffix VARCHAR(20) DEFAULT '',
  description TEXT,
  category VARCHAR(80) NOT NULL DEFAULT 'overview',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impact_metrics_category
  ON impact_metrics (category, sort_order ASC);

CREATE INDEX IF NOT EXISTS idx_impact_metrics_is_active
  ON impact_metrics (is_active);

CREATE TABLE IF NOT EXISTS impact_metric_history (
  id SERIAL PRIMARY KEY,
  metric_id INT NOT NULL REFERENCES impact_metrics(id) ON DELETE CASCADE,
  value NUMERIC(16, 2) NOT NULL,
  recorded_on DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impact_metric_history_metric_id
  ON impact_metric_history (metric_id);

CREATE INDEX IF NOT EXISTS idx_impact_metric_history_recorded_on
  ON impact_metric_history (recorded_on DESC);

CREATE TABLE IF NOT EXISTS impact_program_outcomes (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  metric_label VARCHAR(255),
  metric_value NUMERIC(16, 2),
  metric_suffix VARCHAR(20) DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impact_program_outcomes_is_active
  ON impact_program_outcomes (is_active);

CREATE INDEX IF NOT EXISTS idx_impact_program_outcomes_sort_order
  ON impact_program_outcomes (sort_order ASC);

CREATE TABLE IF NOT EXISTS impact_geographies (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) UNIQUE NOT NULL,
  location_name VARCHAR(255) NOT NULL,
  region VARCHAR(120),
  summary TEXT NOT NULL,
  beneficiary_label VARCHAR(255),
  beneficiary_value NUMERIC(16, 2),
  beneficiary_suffix VARCHAR(20) DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impact_geographies_is_active
  ON impact_geographies (is_active);

CREATE INDEX IF NOT EXISTS idx_impact_geographies_sort_order
  ON impact_geographies (sort_order ASC);

CREATE TABLE IF NOT EXISTS impact_stories (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) UNIQUE NOT NULL,
  headline VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  source_label VARCHAR(255),
  related_program_slug VARCHAR(120),
  related_metric_key VARCHAR(120),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impact_stories_is_active
  ON impact_stories (is_active);

CREATE INDEX IF NOT EXISTS idx_impact_stories_sort_order
  ON impact_stories (sort_order ASC);

INSERT INTO impact_metrics (
  metric_key,
  label,
  value,
  display_suffix,
  description,
  category,
  sort_order,
  is_active
)
SELECT *
FROM (
  VALUES
    ('people_reached', 'People reached', 14000, '+', 'Community members reached through direct and digital programming.', 'overview', 1, TRUE),
    ('communities_reached', 'Communities reached', 96, '', 'Communities represented across community-centered activities.', 'overview', 2, TRUE),
    ('young_people_trained', 'Young people trained', 5721, '+', 'Young leaders and learners supported through skills-building.', 'overview', 3, TRUE),
    ('social_engagements', 'Social engagements', 45000, '+', 'Digital engagement across campaigns, reports, and program stories.', 'overview', 4, TRUE),
    ('education_access', 'Education access', 14000, '+', 'Learning support led by the Edu4All response and related programming.', 'chart', 1, TRUE),
    ('protection_response', 'Protection response', 96, '', 'Community safeguarding, SRHR, and anti-GBV action.', 'chart', 2, TRUE),
    ('digital_opportunity', 'Digital opportunity', 5721, '+', 'Training and digital inclusion opportunities for young people.', 'chart', 3, TRUE),
    ('civic_participation', 'Civic participation', 45000, '+', 'Campaign reach and community participation across civic work.', 'chart', 4, TRUE)
) AS seed(metric_key, label, value, display_suffix, description, category, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM impact_metrics);

INSERT INTO impact_program_outcomes (
  slug,
  title,
  summary,
  metric_label,
  metric_value,
  metric_suffix,
  sort_order,
  is_active
)
SELECT *
FROM (
  VALUES
    ('edu4all', 'Edu4All Initiative', 'Bridging education gaps for displaced and underserved children through access, support, and protection.', 'People reached', 14000, '+', 1, TRUE),
    ('nextgen-ai', 'Ethical & Responsible AI for Social Equity', 'Advancing digital opportunity and responsible AI literacy for youth and community advocates.', 'Young people trained', 5721, '+', 2, TRUE),
    ('nextgen-civic-lab', 'Youth Civic Accountability & Good Governance', 'Building civic participation through transparency, community monitoring, and youth voice.', 'Social engagements', 45000, '+', 3, TRUE)
) AS seed(slug, title, summary, metric_label, metric_value, metric_suffix, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM impact_program_outcomes);

INSERT INTO impact_geographies (
  slug,
  location_name,
  region,
  summary,
  beneficiary_label,
  beneficiary_value,
  beneficiary_suffix,
  sort_order,
  is_active
)
SELECT *
FROM (
  VALUES
    ('kaduna-state', 'Kaduna State', 'Northern Nigeria', 'A core base for program delivery, partnerships, and community engagement.', 'Communities reached', 96, '', 1, TRUE),
    ('nigeria-wide', 'Across Nigeria', 'National', 'Digital campaigns and storytelling extend the reach of our work beyond any single site.', 'People reached', 14000, '+', 2, TRUE),
    ('online-community', 'Online Community', 'Digital', 'Social platforms and newsletter updates keep the wider community engaged.', 'Social engagements', 45000, '+', 3, TRUE)
) AS seed(slug, location_name, region, summary, beneficiary_label, beneficiary_value, beneficiary_suffix, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM impact_geographies);

INSERT INTO impact_stories (
  slug,
  headline,
  summary,
  source_label,
  related_program_slug,
  related_metric_key,
  sort_order,
  is_active
)
SELECT *
FROM (
  VALUES
    ('edu4all-beneficiary', 'A child back in class', 'A caregiver shared that education support helped a displaced child return to school and restore stability at home.', 'Edu4All beneficiary, Saminaka Community', 'edu4all', 'education_access', 1, TRUE),
    ('community-voice', 'Communities shaping the response', 'Program design stays grounded in what communities say they need, not in assumptions from the outside.', 'Community partners', 'nextgen-civic-lab', 'civic_participation', 2, TRUE),
    ('digital-pathways', 'Training that unlocks opportunity', 'Digital skills support is paired with access to civic, creative, and social innovation pathways.', 'Youth participants', 'nextgen-ai', 'digital_opportunity', 3, TRUE)
) AS seed(slug, headline, summary, source_label, related_program_slug, related_metric_key, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM impact_stories);
