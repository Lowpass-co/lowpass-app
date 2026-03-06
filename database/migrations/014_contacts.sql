-- ============================================
-- LOWPASS — Workspace Contact Book
-- Migration 014
--
-- Contacts persist across all tours and artists.
-- Used by Key Contacts advance section.
-- ============================================

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT '',
  venue_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_venue ON contacts(workspace_id, venue_name);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_select" ON contacts FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "contacts_insert" ON contacts FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "contacts_update" ON contacts FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "contacts_delete" ON contacts FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- Key Contacts advance section template (platform-wide)
INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types) VALUES
(NULL, 'section', 'Key Contacts', 'Show contacts — promoter, venue rep, production', 'users', '[]'::jsonb, ARRAY['show', 'festival', 'rehearsal']);
