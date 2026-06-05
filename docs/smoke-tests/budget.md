# Budget smoke tests

> **Last run**: 2026-06-05 on `feat/budget-grid-usable` preview — full
> Phases B–E. ID prefix `BUD`; IDs never recycled.

Reference tour: "Warning Support". Templates picker needs a NEW empty tour.

## Status snapshot (2026-06-05)

| ID | Result | Note |
|----|--------|------|
| BUD-01/02/06/07/09 | PASS | inline edit, persistence, title-only open, totals |
| BUD-10/11 | PASS | migration 200 applies; existing budgets load |
| BUD-13 | PASS | picker works; **make modal + prettier**; default to Budget tab (DONE) |
| BUD-14 | PASS | fixed: no longer flags template lines as duplicates (DONE) |
| BUD-15 | **FAIL** | section/line create-rename-delete unreliable (no optimistic; `.single()` error); no multi-select; delete broken |
| BUD-16 | **FAIL** | grouping still keyed on free-text `category`, not `section_id` |
| BUD-17 | PASS | needs visible drag handles |
| BUD-18 | PASS | fixed: phase strip now hides with toggle (DONE); was refresh-only |
| BUD-19 | PASS | need click-to-rename template; dropdown style inconsistent |
| BUD-20 | **FAIL** | summary refresh-only + lists phantom/old sections |

## Fixed this pass (retest on next deploy)

- **Budget is the landing tab** (BUD-13) — `resolveBudgetTab` defaults to `budget`.
- **No duplicate warning on $0 lines** (BUD-14/15) — `detectDuplicates` skips zero-cost pairs.
- **Phase strip hides when tracking off** (BUD-18) — gated on `track_phases` in `page.tsx`.

## Open — correctness (the real failures)

- **Section CRUD has no optimistic updates + a `.single()` bug.** Create
  /rename/delete sections (and lines) are slow, revert until refresh,
  and throw "Cannot coerce the result to a single JSON object" (a
  `.single()` on a row RLS/returns 0). Same disease the line grid had —
  apply optimistic updates to section ops; swap `.single()` →
  `.maybeSingle()` / return the written row. (BUD-15, BUD-18, BUD-20.)
- **Section model is half-migrated** (`category` vs `section_id`).
  Renaming a line's category doesn't move it between sections; you can
  add lines to categories that aren't real sections; the summary shows
  sections that aren't in the grid. `section_id` must be the single
  grouping source: move a line = pick an existing section (dropdown), no
  free-text orphan categories. (BUD-16, BUD-20.)
- **Delete line is broken** (paused, didn't delete). (BUD-15.)
- **No multi-select** — need shift-click + select-all so bulk ops are
  usable. (BUD-15.)

## Open — UX / polish

- Empty-state picker should be a **modal over the screen**, not an inline
  menu; make it prettier (UX/UI + 21st). (BUD-13.)
- Visible **drag handles** for resizable columns + rows. (BUD-17.)
- **Click-to-rename templates**; the template-contents dropdown should
  match the Advance section style for consistency. (BUD-19.)
- Unclear **add-line / delete-section** buttons. (BUD-15.)
- Slide-over still doesn't match the grid design language. (BUD-04, prior.)
- IA: "too many ways to find things" — consolidate toward a single
  spreadsheet surface.

## Open — Stage 3 (income + spreadsheet maths) — newly requested

- **Income as its own tab**: guarantees, predicted merch sales, VIP.
- **Formula rows**: cost-of-goods % deduction; management commission +
  agent commission (one net, one gross); contingency %. Net P&L bottom
  line. DB already has `budget_income` / `budget_commissions` /
  `budget_settings` (insurance/contingency/accountancy %).
- Goal: spreadsheet-level calculation, not hand-typed totals.

## Templates

- BUD-13 presets are "okay, not quite right." Adam will build the correct
  ones; then persist them site-wide as system/workspace templates
  (template-authoring + save flow needed).

## Known later

- Actual-vs-transactions override math (gates a `transactions.ts` refactor).
- Deliberate gaps: per-artist template override UI; drag-reorder;
  top-level "Line item"/Quick-Add still create section-less lines.
