-- Deal Info section and tm_only flag for TM-view-only sections
ALTER TABLE advance_templates ADD COLUMN IF NOT EXISTS tm_only boolean NOT NULL DEFAULT false;

INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types, tm_only) VALUES
(NULL, 'section', 'Deal Info', 'Guarantee, guest list, transport, backline – TM view only', 'file-text', '[
  {"id": "guarantee", "label": "Guarantee", "type": "currency", "required": false},
  {"id": "guest_list", "label": "Guest List", "type": "textarea", "required": false, "placeholder": "Number + details"},
  {"id": "transport_from_promoter", "label": "Transport from Promoter", "type": "textarea", "required": false},
  {"id": "backline_provisions", "label": "Backline Provisions", "type": "textarea", "required": false},
  {"id": "deal_notes", "label": "Notes", "type": "textarea", "required": false},
  {"id": "deal_memo_file", "label": "Deal Memo (PDF/image)", "type": "file", "required": false}
]'::jsonb, ARRAY['show', 'festival'], true);
