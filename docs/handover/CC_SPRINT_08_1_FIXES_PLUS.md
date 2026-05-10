# CC Sprint 8.1 — Sprint 8 fixes + new features (combined)

Adam smoked Sprint 8 and surfaced four issues + two new feature requests. Combined into one sprint per Adam's call.

The scope: structural fixes (Phase 4 layout restructure), small UX corrections (Phase 2 compressed bar drop + Phase 5 8a/8b corrections), AND two new features (multi-step TourCreateSlideOver with routing builder + delete tour with cascade).

This is the largest sprint to date. Five phases. Three sign-off gates. ~2-2.5 days CC time.

**Branch off `fix/sprint-8-polish-builders`** (NOT main — Sprint 8 is in-flight, not yet merged). Five commits + V verify.

---

## 0. Required reading

- `CLAUDE.md`
- `docs/handover/CC_SPRINT_08_POLISH_AND_BUILDERS.md` (context)
- `src/components/shell-v2/TourHeader.tsx` + `TourHeaderClient.tsx` — Phase 1 deletion target (compressed bar)
- `src/components/shell-v2/ArtistTourSwitcher.tsx` — Phase 1 trigger update (key stat); Phase 4 routing builder UX inherits its slide-over patterns
- `src/components/shell-v2/ProductShell.tsx` + `ProductHeader.tsx` — Phase 2 hoisting target
- `src/app/(app)/artists/[id]/page.tsx`, `/budget/[tourId]/page.tsx`, `/advance/[tourId]/page.tsx` (overview), `/advance/[tourId]/[routingId]/page.tsx`, `/operations/[tourId]/page.tsx` — Phase 2 mounts move to layouts
- `src/components/shell-v2/ArtistCreateSlideOver.tsx` — Phase 3 8a + 8b targets
- `src/components/shell-v2/TourCreateSlideOver.tsx` — Phase 4 multi-step rewrite
- `src/components/artists/ArtistsGrid.tsx` (or wherever the workspace `+ NEW ARTIST` button lives) — Phase 3 8a target
- `database/migrations/` — Phase 5 cascade audit; identify every table with `tour_id` FK and decide per-table cascade behavior
- `src/app/api/tours/route.ts` — Phase 5 needs a DELETE handler

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings.
4. Typecheck zero.
5. Build via `next build --webpack` only.
6. Five commits in numeric order: 1 → 2 → 3 → 4 → 5. One per phase.
7. Verify before claiming. Quote post-fix file:line for every acceptance criterion.
8. Visual fidelity is a hard requirement. Tokens-only. §1.5 Visual Language Manifesto applies in full.
9. Smooth animations are a hard requirement. Web Animations API for any non-trivial transitions. `prefers-reduced-motion` honored.
10. **Mockup sign-off required on Phase 4 (multi-step routing builder UX) and Phase 5 (delete confirmation modal UX)**. **Diagnosis sign-off required on Phase 2 (architecture change — layout hoisting has implications) and Phase 5 (cascade scope — which tables get deleted, which don't)**. Phase 1 + Phase 3 are mechanical.
11. **Batch sign-off requests like Sprint 7/8.** Phase 1 + 3 ship first as mechanical commits. Then post Phase 2 diagnosis + Phase 4 mockup + Phase 5 dual sign-off (cascade scope + delete confirmation mockup) as ONE batched chat message.
12. No protocol skips.
13. Out-of-scope list at the bottom — leave them alone.

---

## 2. Phase 1 — Drop compressed TourHeader bar; add key stat to switcher trigger (~60 min, mechanical)

### 2.1 Symptom (Adam's smoke)

> "It spills over the side navigation bar on the left side, and it also just mirrors the tour picker to be honest"

The Sprint 8 compressed bar overlaps ProductRail (layout bug: `position: fixed; left: 0; right: 0` ignores the 56px ProductRail) AND duplicates info already in the switcher trigger.

### 2.2 Fix scope

**Drop the compressed bar entirely.** Keep the expanded TourHeader at the top of each product page (it carries the visual hero). Drop the IntersectionObserver + sentinel + `<TourHeaderCompressed>` machinery.

In `src/components/shell-v2/TourHeaderClient.tsx`:
- Remove the sentinel `<div>`.
- Remove the IntersectionObserver effect.
- Remove the `<TourHeaderCompressed>` element.
- Keep only the entrance animation (fade-in + 4px translateY) on the expanded TourHeader.

**Add the key stat to the switcher trigger** (when on a tour-scoped page).

In `src/components/shell-v2/ArtistTourSwitcher.tsx` (the trigger render block, ~line 489-624):
- The trigger already shows: `[avatar] Artist Name · Tour Name [chevron]`.
- When on `/budget/[tourId]`, `/advance/[tourId]/*`, or `/operations/[tourId]/*`, append a third dot-segment showing the key stat: `[avatar] Artist Name · Tour Name · 96% SPENT [chevron]`.
- Stat picks per product (carry over from Sprint 8 §2.2):
  - Budget: `<spentPercent>% SPENT`
  - Advance: `<advanceCompletePercent>% COMPLETE`
  - Operations: `<crewCount> CREW`
- The stat data needs to flow to the trigger. Currently the wrapper holds tours but not per-tour stats. Either:
  - **(A)** Pass per-tour stats from the page (page.tsx already fetches them for TourHeader) down to the wrapper via a new prop. Simple.
  - **(B)** Wrapper fetches per-tour stats on demand. More expensive.
- Pick A. The page already has the stats; pass them through as a `currentTourStats` prop on the wrapper, then to the switcher trigger.
- When NOT on a tour-scoped page (e.g. `/artists/[id]`), no key stat — trigger shows `[avatar] Artist · Tour [chevron]` as before.

### 2.3 Acceptance

- [ ] No compressed bar on any product page. Scrolling the page does NOT cause any sticky bar to appear/disappear.
- [ ] Switcher trigger on `/budget/[X]` shows artist · tour · `<X>% SPENT` (or omitted dot+stat if % is null).
- [ ] Same on `/advance/[X]` and `/operations/[X]` with their respective key stats.
- [ ] On `/artists/[id]` (no tour selected, no product), trigger shows artist · tour as before, no key stat.
- [ ] Trigger still fits within ProductHeader's 48px height. If the third segment causes overflow, truncate the tour name first (already has `truncate` class).
- [ ] Lint + typecheck clean.

### 2.4 Quote in report

- The deleted IntersectionObserver / sentinel / compressed-bar block (cite line range that's now gone).
- The trigger JSX with the new key stat segment.
- The new `currentTourStats` prop wiring (wrapper → switcher).

### 2.5 Commit

`fix(shell-v2): drop compressed TourHeader bar; key stat moves into switcher trigger (Sprint 8.1 §1)`

---

## 3. Phase 3 — Workspace landing "+ NEW ARTIST" + name/Spotify merge (~45 min, mechanical)

(Phase 2 is the structural Phase 4 → renumbered Phase 2 next; this Phase 3 covers the small Phase 5 corrections from Sprint 8.)

### 3.1 Sub-bug 8a — Workspace landing "+ NEW ARTIST" 404s

**Symptom (Adam's smoke):** The `+ NEW ARTIST` button on `/artists` workspace landing navigates to `/artists/new` (placeholder per Sprint 7 §6.5 scope), which 404s. The slide-over from Sprint 8 lives in the switcher; this button doesn't open it.

**Fix:** Wire the workspace landing button to open the same ArtistCreateSlideOver via a wrapper. The page is server-rendered, so the button needs to live in a small client wrapper that owns the `[isOpen, setIsOpen]` state.

In whichever component renders the workspace landing's `+ NEW ARTIST` button (likely `src/components/artists/ArtistsGrid.tsx` or the page itself):
- Replace the `<Link href="/artists/new">` with a `<button onClick={() => setOpen(true)}>`.
- Mount `<ArtistCreateSlideOver open={open} onClose={() => setOpen(false)} onCreated={...}>` next to it.
- On created: same flow as the switcher version — optimistic prepend (locally, OR `router.refresh()` to re-fetch artists), navigate to `/artists/[new-id]`.

If the button render needs to become a client component, extract a thin `<NewArtistButton>` client component.

### 3.2 Sub-bug 8b — Merge name + Spotify search into one input

**Symptom (Adam's smoke):** "The 'name' field should be the spotify search box. not separate."

**Fix:** Refactor `ArtistCreateSlideOver`'s field block. Today it has two separate inputs (Name + Spotify search). Merge into one combined input that:

1. Single text input labeled "ARTIST NAME / SEARCH SPOTIFY". User types.
2. As they type (debounced 300ms), search Spotify in the background. If results, show a dropdown of top 5 artist results below the input.
3. User can:
   - **Pick a Spotify result** → fills `spotify_id`, `spotify_image_url`, `spotify_banner_url`. Locks the name to the picked artist's name. Shows a "✓ Linked to Spotify" indicator below input. `[× Unlink]` button to clear back to free-text.
   - **Ignore the dropdown** → submit creates artist with just the typed name; no Spotify link.
4. Submit button enabled when input is non-empty.

The pattern is "type-ahead linked". User flow stays at one input; Spotify is auto-discovered, opt-in to link.

### 3.3 Acceptance

**8a:**
- [ ] On `/artists` workspace landing, `+ NEW ARTIST` button opens the ArtistCreateSlideOver (NOT a 404).
- [ ] Submit creates artist + appears in workspace artists grid + navigates to `/artists/[new-id]`.

**8b:**
- [ ] ArtistCreateSlideOver has ONE combined input (name + Spotify search), not two.
- [ ] Typing populates Spotify dropdown after 300ms debounce.
- [ ] Picking a result links the artist (Spotify ID + image URLs filled).
- [ ] Submit without picking creates a free-text artist.
- [ ] `× Unlink` clears the link, returns to free-text mode.
- [ ] Lint + typecheck clean.

### 3.4 Quote in report

- Workspace landing button JSX + slide-over mount (post-fix).
- The combined-input refactor in ArtistCreateSlideOver.

### 3.5 Commit

`fix(shell-v2,home): workspace + NEW ARTIST opens slide-over; name/Spotify merged input (Sprint 8.1 §3)`

**Push commits 1 + 3 together. Then post the batched sign-off requests (Phase 2 diagnosis + Phase 4 mockup + Phase 5 dual sign-off) before committing 2 / 4 / 5.**

---

## 4. Phase 2 — Hoist ProductShell to per-product layouts (~90 min)

### 4.1 Goal (Adam's smoke)

> "still no smooth scroll between artist/tour in the picker, it just closes and re-opens"

Sprint 8's popstate fix addressed browser back/fwd. But same-route navigation (e.g. `/artists/[A]` → `/artists/[B]`) still remounts the page component, which remounts ProductShell + ProductHeader + the switcher wrapper. New wrapper instance = closed dropdown.

Fix: hoist ProductShell to per-product LAYOUTS so the wrapper instance persists across `[id]` changes within the same product silo.

### 4.2 Diagnosis (post to chat for sign-off)

Read each of these page.tsx files. Confirm where ProductShell is mounted (each currently mounts it inline in the page). Then propose the layout structure:

```
src/app/(app)/
  artists/
    [id]/
      layout.tsx          ← NEW: wraps ProductShell. Children = page.
      page.tsx            ← existing, drops the ProductShell mount.
  budget/
    [tourId]/
      layout.tsx          ← NEW: wraps ProductShell + (optionally) TourHeader.
      page.tsx            ← existing, drops the ProductShell mount.
      settlement/
        page.tsx          ← inherits the layout's ProductShell.
  advance/
    [tourId]/
      layout.tsx          ← NEW
      page.tsx            ← drops ProductShell mount; renders overview content.
      [routingId]/
        page.tsx          ← inherits layout; drops ProductShell mount.
  operations/
    [tourId]/
      layout.tsx          ← exists from Sprint 7? Verify.
      page.tsx            ← drops ProductShell mount.
      ... other sub-routes
```

For each layout: it does the server-side data fetch that ProductShell needs (artistId, tourId, productName), plus the data the TourHeader needs (artist row, tour row, stats). Mounts:

```tsx
export default async function BudgetLayout({ children, params }) {
  const { tourId } = await params;
  // ... server fetches ...
  return (
    <ProductShell active="budget" artistId={...} tourId={...}>
      <TourHeader product="budget" artistId={...} ... />
      {children}
    </ProductShell>
  );
}
```

The pages then just render their unique body content; ProductShell + TourHeader come from the layout, which is preserved across same-product `[id]` changes (e.g. budget/A → budget/B keeps the layout instance).

**Diagnosis post:**

```
Phase 2 diagnosis:
- Current ProductShell mount sites: <list of pages>
- Proposed layout sites: <list of new layouts>
- Pages becoming children-only: <list>
- TourHeader: moved to layouts? Or stays in pages?
- Risk: <any data flow issues with hoisting fetches to layouts>
```

Wait for Adam's sign-off.

### 4.3 Fix scope (subject to diagnosis)

For each product silo:
1. Create `layout.tsx` if it doesn't exist.
2. Hoist the server-side data fetches from page.tsx to layout.tsx.
3. Mount ProductShell + TourHeader in the layout (not the page).
4. Page returns just its content body (children of the layout).
5. Sub-routes (e.g. `/budget/[tourId]/settlement`) inherit the layout's ProductShell automatically.

### 4.4 Acceptance

- [ ] On `/artists/[A]`, click artist B in switcher → URL changes to `/artists/[B]`, page content updates BUT the switcher dropdown stays open showing B's tours pane (no close-and-reopen).
- [ ] Same for `/budget/[A]` → `/budget/[B]` (if user has multiple tours in different artists, can switch via switcher without dropdown closing).
- [ ] Cross-product navigation (e.g. `/artists/[A]` → `/budget/[X]`) still closes dropdown (different layout, expected).
- [ ] No regressions in any of the product surfaces — TourHeader still renders, ProductShell still renders, page content still renders.
- [ ] Lint + typecheck clean.

### 4.5 Quote in report

- Each new `layout.tsx` file (full content if ≤80 lines, else imports + render block).
- Each post-fix `page.tsx` showing the dropped ProductShell + TourHeader mounts.
- Diagnosis sign-off timestamp.

### 4.6 Commit

`refactor(app): hoist ProductShell + TourHeader to per-product layouts (Sprint 8.1 §2 — fixes cross-route picker close)`

---

## 5. Phase 4 — Multi-step TourCreateSlideOver with routing builder page 2 (~3 hr)

### 5.1 Goal (Adam's smoke)

> "the personnel section etc is less relevant than the routing for that tour. When adding a tour, the routing is essential, so the next PAGE of that sidebar, should be the routing builder condensed to fit and in the same design language."

Convert TourCreateSlideOver into a multi-step (2-page) slide-over. Page 1 = current tour fields. Page 2 = routing builder.

### 5.2 Mockup (post to chat for sign-off)

```
PAGE 1 — Tour info
┌────────────────────────────────────────────────────────┐
│  NEW TOUR · Tour info                              [×] │
├────────────────────────────────────────────────────────┤
│  ARTIST                                                 │
│  Good Neighbours    (auto from context, or picker)     │
│                                                         │
│  TOUR NAME *                                            │
│  [text input · autofocus]                               │
│                                                         │
│  START DATE *               END DATE *                  │
│  [date input]               [date input]                │
│                                                         │
│  CONTINENT *                                            │
│  [select: UK / EU / US / AUS / ASIA / GLOBAL / OTHER]   │
│                                                         │
│  CURRENCY                                               │
│  [select: GBP / USD / EUR / AUD]                        │
│                                                         │
│  PERSONNEL  (optional)                                  │
│  Principal: [#]   Band: [#]   Crew: [#]                │
│                                                         │
├────────────────────────────────────────────────────────┤
│                                  [Cancel]  [Next: Routing →]│
└────────────────────────────────────────────────────────┘

PAGE 2 — Routing
┌────────────────────────────────────────────────────────┐
│  NEW TOUR · Routing                                [×] │
├────────────────────────────────────────────────────────┤
│  ┌─ STEP 1 of 2 ──── 2 of 2 ────────────────────┐    │
│  │ ●○ Tour info  →  ●● Routing                  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Add show days for this tour. You can skip this step   │
│  and add routing later.                                 │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │ DATE       TYPE        VENUE        CITY       │   │
│  │ [date]     [select]    [text]       [text]   × │   │
│  │ [date]     [select]    [text]       [text]   × │   │
│  │ [date]     [select]    [text]       [text]   × │   │
│  │ [+ Add row]                                    │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│  Optional fields per row (collapsed):                   │
│  Address · Capacity                                     │
│                                                         │
├────────────────────────────────────────────────────────┤
│  [← Back]  [Skip & create]              [Create tour]   │
└────────────────────────────────────────────────────────┘
```

**Spec:**

- Step indicator at top of Page 2: dot-pattern showing 1 of 2 / 2 of 2.
- Routing rows: simple form rows (no virtualization). Each row:
  - **Date** (date input, required).
  - **Day type** (select: show / festival / travel / off / rehearsal / press / radio / tv — match existing day_type values from schema).
  - **Venue** (text, required).
  - **City** (text, required).
  - **Address** (optional, expandable).
  - **Capacity** (optional, expandable).
  - `[×]` to remove the row.
- `[+ Add row]` button below the list. Adds an empty row.
- Defaults to one empty row on initial open of page 2.
- Footer:
  - `[← Back]` returns to page 1 without saving.
  - `[Skip & create]` creates the tour with no routing rows.
  - `[Create tour]` creates the tour AND inserts the routing rows in one transaction.
- Validation: if routing rows are present, each row's required fields (date, venue, city, day_type) must be valid. If user skips, no validation needed.

**Implementation:**

- Reuse `<SlideOver>` primitive.
- Internal state machine: `step: 'tourInfo' | 'routing'`. Switch on Next/Back.
- Routing rows: array of `{ date, day_type, venue, city, address?, capacity? }` with stable IDs for React keys (use crypto.randomUUID).
- Submit:
  - POST `/api/tours` with tour fields → returns new tour ID.
  - If routing rows present: POST batch insert to `/api/tours/[tourId]/routing/batch` (write this if it doesn't exist) OR loop over per-row POSTs (simpler but more requests; pick batch if >5 rows expected).
  - On success: same flow as today — close, toast, optimistic prepend, navigate.

**Animation between pages:** smooth horizontal slide (page 1 slides left out, page 2 slides in from right). Same Web Animations pattern as the switcher's pane transitions. Reduced-motion → instant.

### 5.3 Acceptance

- [ ] `+ Create new tour` from switcher → slide-over opens on page 1 (Tour info).
- [ ] Filling page 1 + clicking "Next: Routing →" → smooth slide to page 2.
- [ ] Page 2 shows step indicator + routing rows.
- [ ] `[+ Add row]` adds empty row.
- [ ] `[×]` removes row.
- [ ] `[← Back]` returns to page 1 without losing entered fields.
- [ ] `[Skip & create]` creates tour with no routing.
- [ ] `[Create tour]` creates tour + routing rows in one flow.
- [ ] Validation: empty required fields prevent submit.
- [ ] On success: tour appears in switcher, page navigates.
- [ ] Animation between pages smooth, reduce-motion respected.
- [ ] Lint + typecheck clean.

### 5.4 Quote in report

- Mockup sign-off timestamp.
- The expanded TourCreateSlideOver step state machine.
- Page 2 routing rows JSX.
- Submit handler with both tour POST and routing batch POST.
- Routing batch endpoint if newly created.

### 5.5 Commit

`feat(shell-v2,api): multi-step TourCreateSlideOver with routing builder (Sprint 8.1 §4)`

---

## 6. Phase 5 — Delete tour with cascade + confirmation modal (~2.5 hr)

### 6.1 Goal (Adam's smoke)

> "We also need a way to DELETE tours. potentially on the cards in the picker, also in operations I suppose. There needs to be a DELETE confirmation because you lose a LOT of data when you do that. Need to make sure supabase also deletes all the relevant data, but not data that resides in other projects."

### 6.2 Cascade scope diagnosis (post to chat for sign-off)

**Investigation step:**

1. `grep -rn "tour_id" database/migrations/ | grep -i "REFERENCES tours"` — list every table that has a `tour_id` FK to `tours`.
2. For each table, decide:
   - **Cascade** (delete with the tour): tour-scoped data that loses meaning without the tour.
   - **NULL** (set tour_id NULL): data that survives the tour (e.g. a personnel record assigned to multiple tours).
   - **Restrict** (block deletion): data that should prevent deletion if present (e.g. payroll records for legal reasons — confirm with Adam if any).
3. Cross-check workspace-shared tables: `personnel`, `venues`, `artists`, `templates` should NEVER cascade-delete.

**Diagnosis post:**

```
Phase 5 cascade diagnosis:
- Tables with tour_id FK: <list>
- Cascade decisions per table:
  - <table>: CASCADE — <one-line reason>
  - <table>: NULL — <reason>
  - <table>: RESTRICT — <reason>
- Workspace-shared tables (NOT touched): personnel, venues, artists, templates
- Counts query (for confirmation modal):
  - <how the modal shows "15 shows, 247 line items, etc"; what queries fire>
- Migration approach: <single migration adding ON DELETE CASCADE/NULL/RESTRICT to existing FKs>
```

Wait for Adam's sign-off.

### 6.3 Confirmation modal mockup (post to chat for sign-off)

```
┌────────────────────────────────────────────────────────┐
│  DELETE TOUR · IRREVERSIBLE                       [×]  │
├────────────────────────────────────────────────────────┤
│                                                         │
│  You're about to permanently delete:                    │
│                                                         │
│   GOOD NEIGHBOURS · South Africa Aug '26               │
│                                                         │
│  This will delete:                                      │
│   · 15 shows                                           │
│   · 247 budget line items                               │
│   · 3 advance instances                                 │
│   · 12 personnel assignments (assignments only —       │
│     personnel records are workspace-shared)            │
│   · 8 rooming assignments                               │
│   · ...                                                 │
│                                                         │
│  This action cannot be undone.                          │
│                                                         │
│  Type DELETE to confirm:                                │
│  [text input]                                           │
│                                                         │
├────────────────────────────────────────────────────────┤
│                          [Cancel]  [Delete tour] (red)  │
└────────────────────────────────────────────────────────┘
```

**Spec:**

- Modal (NOT slide-over — modal feels more weighted for destructive actions).
- Lists exact counts of what will be deleted, fetched server-side via a `GET /api/tours/[tourId]/delete-preview` endpoint.
- "Type DELETE to confirm" — disabled `[Delete tour]` button until input exactly matches "DELETE" (case-sensitive).
- Delete button red (`var(--lp-status-error)` or equivalent, NOT orange — orange is functional accent, red is destructive).
- On confirm: DELETE `/api/tours/[tourId]` → cascade delete fires via the migration → 200 → toast "Tour deleted" → navigate to `/artists/[artistId]` (or workspace landing if user has no artist context).

### 6.4 UI mount points

**Picker cards (in switcher tour list):** add a `[…]` overflow menu on hover at the right edge of each tour row in the switcher. Menu items: "Delete tour…" (opens confirmation modal). Subtle, not always-visible.

**Operations page:** add a "Delete tour" item to the existing tour-edit menu OR a dedicated "Tour settings" section with Delete prominently in a "Danger zone" subsection at the bottom.

For Sprint 8.1, picker overflow is the priority. Operations page can be done in same sprint or as follow-up — CC's call based on time.

### 6.5 Migration

New migration file: `database/migrations/NNN_tour_cascade_delete.sql`. Per Adam's call:
- Hard delete (NOT soft-delete with deleted_at).
- ALTER each FK constraint per the cascade scope diagnosis.
- Idempotent: `ALTER CONSTRAINT IF EXISTS … DROP; ADD CONSTRAINT … ON DELETE CASCADE;` pattern.

### 6.6 API

New route handler: `DELETE /api/tours/[tourId]/route.ts`. Auth-gate, RLS-scoped (user must have permission on this tour's workspace), execute the delete, return 200.

New route: `GET /api/tours/[tourId]/delete-preview` returning the counts the modal displays.

### 6.7 Acceptance

- [ ] Tour row in switcher has overflow `[…]` menu on hover. Menu has "Delete tour…" item.
- [ ] Click "Delete tour…" → confirmation modal opens with counts populated.
- [ ] Counts accurate (verify against DB after delete).
- [ ] "Type DELETE" required to enable Delete button.
- [ ] Click Delete → cascade fires → all tour-scoped data removed → workspace-shared data preserved.
- [ ] Toast + navigation work.
- [ ] Lint + typecheck clean.

### 6.8 Quote in report

- Mockup sign-off timestamp.
- Cascade scope diagnosis sign-off.
- The migration file (full).
- DELETE route handler.
- delete-preview route handler.
- Confirmation modal component.
- Switcher overflow menu wiring.

### 6.9 Commit

`feat(api,shell-v2,db): tour delete with cascade + confirmation modal (Sprint 8.1 §5)`

---

## V. Verify (~30 min)

CC: walk these on the Vercel preview after all five phases land.

1. Phase 1 — no compressed bar on any product page. Switcher trigger shows artist · tour · key stat on tour-scoped pages. PASS / FAIL.
2. Phase 2 — on `/artists/[A]`, click artist B in switcher → URL changes to `/artists/[B]`, dropdown stays open (no close-and-reopen). PASS / FAIL.
3. Phase 2 regression — cross-product nav (`/artists/[A]` → `/budget/[X]`) still closes dropdown (expected). PASS / FAIL.
4. Phase 3 8a — on `/artists`, `+ NEW ARTIST` opens slide-over. PASS / FAIL.
5. Phase 3 8b — ArtistCreateSlideOver has ONE combined name/Spotify input. Search dropdown appears on type. PASS / FAIL.
6. Phase 4 — TourCreateSlideOver page 1 → "Next: Routing →" → smooth slide to page 2. Routing rows editable. Skip OR Create works. PASS / FAIL.
7. Phase 5 — Switcher tour row hover → overflow menu → "Delete tour…" → confirmation modal with accurate counts. PASS / FAIL.
8. Phase 5 — Type DELETE + click Delete → tour gone, cascade verified (check Supabase: tour_id-FK rows deleted, workspace-shared rows preserved). PASS / FAIL.
9. `prefers-reduced-motion: reduce` → all animations collapse to instant. PASS / FAIL.
10. Console clean.
11. Lint baseline 75/120. Typecheck zero. `next build --webpack` succeeds.

---

## When done — report exactly this format

```
Sprint 8.1 done. Branch: fix/sprint-8.1-fixes-plus
Vercel preview: <URL>

Commits in order:
- 1: <hash> fix(shell-v2): drop compressed TourHeader bar; key stat in trigger
- 2: <hash> refactor(app): hoist ProductShell + TourHeader to per-product layouts
- 3: <hash> fix(shell-v2,home): workspace + NEW ARTIST opens slide-over; name/Spotify merged input
- 4: <hash> feat(shell-v2,api): multi-step TourCreateSlideOver with routing builder
- 5: <hash> feat(api,shell-v2,db): tour delete with cascade + confirmation modal

Phase 2 diagnosis posted at <ts>, signed off at <ts>.
Phase 4 mockup posted at <ts>, signed off at <ts>.
Phase 5 cascade scope posted at <ts>, signed off at <ts>.
Phase 5 confirmation modal mockup posted at <ts>, signed off at <ts>.

Quoted post-fix lines:
[Phase 1] deleted compressed-bar block + new key-stat trigger JSX + stat prop wiring
[Phase 2] each new layout.tsx + each post-fix page.tsx
[Phase 3] workspace landing button + slide-over mount + combined-input refactor
[Phase 4] step state machine + routing rows JSX + submit handler + batch route
[Phase 5] migration file + DELETE route + delete-preview route + modal component + switcher overflow menu

V.1-11 results:
1. <pass/fail>
... (all 11)

Lint <X errors / Y warnings>. Typecheck zero. Build OK.
```

---

## Out of scope this sprint (DO NOT touch)

1. **Operations page tour delete** — Phase 5 prioritizes the picker overflow; if there's spare time, add the operations page delete too. Otherwise defer.
2. **Soft-delete / undelete** — Adam picked hard-delete with confirmation. Soft-delete is its own sprint if needed.
3. **TourWizard retirement** — slide-overs are now feature-complete (multi-step + routing). Wizard retirement is the next sprint after this proves out.
4. **Workspace-wide activity feed** — still placeholder.
5. **Edit profile slide-over** for `/artists/[id]` — still wires to legacy edit page.
6. **Logo upload UI** — fallback chain still handles missing logos.
7. **Phase 4 Operations migration** — Personnel / Channel List / Payroll / Rooming / Files placeholder pages.
8. **Status pill 10s + page reload** autosave.
9. **Custom field plus button** broken.
10. **404 pages have no return-to-home button**.
11. **Print button regression** in read mode.
12. **Five baseline `react-hooks/set-state-in-effect` errors** in ArtistTourContext.
13. **Spotify search genre extension** — ArtistCreateSlideOver's genre auto-fill still won't populate (search endpoint doesn't return genres). Sprint 9 candidate.
14. **AdvanceOverviewStatsStrip orphan deletion** — file stays on disk; cleanup sprint.

If you find another bug while doing this sprint — note it in the report's "out of scope, deferred" section. Don't fix it.
