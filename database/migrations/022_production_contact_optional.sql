-- Venue Production Contact: make optional (was required in seed)
UPDATE advance_templates
SET fields = (
  SELECT jsonb_agg(
    CASE WHEN (elem->>'id') = 'production_contact'
      THEN jsonb_set(elem, '{required}', 'false'::jsonb)
      ELSE elem
    END
  )
  FROM jsonb_array_elements(fields) AS elem
)
WHERE name = 'Production'
  AND template_type = 'section';
