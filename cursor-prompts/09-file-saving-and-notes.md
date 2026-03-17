# Prompt 09 — Fix File Saving + Line Item Notes

## Bug 1 — Advance file saving: files don't persist or appear

### What's broken
In the Advance section (`src/app/(app)/tours/[id]/advance/[routingId]/`), when a user
uploads a file in the "Important Documents" section (or any document section), the file
appears briefly but does not persist on reload. The user also cannot name the file before
uploading.

### Root cause
`onUpdate()` in the section builder only updates local React state. It doesn't call
`PATCH /api/advance/form-config/[routingId]` to persist the section data including
the file reference to `advance_form_configs`.

### Fix

**Step 1 — Find where file upload happens**

Look in `src/app/(app)/tours/[id]/advance/[routingId]/AdvanceSectionBuilder.tsx`
(or wherever the document upload UI lives). Find the file input / upload handler.

**Step 2 — Add a file name input before upload**

Before the file input button, add a text input for the file name:
```tsx
<input
  type="text"
  placeholder="File name (optional)"
  value={pendingFileName}
  onChange={(e) => setPendingFileName(e.target.value)}
  className="w-full rounded-md border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:outline-none focus:ring-1 focus:ring-lp-orange"
/>
```
If the user doesn't enter a name, use the original filename (without extension).

**Step 3 — Upload to Supabase storage**

Files go in the `advance-files` bucket (already exists). Path: `{workspace_id}/{routing_id}/{timestamp}-{filename}`

Use the existing Supabase client. After upload, get the public/signed URL.

**Step 4 — Persist to database**

After successful upload, call PATCH on the advance form config to update the section's
file list. The file entry should include:
```ts
{
  id: crypto.randomUUID(),
  name: pendingFileName || originalFileName,
  url: signedUrl,
  size: file.size,
  type: file.type,
  uploaded_at: new Date().toISOString(),
}
```

**Step 5 — Display uploaded files**

Files should render as a list below the upload button. Each row:
- File icon (use `FileText` from lucide-react for docs, `Image` for images)
- File name (clickable, opens in new tab)
- File size (formatted: "2.4 MB")
- Upload date (formatted: "14 Mar 2026")
- Delete button (x icon, removes from DB and storage)

Use `rounded-lg border border-lp-border bg-lp-surface/50 px-3 py-2` for each row.

---

## Bug 2 — Line item notes: no author, no edit, no delete

### What's broken
In `src/components/detail-panel/LineItemDetailPanel.tsx`, the Notes tab shows notes but:
1. No author name or timestamp shown
2. Notes cannot be edited after posting
3. Notes cannot be deleted

### Fix

**Step 1 — Update the note data model**

The `budget_line_item_notes` table already has: `id, line_item_id, workspace_id, note, created_at`.
It needs `author_id` (already in migration as a UUID FK to profiles).

In `src/app/api/budget/line-items/[id]/notes/route.ts`:
- On POST: set `author_id` from the authenticated user's ID
- On GET: join with profiles to get author name:
  ```ts
  .select('*, author:profiles(id, name, avatar_url)')
  ```

**Step 2 — Update LineItemDetailPanel notes rendering**

In the Notes tab of `src/components/detail-panel/LineItemDetailPanel.tsx`:

Each note should render as:
```
┌─────────────────────────────────────────┐
│ [Avatar] Adam Rowley        14 Mar 14:23 │
│          This is the note text here.     │
│                         [Edit] [Delete]  │
└─────────────────────────────────────────┘
```

- Avatar: 28px circle, initials if no avatar_url (same style as sidebar)
- Author name: `text-[13px] font-semibold text-lp-text`
- Timestamp: `text-[11px] text-lp-text-tertiary` (format: "14 Mar 14:23")
- Note text: `text-[13px] text-lp-text-secondary leading-relaxed`
- Edit/Delete: small icon buttons, only visible on hover of the note row
  - Edit: pencil icon, `text-lp-text-tertiary hover:text-lp-text`
  - Delete: trash icon, `text-lp-text-tertiary hover:text-red-500`
- Container: `rounded-xl border border-lp-border bg-lp-surface/50 p-3 space-y-1.5`

**Step 3 — Inline edit**

When Edit is clicked:
- Replace the note text with a `<textarea>` pre-filled with the note content
- Same styling as the note input box
- Two buttons below: "Save" (orange) and "Cancel" (ghost)
- On Save: PATCH `/api/budget/line-items/[id]/notes/[noteId]` with `{ note: newText }`

Create the PATCH handler in `src/app/api/budget/line-items/[id]/notes/route.ts`:
```ts
export async function PATCH(req, { params }) {
  // auth check, then:
  const { noteId, note } = await req.json();
  // update budget_line_item_notes where id = noteId and workspace_id matches
}
```

**Step 4 — Delete note**

On Delete click: show a simple confirm (`window.confirm` is fine for now).
On confirm: DELETE `/api/budget/line-items/[id]/notes/[noteId]`

Create the DELETE handler:
```ts
export async function DELETE(req, { params }) {
  const { noteId } = await req.json();
  // delete from budget_line_item_notes where id = noteId and workspace_id matches
}
```

Remove the note from local state optimistically (before server response) then revalidate.

---

## Style reference

All components must match the existing detail panel style in `LineItemDetailPanel.tsx`:
- Background: `bg-lp-surface/50` on cards
- Borders: `border-lp-border`
- Text: `text-lp-text`, `text-lp-text-secondary`, `text-lp-text-tertiary`
- Orange: `text-lp-orange`, `bg-lp-orange`, `ring-lp-orange`
- Spacing: consistent `p-3`, `gap-2`, `space-y-2`
