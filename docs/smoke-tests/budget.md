# Budget smoke tests

> **Last run**: 2026-06-04 on `feat/budget-grid-usable` preview, all
> phases (grid redesign + sections/templates). ID prefix `BUD`. IDs are
> never recycled.

Per `docs/smoke-tests/README.md`. Reference tour: "Warning Support".

## Verified passing (detail retired)

BUD-01, BUD-02, BUD-06, BUD-07, BUD-09 (inline edit, persistence,
title-only slide open, no-slide-on-cell-edit, totals reconcile) —
**pass**. BUD-10 (migration 200 applies, idempotent), BUD-11 (existing
budgets still load) — **pass**.

## Open issues from the 2026-06-04 run

- **Full-page reload on every inline edit (BUD-01/02/09)** — FIXED,
  retest. The eager `router.refresh()` per cell commit re-ran the whole
  server page; removed on the success path (optimistic overlay is the
  source of truth; totals derive from it). Expect: edits commit with no
  page flash; reload still shows the saved value.
- **Phase chip "Show days" wrapped to two lines (BUD-05)** — FIXED,
  retest. Added `nowrap` to the phase chip; column is resizable anyway.
- **Slide-over design language (BUD-04)** — OPEN → CC. The slide-over
  doesn't match the grid: it should use the same custom dropdown style
  and the redesigned visual language. Queued as a CC pass.
- **Flight grid not working (BUD-08)** — OUT OF SCOPE here. Derived
  flight rows belong to the flights module; can't test derived-row
  read-only until that works. Tracked separately.
- **Template picker not visible (BUD-13)** — NOT A BUG. The empty-state
  picker only renders when a tour has **0 sections AND 0 lines**.
  Warning Support has lines (and migration 200 backfilled sections from
  them), so it correctly shows the grid. To see the picker, create a
  **new empty tour**. The system templates themselves are visible on any
  tour under **Budget → Settings → Templates**.

## Remaining checklist (blocked on testing against an empty/rebuilt tour)

#### BUD-12 — Sections backfilled + system templates seeded (DB check)

**Do**: Supabase SQL Editor —
`SELECT name, sort_order FROM budget_sections WHERE tour_id = '<id>' ORDER BY sort_order;`
`SELECT name, tier FROM budget_templates WHERE is_system ORDER BY tier;`
`SELECT count(*) FROM budget_line_items WHERE tour_id = '<id>' AND section_id IS NULL AND category <> '';`

**Expect**: one section per distinct category; three system templates
(Club / Support run, Headline tour, Festival run); NULL-`section_id`
count = 0 for previously-categorised lines.

#### BUD-13 — Empty-state template picker

**Do**: Open a **new tour** with zero sections + zero lines → Budget tab.

**Expect**: template picker (3 system presets with tier badges +
section chips, plus your own templates) and a "Start blank" button.

#### BUD-14 — Create budget from a template

**Do**: "Create budget from this template" on a preset.

**Expect**: grid grouped by Section with the template's default lines
(est/act = 0); re-applying adds nothing.

#### BUD-15 — Start blank + add section/line inline

**Do**: "Start blank" → "+ Section", rename a header inline, "+ Add
line", rename the line.

**Expect**: a "General" section scaffolds; new sections/lines persist
across reload; rename commits on Enter/blur, cancels on Escape.

#### BUD-16 — Section grouping + subtotals + delete

**Do**: With Group = Section, review headers; delete a section.

**Expect**: header shows name · count + est/act/var; deleting moves its
lines to "Uncategorised" (not deleted) after a confirm.

#### BUD-17 — Resizable columns + canvas (persisted)

**Do**: Drag a column edge; drag the grid's right edge; reload; "Reset
widths".

**Expect**: widths change, persist per-tour (localStorage), reset works.

#### BUD-18 — Phase toggle hides/shows the Phase column

**Do**: Settings → toggle Phase tracking off/on; return to the grid.

**Expect**: off = no Phase column + no Group=Phase option (falls back to
Section); on = both return.

#### BUD-19 — Settings: template clone + edit

**Do**: Settings → Templates → clone a system preset; edit its
sections/lines; "Apply to tour".

**Expect**: clone appears under "Yours"; edits persist; system presets
read-only; apply adds missing lines.

#### BUD-20 — Summary per-section rollup

**Do**: Summary tab on a tour with sections + lines.

**Expect**: "Section summary" table (Estimate/Actual/Variance + grand
total) alongside the existing charts; over = red, under = green.

## Known broken / later

- **Actual vs transactions override math** — manual Actual ≠ transaction
  sum behaviour across reload; gates a possible `transactions.ts`
  refactor. Repro: add 2 txns (sum $300), type a different Actual ($350)
  → expect ⚠ override + $350 sticking; slide "Sync to transactions sum"
  → $300.
- **Deliberate gaps from Phases B–E**: per-artist template override has
  no picker UI; section reorder is two PATCHes (no drag); top-level
  "Line item" / Quick-Add still create section-less lines (land in
  "Uncategorised"); income/net P&L not in the Summary rollup yet.
