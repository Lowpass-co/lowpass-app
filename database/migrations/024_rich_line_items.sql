-- Rich Line Items: status, tags, linked items, attachments, notes
-- Run: psql "$SUPABASE_DB_URL" -f database/migrations/024_rich_line_items.sql

-- Add status and tags to existing budget_line_items
ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'quoted', 'approved', 'paid', 'disputed'));
ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS linked_item_ids UUID[] DEFAULT '{}';

-- Line item attachments (quotes, invoices, photos)
CREATE TABLE IF NOT EXISTS budget_line_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id UUID NOT NULL REFERENCES budget_line_items(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

-- Line item notes / activity log
CREATE TABLE IF NOT EXISTS budget_line_item_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id UUID NOT NULL REFERENCES budget_line_items(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  note_type TEXT DEFAULT 'note' CHECK (note_type IN ('note', 'status_change', 'approval', 'system'))
);

-- RLS policies
ALTER TABLE budget_line_item_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_line_item_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage attachments in their workspace" ON budget_line_item_attachments;
CREATE POLICY "Users can manage attachments in their workspace" ON budget_line_item_attachments
  FOR ALL USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage notes in their workspace" ON budget_line_item_notes;
CREATE POLICY "Users can manage notes in their workspace" ON budget_line_item_notes
  FOR ALL USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_attachments_line_item ON budget_line_item_attachments(line_item_id);
CREATE INDEX IF NOT EXISTS idx_notes_line_item ON budget_line_item_notes(line_item_id);
