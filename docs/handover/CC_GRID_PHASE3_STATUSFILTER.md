# CC — Phase 3 BLOCKER: Grid (beta) shows 0 rows (status filter excludes DB statuses)

**Live-verified on `701582e`** (Chrome DOM, budget tour `6889d072…`,
"Simple Plan Support | Fall'26"): switching Budget → Expenses to **Grid (beta)**
renders the sections (ACCOMMODATION 🔗 ROOMING, SALARY 🔗 PAYROLL, UNCATEGORISED)
with correct derived pills and a correct SALARY total (`est $14,669` = £11,550 ×
FX), **but every section shows 0 rows** ("0 rows" in the toolbar). Classic shows
all 10 rows.

## Root cause (confirmed)
The Filter popover "SHOW STATUSES" lists only the grid's canonical four —
`budgeted · paid · reconciled · refunded`. Every budget line's status is
**`draft`** (the DB default; visible as "Draft" pills in Classic). A row only
renders if its status is in the filter set, so all `draft` rows are filtered
out. The section totals still show because they're computed from the adapter
data **before** the status filter.

Decision #1 (keep the DB's 5 statuses, make the grid's status set
**surface-configurable**) was applied to the **column options** and the **slide
menu**, but the **status filter** (the "SHOW STATUSES" set + its default
all-checked initialisation) is still hardcoded to `gridModel.STATUSES`. It must
use the **same configurable status list** passed in for this surface — the DB
set `draft · quoted · approved · paid · disputed`.

## Fix
Drive the grid's status **filter** from the same status-set prop that already
configures the column/slide (do not hardcode `gridModel.STATUSES`):
- the "SHOW STATUSES" options = the surface's status set;
- the default filter state = **all** of that set checked (so nothing is hidden
  on first render);
- guard the initialiser so a row whose status isn't in the set is **not**
  silently filtered out (this is the income-rows-invisible bug class again —
  `statusFilter` was seeded with the wrong set).

`BudgetGridView` already knows the DB status set (it configures the column);
pass it to the filter too. The `/grid-demo` (no prop) keeps the canonical 4.

## Verify (not from code — it's a render-time filter)
On a fresh build, Grid (beta) on the same budget must show **all 10 rows**
(4 Accommodation + 5 Salary + 1 Uncategorised), each with its DB status pill,
and the toolbar row count must match Classic. I'll re-confirm live via Chrome.

## Note
This is the single blocker for the rest of the Phase-3 mount smoke (edits,
derived locks, persistence-survives-reload, slide). Everything else looked right
at the section level (derived classification, source pills, FX total). Record as
a BUD-38 follow-up in `budget.md`.
