# Cursor Prompt — HOTFIX-1: delete-advance wipes entire show (data-loss bug)

Paste this whole file into Cursor. Execute in order. Do not skip steps. Do not add scope beyond what is listed. This is a data-loss bug fix — precision matters more than speed.

---

## Context

When the user clicks **Delete** on an advance row in the advance overview list, the whole show (routing row) disappears from the tour. Expected behaviour: only the advance questionnaire data is cleared; the show date, venue, city etc. stay in the tour.

### Root cause (already located)

Server handler `src/app/api/tours/[id]/advance/[routingId]/route.ts` at lines ~378–418 deletes from the `routing` table instead of `advance_instances`:

```ts
// WRONG — destroys the show row, not the advance data
const { data: deletedRouting, error: deleteRoutingErr } = await supabase
  .from('routing')
  .delete()
  .eq('id', routingId)
  .eq('tour_id', tourId)
  .select('id');
```

### Cascade safety note

`advance_comments.advance_instance_id` has `ON DELETE CASCADE` (see `database/migrations/001_initial_schema.sql:248`). So deleting the `advance_instances` row automatically cleans up associated comments. No manual cleanup needed.

### Caller

`src/app/(app)/tours/[id]/advance/AdvanceOverview.tsx` around line 674 calls the endpoint and uses `DeleteConfirmationModal` with `itemName={rowLabel}` — the show name/date. The modal heading ends up reading "Delete Berlin, 14 Jun 2026?" which doesn't make clear whether it's the advance or the show being deleted. Fix label + add explicit description.

---

## Goal

1. **Server:** rewrite the DELETE handler to remove the `advance_instances` row (keyed by `routing_id`) and leave `routing` untouched.
2. **Client:** make the confirmation modal's heading and description spell out exactly what is being deleted.

No new endpoints, no schema changes, no new dependencies.

---

## Files to modify

### 1. `src/app/api/tours/[id]/advance/[routingId]/route.ts`

Replace the entire `DELETE` handler (current lines ~378–418) with the corrected version below. The `GET` / `PUT` / etc. handlers above it stay untouched.

```ts
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; routingId: string }> }
) {
  const { supabase, user } = await ensureAuth();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: tourId, routingId } = await params;
  const tour = await ensureTourAccess(supabase, tourId);
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  // Validate the routing row belongs to this tour. We do NOT delete it.
  const { data: routingRow, error: routingErr } = await supabase
    .from('routing')
    .select('id')
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .single();

  if (routingErr || !routingRow) {
    return NextResponse.json({ error: 'Routing date not found' }, { status: 404 });
  }

  // Delete ONLY the advance_instances row for this routing.
  // advance_comments cascades via ON DELETE CASCADE.
  // The routing row itself stays intact — the show remains on the tour.
  const { data: deletedInstance, error: deleteInstanceErr } = await supabase
    .from('advance_instances')
    .delete()
    .eq('routing_id', routingId)
    .select('id');

  if (deleteInstanceErr) {
    return NextResponse.json({ error: deleteInstanceErr.message }, { status: 500 });
  }

  if (!deletedInstance?.length) {
    // No advance was ever created for this show — nothing to clear.
    return NextResponse.json(
      { error: 'No advance exists for this show yet' },
      { status: 404 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
```

### 2. `src/app/(app)/tours/[id]/advance/AdvanceOverview.tsx`

Find the `<DeleteConfirmationModal>` invocation around line 669–685. Update the `itemName` and add a `description` so the heading + body make it unambiguous.

Before:

```tsx
<DeleteConfirmationModal
  open={deleteOpen}
  itemName={rowLabel}
  onClose={() => setDeleteOpen(false)}
  onConfirm={async () => {
    const res = await fetch(`/api/tours/${tourId}/advance/${item.routing_id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Failed to delete advance');
    }
    showToast('Advance deleted');
  }}
  onDeleted={() => {
    setDeletingFade(true);
    setTimeout(() => onDeleted?.(), 200);
  }}
/>
```

After:

```tsx
<DeleteConfirmationModal
  open={deleteOpen}
  itemName={`advance for ${rowLabel}`}
  description="Only the advance questionnaire data is cleared. The show itself stays on the tour — you can start a new advance for this date any time."
  onClose={() => setDeleteOpen(false)}
  onConfirm={async () => {
    const res = await fetch(`/api/tours/${tourId}/advance/${item.routing_id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Failed to delete advance');
    }
    showToast('Advance cleared');
  }}
  onDeleted={() => {
    setDeletingFade(true);
    setTimeout(() => onDeleted?.(), 200);
  }}
/>
```

Three changes:
- `itemName` → `advance for ${rowLabel}` so the modal heading reads "Delete advance for Berlin, 14 Jun 2026?"
- `description` added, matching the actual behaviour.
- Toast text → `"Advance cleared"` (more accurate than "deleted" since the show persists).

---

## Hard rules — do not break

1. Do **not** modify the `GET`, `PUT`, `PATCH`, or any other HTTP handler in the route file. Only `DELETE`.
2. Do **not** change the `DeleteConfirmationModal` component itself — it already accepts `description`.
3. Do **not** alter `routing` table behaviour anywhere. If a user ever wants to delete a whole show row, that'll be a separate feature on the routing page.
4. Do **not** add cascade-delete logic for `advance_comments` — the DB already handles this via `ON DELETE CASCADE` on the FK.
5. Do **not** change the frontend state/list invalidation logic. The existing `onDeleted` callback + optimistic fade is fine; the row disappears from the list because its advance `status` changes, not because the routing row is gone.
6. Do **not** touch the sidebar's `TourRoutingList` — that lists routing rows, which continue to exist after this fix.

---

## Acceptance criteria (run through each before finishing)

- [ ] `npx tsc --noEmit --skipLibCheck` is clean.
- [ ] `npm run lint` does not add new errors.
- [ ] Create an advance for any show, fill in some data. Go back to the advance overview list. Click **Delete** on that row. Confirm in modal.
  - Modal heading reads **"Delete advance for {city}, {date}?"** not "Delete {city}, {date}?".
  - Modal body shows the new description line.
- [ ] After confirming delete:
  - Toast shows "Advance cleared".
  - Row disappears (or reverts to "no advance started") from the overview list.
  - **The show itself is still visible** in the `TourRoutingList` sidebar and on the routing page. City, date, venue all unchanged.
- [ ] Re-visit `/tours/<tourId>/advance/<routingId>` — advance loads fresh/empty, not a 404.
- [ ] If you try to delete an advance for a show that never had one created: API returns 404 with `{ error: "No advance exists for this show yet" }`. Modal surfaces the error text.
- [ ] DB sanity check (if you have access): `SELECT id FROM routing WHERE id = '<routingId>'` returns 1 row. `SELECT id FROM advance_instances WHERE routing_id = '<routingId>'` returns 0 rows.
- [ ] Open any comment thread on a pre-deletion advance before deletion, then delete — the cascade removed the comments with the advance_instance (i.e. no orphan rows).

---

## Verification commands (run after implementation)

```bash
npx tsc --noEmit --skipLibCheck
npm run lint

# Confirm no other code paths still .delete() the routing table from an advance endpoint
git grep -n "from('routing')" src/app/api/tours/ | grep -i delete
# Expected: no matches inside advance/* routes; matches only in /api/tours/[id]/routing/route.ts are fine.
```

Paste output into the PR description.

---

## Out of scope for this PR (explicitly defer)

- Adding a separate "delete whole show / delete routing row" button on the routing page → feature, not a bug fix. Separate PR.
- Audit of other DELETE endpoints for similar cross-table bugs → separate pass (worth doing once Phase A0 lands; add to backlog).
- Changing behaviour when no advance exists (e.g. auto-creating one) → no, 404 is correct.
- Restoring / soft-delete / trash bin → out of scope; Phase D (versioning) is where undo lives long-term.

---

## Output format expected from Cursor

1. Diff of the two files touched (`route.ts` and `AdvanceOverview.tsx`).
2. `npx tsc --noEmit --skipLibCheck` output (should be empty).
3. Output of the `git grep` check.
4. A short note on any deviations.

Then stop. Do not auto-continue into A0.3 or any other PR.
