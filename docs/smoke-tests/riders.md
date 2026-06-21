# Riders smoke tests

> Stage B fix: **Open → 404** (no operations-nested editor route) + **no
> Delete**. Map: `docs/handover/RIDERS_FIX_MAP.md`. ID prefix `RID`.

## Status snapshot (2026-06-11 — Stage B landed, needs-live)

| ID | Result | Note |
|----|--------|------|
| RID-01 | code-verified | Open: list row → operations editor route (no 404) |
| RID-02 | code-verified | shared body renders on both routes (extract, no dup) |
| RID-03 | code-verified | Delete: slide-over footer → confirm → DELETE → list drops + refresh |
| RID-04 | **needs-live** | "Loading packs…" rail (no code bug found — D5 live re-check) |
| RID-05 | **needs-live** | Create: "+ New rider pack" → POST → opens new pack's editor |

`tsc` 0 · `eslint` 0 · `next build --webpack` green (route
`ƒ /operations/[tourId]/riders/[id]` compiled).

---

## What changed (Stage B)

- **D1 — extract.** The editor body is now `RiderPackEditorView({ packId, mode,
  standalone })` (`src/components/rider-pack/RiderPackEditorView.tsx`). Both
  routes render it → **one source of truth**, byte-identical body.
- **D2 — chrome matches the list.** The riders LIST page renders inner content
  only; the Operations **layout** (`/operations/[tourId]/layout.tsx`) supplies
  `ProductShell` + `TourHeader`. So the new editor route passes
  `standalone={false}` (inner content → Operations-active chrome, same as the
  list). `/rider-packs/[id]` passes `standalone` → wraps in its own
  `ProductShell active={null}` (rider) / `builderAppPageShell` (channel_list).
- **D3 — both.** Row click pushes the **direct**
  `/operations/[tourId]/riders/[id]` (no redirect hop); the new page also makes
  the legacy `/tours/[id]/rider-packs/[packId]` → `/operations/...` redirect
  resolve.
- **D4 — delete.** `RiderPackDetailsSlideOver` footer → inline confirm →
  `DELETE /api/rider-packs/[id]` → optimistic row removal + `router.refresh()`.
- **D5 — loading rail.** Left untouched (no code bug found); live re-check.

## RID-01 — Open works (no 404)  ⟵ Adam, Chrome
**Do**: Operations → a tour → Riders → click a pack row.
**Expect**: the rider editor loads (full canvas / sections), **no 404**, inside
the Operations chrome. Also works via the legacy `/tours/[id]/rider-packs/[id]`
URL (redirect resolves).

## RID-02 — Editor identical on both routes
**Do**: Open the same pack at `/operations/[tourId]/riders/[id]` and at
`/rider-packs/[id]`.
**Expect**: the editor BODY is identical (shared `RiderPackEditorView`); only the
surrounding shell differs (Operations chrome vs the standalone Rider shell).
Channel-list packs still open the `PackEditor` path; `?mode=edit` → builder.

## RID-03 — Delete removes the pack  ⟵ Adam, Chrome
**Do**: In the Riders list, open a pack's `…` → **Delete pack** → confirm.
**Expect**: confirm copy "Delete "{title}"? … permanently removes the pack, its
sections, and its history. This can't be undone." On confirm: `DELETE
/api/rider-packs/[id]`, the row disappears from the list (optimistic + refresh),
and reopening it 404s. Blast radius = one pack (1:1 folder↔pack).

## RID-04 — "Loading packs…" rail (D5, live)
**Do**: In the editor, watch the left pack rail.
**Expect**: it resolves to the sibling packs. (No code bug found — the GET
accepts the rail's params + returns `{packs}`. If it's actually stuck, capture
the `/api/rider-packs` network status/timing — its own ticket.)

## RID-05 — Create a new rider pack  ⟵ Adam, Chrome
**Do**: On an **empty** Riders list (e.g. after deleting the only pack), click
**"+ New rider pack"** in the header.
**Expect**: `POST /api/rider-packs` with `{ scope:'tour', artist_id, tour_id }`
creates a folder + pack and the new pack's editor **opens** at
`/operations/[tourId]/riders/[newId]`. The button shows "Creating…" while in
flight; on error a toast appears and the list is unchanged. `artist_id` is the
tour's artist (added to the page's tour select; `tours.artist_id` is NOT NULL).

> Don't delete the editor body's other consumers: templates (assign-to-tour),
> channel-list/stage-plot, and the `/rider-packs/[id]` route are unchanged
> (shared body, same fetch).
