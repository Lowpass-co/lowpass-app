# CC — Riders list: fix Open (proper route) + add Delete

Two diagnosed bugs in the rider-packs list (`RiderPacksTourClient.tsx`), confirmed
live via Chrome:

1. **Open → 404.** A row's click does
   `router.push('/tours/[tourId]/rider-packs/[id]')` (`RiderPacksTourClient.tsx:113`).
   `next.config.ts` redirects every `/tours/[id]/*` → its product-prefixed
   equivalent → **`/operations/[tourId]/riders/[id]`**, which **has no page** (only
   the list at `/operations/[tourId]/riders` exists). So the redirect lands on a
   404. The editor itself works at **`/rider-packs/[id]`** (verified — full canvas,
   Edit template, sections panel).
2. **No Delete.** The row's `…` opens `RiderPackDetailsSlideOver` — read-only (no
   delete). But the backend is ready: **`DELETE /api/rider-packs/[id]`** exists
   (cascade delete).

**Adam's call: the PROPER fix — create the operations-nested editor route, NOT a
re-point.** Riders should live fully inside the Operations product.

## ⛔ Gated: Stage A (map, no code) → review → Stage B

### Stage A — map (NO code) → `docs/handover/RIDERS_FIX_MAP.md`
1. What `src/app/(app)/rider-packs/[id]/page.tsx` mounts (the editor component +
   the data it loads) — the thing to re-mount tour-scoped.
2. The exact `next.config.ts` redirect rule for `/tours/[id]/rider-packs/[packId]`
   → confirm the target is `/operations/[tourId]/riders/[id]` (so the new page
   must live there).
3. `RiderPacksTourClient` — the row click (`:113`), the `…`/
   `RiderPackDetailsSlideOver` mount, and how the list refetches after a mutation.
4. `DELETE /api/rider-packs/[id]` — its response + any guards (workspace/role).
5. ⚠ Investigate the **stuck "Loading packs…" left rail** in the editor (I saw it
   not resolve) — is it a real bug or just slow? Note it; fix only if trivial +
   in-scope.
6. Decisions for Adam (e.g. does the editor need the tour context the top-level
   route doesn't get?). Then stop.

### Stage B — build (after the map is approved)
1. **Create `src/app/(app)/operations/[tourId]/riders/[id]/page.tsx`** mounting the
   existing rider editor (the same component `/rider-packs/[id]` renders), scoped
   to the tour, inside the Operations product chrome. The
   `/tours/[id]/rider-packs/[packId]` redirect now resolves → **Open works.**
   Don't break the existing `/rider-packs/[id]` route.
2. **Add a Delete action** to the row (a `…` menu item and/or in
   `RiderPackDetailsSlideOver`), gated by a **confirm** ("This deletes the pack and
   its sections — undoable? no → confirm"), wired to `DELETE /api/rider-packs/[id]`,
   optimistic remove + refetch the list.
3. (If trivial) fix the stuck "Loading packs…" rail.

## Hard rules
- Map both sides; cite the redirect rule + the editor component; don't guess.
- Tokens; `next build --webpack`; tsc 0; eslint 0; don't regress the rider editor,
  the `/rider-packs/[id]` route, templates, or the channel-list/stage-plot flows.
- **Verify before claiming** — name files/lines; mark build vs needs-live. I
  Chrome-verify Open (row → editor loads, no 404) + Delete (removes the pack, list
  refreshes) on the preview.
- Land smoke IDs in a riders smoke file + add Adam's manual smokes to `SMOKE_QUEUE.md`.
