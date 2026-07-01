# CC — Tour creation: one modal creator, retire the wizard. Build. Branch `feat/tour-create-modal-ui` off `main`.

Follow-up to the create-unblock (the `/tours/:id` UUID fix is merged; create works via the old full-page
wizard now). **Adam's decision stands: ONE export-style modal is the single tour creator; retire the wizard.**
The 404 fix already merged — this is the UX migration CC correctly deferred as a large cross-cutting refactor.
Prerequisite: `main` includes the merged tour-map-pins + routing-revamp + tour-create (UUID fix) stack.

> ## ⚙️ PER-PART PROTOCOL (every step)
> 1. **CHECK FIRST** — open the cited files, confirm shapes, cite file:line. Grep `/tours/create` to
>    enumerate EVERY entry point before touching anything.
> 2. **BUILD** in the safe order below.
> 3. **SMOKE** — prove it: the modal opens from each repointed entry point, a create round-trips (static path
>    + build; Adam drives the live authenticated create — see note). `tsc` 0 · `next build --webpack` green is
>    the floor, not the proof.
> 4. **PUSH + REPORT** — hash + evidence + which entry points you repointed (list them).
> 5. **The wizard delete is GATED** — only after grep proves zero remaining links/importers.
>
> ## INVARIANTS
> - Reuse `<Modal>` (`src/components/ui/Modal.tsx`) — don't roll new dialog chrome. Style like
>   `ExportTemplateEditor.tsx` (the modern chrome Adam likes), NOT the old wizard look.
> - Tokens only. Workspace-RLS unchanged. Keep the create submit path (`POST /api/tours` then
>   `/api/tours/[id]/routing`) — the flow works; you're re-housing the UI, not rewriting the data path.
> - A partial repoint that deletes the wizard while an entry point still links to it RE-BREAKS create. Delete last.

## Base to build from
- **Logic source:** `src/components/shell-v2/TourCreateSlideOver.tsx` already has the full 2-step flow (Tour
  info → embedded routing grid), validation, submit, and optimistic switcher-prepend. **Reuse its logic** —
  move it into a `<Modal size='lg'>` shell; don't rebuild the form from scratch.
- **Step 2 routing grid:** embed the **Part-2 restyled routing grid** (now on `main`) so step 2 matches the app.
- **Fields (from the live wizard, confirm parity):** artist (Existing/New toggle + picker), tour name,
  start/end date, continent/territories, currency, principal/band/crew counts.

## Build — in this safe order
1. **Shared modal host (the crux).** 8 entry points currently `router.push('/tours/create')`; they need to
   open the modal from anywhere. **Reuse the existing app-context pattern** (`DetailPanelContext`,
   `EntityRoutingProvider`, `ProductContext` in `src/contexts/`): add a `TourCreateProvider` +
   `useTourCreate()` exposing `openCreateTour(opts?)` / `openEditTour(id)`, mounted once high in the `(app)`
   tree next to the other providers, rendering the modal at root. Find where the existing providers mount and
   co-locate (don't mount per-page).
2. **Build the modal** — `<Modal size='lg'>` (export-editor visual style), TourCreateSlideOver's 2-step flow
   inside it, step 2 = the restyled routing grid. Remove the "full tour wizard" fallback link. Keep submit +
   validation identical.
3. **Repoint the switcher first** (`ArtistTourSwitcherClientWrapper.tsx:58,234`) from the slide-over to
   `useTourCreate().openCreateTour()`. Verify it opens + creates. Then retire `TourCreateSlideOver` (or keep
   it as the modal's inner body if that's cleaner — your call, but one creator only).
4. **Repoint the remaining 7 entry points** to `openCreateTour()` (grep `/tours/create` for the full list —
   CC previously enumerated: tours-list "New Tour" button + empty-state (`app/(app)/tours/page.tsx`),
   `AppTopBar`, `ShellTopBarClient`, `DashboardArtistGate`, `DashboardTourList`, `TourPicker`, `JobModal`).
   None should navigate to `/tours/create` after this.
5. **Rehome edit.** `DashboardTourCard` does `router.push('/tours/create?edit='+id)` → repoint to
   **`EditTourSlideOver`** (the canonical edit surface) via `openEditTour(id)` or its existing opener. **Confirm
   field parity** with the wizard's edit mode; if a field is missing, FLAG it — don't silently drop it.
6. **Delete the wizard — GATED.** Only after `grep -r "tours/create"` and an importer grep on `TourWizard`
   both return zero: delete `src/app/(app)/tours/create/page.tsx` + the `TourWizard` component. Build green
   after = proof nothing referenced them.
7. **Redirect cleanup (optional):** the `/tours/:id([0-9a-fA-F-]{36})` constraint can stay (harmless). With
   the page gone, `/tours/create` would 404 on fall-through, but nothing links to it — acceptable. Note it.

## Live verification (Adam's step — state it in the report)
A real authenticated tour INSERT can't be run headlessly (needs a DB/auth session). Build it so **Adam drives
the live create** from each entry point; CC provides the static-path + build verification and lists exactly
which entry points to test. **Do not claim a live create you didn't run.**

Smoke `TOUR-MODAL-01..`: modal opens from switcher + tours-list + topbar (+ the rest); 2-step flow renders with
the restyled routing grid on step 2; edit opens `EditTourSlideOver`; grep shows zero `/tours/create` links;
wizard deleted with build green.

## Final
- One branch, commit + PUSH, report hash + the entry-point list + any edit-field-parity gap found.
- No migration. If edit parity needs a schema touch, STOP and flag — don't invent columns.
