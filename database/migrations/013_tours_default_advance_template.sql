-- Tour default advance layout template
-- When set, new advances for this tour auto-populate with this template's sections.
ALTER TABLE tours ADD COLUMN IF NOT EXISTS default_advance_template_id UUID REFERENCES advance_form_configs(id) ON DELETE SET NULL;
