/* Set the homepage impact metrics to the current approved reporting values. */

INSERT INTO public.impact_metrics (
  metric_key,
  label,
  value,
  display_prefix,
  display_suffix,
  category,
  sort_order,
  is_active
)
VALUES
  ('people_reached', 'People reached', 11000, '', '+', 'overview', 1, TRUE),
  ('communities_reached', 'Communities reached', 20, '', '+', 'overview', 2, TRUE),
  ('young_people_trained', 'Young people trained', 1500, '', '+', 'overview', 3, TRUE),
  ('social_engagements', 'Social media engagements', 5000, '', '+', 'overview', 4, TRUE)
ON CONFLICT (metric_key) DO UPDATE
SET
  label = EXCLUDED.label,
  value = EXCLUDED.value,
  display_prefix = EXCLUDED.display_prefix,
  display_suffix = EXCLUDED.display_suffix,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
