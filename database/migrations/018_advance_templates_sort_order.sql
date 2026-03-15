-- advance_templates: add sort_order for library drag-to-reorder (workspace sections)
ALTER TABLE advance_templates
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN advance_templates.sort_order IS 'Display order in library (workspace templates only).';
