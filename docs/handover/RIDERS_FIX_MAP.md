# RIDERS_FIX_MAP — Stage A (map only, no code)

> Two bugs in the rider-packs list: **Open → 404** (no operations-nested editor
> route) and **no Delete**. Adam's call: the PROPER fix — create the
> operations-nested editor route (not a re-point), so riders live fully inside
> Operations. Decisions in §6, then stop.
>
> **Status:** Stage A. Awaiting review + D1–D5 before Stage B.

---

## 0. TL;DR

- The editor page `src/app/(app)/rider-packs/[id]/page.tsx` derives **everything
  from the pack id** — the `rider_packs` row carries `tour_id`/`artist_id`/
  `scope`/`kind`. It needs **no route tourId**. So the new route just renders the
  same page body for `params.id`.
- Redirect confirmed (`next.config.ts:82–83`): `/tours/:id/rider-packs/:packId`
  → `/operations/:id/riders/:packId`. **No page exists there → the 404.** The
  fix: create `operations/[tourId]/riders/[id]/page.tsx`.
- The list (`RiderPacksTourClient`) is **server-rendered** (`rows` is a prop) →
  refetch after delete = `router.refresh()` (+ optimistic local removal).
- DELETE exists + is **safe**: it deletes the pack's `rider_folders` row
  (1:1 folder↔pack, confirmed) → cascades to the pack + sections + its 90-day
  history. Blast radius = **one pack**.
- The "Loading packs…" rail has **no identifiable code bug** — the GET is
  correct; likely transient. Flag for live re-check, don't fix blind.

---

## 1. The editor page (the thing to re-mount tour-scoped)

`src/app/(app)/rider-packs/[id]/page.tsx` — **server component**, `dynamic =
'force-dynamic'`:
- `params: { id }`, `searchParams: { mode }` (`?mode=edit` → builder, else show).
- Loads `rider_packs` by id (`id, title, kind, scope, artist_id, tour_id,
  routing_id, updated_at`); `notFound()` if absent.
- **`kind='channel_list'`** → `builderAppPageShell(<PackEditor packId={id}/>)`
  (the legacy editor that mounts `ChannelListEditor`).
- **`kind='rider'`** → loads `rider_sections`, scope-context name, then renders:
  ```
  <ProductShell active={null} artistId tourId productName="Rider">
    <RiderPackSidebar scope contextId contextName activePackId={id}/>   (when contextId)
    isEdit ? <main><RiderPackHeader/><RiderBuilderShellClient packId/></main>
           : <main><RiderPackHeader/><RiderShowReadView packId/></main> + <RiderShowRightRail/>
  </ProductShell>
  ```
- The shells fetch their own data client-side by `packId`. **Conclusion: the
  page is fully a function of `packId`** — the new route can reuse the exact body.

## 2. The redirect (confirmed)

`next.config.ts`:
```
{ source: '/tours/:id/rider-packs/:packId', destination: '/operations/:id/riders/:packId' }  // L82–83
{ source: '/tours/:id/rider-packs',          destination: '/operations/:id/riders' }          // L87–88
```
`operations/[tourId]/riders/` has **only `page.tsx` (the list)** — no `[id]/`.
So `/operations/[tourId]/riders/[packId]` 404s. **The new page must live at
`src/app/(app)/operations/[tourId]/riders/[id]/page.tsx`.**

## 3. The list client (`src/components/tours/RiderPacksTourClient.tsx`)

- Mounted by the server page `operations/[tourId]/riders/page.tsx` (L65) which
  fetches `rider_packs` for the tour → `riderPackRowsFromServer` → `rows` prop.
- Row click (**:112–114**): `router.push('/tours/${tourId}/rider-packs/${row.id}')`
  → hits the redirect → 404 today.
- The trailing **`...` button** (:77–88) `setDetailsId(row.id)` → mounts
  `RiderPackDetailsSlideOver` (`src/components/entity/rider-pack/
  RiderPackDetailsSlideOver.tsx`) — **read-only** (Status / Sharing log /
  Comments; props `{ pack, onClose }`). No delete, no tourId.
- `rows` is a **prop, not state** → after a mutation, refresh via
  `router.refresh()` (re-runs the server page) + optimistic local removal needs a
  `useState(rows)`.

## 4. DELETE `/api/rider-packs/[id]` (ready + safe)

`src/app/api/rider-packs/[id]/route.ts` DELETE:
- Auth: `getUser()` → 401 if none. **No explicit role/admin check** (RLS on
  `rider_folders` scopes the delete to the workspace).
- Loads `before` (the pack); 404 if missing; 500 if `!before.folder_id`.
- **Deletes the `rider_folders` row by `before.folder_id`** → FK
  `ON DELETE CASCADE` removes the pack + sections (+ channel-list rows /
  sub-snakes / stage-boxes for channel packs) + the pack's **90-day history**.
- Returns `{ ok: true }`.
- **Blast radius = ONE pack:** `POST /api/rider-packs` creates "a rider_folders
  row + one rider_packs row" (route header L10–11) → **1:1 folder↔pack
  confirmed**, so the folder-keyed delete removes exactly this pack. ⚠ If legacy
  data ever put multiple packs in one folder, this would nuke siblings — not
  expected, but the confirm copy should say "pack + its sections + history".

## 5. The "Loading packs…" rail (investigated)

`src/components/rider-pack/RiderPackSidebar.tsx` (L57–135): `useEffect` fetches
`GET /api/rider-packs?scope=${scope}&(tour_id|artist_id)=${contextId}`, sets
`packs` (filtered to `kind==='rider'`), shows "Loading packs…" while `packs===
null`. The **GET handler accepts `scope`/`tour_id`/`artist_id` and returns
`{ packs }`** (verified `api/rider-packs/route.ts` GET L10–58) — params match,
shape matches.
- **No code bug found.** Stuck-on-loading would require the fetch to never
  resolve (hang) or the component to unmount mid-flight. Most likely **transient
  / slow dev server**, or it was observed on the 404'd operations URL where the
  whole page failed.
- **Recommendation:** don't fix blind. Re-check live after the Open fix; if it
  recurs, capture the `/api/rider-packs` network status + timing. Flagged as
  needs-live, **not** a Stage-B code change unless a real cause surfaces.

---

## 6. Decisions for Adam (D1–D5) — before Stage B

- **D1 — How to mount the editor at the new route.** The existing page body is
  a pure function of `packId`. Cleanest: **extract the body into a shared async
  component** (e.g. `RiderPackEditorView({ packId, mode })`) and have BOTH
  `/rider-packs/[id]` and `/operations/[tourId]/riders/[id]` render it (the new
  route ignores its `tourId` for data — the pack carries it — but the URL keeps
  riders inside Operations). Or just duplicate the page. *(Recommend extract a
  shared component — one source of truth, no divergence.)*
- **D2 — Product chrome on the new route.** The existing page uses
  `<ProductShell active={null} productName="Rider">`. Keep that verbatim on the
  operations-nested route (coherent shell; "inside Operations" satisfied by the
  URL), or switch to Operations-active chrome? *(Recommend reuse as-is — minimal
  risk; the editor is full-canvas anyway.)*
- **D3 — Row click target.** Keep `router.push('/tours/${tourId}/rider-packs/
  ${row.id}')` (relies on the redirect → new page), or push the **direct**
  `/operations/${tourId}/riders/${row.id}` (no redirect hop)? *(Recommend direct
  push — cleaner — AND still create the page so the redirect path also resolves
  for any existing `/tours/...` links.)*
- **D4 — Delete UI + copy.** Put Delete in the **`RiderPackDetailsSlideOver`
  footer** (a red "Delete pack" → confirm modal), wired to
  `DELETE /api/rider-packs/[id]`, optimistic remove + `router.refresh()`. Confirm
  copy: *"Delete "{title}"? This permanently removes the pack, its sections, and
  its history. This can't be undone."* Also add a row `…`-menu Delete, or
  slide-over only? *(Recommend slide-over footer only — the `…` already opens it;
  one place, less surface.)*
- **D5 — "Loading packs…" rail.** Agree it's **not a code bug** (GET + fetch are
  correct) → re-verify live after the Open fix, no blind change. Confirm.

---

## 7. Hard-rule compliance (Stage A)

- ✅ Both sides mapped; redirect rule + editor component + DELETE handler cited
  with line numbers; folder↔pack 1:1 verified (not guessed).
- ✅ Investigated the loading rail; found no code bug; flagged for live re-check.
- ⛔ **No code written.** Stopping for D1–D5 review.

### Stage B smoke IDs (placeholders — riders smoke file)
`docs/smoke-tests/riders.md` (+ Adam's manual → `SMOKE_QUEUE.md`):
- **RID-01** Open: list row → editor loads (no 404), full canvas + sections.
- **RID-02** New route `operations/[tourId]/riders/[id]` renders; `/rider-packs/[id]`
  still works; channel-list packs still open (PackEditor path).
- **RID-03** Delete: slide-over → confirm → `DELETE` → pack gone, list refreshes
  (optimistic + refresh), can't reopen.
- **RID-04** Delete blast radius = one pack (siblings on the tour untouched).
- **RID-05** (needs-live) "Loading packs…" rail resolves.
