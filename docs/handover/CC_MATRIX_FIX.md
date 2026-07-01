# CC — Matrices render 0 rows: `rowMatches` hides statusless rows (gridModel.ts:125)

Chrome-verified the matrix rebuild on the `feat/personnel-unify` preview
(commit `eeb84f8`, deploy live/"eeb84f8"). **The rebuild is structurally excellent**
— but **both matrices show ZERO person rows despite data existing.** Root cause found,
exact one-line fix below.

## What PASSED (verified live — don't touch these, they're great)
- **People = rows, days = columns.** Rooming + Payroll Days both flipped correctly.
- **Frozen person column on horizontal scroll** (your flagged riskiest item):
  scrolled rooming days from 10-01→10-27 and the PERSON column + "Rooms / night"
  label stayed pinned. ✅
- **Day-pill headers** (date · city · day-type dot). ✅
- **Week markers**: "WC 28 SEPT / WC 5 OCT / WC 12 OCT" with the orange Monday
  divider, only on week-start columns — exactly the light D1 option. ✅
- **Per-column footer** (rooming Rooms/night: 3·2·1·2·1). ✅
- **Canonical Grid chrome + the drag-to-select hint bar is back** ("Shift extend ·
  drag to select · ⌘C/V…"). ✅
- **Budget invariant holds**: Expenses renders identically (full grid, pill tints,
  variance) on the same deploy. ✅

## The bug — 0 rows
- Payroll **Days matrix shows "PERSONNEL 0"** while **Rates & totals shows 5 crew**
  (Ben, Jonny, Dillon, Adam, Megan) on the same tour. Rooming **Matrix shows
  "ROSTER 0"** yet its Rooms/night footer has counts → assignment data exists.
- The component guard `if (people.length === 0)` is NOT firing (we see the Grid, not
  the "No personnel" div) → `people` is non-empty → the Grid is being handed rows but
  **renders none**.

## Root cause — `src/components/grid/gridModel.ts:125`
```ts
export function rowMatches(row: Row, query: string, statusFilter: Set<string>): boolean {
  if (query) { ... }
  return statusFilter.has(String(row.status));   // ← line 125
}
```
Matrix rows have **no `status`** and there's **no status-type column**, so
`statusUniverse()` returns `[]` → `filterRef` is an **empty Set** → for every row
`statusFilter.has(String(undefined))` = `has("undefined")` = **false** → all rows
filtered out. This is the *same* "rows silently filtered to zero" class the comment at
`Grid.tsx:126` / `:181-184` says it fixed for draft rows — it just never handled rows
with **no status at all**.

## The fix (surgical, regression-free)
In `rowMatches`, a row with no status is never subject to the status filter:
```ts
export function rowMatches(row: Row, query: string, statusFilter: Set<string>): boolean {
  if (query) { /* unchanged */ }
  if (row.status == null || row.status === '') return true; // statusless rows always visible
  return statusFilter.has(String(row.status));
}
```
- **No budget regression**: budget rows always carry a status, so the early-return
  never triggers for them; the status-filter popup still hides/show status-bearing rows
  exactly as today. Prove it by re-checking Expenses + the status filter after the change.

## Also unblocks Income
Income rows are likewise statusless — so **even after the income client-fetch fix
(`CC_BUDGET_INCOME_FIX.md`), Income would still render 0 rows until this `rowMatches`
fix lands.** Both fixes are needed for Income to actually show data; this one is the
shared root for the "0 rows" symptom across Income + both matrices.

## Rules
- One-line fix in `gridModel.ts` (+ optional: make the Filter chip a no-op/hidden when
  `statusUniverse` is empty, so matrices don't show an empty filter popup — nice-to-have).
- `next build --webpack`; tsc 0; eslint 0. Push + include the "Pushed `<hash>`" line.
- I re-Chrome-verify: payroll Days shows the 5 crew as rows with day-type tint-filled
  cells + drag-select + edit-persist; rooming Matrix shows roster rows; Expenses +
  status filter unchanged.
