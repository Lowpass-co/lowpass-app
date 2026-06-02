# CC Sprint — Budget Phase B (Polish + Power + Consistency)

This is a comprehensive sprint covering everything Adam needs to take Budget from "works" to "daily-driver." Combines what was originally scoped as B1 (ergonomic polish) and B2 (spreadsheet power) into one sprint per his direction, plus a §B0 bug fix for the §A3 override-inference flaw.

**Baseline assumption:** Phase A is merged to `main` before this sprint starts. The §A1 transactions table + §A2 side-by-side columns + §A3 override marker are all in `main`. If your branch state shows otherwise, halt and report — Phase B references Phase A code throughout.

**Branch:** `feat/budget-phase-b` off `main`.

**Sub-phase order:** §B0 → §B1 → §B2 → §B3 → §B4 → §B5. Each is its own commit. Halt-and-report at ~400 LOC; if any sub-phase exceeds the budget, surface a proposed split before committing.

---

## Hard rules

1. **One feature commit per sub-phase.** Don't merge multiple sub-phases into one commit.
2. **Lint baseline does not regress.** `tsc --noEmit` zero. `next build --webpack` green.
3. **Token discipline.** All visual values via `var(--lp-…)`. New tokens may be introduced but must follow the existing naming convention (see §B4).
4. **No new deps** without halt-and-report.
5. **Verify before claiming.** Name files and line numbers in each report. Adam diffs before merge.
6. **Scope discipline.** Phase C (data frontloading / client-side cache) is OUT of scope. Phase B optimisations should not change data-fetching architecture beyond what each sub-phase explicitly requires.
7. **No file deletions** without explicit call-out. Deprecated paths get marked `@deprecated` with a one-line comment, not removed.

---

# §B0 — Fix the override-inference bug

**Status before sub-phase:** §A3's `syncActualCostIfNoOverride` infers override-active from `actual_cost ≠ transactions.sum`. This breaks for any line item where the user typed a value into Actual *before* adding transactions (the create-then-add flow). Adam confirmed via repro: created line item with $1000 typed in Actual, added two transactions summing to $1300, no marker shown, Actual stays at $1000, variance computed off wrong number.

**Root cause** in `src/lib/budget/transactions.ts:148`:

```ts
if (!numericEqual(currentActual, previousSum)) {
  /* User had a manual override before this write — preserve it. */
  return;
}
```

The "previous actual matched previous sum" rule treats any pre-existing actual value as an override. It can't distinguish "user typed $1000 as a quick estimate" from "user explicitly chose to override the transaction sum."

**Fix:** replace inference with explicit storage.

## Migration 105 — `actual_cost_override` column

```sql
/* ============================================================
   MIGRATION 105 — actual_cost_override flag (Phase B §B0)

   Replaces the brittle "actual_cost differs from transactions
   sum" inference with explicit per-row storage of whether the
   user has set a manual override. Auto-sync runs unless this
   flag is true.

   Default false — existing rows are treated as not-overridden.
   The §B0 client logic sets the flag to true only on explicit
   user action (typing in the Actual field when transactions
   exist AND value differs from sum).
   ============================================================ */

ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS actual_cost_override BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.budget_line_items.actual_cost_override IS
  'TRUE when the user has explicitly set actual_cost to a value that should not auto-sync to the transactions sum. Set by deliberate edits in the ACTUAL field; cleared by the "Sync to transactions sum" button or by deleting all transactions.';
```

Write a matching `_apply_105_supabase.sql` paste-block in the same commit so Adam can apply via Supabase SQL Editor.

## Updated `syncActualCostIfNoOverride` logic

In `src/lib/budget/transactions.ts`, replace the inference-based body with the flag-based check:

```ts
export async function syncActualCostIfNoOverride(
  supabase: SupabaseClient,
  lineItemId: string,
  deltaApplied: number,
): Promise<void> {
  if (deltaApplied === 0) return;
  const { data: line } = await supabase
    .from('budget_line_items')
    .select('actual_cost, actual_cost_override')
    .eq('id', lineItemId)
    .maybeSingle<{ actual_cost: number | null; actual_cost_override: boolean }>();
  if (!line) return;

  /* Explicit override — preserve actual_cost regardless of the
     transaction change. The slide-over's Sync button is how
     the user clears the override. */
  if (line.actual_cost_override) return;

  const aggregates = await fetchTransactionAggregates(supabase, [lineItemId]);
  const newSum = aggregates.get(lineItemId)?.sum ?? 0;
  if (!numericEqual(Number(line.actual_cost ?? 0), newSum)) {
    await supabase
      .from('budget_line_items')
      .update({ actual_cost: newSum })
      .eq('id', lineItemId);
  }
}
```

Note: this also auto-syncs the create-then-add flow correctly. When a user creates a line with actual=$1000 and zero transactions, override=false. Adding the first transaction of $900 triggers auto-sync, actual becomes $900. If the user wanted to preserve the $1000 they should have set the override BEFORE adding transactions (UI affordance in §B1 — see below).

## Updated `getActualState` logic

In `src/lib/budget/transactions.ts`, update the helper to use the flag:

```ts
export function getActualState(line: {
  actual_cost?: number | null;
  actual_cost_override?: boolean | null;
  transaction_sum?: number | null;
  transaction_count?: number | null;
}): ActualState {
  const actual = Number(line.actual_cost ?? 0);
  const count = Number(line.transaction_count ?? 0);
  const sum = Number(line.transaction_sum ?? 0);
  /* Override flag is the source of truth. Drift between actual
     and sum can exist transiently (e.g. mid-edit) without
     being a "real" override. */
  const isOverride = Boolean(line.actual_cost_override);
  return {
    value: actual,
    isOverride,
    transactionSum: sum,
    transactionCount: count,
  };
}
```

## Setting / clearing the override flag

Three places need to set/clear the flag:

1. **Slide-over ACTUAL field edit.** When the user types a new value into the ACTUAL field AND transactions exist AND the new value ≠ sum, set `actual_cost_override = true` via PATCH `/api/budget/line-items/[id]`.
2. **Grid Actual cell edit (§B1 introduces this).** Same logic as above when inline-editing.
3. **"Sync to transactions sum" button.** Set `actual_cost = transaction_sum` AND `actual_cost_override = false` via PATCH.

The transaction CRUD endpoints (POST/PATCH/DELETE on transactions) do NOT touch the override flag — they only update the data and call `syncActualCostIfNoOverride` which respects the flag.

## API layer

Update `/api/budget/line-items/[id]` PATCH to accept `actual_cost_override: boolean` in the body. Add the field to `BudgetLineItem` TS type. Update `enrichLinesWithTransactionAggregates` to include `actual_cost_override` in returned shape (it's already on the row, just needs threading).

## Slide-over UI

In `src/components/budget/BudgetLineSlideOver.tsx`, the override marker render condition changes from "actual ≠ sum" to "actual_cost_override flag is true." All visual treatment (AlertTriangle icon, "Override" badge, Sync button, input border tint) stays — just driven by the explicit flag.

When the user edits the ACTUAL field in the slide-over:

- If `transactionCount === 0`: no override concept applies. Just save the new value.
- If `transactionCount > 0` AND new value === sum: clear the override flag (set false). Save value.
- If `transactionCount > 0` AND new value ≠ sum: set the override flag (true). Save value.

When the user clicks "Sync to {sum}": PATCH `actual_cost = sum`, `actual_cost_override = false`.

## §B0 reporting

```
Phase B0 done. Commit: <hash>
Migration added: 105
Files modified:
  - src/lib/budget/transactions.ts (auto-sync + getActualState refactored)
  - src/app/api/budget/line-items/[id]/route.ts (PATCH accepts override flag)
  - src/components/budget/BudgetLineSlideOver.tsx (marker reads explicit flag, edit handler sets it)
  - any other call sites of getActualState that need the field passed through
Verify: tsc=0, lint baseline, build green
Smoke instructions for Adam: 
  1. Apply migration 105 via Supabase
  2. Test repro: create new line item with actual=$1000, add transaction of $900, confirm Actual updates to $900 (not stuck at $1000 with no marker)
  3. Type a value into Actual that differs from sum → marker appears
  4. Click Sync → marker clears, value reverts to sum
Blockers: [empty if clean]
```

---

# §B1 — Unified create slide + inline edit + variance + currency + add-row

This is the largest sub-phase. May need to split into B1a / B1b — surface a proposed split in your recon if total LOC > 400.

## B1.1 — Unified create-vs-edit slide-over

**Problem:** Currently the "create new line item" slide-over (triggered when `line.id.startsWith('pending-')` per `src/components/budget/BudgetLineSlideOver.tsx:164`) does NOT show the Transactions section. The user creates the line, closes the slide, then re-opens to add transactions. Friction.

**Fix:** Render the Transactions section in create mode too, but with the section disabled / locked behind a placeholder until the line is saved.

In `BudgetLineSlideOver.tsx`:

```tsx
{isCreate ? (
  <section className="...">
    <h3>TRANSACTIONS</h3>
    <p className="empty-state">
      Save the line item to start adding vendor breakdowns.
    </p>
  </section>
) : (
  <TransactionsSection lineItemId={line.id} onChange={() => router.refresh()} />
)}
```

After save (line.id is no longer pending), the section becomes interactive in the same slide-over instance — no close-and-reopen needed.

**Bonus:** auto-save the line item on first field blur (label, category, amount typed) so the user transitions from create to edit naturally without an explicit Save button click. The pending ID is replaced with the real ID, the Transactions section becomes interactive. Use the existing 600ms debounce.

## B1.2 — Inline edit Actual + Proposed in the grid

Today the grid's Actual cell is display-only (per CC's A2 report). Add inline editing using the new override semantics.

**Behaviour rules (matching §B0):**

- **Proposed cell:** always directly editable. Saves to `budget_line_items.proposed_cost`.
- **Actual cell:**
  - If `transactionCount === 0`: directly editable. Saves to `actual_cost`. Override flag stays false.
  - If `transactionCount > 0`: directly editable. On commit:
    - If new value === `transactionSum`: save `actual_cost = newValue`, `actual_cost_override = false`.
    - If new value ≠ `transactionSum`: save `actual_cost = newValue`, `actual_cost_override = true`. AlertTriangle marker appears.
- **Variance cell:** always read-only. Recomputed from Proposed + Actual on every change.

**Implementation:** create a `BudgetCellInput` component in `src/components/budget/cells/` that wraps the cell render with an inline editor. Use the existing `SpreadsheetGrid` cell pattern for triggering edit mode (F2, double-click, or typing). On commit (Enter / Tab / blur), call the existing PATCH endpoint.

Add the AlertTriangle marker inline next to the value when override is active, matching the slide-over marker treatment.

## B1.3 — Variance sign flip for income rows

**Problem:** All rows currently treat positive variance as bad (red). For income rows (where higher actual = better), positive variance should be GREEN.

**Solution path A (simplest, ship this):** infer row kind from category. The existing category taxonomy in `budgetUx14Kinds.ts` likely has Income as a distinct kind from the others (Expenses, Hotels, Travel, etc.). If the category is in the income set, flip the variance color logic.

```ts
function varianceColor(variancePct: number | null, isIncomeRow: boolean): string {
  if (variancePct === null) return 'var(--lp-text-tertiary)';
  const positiveIsGood = isIncomeRow;
  if (variancePct > 5) return positiveIsGood ? 'var(--color-lp-status-complete)' : 'var(--color-lp-status-needs-review)';
  if (variancePct > 10) return positiveIsGood ? 'var(--color-lp-status-complete)' : 'var(--color-lp-error, #EF4444)';
  if (variancePct < -5) return positiveIsGood ? 'var(--color-lp-error, #EF4444)' : 'var(--color-lp-status-complete)';
  return 'var(--lp-text-secondary)';
}
```

Add an `isIncomeRow(line)` helper that checks `line.category` against the income set in `budgetUx14Kinds.ts`.

**Solution path B (later sprint, do not ship in §B1):** add `row_kind ENUM('income' | 'expense')` to budget_line_items. Migration + UI. Better long-term but out of scope here.

Update the variance color call sites in:
- `src/components/budget/BudgetLineSlideOver.tsx` (the VARIANCE display in the header trio)
- `src/components/budget/BudgetSpreadsheetView.tsx` (the grid's Variance column)

## B1.4 — Currency symbol prefix on numeric inputs

Every numeric input in the budget grid + slide-over (Proposed, Actual, Quantity, transaction Amount) currently shows raw numbers. Add a currency symbol prefix.

Use `budgetCurrencySymbol(line.currency)` from `src/lib/budget-currency.ts` to derive the symbol. Render as a non-editable prefix inside the input field:

```tsx
<div className="currency-input-wrapper">
  <span className="currency-prefix">{budgetCurrencySymbol(currency)}</span>
  <input type="number" value={value} onChange={...} />
</div>
```

Style the prefix with `var(--lp-text-secondary)` and ensure the input's actual numeric content sits to the right of the prefix without overlap.

Apply to:
- BudgetLineSlideOver: ESTIMATED, ACTUAL fields
- TransactionsSection: Amount field per row
- The grid's Proposed + Actual cells when in edit mode

**Note on quantity:** the Quantity field is not currency. Don't add a prefix there. Keep it as a plain numeric input.

## B1.5 — Per-section "Add row" affordance

Today there's a global "Add line item" button (per recon, in `TourBudgetAccordion.tsx:714, 1308` and `TourBudgetRebuildClient.tsx:314`). Add a per-section "+ Add row" button at the bottom of each section's row group in the grid.

**Behaviour:** clicking the section-scoped button opens the slide-over in create mode with the section's category pre-selected. The user fills in the rest of the fields. After save, the new row appears in that section.

**Location:** between the last row of each section's row group and the section's pinned totals row. Style as a muted link or button — should feel discoverable but not noisy.

**Reuse:** the global "Add line item" button stays for users who want to add a line without committing to a section yet. Don't remove it.

## §B1 reporting

```
Phase B1 done. Commit: <hash>
Files modified:
  - src/components/budget/BudgetLineSlideOver.tsx (unified create, currency prefix)
  - src/components/budget/cells/BudgetCellInput.tsx (NEW — inline editor)
  - src/components/budget/BudgetSpreadsheetView.tsx (inline edit wiring, variance color, per-section add button)
  - src/components/budget/TourBudgetAccordion.tsx (per-section add button mount)
  - src/lib/budget/income-rows.ts (NEW — isIncomeRow helper)
  - any other call sites updated
Verify: tsc=0, lint baseline, build green
Smoke instructions for Adam:
  1. Create a new line item. Confirm Transactions section is visible but locked behind "Save first" placeholder. Type the label, blur — line auto-saves, Transactions section unlocks.
  2. In the grid, click into an Actual cell. Confirm inline edit works. Type a value, hit Enter, confirm save.
  3. For a line with 2+ transactions, type a different value in the Actual cell. Confirm AlertTriangle appears immediately. Reopen slide-over, click Sync to clear.
  4. For an income line item, set actual > proposed. Confirm variance renders GREEN (not red).
  5. Confirm currency symbol prefix appears on all Proposed, Actual, and transaction Amount inputs.
  6. Click the per-section "+ Add row" button at the bottom of any section. Confirm the slide-over opens with that section's category pre-selected.
Blockers: [empty if clean]
```

---

# §B2 — Spreadsheet keyboard power

## B2.1 — Copy / Paste (Cmd+C / Cmd+V)

**Scope (v1):** single-column ranges only. Copying a single Proposed value down a column of Proposed cells. NOT cross-column copy/paste (that requires column-type matching logic that's heavier than this scope warrants).

**Implementation:**
- Cmd+C on a selected range: capture the values into the clipboard as newline-separated text. Format compatible with Sheets (so a paste from Sheets back into Lowpass also works).
- Cmd+V on a selected target range:
  - If clipboard has 1 value and target has N cells in 1 column: fill all N with the single value.
  - If clipboard has N values and target has 1 cell: paste N values down from target.
  - If clipboard has N values and target has M cells where M = N: paste 1-to-1.
  - Other shapes: paste what fits, ignore the rest, show a quick toast "Pasted X cells."

Hook into the existing `SpreadsheetGrid` keyboard handler. Add `useGridClipboard` hook in `src/components/spreadsheet-grid/hooks/`.

**Validation:** the paste must respect the cell's edit rules. Pasting into a derived/read-only cell (e.g. Variance) is rejected with a toast. Pasting into a Stage Box select cell accepts only values matching an existing stage box.

## B2.2 — Drag-fill (Sheets corner handle)

**Behaviour:** when a single cell or range is selected, show a small blue square handle at the bottom-right corner of the selection (matching Sheets visual). The user drags the handle down or up to extend the selection and fill with the source value(s).

**Implementation:**
- Render the handle as an absolutely-positioned `<div>` on the bottom-right of the selection bounds.
- Mouse down on handle → enter drag-fill mode (cursor changes to crosshair).
- Mouse move → extend the visual selection bounds.
- Mouse up → commit the fill.

Fill semantics same as paste (single value fills all target cells; range repeats / extrapolates).

## B2.3 — Ctrl+D / Cmd+D fill-down

Keyboard shortcut equivalent to selecting a range and triggering drag-fill from top to bottom. When the user has a multi-cell range selected, Cmd+D / Ctrl+D fills the entire range with the top cell's value(s).

Single-cell selection: Cmd+D has no effect (or copies the value to itself, no-op).

## B2.4 — Cmd+Arrow jump-to-edge

Standard Sheets / Excel pattern:
- `Cmd+ArrowDown` from any cell: move focus to the last non-empty cell in the same column (or the very last cell if all below are empty).
- `Cmd+ArrowUp`: same, opposite direction.
- `Cmd+ArrowLeft / Right`: same, by column.
- Shift+Cmd+Arrow: extend selection to the edge instead of moving focus.

Hook into the existing keyboard handler in `SpreadsheetGrid.tsx`.

## §B2 reporting

```
Phase B2 done. Commit: <hash>
Files added: src/components/spreadsheet-grid/hooks/useGridClipboard.ts
Files modified:
  - src/components/spreadsheet-grid/SpreadsheetGrid.tsx (drag handle render, paste handler, Cmd+Arrow)
  - src/components/spreadsheet-grid/hooks/useGridKeyboard.ts (Cmd+D handler)
Verify: tsc=0, lint baseline, build green
Smoke instructions for Adam:
  1. Select a single Proposed cell with value $500. Cmd+C. Select 10 cells in the same column below. Cmd+V. Confirm all 10 get $500.
  2. Same selection, drag the blue corner handle down 5 cells. Confirm fill.
  3. Cmd+D on a multi-cell selection. Confirm fill-down.
  4. Cmd+ArrowDown in a column. Confirm jump-to-last-cell.
  5. Try Cmd+V into a Variance cell (read-only). Confirm rejection toast.
Blockers: [empty if clean]
```

---

# §B3 — Smart fields (Category chip + Vendor autocomplete)

## B3.1 — Category as inline colored chip

Today the Category cell is a text/select. Change to render as a colored chip inline.

**Implementation:**
- The category enum (from `budgetUx14Kinds.ts`) gets a colour map. Each category gets a colour token (e.g. Income = `--lp-status-positive`, Expenses = `--lp-orange`, Hotels = `--lp-blue`, etc.). Define the map in `src/lib/budget/category-colors.ts`.
- In the grid, render the category as a chip: background = category color (10% opacity), border = category color (40% opacity), text = category color (full).
- Click the chip → open a dropdown of category options, each rendered as a chip preview.
- Selection commits via the existing PATCH endpoint.

**No new column.** Replace the existing Category cell's render with the chip treatment.

## B3.2 — Vendor cell with autocomplete

The transactions Vendor field is currently a free-text input. Add autocomplete:

**Source:**
1. **Parent line item vendor** — if the line item has a vendor set (from notes-encoded vendor or the future vendor column), pre-fill the new transaction's vendor with it. Editable.
2. **Workspace transaction history** — SELECT DISTINCT `vendor_name` FROM `budget_line_item_transactions` WHERE `workspace_id = $workspace`. Order by frequency (most-used first), limit ~50.

**UI:** when the user focuses the Vendor cell on a new transaction, the autocomplete dropdown opens with the pre-filled parent vendor at the top (if any), followed by the workspace history. Typing filters the list. Picking commits.

**Implementation:**
- New endpoint: `GET /api/budget/vendor-history?tour_id=<id>` returns `string[]` of distinct vendors used in the workspace, ordered by frequency. Cache server-side for 5 min per workspace (use the existing rate-limit pattern).
- New component: `VendorCombobox` in `src/components/budget/cells/`. Wraps a text input with the autocomplete popover.
- Mount in `TransactionsSection` for the Vendor field.

**Backwards compat:** existing transactions with arbitrary vendor strings render fine — autocomplete is opt-in via the dropdown trigger.

## §B3 reporting

```
Phase B3 done. Commit: <hash>
Files added:
  - src/lib/budget/category-colors.ts
  - src/components/budget/cells/CategoryChip.tsx
  - src/components/budget/cells/VendorCombobox.tsx
  - src/app/api/budget/vendor-history/route.ts
Files modified:
  - src/components/budget/BudgetSpreadsheetView.tsx (Category cell → CategoryChip)
  - src/components/budget/TransactionsSection.tsx (Vendor cell → VendorCombobox)
Verify: tsc=0, lint baseline, build green
Smoke instructions:
  1. Category column in the grid renders as colored chips. Click one, dropdown shows other categories as chip previews. Pick one, confirm save.
  2. Open a line item with a vendor. Add a new transaction. Vendor field is pre-filled with the line item's vendor.
  3. Click the Vendor field on a new transaction. Dropdown shows workspace vendor history. Type to filter.
Blockers: [empty if clean]
```

---

# §B4 — Density modes + visual consistency

## B4.1 — Three density modes

The current SpreadsheetGrid has `density: 'compact' | 'comfortable' | 'tight'` per recon (line 35–37 of `SpreadsheetGrid.tsx`). The Budget grid hardcodes `density='compact'`. The mode CSS tokens exist but the rest of the cell content (font size, indicator size, numeric size) doesn't currently scale.

**Updated mode set + default:**

| Mode | Row height | Cell padding-y | Font size | Numeric size | Default? |
|---|---|---|---|---|---|
| Compact | 32px | 4px | 13px | 14px | No |
| **Comfortable** | **44px** | **8px** | **14px** | **16px** | **Yes (new default)** |
| Cozy | 56px | 12px | 15px | 18px | No |

Keep "tight" as a deprecated alias for "compact" if any call sites use it; remove "tight" from the new public API.

**Tokens to add to `src/app/globals.css`:**

```css
:root {
  /* Density: row height */
  --lp-row-height-compact: 32px;
  --lp-row-height-comfortable: 44px;
  --lp-row-height-cozy: 56px;

  /* Density: vertical padding inside cells */
  --lp-row-cell-padding-y-compact: 4px;
  --lp-row-cell-padding-y-comfortable: 8px;
  --lp-row-cell-padding-y-cozy: 12px;

  /* Density: font size for cell text */
  --lp-cell-font-size-compact: 13px;
  --lp-cell-font-size-comfortable: 14px;
  --lp-cell-font-size-cozy: 15px;

  /* Density: font size for numeric cells (slightly larger for readability) */
  --lp-cell-numeric-size-compact: 14px;
  --lp-cell-numeric-size-comfortable: 16px;
  --lp-cell-numeric-size-cozy: 18px;

  /* Density: indicator sizes (AlertTriangle, paperclip, chip text) */
  --lp-cell-indicator-size-compact: 12px;
  --lp-cell-indicator-size-comfortable: 14px;
  --lp-cell-indicator-size-cozy: 16px;
}
```

Existing `--lp-row-cell-padding-y-{density}` tokens already cover one of these. Don't duplicate; extend the set with the missing dimensions.

## B4.2 — Density toggle UI

Add a density toggle in the Budget product surface. Two reasonable locations:

- **Option A:** in the BudgetTabNav row, far right (small icon group: ☰ Compact / ≡ Comfortable / ☷ Cozy).
- **Option B:** in a "View" menu accessible from the page header.

Pick A — more discoverable, one click to change.

**Persistence:** save the user's choice to `localStorage` under `lowpass:budget:density`. Apply on next page load. No server-side sync needed (per-device preference is fine).

**Default:** Comfortable on first load (no localStorage value yet).

## B4.3 — Apply density to budget cell content

Update the Budget grid components to consume the new tokens:

- `BudgetSpreadsheetView.tsx` cells use `font-size: var(--lp-cell-font-size-${density})` for label/text cells and `var(--lp-cell-numeric-size-${density})` for Proposed/Actual/Variance/Quantity cells.
- AlertTriangle, paperclip, and chip indicators scale via `var(--lp-cell-indicator-size-${density})`.

Make sure the SpreadsheetGrid generic API exposes the density value to children so the budget cells can read it without prop-drilling. If the existing API doesn't, add a context provider for density at the grid level.

## §B4 reporting

```
Phase B4 done. Commit: <hash>
Files added: (none — token additions only)
Files modified:
  - src/app/globals.css (new density tokens)
  - src/components/spreadsheet-grid/SpreadsheetGrid.tsx (density default change, context provider)
  - src/components/budget/BudgetTabNav.tsx (density toggle UI)
  - src/components/budget/BudgetSpreadsheetView.tsx (consume density tokens)
  - any other budget cells using hardcoded font sizes
Verify: tsc=0, lint baseline, build green
Smoke instructions:
  1. Open the Budget tab. Confirm default density is Comfortable (rows look bigger than before).
  2. Click each density toggle. Confirm rows, padding, font, and indicator sizes all scale.
  3. Reload the page. Confirm the chosen density persists via localStorage.
Blockers: [empty if clean]
```

---

# §B5 — Visual consistency propagation

After §B4 lands and Adam confirms density on Budget feels right, propagate the same token system + toggle to the Equipment and Personnel grids.

## Scope

- **Equipment grid:** `src/components/equipment/InventoryTab.tsx` and related grid cells.
- **Personnel grid:** wherever the canonical personnel grid lives — likely under `src/components/personnel/` or `src/components/operations/personnel/`.

For each:
1. Replace any hardcoded font sizes / padding / row heights with the density tokens from §B4.
2. Add the density context provider (already in `SpreadsheetGrid`).
3. Add the density toggle UI in the same visual position as Budget (top-right of the page header or grid toolbar).
4. Persist the choice independently — localStorage key per surface (`lowpass:equipment:density`, `lowpass:personnel:density`). Different grids might want different default densities.

## §B5 reporting

```
Phase B5 done. Commit: <hash>
Files modified:
  - src/components/equipment/InventoryTab.tsx
  - src/components/equipment/[any related cells]
  - src/components/personnel/[grid surface]
  - density toggle UI added in each
Verify: tsc=0, lint baseline, build green
Smoke instructions:
  1. Visit Equipment. Confirm density toggle works, scales rows and cells.
  2. Visit Personnel. Same.
Blockers: [empty if clean]
```

---

## Sprint summary

After all 6 sub-phases ship:

- **§B0:** override-inference bug fixed via explicit flag (migration 105)
- **§B1:** unified create slide-over + inline cell edit + variance sign flip + currency prefix + per-section add row
- **§B2:** Cmd+C/V + drag-fill + Cmd+D + Cmd+Arrow
- **§B3:** Category chips + Vendor autocomplete
- **§B4:** density modes (Compact/Comfortable/Cozy) with full scaling, default Comfortable
- **§B5:** density system propagated to Equipment + Personnel grids

Total estimated LOC: ~1600 across 6 commits.

After Adam smokes each sub-phase and signs off, merge `feat/budget-phase-b` to `main`. Then we plan Phase C (data frontloading + client-side cache architecture).

---

## Phase C preview (out of scope for this sprint, here for context)

Adam wants the app to feel instant on click after initial login. The plan is:

1. On login, fetch a "workspace bootstrap" payload — all artists, tours, key entities — in parallel.
2. Hydrate a client-side cache (TanStack Query or similar).
3. All page renders read from cache; background revalidation keeps it fresh.
4. Mutations write through cache + invalidate affected queries.

This requires its own design pass and architecture work. Spec writes after Phase B ships.

---

## Halt-and-report criteria (across all sub-phases)

Stop and ping Adam if:

- Any sub-phase's recon reveals a structural assumption in the spec that's wrong (e.g. the income category set doesn't exist as a clear subset in `budgetUx14Kinds.ts`, or the grid keyboard handler is in a different file than expected).
- LOC for a sub-phase exceeds 400 — propose a split (B1a / B1b / B1c naming).
- A new dep is needed beyond what's already in package.json.
- Density token changes affect surfaces outside Budget / Equipment / Personnel (e.g. SlideOver content) — surface and confirm whether they should be updated too.
- The auto-sync override flag refactor breaks any existing tests (likely none, but confirm).
- Adam's existing budget data has values that don't migrate cleanly (e.g. some line items have `actual_cost_override = NULL` from race conditions during the migration — the DEFAULT FALSE should prevent this but verify).

---

## Pre-sprint checklist for Adam

Before sending this spec to CC, Adam needs to:

1. Merge `feat/budget-phase-a` to `main` (commands at the top of my prior chat message)
2. Confirm Vercel preview rebuilds main cleanly
3. Smoke that Phase A's existing behaviour still works on prod (the slide-over Transactions section, the override marker on rows that DO match the rule, the grid stats reflecting effective actual)

Once those are green, paste this spec to CC and let them start with §B0.
