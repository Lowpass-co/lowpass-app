# Claude Code prompt — Budget Fix-pack A (correctness)

> Run on branch `feat/budget-grid-usable` AFTER Adam commits the current
> changes. Fixes the real failures from the 2026-06-05 smoke run
> (BUD-15/16/20). Polish + Stage 3 are separate prompts — stay in scope.

## Hard rules
- Edit only budget files: `src/components/budget/*`, `src/app/api/budget/*`,
  `src/app/(app)/budget/[tourId]/page.tsx`, budget types. No migrations
  needed (if you think you need one, STOP and ask — numbering starts at 200).
- **Preserve the existing optimistic line-edit machinery** in
  `BudgetSpreadsheetView.tsx` (`optimistic` state, `commitLineEdit`,
  `allLines`, the `[lines]` clear effect). Reuse its PATTERN for sections.
- Token-clean (`var(--lp-…)` / `color-mix`). `npx eslint` 0 errors;
  `tsc --noEmit` clean. Show the diff + line ranges per file. Do not claim
  done without showing it. Commit nothing.

## Task 1 — Optimistic section/line CRUD + fix the `.single()` crash
Symptoms: creating/renaming/deleting sections (and lines) is slow,
reverts until a manual refresh, and sometimes throws "Cannot coerce the
result to a single JSON object."

1. In every budget API route under `src/app/api/budget/sections/*` and
   `src/app/api/budget/templates/*` (and check `line-items`), find
   `.single()` calls. Replace with `.maybeSingle()` and handle the null
   case with a clear JSON error, OR ensure inserts use
   `.select().single()` on a row that definitely exists. The crash is a
   `.single()` returning 0 rows (RLS filter or a delete/return mismatch).
2. Give section create / rename / delete the SAME optimistic treatment as
   `commitLineEdit`: apply the change to local state immediately, fire the
   request, roll back + toast on failure, and do NOT `router.refresh()` on
   success (it caused the full-page reload — the grid already proved the
   pattern). The section list, group headers, settings editor, and summary
   must reflect changes instantly without a manual refresh.
3. **Delete line is broken** (pauses, doesn't delete). Trace the delete
   path (DELETE `/api/budget/line-items`), make it work, and remove the
   row optimistically.

## Task 2 — `section_id` is the single grouping source (kill the category split)
Symptoms (BUD-16/20): renaming a line's category doesn't move it; lines
can be added to "categories" that aren't real sections; the summary lists
sections that aren't in the grid.

1. The grid groups by `section_id` → `budget_sections` ONLY. Stop using
   the free-text `category` for grouping/labels. Leave the `category`
   column in the DB (back-compat) but ignore it in the UI.
2. Moving a line between sections = a dropdown of EXISTING sections that
   writes `section_id`. Remove any path that creates a section/category
   implicitly by typing free text on a line.
3. New lines — the top-level "Line item" button and Quick-Add — must take
   a `section_id` (default to the section the user added from, or the
   first section; if zero sections exist, create/scaffold one first).
   Never create a section-less line that lands in "Uncategorised".
4. The Summary per-section rollup must read `budget_sections` joined to
   lines by `section_id`, so it matches the grid 1:1 (no phantom/missing
   sections).

## Task 3 — Multi-select
Selecting many lines is hard. Add: a header "select all" checkbox, and
shift-click range selection on the row checkboxes, feeding the existing
bulk action bar (mark status / delete). Make bulk delete actually work
(see Task 1.3).

## Verify
eslint 0 + tsc clean on every touched file. Then re-walk BUD-15, BUD-16,
BUD-20 from `docs/smoke-tests/budget.md` and report which now pass, with
the diff + line ranges. Flag anything you couldn't verify statically for
Adam to click-test.
