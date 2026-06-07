# Claude Code prompt — Budget grid clean-up (match the reference mock)

> Make the budget grid scan as clean as the reference mock Adam likes:
> full-width with columns **distributed evenly** (balanced gutters, tidy
> aligned number columns), clean rows, no clutter. Branch off main
> (e.g. `feat/budget-grid-clean`). Use the UI/UX skill. Per-task; verify
> in `npm run dev` (webpack here, runs fine); build green; eslint 0; show
> diffs; commit nothing.
>
> **NAVIGATION IS OUT OF SCOPE for this pass.** Do NOT touch the product
> bar, the mode tabs, dropdowns, or the artist/tour picker — that's a
> dedicated effort later. This pass is the grid only.

## Pitfalls
- No per-edit `router.refresh()`; reuse the optimistic overlay; popovers
  reuse the portaled `InlineSelectCell`; pure helpers out of `'use
  client'`; `.maybeSingle()`; token-clean (`var(--lp-…)`/`color-mix`, no
  hardcoded hex). `next build --webpack` green.

## 1 — Distribute columns evenly across the full width (kill the canyon)
The live grid flexes the Item column to eat ALL leftover width → item
names on the far left, numbers crammed on the far right, a dead canyon
between. The mock Adam likes instead spreads the width across EVERY column
with balanced gutters and tidy, right-aligned number columns.
- Default column widths are **proportional and sum to fill the container**
  (roughly: Item ~26%, Vendor ~18%, Estimate ~12%, Actual ~13%, Variance
  ~11%, Status ~10%; checkbox + # stay fixed/narrow). NO single
  flex-into-void column; remove the `width:'auto'` flex on Item.
- Numbers right-aligned in their own columns and vertically aligned down
  the grid; comfortable, even gutters between columns.
- Column resize still works: dragging a column sets an explicit width
  (override); untouched columns keep their proportional default.
- On ultra-wide screens cap the panel (~1500–1600px) + centre so columns
  don't stretch absurdly. Keep the raised panel + density.

(Reference: the mock with the full-width, evenly-spread columns — that
balance is the goal, not packed-left-with-margin and not one wide column.)

## 2 — Remove the per-row "Open" buttons
The mock has clean rows; the live grid has 30 identical "Open" buttons =
noise. Remove them; clicking the row (or the item name, already the open
affordance) opens the detail slide-over.

## 3 — Template cleanup: dedupe + mute
- The default template seeds **duplicate/overlapping sections**: `HOTELS`
  + `HOTEL`, and `TRAVEL & FLIGHTS` + `TRANSPORT` (Transport also has
  Flights/Bus). Dedupe the seed so there's one of each.
- **Visually mute $0 / Draft placeholder rows** (lower contrast) so filled
  rows stand out. (Collapsing 0-line sections is optional — they read fine
  in the clean layout; muting the $0 rows is the priority.)

## 4 — Remove the "add preset line" feature
Remove the preset line-item quick-add (the Quick Add preset chips / any
"add preset line" picker — Adam says it's useless). Plain **"+ Add line"**
stays. Keep the "+ Add section" picker + the locked formula sections.

## 5 — Merge the control strips
Fold the **status-filter chips into the toolbar row** (or behind the
Filter button) so there's one control row, not two.

## 6 — Variance: encode once
Keep colour + sign; drop the redundant arrow (or drop the `+`) — not all
three. (And the burn bar's "variance vs committed" vs the grid's "variance
vs estimate" reuse one word for two metrics — relabel one.)

## Verify
`next build --webpack` green; eslint 0. Click through `/budget`: columns
evenly distributed across the full width (no canyon, numbers in tidy
aligned columns), no per-row Open, deduped sections, muted $0 rows, one
control row. Navigation unchanged. Show diffs + line ranges.
