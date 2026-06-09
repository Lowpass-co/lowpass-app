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

**Last verified**: 2026-06-07 (Adam, preview) — ✅ PASS after the `main`
merge brought `BudgetSettingsTab` in. Follow-up (redesign): move commissions
out of Settings into a budget tab so it's not buried.

#### BUD-29 — Density toggle present + app-wide

**Do**: On the budget grid, use the density control in the context band:
Compact / Comfortable / Spacious.

**Expect**: Rows + text resize; the choice persists on reload; the same
control resizes the other grids (channel-list, payroll).

**Last verified**: 2026-06-07 (Adam, preview) — ✅ PASS once the merge
conflict in `BudgetContextBand` was resolved. Follow-up (redesign): the grid
now has two toolbars split by the summary bar — too cluttered; consolidate.

#### BUD-30 — Receipts as a compact top button

**Do**: On the budget grid toolbar, click **"Receipts"**; drop a file on it
or open the popover.

**Expect**: A compact button + popover near the top of the grid (the old
bottom drop-zone is gone); upload/link works.

**Last verified**: 2026-06-07 (Adam, preview) — works, but the `main` merge
left TWO Receipts buttons (inline mount + page `receiptSlot`). Fixed by
removing the inline mount in `BudgetSpreadsheetView` (kept the page-driven
slot). Re-verify there's now exactly one on the next build.

## Phase 3 — canonical `<Grid>` on Expenses (in progress)

Mounting the canonical `<Grid>` + `<GridSlideOver>` (see `grid.md`) on
`/budget/[tourId]` Expenses, replacing `BudgetSpreadsheetView`. **Stage A** map:
`docs/handover/PHASE3_BUDGET_MAP.md`. **Stage B floor (landed, this PR):**

#### BUD-31 — `source_entity_type` CHECK drift fixed (migration 208)
**Do**: `npm run db:migrate` (applies `208_widen_source_entity_type_check.sql`).
**Expect**: the live `budget_line_items.source_entity_type` CHECK now matches
what reconcile writes (`hotel_booking·flight_booking·flight·payroll·
payroll_per_diem·gear`). Migration 026 only allowed two; the live DB had
drifted — a fresh clone would have silently dropped the Salary/Per-Diem/gear
derived sections. **Read-safe**; records the drift.
**Last verified**:

#### BUD-32 — budget↔grid adapter (pure, unit-tested)
`src/lib/grid/budgetAdapter.ts` maps `budget_line_items`/`budget_sections` →
grid `Section[]`/`Row` and grid edits → DB patches (both directions tested:
`node --experimental-strip-types src/lib/grid/budgetAdapter.test.ts` → 7 checks).
Formula sections excluded; derived sections classified + sourced; `est`→
`proposed_cost`, `act`→`actual_cost`(+override), no `vendor` column.

#### BUD-33 — Grid (beta) renders on real budget data
**Do**: Budget → Expenses tab → click **Grid (beta)** (default is Classic).
**Expect**: The canonical `<Grid>` renders the live sections + lines (same
data as Classic); the production view is untouched on the **Classic** toggle.
**Last verified**:

#### BUD-34 — Cell edits persist (survive reload)
**Do**: In Grid (beta), edit an Item / Estimate / Actual / Status on a normal
line; reload.
**Expect**: The edit persisted (PATCH `/api/budget/line-items`, optimistic, no
flash). A rejected write toasts + refreshes.
**Last verified**:

#### BUD-35 — Derived sections locked (est + act)
**Do**: Look at the Salary / Accommodation sections.
**Expect**: They show the 🔗 source pill; **both** Estimate and Actual are
read-only with a 🔒 (the reconcile owns them — GRID_SPEC §6).
**Last verified**:

#### BUD-36 — Currency uses the tour FX
**Do**: A foreign-currency line (e.g. EUR on a GBP tour).
**Expect**: The cell shows the SOURCE figure in its currency + a red ≈
conversion in the tour currency (via `src/lib/budget/fx.ts`, not the demo
table); the tour's own symbol (£/$/€) is used throughout.
**Last verified**:

#### BUD-37 — Slide opens (LINE variant, DB statuses)
**Do**: Click the orange **Open** chip on a line.
**Expect**: The slide opens as the LINE variant (no person/hotel/settlement);
the Status menu lists the DB set (`draft·quoted·approved·paid·disputed`); slide
edits to item/est/act/status/notes persist.
**Last verified**:

> **Deferred to the grid-default flip (next pass, called out):** add-line /
> delete-line / section CRUD / reorder persistence, and the slide's
> Transactions/Documents CRUD (the budget rows don't carry them yet). Those
> stay on the **Classic** view until wired — which is why the toggle keeps it.

> Cross-ref `docs/smoke-tests/grid.md` for the grid component's GRID-/SLIDE- IDs.

## Known later

- Actual-vs-transactions override math (gates a `transactions.ts` refactor).
- Deliberate gaps: per-artist template override UI; drag-reorder;
  top-level "Line item"/Quick-Add still create section-less lines.
