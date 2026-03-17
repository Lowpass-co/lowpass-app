# Cursor Prompt 04: Rich Line Items & Notion-Style Detail Panel

## Prerequisites

- Prompts 01-03 completed
- Day View, Spreadsheet View, and InlineEditCell all exist

## Context

**Stack**: Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase.

**Goal**: Every budget line item becomes a rich object. Clicking any line item (in Day View or Spreadsheet View) opens a right slide-over panel showing notes, attachments, linked items, and history. This is the Notion-style "page peek" feature.

## Database Migration

Create `database/migrations/024_rich_line_items.sql`:

```sql
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

CREATE POLICY "Users can manage attachments in their workspace" ON budget_line_item_attachments
  FOR ALL USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage notes in their workspace" ON budget_line_item_notes
  FOR ALL USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- Indexes
CREATE INDEX idx_attachments_line_item ON budget_line_item_attachments(line_item_id);
CREATE INDEX idx_notes_line_item ON budget_line_item_notes(line_item_id);
```

Run this migration against Supabase using:
```bash
psql "$SUPABASE_DB_URL" -f database/migrations/024_rich_line_items.sql
```

## API Routes

### Create `src/app/api/budget/line-items/[id]/details/route.ts`

**GET** — Fetch all details for a line item:
```typescript
// Returns: { attachments: [], notes: [], linked_items: [] }
// Fetch attachments: supabase.from('budget_line_item_attachments').select('*').eq('line_item_id', id).order('uploaded_at', { ascending: false })
// Fetch notes: supabase.from('budget_line_item_notes').select('*').eq('line_item_id', id).order('created_at', { ascending: false })
// Fetch linked items: if line_item has linked_item_ids, fetch those line items from budget_line_items
// Run all 3 queries in parallel with Promise.all
```

### Create `src/app/api/budget/line-items/[id]/attachments/route.ts`

**POST** — Upload attachment:
```typescript
// Accept multipart form data
// Upload file to Supabase storage bucket 'budget-files' at path: {workspace_id}/line-items/{line_item_id}/{filename}
// Create record in budget_line_item_attachments
// Return the attachment record
```

**DELETE** — Remove attachment:
```typescript
// Delete from Supabase storage
// Delete from budget_line_item_attachments
```

### Create `src/app/api/budget/line-items/[id]/notes/route.ts`

**POST** — Add note:
```typescript
// Insert into budget_line_item_notes with content, created_by, note_type
// Return the note record
```

### Modify `src/app/api/budget/line-items/route.ts`

Add support for the new fields in PATCH:
- `status` (validate against allowed values)
- `tags` (array of strings)
- `linked_item_ids` (array of UUIDs)

## Frontend Components

### 1. LineItemDetailPanel (the slide-over)

Create `src/components/detail-panel/LineItemDetailPanel.tsx` ('use client'):

```typescript
interface LineItemDetailPanelProps {
  lineItemId: string | null; // null = panel closed
  tourId: string;
  onClose: () => void;
}
```

**Renders as a fixed-position right slide-over:**
- Width: `w-[480px]` on desktop, `w-full` on mobile
- Position: `fixed top-0 right-0 h-full z-50`
- Background: `bg-lp-bg border-l border-lp-border shadow-2xl`
- Backdrop: `fixed inset-0 bg-black/20` (click to close)
- Slide animation: `transition-transform duration-200 ease-out` + `translate-x-0` (open) / `translate-x-full` (closed)

**Panel layout:**
```
┌─ AUDIO HIRE ──────────────────────── ✕ ─┐
│                                          │
│  Category: Production > Audio            │
│  Status: [draft ▾]                       │
│  Proposed: £2,500    Actual: £0          │
│  Applies to: Whole tour / 22 May         │
│                                          │
│  ── Overview │ Files │ Links │ History ── │
│                                          │
│  [Tab content here]                      │
│                                          │
└──────────────────────────────────────────┘
```

**Header section** (always visible):
- Line item label as heading (`text-lg font-bold`)
- Close button (✕) top-right
- Category shown as breadcrumb: "Production > Audio + Backline"
- Status dropdown (InlineEditCell type: select, options: draft/quoted/approved/paid/disputed)
- Status badge colours: draft=grey, quoted=blue, approved=green, paid=green-dark, disputed=red
- Proposed + Actual amounts
- Context: "Whole tour" if no routing_id, or the date + venue if routing_id is set

**Tab: Overview (default)**
- Notes section: list of notes in reverse chronological order
- Each note shows: content, author name, timestamp
- "Add note" textarea at the bottom with submit button
- Notes save via `POST /api/budget/line-items/{id}/notes`

**Tab: Files**
- Grid of attachment cards (2 columns)
- Each card: file icon (based on type), filename, file size, upload date, small "×" to delete
- Upload area at bottom: drag-and-drop zone OR click to upload button
- Upload via `POST /api/budget/line-items/{id}/attachments` (multipart form)
- File type icons: PDF=red, image=blue, doc=blue, other=grey

**Tab: Links**
- List of linked line items
- Each linked item: category badge + label + amount
- Click a linked item → panel navigates to that item (replace current content)
- "+ Link item" button opens a searchable dropdown of all line items in this tour
- Linking saves via `PATCH /api/budget/line-items` with updated `linked_item_ids`

**Tab: History**
- Chronological list of all notes with `note_type` = 'status_change', 'approval', 'system'
- Auto-generated entries when status changes
- Format: "16 Mar 2026 — Status changed to 'approved' by Adam"

### 2. Integration with Day View

Modify `src/components/day-view/DayBudgetPanel.tsx`:
- Each line item row gets an expand icon (→ arrow or small icon) on the right
- Clicking the expand icon (or clicking the line item label) opens `LineItemDetailPanel` with that `lineItemId`
- The panel renders as a sibling overlay, not inside the DayCard

### 3. Integration with Spreadsheet View

Modify all grid components in `src/components/spreadsheet-view/`:
- Each grid row gets a small indicator if the line item has attachments or notes (tiny dot/badge after the label)
- Clicking the label cell (not the amount cells) opens `LineItemDetailPanel`
- This means label cells are NOT inline-editable via click — they open the detail panel instead. Label editing happens inside the panel.

### 4. Detail panel state management

Create `src/contexts/DetailPanelContext.tsx`:

```typescript
interface DetailPanelContextType {
  openLineItemId: string | null;
  openLineItem: (id: string) => void;
  closePanel: () => void;
}
```

Wrap the tour layout with this provider so any component in the tour pages can open the detail panel.

Add the `<LineItemDetailPanel>` render in the tour layout (or in a shared component that wraps all tour sub-pages).

## Files to create

1. `database/migrations/024_rich_line_items.sql`
2. `src/app/api/budget/line-items/[id]/details/route.ts`
3. `src/app/api/budget/line-items/[id]/attachments/route.ts`
4. `src/app/api/budget/line-items/[id]/notes/route.ts`
5. `src/components/detail-panel/LineItemDetailPanel.tsx`
6. `src/contexts/DetailPanelContext.tsx`

## Files to modify

1. `src/app/api/budget/line-items/route.ts` — add status/tags/linked_item_ids to PATCH handler
2. `src/components/day-view/DayBudgetPanel.tsx` — add expand icon per line item
3. All grid components in `src/components/spreadsheet-view/` — add indicator + click-to-open on labels
4. `src/app/(app)/tours/[id]/layout.tsx` (create if doesn't exist) or the parent layout — render DetailPanelProvider + LineItemDetailPanel

## Files to NOT modify

- Do NOT touch advance components
- Do NOT touch the Summary tab
- Do NOT modify existing budget_line_items table structure beyond the ALTER statements above

## Supabase storage

- Bucket name: `budget-files` (create if it doesn't exist)
- Path pattern: `{workspace_id}/line-items/{line_item_id}/{filename}`
- Max file size: 10MB
- Allowed types: pdf, png, jpg, jpeg, gif, doc, docx, xls, xlsx

## Do NOT

- Do NOT use a rich text editor for notes — plain textarea is fine for now
- Do NOT add real-time subscriptions — this is a single-user-at-a-time feature for now
- Do NOT install any file upload libraries — use native `<input type="file">` + FormData
- Do NOT add drag-and-drop for file upload — simple click-to-upload is fine for V1
- Do NOT create a separate page for the detail panel — it must be a slide-over overlay
