-- Restore the approved canonical order without changing any other Program data.
DO $$
DECLARE
  matched_programs INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO matched_programs
  FROM public.programs
  WHERE id IN (1, 2, 3, 4, 5, 6, 7)
    AND slug IN (
      'education-access-opportunity',
      'ai-technology-next-generation',
      'career-pathways-future-readiness',
      'civic-engagement-digital-citizenship',
      'community-needs-research-action',
      'health-access-community-well-being',
      'think-tank-policy-innovation-lab'
    );

  IF matched_programs <> 7 THEN
    RAISE EXCEPTION 'Program display-order correction precondition failed';
  END IF;
END $$;

UPDATE public.programs
SET display_order = CASE id
  WHEN 1 THEN 1
  WHEN 4 THEN 2
  WHEN 6 THEN 3
  WHEN 3 THEN 4
  WHEN 7 THEN 5
  WHEN 2 THEN 6
  WHEN 5 THEN 7
END
WHERE id IN (1, 2, 3, 4, 5, 6, 7);
