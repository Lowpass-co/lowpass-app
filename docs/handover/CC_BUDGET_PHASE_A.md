# CC Sprint — Budget Phase A (Foundation)

Adam's vision for Budget (recap):

- Spreadsheet-style data entry (like his Google Sheets)
- Proposed and Actual side-by-side per row (NOT a separate Actuals tab)
- Variance computed and visible at a glance
- Line items can have multiple sub-cost breakdowns ("$200 Lowpass Audio + $800 Clair Audio = $1000 line item")
- Inline editing for quick changes, slide-over for depth

Phase A scope (this sprint): the data model and core surfacing so the rest of the budget polish makes sense. Phase B (Sheets keyboard / smart fields / visual consistency) and Phase C (scenarios / reports / cross-tour rollup) wait until A ships clean.

Start from current `main` (post-merge of `feat/operations-pages-port`). Branch off as `feat/budget-phase-a`.

---

## Hard rules

1. **One feature commit per sub-phase.** Halt-and-report at ~400 LOC.
2. **Lint baseline** does not regress. `tsc --noEmit` zero. `next build --webpack` green.
3. **Token discipline** — all visual values via `var(--lp-…)`.
4. **No new deps** without halt-and-report.
5. **Verify before claiming.** Name files/lines in the report. Adam diffs before merge.
6. **Phase B+ are explicitly out of scope.** Do NOT touch keyboard ergonomics (Cmd+C/V, drag-fill), do NOT polish smart fields, do NOT touch visual consistency tokens beyond what Phase A's new components naturally need. Those come later. Resist the urge.

---

## §A1 — Data model + slide-over (foundation)

### Migration 104 — `budget_line_item_transactions`

```sql
CREATE TABLE IF NOT EXISTS public.budget_line_item_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  line_item_id UUID NOT NULL REFERENCES public.budget_line_items(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT,                          -- NULL = inherit from line item
  paid_at DATE,
  receipt_id UUID REFERENCES public.receipts(id) ON DELETE SET NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_line_item_transactions_line_item
  ON public.budget_line_item_transactions (line_item_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_budget_line_item_transactions_workspace
  ON public.budget_line_item_transactions (workspace_id);

ALTER TABLE public.budget_line_item_transactions ENABLE ROW LEVEL SECURITY;

-- Canonical 4-policy RLS (admin gate on DELETE)
CREATE POLICY budget_line_item_transactions_select ON public.budget_line_item_transactions
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY budget_line_item_transactions_insert ON public.budget_line_item_transactions
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY budget_line_item_transactions_update ON public.budget_line_item_transactions
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY budget_line_item_transactions_delete ON public.budget_line_item_transactions
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());
```

### Backfill

For every existing `budget_line_items` row where `actual_cost IS NOT NULL AND actual_cost > 0`, create one transaction:

```sql
INSERT INTO public.budget_line_item_transactions
  (workspace_id, line_item_id, vendor_name, amount, currency, sort_order)
SELECT
  li.workspace_id,
  li.id,
  '(legacy entry)',                       -- vendor name placeholder
  li.actual_cost,
  li.currency,
  0
FROM public.budget_line_items li
WHERE li.actual_cost IS NOT NULL
  AND li.actual_cost > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.budget_line_item_transactions t
    WHERE t.line_item_id = li.id
  );
```

This preserves existing data. Adam can re-label the "(legacy entry)" vendor manually as he revisits each line item.

After backfill, `budget_line_items.actual_cost` becomes the **effective fallback** — used only when no transactions exist. Don't drop the column.

### Effective actual cost — derivation rule

In all API responses and computed views going forward:

```ts
const effectiveActual = transactions.length > 0
  ? transactions.reduce((sum, t) => sum + t.amount, 0)
  : line_item.actual_cost ?? 0;
```

When transactions exist, `actual_cost` column is ignored (but kept for back-compat / single-entry fast path).

**Inline edit behaviour in the grid (deferred to §A2 but flagged here):**

- If line item has **0 transactions** AND user types in the Actual cell → updates `budget_line_items.actual_cost` directly (single-entry fast path)
- If line item has **1 transaction** AND user types in the Actual cell → updates that single transaction's amount
- If line item has **2+ transactions** → cell is read-only, shows the sum, user must open slide-over to edit

This keeps single-entry inline editing fast while making multi-entry explicit.

### API endpoints (new in §A1)

- `GET /api/budget/line-items/[id]/transactions` — list transactions for a line item, ordered by sort_order
- `POST /api/budget/line-items/[id]/transactions` — create a transaction (body: vendor_name, amount, currency?, paid_at?, receipt_id?, notes?, sort_order?)
- `PATCH /api/budget/transactions/[id]` — update a transaction
- `DELETE /api/budget/transactions/[id]` — delete a transaction
- `PATCH /api/budget/transactions/[id]/reorder` — change sort_order

All gated via `requireUserAndWorkspace` + `requireTourInWorkspace` (reuse from §SAFE workspace-check helper). All write operations validate `vendor_name` non-empty and `amount` ≥ 0. Currency defaults to the line item's currency at creation if not provided.

### Slide-over: beef it up

Find the existing line-item detail slide-over (likely `src/components/budget/BudgetLineItemDetailSlideOver.tsx` or similar — recon to confirm). Add a new "Transactions" section below the existing line-item header/fields.

UI layout for the Transactions section:

```
Transactions                                  [+ Add transaction]

  Lowpass Audio        £200.00    2026-04-15    📄
  Clair Audio          £800.00    2026-04-20

                       ─────────
                       £1,000.00 (2 transactions)
```

- Each row editable inline (vendor_name, amount, paid_at, notes — all in a single grid-like row)
- Drag handles for reordering (use `@dnd-kit`, already in deps)
- Receipt icon links to the receipt detail if `receipt_id` is set
- Hover/right-click on a row → context menu with Delete
- The totals row shows the sum of all transactions in the line item's currency
- If 0 transactions: show empty state with "Type an Actual cost directly in the grid for a quick entry, or add a vendor breakdown below" + a single "[+ Add transaction]" button
- Auto-save via the existing `useAutoSave` primitive on each field blur

### Halt-and-report — §A1

Stop and ping Adam if:

- The existing slide-over has structural assumptions that make adding a Transactions section require a layout reshape rather than a section append
- `receipts` table doesn't have the expected schema for the FK
- Existing budget_line_items rows have `actual_cost` values that don't backfill cleanly (e.g. negative values, non-numeric drift)
- The drag-handle reorder UI requires a heavier dep than dnd-kit

### §A1 reporting

```
Phase A1 done. Commit: <hash>
Migration added: 104
Files added: [paths]
Files modified: [paths]
Backfill count: <N> transactions created from legacy actual_cost values
Verify: tsc=0, lint baseline, build green
Blockers: [empty if clean]
```

---

## §A2 — Budget tab grid: proposed/actual/variance side-by-side

### Drop the Actuals tab

Find `BudgetTabNav.tsx` (or equivalent) and remove the "Actuals" entry. Find the Actuals page component (`/budget/.../actuals/page.tsx` or component file `BudgetActualsTab.tsx`) — delete or repurpose.

If the Actuals page had any unique logic (e.g. a variance view that the main Budget tab didn't have), that logic moves into the main Budget tab's grid columns. Surface anything you delete that doesn't have an obvious replacement.

### Budget tab grid columns — new layout

Current grid columns (approximate, from recon): Label | Quantity | Proposed Cost | Category | Notes | ...

New columns: **Label | Category | Quantity | Proposed | Actual | Variance | Notes | [...derived/linked columns]**

- **Proposed** — directly editable, updates `budget_line_items.proposed_cost`
- **Actual** — editable per rules above (single-entry fast path or read-only sum if 2+ transactions). Renders the EFFECTIVE actual (sum of transactions, or fallback to `actual_cost` column).
- **Variance** — computed `Actual - Proposed`. Read-only. Styled:
  - Green text if variance is favourable (under budget for expenses, over forecast for income — depends on the line item's category sign)
  - Red text if unfavourable
  - Muted/gray if zero or no actual yet
- **Indicator** next to the Actual cell when 2+ transactions exist — small icon (📄 or similar) that signals "click slide-over to edit". Tooltip: "X transactions — open detail to edit"

### Total rows (pinned)

The existing per-section pinned totals rows (from the UX14 work) gain Proposed total + Actual total + Variance total. Same per-section grouping as today.

Top-of-budget summary row: aggregate across all sections. Same Proposed/Actual/Variance trio.

### API changes

`GET /api/budget/[tourId]` (or wherever the budget page fetches data) needs to also return transactions per line item OR a derived `effective_actual_cost` per line item.

Cheapest path: extend the existing query to JOIN+aggregate transactions and return `effective_actual_cost` + `transaction_count` per line item. Don't return the full transaction list at the budget-level — that's fetched lazily when the slide-over opens.

### Halt-and-report — §A2

Stop and ping Adam if:

- The existing budget data-fetching layer makes adding `effective_actual_cost` a >150-LOC reshape (suggests we should phase the derived computation differently)
- Variance styling requires new design tokens beyond existing semantic colors (`--lp-status-positive`, `--lp-status-negative`, etc.)
- The pinned totals rows currently render via a path that doesn't support the new derived columns

### §A2 reporting

```
Phase A2 done. Commit: <hash>
Files modified: [paths]
Files deleted: [Actuals tab files]
Verify: tsc=0, lint baseline, build green
Variance styling: confirm red/green tokens used
Smoke test: open the budget tab, confirm Proposed / Actual / Variance render side-by-side. Add a transaction via the slide-over, confirm the grid Actual cell updates to the sum.
Blockers: [empty if clean]
```

---

## Manual Adam steps (for the report)

After both §A1 + §A2 ship:

1. Paste migration 104 into Supabase SQL Editor (apply block format same as previous migrations — CC to write `_apply_104_supabase.sql` alongside the migration)
2. Verify the backfill count with:
   ```sql
   SELECT count(*) FROM public.budget_line_item_transactions WHERE vendor_name = '(legacy entry)';
   ```
3. Re-label "(legacy entry)" vendor names as Adam revisits each line item in the slide-over

---

## Phase A success criteria

- Budget tab grid shows Proposed / Actual / Variance side-by-side per row
- Actuals tab is gone
- Click any line item → slide-over with a Transactions list, add/edit/delete works
- Sum of transactions in the slide-over equals the Actual cell in the grid
- Existing data preserved via the (legacy entry) backfill
- Tour-wide and per-section totals all reflect the effective actual costs

Phase B (Sheets keyboard, smart fields, visual consistency) lands after Adam smokes A and confirms the model is right.

---

## Out of scope (intentionally, do not build in Phase A)

- Cmd+C / Cmd+V across ranges
- Drag-fill handle
- Cmd+Arrow jump-to-edge
- Airtable smart fields (currency-aware cells beyond what already exists, category chips, etc.)
- Visual consistency pass / canonical row heights
- What-if scenarios
- Tour reports with date-range filters
- Cross-tour rollup (one artist, multiple tours)
- Receipt OCR auto-creating transactions (the receipt OCR endpoint can stay as-is; linking to transactions is a polish item for Phase B)

If you see one of these temptations during Phase A work, write it down and surface in the report for Phase B/C scoping. Don't ship it inside Phase A.
