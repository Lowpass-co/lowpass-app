# UX04 — Migrate Existing Pages onto PageShell

> Last prompt of Phase A (foundation). Every page in the app gets wrapped in `<PageShell>` from UX02. **Body content is unchanged** — only the chrome moves. Marks the retirement of the old left sidebar.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 3 (information architecture).
2. UX02 (must be merged). `<PageShell>`, `<TopBar>`, `<LeftRail>` exist.
3. UX03 (must be merged). `<SlideOver>` exists and Bug Reports uses it.
4. `src/app/(app)/layout.tsx` and any nested `layout.tsx` files — current shell structure.

---

## 1. Why this prompt exists

Phase A's goal is to land the new shell without breaking anything. By the end of UX04:
- Every page renders inside `<PageShell>`.
- The old sidebar component is unused (still in the repo for diff visibility, deleted in a follow-up after sign-off).
- Each page picks the correct LeftRail variant for its archetype.
- No existing functionality changes — just chrome.

This is the highest-risk migration prompt because it touches every page. Approach is mechanical: enumerate pages, map each to an archetype, swap layout.

---

## 2. Hard rules

1. **No body content changes.** Inside `<PageShell>`'s children slot, render the existing page body unmodified.
2. **No new behaviour.** No new features, no field additions, no API changes.
3. **Page archetype assignment is fixed by the table in §3.** Don't reclassify; if a page is unclear, default to `dashboard` and flag it in the PR description for the user.
4. **Don't delete the old sidebar code.** Move it to `src/components/_legacy/sidebar/` so the diff is visible. Final deletion is a follow-up.
5. **One page = one commit.** Atomic commits make rollback trivial if a page regresses.
6. **Verify visual parity per page.** For each migrated page, take a "before" mental snapshot of layout proportions and confirm "after" matches (TopBar at top, LeftRail at left, content where it was — just in a different chrome).
7. Lint + typecheck clean after every commit.
8. The current sidebar may have been mounted in `(app)/layout.tsx`. Replace that mount with PageShell mounted **per page**, not in the layout file. (PageShell composes its own header + rail; it doesn't expect a layout to provide them.)

---

## 3. Page → archetype mapping

| Route | Archetype | LeftRail variant | Notes |
|-------|-----------|-----------------|-------|
| `/dashboard` (or wherever the post-login landing is) | dashboard | `dashboard` (tour structure) | If no active tour, rail goes to `none` |
| `/tours` | list | `list` (filters: status, year) | All tours table |
| `/tours/[id]` (tour overview) | dashboard | `dashboard` (tour structure) | |
| `/tours/[id]/routing` | document | `docDays` | Day rail |
| `/tours/[id]/advance` | document | `docDays` | Day rail |
| `/tours/[id]/advance/[showId]` | document | `docDays` | Same rail, active day = showId |
| `/tours/[id]/budget` | spreadsheet | `spreadsheet` (sections: Income/Expenses/Hotels/Travel/Payroll) | |
| `/tours/[id]/personnel` | list | `list` (filters: role, employment status) | |
| `/tours/[id]/rooming` | spreadsheet | `spreadsheet` (sections per show or per hotel) | |
| `/tours/[id]/files` | list | `list` (filters: type, show, tag) | |
| `/tours/[id]/rider-packs` | list | `list` (filters: status, template) | |
| `/tours/[id]/rider-packs/[packId]` | builder | `docSections` | Pack editor |
| `/tours/[id]/channel-list` | spreadsheet | `spreadsheet` (sections per show or one) | |
| `/library` | list | `list` (filters by type) | |
| `/library/deal-memos` | list | `list` (filters: tour, status) | |
| `/library/personnel` | list | `list` (filters: role, last-toured) | |
| `/library/gear` | list | `list` (filters: ownership, type) | |
| `/library/mics` | list | `list` (filters: type) | Mic library from R-series |
| `/templates` | list | `list` | |
| `/bugs` | list | `list` (filters: status, severity) | Already uses SlideOver from UX03 |
| `/admin/shell-playground` | (no archetype) | already uses PageShell directly | UX02 surface; leave as-is |
| `/admin/design-tokens` | (no archetype) | leave as-is | UX01 surface |
| `/settings` | document | `docSections` (Account / Workspace / Billing / Integrations) | If no settings page exists, skip |
| Any other page | inspect, classify, list in PR | | |

If a route in the table doesn't exist in the codebase, skip it silently. If a route exists that isn't in the table, classify it and add it to the PR description.

---

## 4. Step 1 — Audit current routes

Walk `src/app/(app)/**/page.tsx` and produce a list of every route. For each, note:
- Path
- Whether it currently renders the old sidebar (likely all do)
- Whether it has a custom layout file in its tree

Output this audit at the top of the PR description so the user can confirm coverage.

---

## 5. Step 2 — Hoist TopBar + LeftRail data

Each page needs to supply:
- `TopBar` props: tours list, active tour, user. Most of this comes from server-side context already used by the current sidebar. Hoist it to a shared `getShellData()` function in `src/lib/shell/getShellData.ts`.
- `LeftRail` variant data:
  - `spreadsheet` / `docSections`: list of section labels + hrefs (page-specific, hardcoded or derived from tour data)
  - `docDays`: tour start/end dates + day list
  - `list`: filter definitions
  - `dashboard`: tour structure links

For variant data, create per-archetype helpers in `src/lib/shell/rails/`:
- `getSpreadsheetSections(tourId, page).ts`
- `getDocDays(tourId).ts`
- `getDocSections(page, context).ts`
- `getListFilters(page).ts`
- `getDashboardStructure(tourId).ts`

These are server-side functions that read from Supabase using existing helpers. Each is pure: same inputs → same outputs.

---

## 6. Step 3 — Migrate pages one at a time

For each route from §3, in this order:

1. `/admin/design-tokens` (already uses PageShell-equivalent — no work, audit only)
2. `/bugs` (smallest blast radius; verifies the migration pattern works)
3. `/dashboard`
4. `/tours`
5. `/tours/[id]` (tour overview)
6. `/library` and children
7. `/templates`
8. `/settings` (if exists)
9. `/tours/[id]/personnel`
10. `/tours/[id]/files`
11. `/tours/[id]/rider-packs` and children
12. `/tours/[id]/routing`
13. `/tours/[id]/advance` and children
14. `/tours/[id]/rooming`
15. `/tours/[id]/channel-list`
16. `/tours/[id]/budget` (largest; saved for last)

For each page:

1. Open the page's `page.tsx`
2. Identify where the old sidebar is mounted (likely in `(app)/layout.tsx` wrapping `{children}`)
3. Replace its content with:
   ```tsx
   const shellData = await getShellData();
   const railVariant = await get<Archetype>RailData(...);
   return (
     <PageShell
       topBar={<TopBar {...shellData.topBar} onCommandPaletteOpen={() => {/* UX08b */}} />}
       leftRail={<LeftRail variant={railVariant} />}
       archetype="<archetype>"
     >
       {/* existing page body, unchanged */}
     </PageShell>
   );
   ```
4. If `(app)/layout.tsx` previously wrapped children in the old sidebar, remove that wrapping (so PageShell isn't double-wrapped). The layout becomes a pass-through.
5. Lint + typecheck
6. Manually verify the page renders, content is intact, archetype's rail is correct
7. Commit with message: `UX04: migrate <route> to PageShell`

---

## 7. Step 4 — Retire old sidebar

After all pages migrate:

1. Move `src/components/sidebar/` (or wherever the old sidebar lives) to `src/components/_legacy/sidebar/`
2. Delete any imports of the old sidebar (search for usage; should be zero)
3. Update `(app)/layout.tsx` to its final pass-through form:
   ```tsx
   export default function AppLayout({ children }: { children: React.ReactNode }) {
     return <>{children}</>;
   }
   ```
4. Commit: `UX04: retire legacy sidebar (move to _legacy)`

The legacy folder stays in the repo until UX05 lands so we have a quick rollback. UX05's final commit deletes `_legacy/sidebar`.

---

## 8. Verification

Per page (do this for every page you migrate):
1. Navigate to it in dev (`npm run dev`)
2. Confirm TopBar at top, LeftRail at left (correct variant), content in main slot
3. Confirm body content is unchanged: every interactive element still works
4. Confirm dark mode still works
5. Confirm responsive: rail collapses below 1280px, hides below 768px

Repo-wide:
- `npm run lint` clean
- `npm run typecheck` clean
- No console errors on any page

---

## 9. Acceptance criteria

- [ ] Every page in `src/app/(app)/**/page.tsx` is wrapped in `<PageShell>` with the correct archetype + rail variant
- [ ] `(app)/layout.tsx` is a pass-through; no shell logic in it
- [ ] Old sidebar moved to `_legacy/`, no imports remain
- [ ] `getShellData()` and `get*RailData()` helpers exist and are pure server functions
- [ ] Bug Reports continues to use SlideOver from UX03 — visually unchanged
- [ ] No body content changes on any page
- [ ] Lint + typecheck clean
- [ ] PR description includes audit table mapping every route → archetype

---

## 10. Out of scope

- ❌ Don't change any page body. No new fields, no UI tweaks beyond chrome.
- ❌ Don't add new pages.
- ❌ Don't wire up Command Palette beyond a stub callback.
- ❌ Don't build DataTable or SpreadsheetGrid — that's UX05/UX06.
- ❌ Don't delete `_legacy/sidebar` yet; UX05 does the final clean.

---

## 11. Commit plan

One commit per migrated page, plus a final retirement commit. ~16-20 commits total. Push the branch incrementally so the user can review pages one at a time if desired.

---

## 12. Rollback plan

If a page regresses, revert that page's commit. Each commit is atomic per page. The legacy sidebar code is still in `_legacy/` if a full retreat is needed.
