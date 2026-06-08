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
| BUD-15 | FIXED | optimistic section/line CRUD + `.maybeSingle()`; multi-select + delete work (Fix-pack A) |
| BUD-16 | FIXED | grouping now keyed on `section_id`; Category retired from UI (Fix-pack A/C) |
| BUD-17 | PASS→see BUD-26 | column resize now has visible handles |
| BUD-18 | PASS | phase strip hides with toggle (no reload) |
| BUD-19 | FIXED | click-to-rename templates + consistent picker (Fix-pack C) |
| BUD-20 | FIXED | summary reads live from `section_id`; no phantom sections (Fix-pack A) |

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

## Grid + nav overhaul (current)

Reference: "Warning Support" (populated) + a fresh empty tour for the picker.

#### BUD-21 — Burn bar
Open `/budget/[tour]`. One burn bar at the top: big **Remaining** + "of $X
budget"; a spent/budget **meter** ("$X spent · NN% used") with a thin
**Committed marker** on the same scale; the fill turns **red** past 100%;
a **Variance** read (arrow + colour, red over / green under) on the right.
No KPI cards.

#### BUD-22 — Quiet section headers
Every section group header reads **NAME · count** only — no
`est… · act… · var…` triplet; the filter bar shows just the row count. The
est/act/var summary lives only in the burn bar.

#### BUD-23 — Raised panel
The grid reads as a **raised panel** lifted off the page (lighter surface
bg than the page + border + visible shadow), not flat. Header + section
rows sit a step higher (`--lp-panel`). Channel-list + payroll grids are
raised the same way.

#### BUD-24 — Fills the width (name column flexes)
The grid fills the container; the **Item/description column stretches** to
absorb the leftover width — no dead band on the right. Numbers stay fixed
+ right-aligned. On ultra-wide the panel caps ~1600px and centres.
Horizontal scroll appears only when columns exceed the container.

#### BUD-25 — Density (app-wide, 3 levels)
Toggle = Compact / Comfortable / Spacious, **default Comfortable**.
Changing it resizes rows + text on the budget grid, the **Income tab**,
AND other grids (channel-list, payroll, a list like Personnel). Persists
on reload. (Shared with UI-05.)

#### BUD-26 — Column resize
Hover a column's right edge → handle appears (grab cursor); drag resizes
that column live; can't drag to zero; dragging the flex (name) column
starts from its **rendered** width (no jump). Widths **persist** on
reload; "Reset widths" restores defaults. Works on channel-list + payroll
too. (Shared with UI-07.)

#### BUD-27 — Two-band budget top
Budget top is **two bands** then content: product bar (Home · Operations ·
Budget · Advance, active = solid orange) → **one context band** (tour
identity + Summary · Expenses · Income tabs + Display/Export/Settings) →
burn bar → grid. Not four stacked layers. The tabs read as tabs and
switch correctly.

#### NAV-01 — Two-bar app nav
No left sidebar anywhere. The top product bar shows on every product;
hover a product → dropdown of its sub-pages → click lands directly (one
load). Each product, the workspace tabs (Artists/Personnel/Equipment), and
Settings/Venues/Bugs all load.

> These supersede the earlier BUD-15/16/20 failures (section CRUD,
> category-vs-section, summary refresh) — all resolved in Fix-pack A.

## Quick-fixes (feat/budget-quick-fixes — retest)

#### BUD-28 — Commissions add/remove in Settings

**Do**: Budget → Settings. Add a commission line, edit its % and basis,
delete one (confirm dialog).

**Expect**: Add/remove are optimistic (no full reload); the Summary P&L
recomputes to match (commission feeds `computeBudgetPnl`).

**Currently**: ❌ FAIL (2026-06-07) — no "add commission" button at all. The
CommissionsCard code never reached this branch: the popped stash only
carried receipts + density (see commit `86d26ce`), NOT
`BudgetSettingsTab.tsx`. The commissions work is stranded on the
`feat/budget-quick-fixes` worktree and must be recovered.

#### BUD-29 — Density toggle present + app-wide

**Do**: On the budget grid, use the density control in the context band:
Compact / Comfortable / Spacious.

**Expect**: Rows + text resize; the choice persists on reload; the same
control resizes the other grids (channel-list, payroll).

**Currently**: ❌ FAIL (2026-06-07) — no density control visible on the grid.
The toggle mount in `BudgetContextBand` either didn't render or was lost in
the `main` merge. Needs diagnosis.

#### BUD-30 — Receipts as a compact top button

**Do**: On the budget grid toolbar, click **"Receipts"**; drop a file on it
or open the popover.

**Expect**: A compact button + popover near the top of the grid (the old
bottom drop-zone is gone); upload/link works.

**Last verified**: 2026-06-07 (Adam, preview) — ✅ PASS, the Receipts button
is present in the toolbar.

## Known later

- Actual-vs-transactions override math (gates a `transactions.ts` refactor).
- Deliberate gaps: per-artist template override UI; drag-reorder;
  top-level "Line item"/Quick-Add still create section-less lines.
