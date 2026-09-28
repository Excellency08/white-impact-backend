-- Replace the public Program catalog without deleting existing Program rows.
-- Existing IDs are preserved so dependent records remain addressable.

-- Preserve the former Creative Lab relational records before ID 5 is reused.
-- These archive tables intentionally copy the complete source row shape and
-- retain the original primary-key values as data for recovery/audit purposes.
CREATE TABLE IF NOT EXISTS public.program_legacy_creative_lab_beneficiaries
  (LIKE public.program_beneficiaries);
ALTER TABLE public.program_legacy_creative_lab_beneficiaries
  ADD COLUMN IF NOT EXISTS archived_program_id INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS archived_program_slug VARCHAR(120) NOT NULL DEFAULT 'creative-lab',
  ADD COLUMN IF NOT EXISTS archived_program_title VARCHAR(255) NOT NULL DEFAULT 'Creative Lab',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NOT NULL DEFAULT NOW();
INSERT INTO public.program_legacy_creative_lab_beneficiaries
SELECT source.*, 5, 'creative-lab', 'Creative Lab', NOW()
FROM public.program_beneficiaries AS source
WHERE source.program_id = 5
  AND NOT EXISTS (
    SELECT 1 FROM public.program_legacy_creative_lab_beneficiaries AS archive
    WHERE archive.id = source.id
  );

CREATE TABLE IF NOT EXISTS public.program_legacy_creative_lab_locations
  (LIKE public.program_locations);
ALTER TABLE public.program_legacy_creative_lab_locations
  ADD COLUMN IF NOT EXISTS archived_program_id INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS archived_program_slug VARCHAR(120) NOT NULL DEFAULT 'creative-lab',
  ADD COLUMN IF NOT EXISTS archived_program_title VARCHAR(255) NOT NULL DEFAULT 'Creative Lab',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NOT NULL DEFAULT NOW();
INSERT INTO public.program_legacy_creative_lab_locations
SELECT source.*, 5, 'creative-lab', 'Creative Lab', NOW()
FROM public.program_locations AS source
WHERE source.program_id = 5
  AND NOT EXISTS (
    SELECT 1 FROM public.program_legacy_creative_lab_locations AS archive
    WHERE archive.id = source.id
  );

CREATE TABLE IF NOT EXISTS public.program_legacy_creative_lab_timeline
  (LIKE public.program_timeline);
ALTER TABLE public.program_legacy_creative_lab_timeline
  ADD COLUMN IF NOT EXISTS archived_program_id INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS archived_program_slug VARCHAR(120) NOT NULL DEFAULT 'creative-lab',
  ADD COLUMN IF NOT EXISTS archived_program_title VARCHAR(255) NOT NULL DEFAULT 'Creative Lab',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NOT NULL DEFAULT NOW();
INSERT INTO public.program_legacy_creative_lab_timeline
SELECT source.*, 5, 'creative-lab', 'Creative Lab', NOW()
FROM public.program_timeline AS source
WHERE source.program_id = 5
  AND NOT EXISTS (
    SELECT 1 FROM public.program_legacy_creative_lab_timeline AS archive
    WHERE archive.id = source.id
  );

CREATE TABLE IF NOT EXISTS public.program_legacy_creative_lab_gallery
  (LIKE public.program_gallery);
ALTER TABLE public.program_legacy_creative_lab_gallery
  ADD COLUMN IF NOT EXISTS archived_program_id INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS archived_program_slug VARCHAR(120) NOT NULL DEFAULT 'creative-lab',
  ADD COLUMN IF NOT EXISTS archived_program_title VARCHAR(255) NOT NULL DEFAULT 'Creative Lab',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NOT NULL DEFAULT NOW();
INSERT INTO public.program_legacy_creative_lab_gallery
SELECT source.*, 5, 'creative-lab', 'Creative Lab', NOW()
FROM public.program_gallery AS source
WHERE source.program_id = 5
  AND NOT EXISTS (
    SELECT 1 FROM public.program_legacy_creative_lab_gallery AS archive
    WHERE archive.id = source.id
  );

CREATE TABLE IF NOT EXISTS public.program_legacy_creative_lab_metrics
  (LIKE public.program_impact_metrics);
ALTER TABLE public.program_legacy_creative_lab_metrics
  ADD COLUMN IF NOT EXISTS archived_program_id INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS archived_program_slug VARCHAR(120) NOT NULL DEFAULT 'creative-lab',
  ADD COLUMN IF NOT EXISTS archived_program_title VARCHAR(255) NOT NULL DEFAULT 'Creative Lab',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NOT NULL DEFAULT NOW();
INSERT INTO public.program_legacy_creative_lab_metrics
SELECT source.*, 5, 'creative-lab', 'Creative Lab', NOW()
FROM public.program_impact_metrics AS source
WHERE source.program_id = 5
  AND NOT EXISTS (
    SELECT 1 FROM public.program_legacy_creative_lab_metrics AS archive
    WHERE archive.id = source.id
  );

CREATE TABLE IF NOT EXISTS public.program_legacy_creative_lab_reports
  (LIKE public.program_reports);
ALTER TABLE public.program_legacy_creative_lab_reports
  ADD COLUMN IF NOT EXISTS archived_program_id INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS archived_program_slug VARCHAR(120) NOT NULL DEFAULT 'creative-lab',
  ADD COLUMN IF NOT EXISTS archived_program_title VARCHAR(255) NOT NULL DEFAULT 'Creative Lab',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NOT NULL DEFAULT NOW();
INSERT INTO public.program_legacy_creative_lab_reports
SELECT source.*, 5, 'creative-lab', 'Creative Lab', NOW()
FROM public.program_reports AS source
WHERE source.program_id = 5
  AND NOT EXISTS (
    SELECT 1 FROM public.program_legacy_creative_lab_reports AS archive
    WHERE archive.id = source.id
  );

CREATE TABLE IF NOT EXISTS public.program_legacy_creative_lab_partners
  (LIKE public.program_partners);
ALTER TABLE public.program_legacy_creative_lab_partners
  ADD COLUMN IF NOT EXISTS archived_program_id INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS archived_program_slug VARCHAR(120) NOT NULL DEFAULT 'creative-lab',
  ADD COLUMN IF NOT EXISTS archived_program_title VARCHAR(255) NOT NULL DEFAULT 'Creative Lab',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NOT NULL DEFAULT NOW();
INSERT INTO public.program_legacy_creative_lab_partners
SELECT source.*, 5, 'creative-lab', 'Creative Lab', NOW()
FROM public.program_partners AS source
WHERE source.program_id = 5
  AND NOT EXISTS (
    SELECT 1 FROM public.program_legacy_creative_lab_partners AS archive
    WHERE archive.id = source.id
  );

-- Temporarily detach slug-based dependencies while the referenced slugs change.
UPDATE public.projects
SET program_slug = NULL
WHERE program_slug IN ('edu4all', 'blood-donation', 'nextgen-civic-lab', 'nextgen-ai', 'creative-lab');

UPDATE public.programs
SET
  title = CASE id
    WHEN 1 THEN 'Education Access & Opportunity'
    WHEN 2 THEN 'Health Access & Community Well-being'
    WHEN 3 THEN 'Civic Engagement & Digital Citizenship'
    WHEN 4 THEN 'AI & Technology for the Next Generation'
    WHEN 5 THEN 'Think Tank & Policy Innovation Lab'
  END,
  slug = CASE id
    WHEN 1 THEN 'education-access-opportunity'
    WHEN 2 THEN 'health-access-community-well-being'
    WHEN 3 THEN 'civic-engagement-digital-citizenship'
    WHEN 4 THEN 'ai-technology-next-generation'
    WHEN 5 THEN 'think-tank-policy-innovation-lab'
  END,
  page_url = CASE id
    WHEN 1 THEN 'education-access-opportunity.html'
    WHEN 2 THEN 'health-access-community-well-being.html'
    WHEN 3 THEN 'civic-engagement-digital-citizenship.html'
    WHEN 4 THEN 'ai-technology-next-generation.html'
    WHEN 5 THEN 'think-tank-policy-innovation-lab.html'
  END,
  seo_title = CASE id
    WHEN 1 THEN 'Education Access & Opportunity | White Impact Development Initiative'
    WHEN 2 THEN 'Health Access & Community Well-being | White Impact Development Initiative'
    WHEN 3 THEN 'Civic Engagement & Digital Citizenship | White Impact Development Initiative'
    WHEN 4 THEN 'AI & Technology for the Next Generation | White Impact Development Initiative'
    WHEN 5 THEN 'Think Tank & Policy Innovation Lab | White Impact Development Initiative'
  END,
  cta_url = CASE id
    WHEN 1 THEN 'education-access-opportunity.html'
    WHEN 2 THEN 'health-access-community-well-being.html'
    WHEN 3 THEN 'civic-engagement-digital-citizenship.html'
    WHEN 4 THEN 'ai-technology-next-generation.html'
    WHEN 5 THEN 'think-tank-policy-innovation-lab.html'
  END,
  updated_at = NOW()
WHERE id IN (1, 2, 3, 4, 5);

-- Create the new referenced catalog rows before restoring Project foreign keys.
-- Each row is inserted once with its complete intended metadata.
INSERT INTO public.programs (
  slug, title, summary, description, body_copy, hero_image_url,
  hero_image_alt, card_icon, card_summary, page_url, cta_label, cta_url,
  status, status_label, status_detail, hero_stats, feature_items, objectives,
  activities, beneficiaries, locations, timeline, gallery, impact_metrics,
  stories, reports, partners, seo_title, seo_description, display_order,
  is_featured, is_active
)
VALUES
  (
    'career-pathways-future-readiness',
    'Career Pathways & Future Readiness',
    'Program information is being prepared.',
    'Program information is being prepared.',
    '[]'::jsonb, '', '', '●', 'Program information is being prepared.',
    'career-pathways-future-readiness.html', 'Learn more',
    'career-pathways-future-readiness.html', 'Active', 'Coming soon',
    'Program content is being prepared.', '[]'::jsonb, '[]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    'Career Pathways & Future Readiness | White Impact Development Initiative',
    'Program information is being prepared.', 3, FALSE, TRUE
  ),
  (
    'community-needs-research-action',
    'Community Needs Research & Action',
    'Program information is being prepared.',
    'Program information is being prepared.',
    '[]'::jsonb, '', '', '●', 'Program information is being prepared.',
    'community-needs-research-action.html', 'Learn more',
    'community-needs-research-action.html', 'Active', 'Coming soon',
    'Program content is being prepared.', '[]'::jsonb, '[]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    'Community Needs Research & Action | White Impact Development Initiative',
    'Program information is being prepared.', 5, FALSE, TRUE
  )
ON CONFLICT (slug) DO NOTHING;

-- The preserved Creative Lab child rows now belong to the approved Career
-- Pathways replacement, not to the repurposed Think Tank record.
UPDATE public.program_beneficiaries
SET program_id = (SELECT id FROM public.programs WHERE slug = 'career-pathways-future-readiness')
WHERE program_id = 5;
UPDATE public.program_locations
SET program_id = (SELECT id FROM public.programs WHERE slug = 'career-pathways-future-readiness')
WHERE program_id = 5;
UPDATE public.program_timeline
SET program_id = (SELECT id FROM public.programs WHERE slug = 'career-pathways-future-readiness')
WHERE program_id = 5;
UPDATE public.program_gallery
SET program_id = (SELECT id FROM public.programs WHERE slug = 'career-pathways-future-readiness')
WHERE program_id = 5;
UPDATE public.program_impact_metrics
SET program_id = (SELECT id FROM public.programs WHERE slug = 'career-pathways-future-readiness')
WHERE program_id = 5;
UPDATE public.program_reports
SET program_id = (SELECT id FROM public.programs WHERE slug = 'career-pathways-future-readiness')
WHERE program_id = 5;
UPDATE public.program_partners
SET program_id = (SELECT id FROM public.programs WHERE slug = 'career-pathways-future-readiness')
WHERE program_id = 5;

UPDATE public.projects
SET program_slug = CASE slug
  WHEN 'edu4all-community-outreach-2026' THEN 'education-access-opportunity'
  WHEN 'nextgen-ai-literacy-series' THEN 'ai-technology-next-generation'
  WHEN 'civic-accountability-workshops' THEN 'civic-engagement-digital-citizenship'
  WHEN 'creative-lab-story-campaigns' THEN 'career-pathways-future-readiness'
END
WHERE slug IN (
  'edu4all-community-outreach-2026',
  'nextgen-ai-literacy-series',
  'civic-accountability-workshops',
  'creative-lab-story-campaigns'
);

UPDATE public.impact_stories
SET related_program_slug = CASE related_program_slug
  WHEN 'edu4all' THEN 'education-access-opportunity'
  WHEN 'nextgen-civic-lab' THEN 'civic-engagement-digital-citizenship'
  WHEN 'nextgen-ai' THEN 'ai-technology-next-generation'
  ELSE related_program_slug
END
WHERE related_program_slug IN ('edu4all', 'nextgen-civic-lab', 'nextgen-ai');

-- Preserve the audited Creative Lab semantic mapping if the current
-- impact_stories table contains that legacy slug. No new Story is created.
UPDATE public.impact_stories
SET related_program_slug = 'career-pathways-future-readiness'
WHERE slug = 'creative-lab-community-voice';

-- Restore the five existing Program IDs that have deliberate replacements.
-- ID 5 remains intentionally empty until factual Think Tank content is approved.
UPDATE public.programs
SET
  summary = CASE WHEN id = 5 THEN 'Program information is being prepared.' ELSE summary END,
  description = CASE WHEN id = 5 THEN 'Program information is being prepared.' ELSE description END,
  body_copy = CASE WHEN id = 5 THEN '[]'::jsonb ELSE body_copy END,
  hero_image_url = CASE WHEN id = 5 THEN '' ELSE hero_image_url END,
  hero_image_alt = CASE WHEN id = 5 THEN '' ELSE hero_image_alt END,
  card_icon = CASE WHEN id = 5 THEN '●' ELSE card_icon END,
  card_summary = CASE WHEN id = 5 THEN 'Program information is being prepared.' ELSE card_summary END,
  cta_label = CASE WHEN id = 5 THEN 'Learn more' ELSE cta_label END,
  status_label = CASE WHEN id = 5 THEN 'Coming soon' ELSE status_label END,
  status_detail = CASE WHEN id = 5 THEN 'Program content is being prepared.' ELSE status_detail END,
  hero_stats = CASE WHEN id = 5 THEN '[]'::jsonb ELSE hero_stats END,
  feature_items = CASE WHEN id = 5 THEN '[]'::jsonb ELSE feature_items END,
  objectives = CASE WHEN id = 5 THEN '[]'::jsonb ELSE objectives END,
  activities = CASE WHEN id = 5 THEN '[]'::jsonb ELSE activities END,
  beneficiaries = CASE WHEN id = 5 THEN '[]'::jsonb ELSE beneficiaries END,
  locations = CASE WHEN id = 5 THEN '[]'::jsonb ELSE locations END,
  timeline = CASE WHEN id = 5 THEN '[]'::jsonb ELSE timeline END,
  gallery = CASE WHEN id = 5 THEN '[]'::jsonb ELSE gallery END,
  impact_metrics = CASE WHEN id = 5 THEN '[]'::jsonb ELSE impact_metrics END,
  stories = CASE WHEN id = 5 THEN '[]'::jsonb ELSE stories END,
  reports = CASE WHEN id = 5 THEN '[]'::jsonb ELSE reports END,
  partners = CASE WHEN id = 5 THEN '[]'::jsonb ELSE partners END,
  seo_description = CASE WHEN id = 5 THEN 'Program information is being prepared.' ELSE seo_description END,
  is_featured = CASE WHEN id IN (1, 2, 3, 4) THEN TRUE ELSE FALSE END,
  is_active = TRUE,
  updated_at = NOW()
WHERE id IN (1, 2, 3, 4, 5);
