# Cursor Prompt 00: Fix Advance File Saving Bug

## Priority: CRITICAL — Fix before anything else

## The Bug

When a user uploads a file in the advance section builder (Important Documents), the file uploads to Supabase storage correctly and the document record gets saved to `advance_instances.data`, BUT the "Important Documents" section definition is never persisted to `advance_form_configs.sections`. On page reload, the section disappears because it only existed in local React state.

## Root Cause

In `src/app/(app)/tours/[id]/advance/[routingId]/AdvanceSectionBuilder.tsx`, around lines 1980-1985:

```typescript
const newSection = { template_id: IMPORTANT_DOCUMENTS_KEY, label: 'Important Documents', fields: [] as FieldDef[], order: advance.sections.length };
onUpdate({ sections: [...advance.sections.map((s, i) => ({ ...s, order: i })), newSection] });
```

This `onUpdate()` call updates local React state but does NOT trigger a save of the updated sections array to the `advance_form_configs` table. The sections are stored in `advance_form_configs.sections` (JSONB), not in `advance_instances.data`.

## The Fix

### Step 1: Find the section persistence mechanism

Look at how other section additions are persisted. The form config is saved via the `/api/tours/[id]/advance` POST or PATCH endpoint. Find where `advance_form_configs.sections` is updated elsewhere in the codebase and replicate that pattern.

### Step 2: After adding the Important Documents section to local state, also persist it

After the `onUpdate({ sections: [...] })` call that adds the Important Documents section, add a fetch call to persist the updated sections array to the form config:

```typescript
// After updating local state, persist the section to the form config
const updatedSections = [...advance.sections.map((s, i) => ({ ...s, order: i })), newSection];
onUpdate({ sections: updatedSections });

// Persist to database
try {
  await fetch(`/api/tours/${tourId}/advance`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      form_config_id: advance.form_config_id,
      sections: updatedSections,
    }),
  });
} catch (err) {
  console.error('Failed to persist Important Documents section:', err);
}
```

### Step 3: Verify the PATCH endpoint handles section updates

Check `src/app/api/tours/[id]/advance/route.ts` — make sure the PATCH handler accepts a `sections` field in the body and updates `advance_form_configs.sections` for the given `form_config_id`.

If the PATCH endpoint doesn't support this, add it:

```typescript
// In the PATCH handler
if (body.sections && body.form_config_id) {
  const { error } = await supabase
    .from('advance_form_configs')
    .update({ sections: body.sections, updated_at: new Date().toISOString() })
    .eq('id', body.form_config_id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update sections' }, { status: 500 });
  }
}
```

## Files to modify

1. `src/app/(app)/tours/[id]/advance/[routingId]/AdvanceSectionBuilder.tsx` — the `setImportantDocuments` function (around line 1975-1990)
2. `src/app/api/tours/[id]/advance/route.ts` — the PATCH handler (if it doesn't already support section updates)

## Files to NOT modify

- Do NOT touch the upload endpoint (`src/app/api/upload/advance-file/route.ts`) — it works fine
- Do NOT change the `advance_instances.data` save logic — it works fine
- Do NOT change any other advance section behaviour

## Testing

1. Navigate to any tour advance page (e.g., `/tours/{id}/advance/{routingId}`)
2. Upload a file to the Important Documents section
3. Refresh the page
4. The Important Documents section should still be visible with the uploaded file
5. The file should be downloadable/viewable

## Do NOT

- Do NOT add any new npm packages
- Do NOT change the file upload flow
- Do NOT modify the AdvanceSectionBuilder's rendering logic
- Do NOT change any existing section templates
