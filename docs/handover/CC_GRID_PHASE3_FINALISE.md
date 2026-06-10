# CC — Phase 3 finalise: complete the Budget (Expenses) grid, then flip default

The mount is live-verified sound (`CC_GRID_PHASE3_VERIFY.md`): rows render,
edits persist + survive reload, derived locks enforced, statuses + derived
sourcing correct. The currency-totals fix is in flight. This prompt finishes the
remaining sandbox/playbox features against the real tables so **Grid (beta) can
become the default**.

Prerequisite: the totals-currency fix lands first (totals + section headers in
the DISPLAY currency via `src/lib/budget/fx.ts`, not `gridModel.FX`).

Each step independently verifiable (build the floor before the ceiling). For the
two steps that touch new tables/routes (Transactions, Documents), **map the
route + table first, like Stage A — don't guess.**

## Step 1 — Currency: bind the grid to the live DISPLAY selector
**Live-verified gap (2026-06-08, after BUD-40):** BUD-40 correctly routes totals
through the injected `fx`, so at DISPLAY=GBP everything reads £11,550 matching
the burn bar. **But the grid's `fx.displayCurrency` is pinned to GBP** — flipping
the page DISPLAY selector to **USD** converts the **burn bar** to `US$14,620`
while the **grid cells AND totals stay £11,550**. The grid ignores the selector.
- Bind `BudgetGridView`'s injected `fx.displayCurrency` to the **same source the
  burn bar uses** (the `?display=` param / the budget display-currency setting),
  and re-render the grid when it changes — so cells + totals convert together
  with the rest of the surface.
- A line whose `currency` differs from the DISPLAY currency then renders **red**
  with the source-amount note (GRID_SPEC §4). Verify with a non-display-currency
  line (e.g. set DISPLAY=USD → the GBP lines show red converted values).

## Step 2 — Reorder persistence (rows + sections)
Currently deferred (BUD-38). Wire the grid's existing row/section drag to
persist `sort_order`:
- row drag → PATCH `budget_line_items.sort_order` (within section);
- section drag → PATCH `budget_sections.sort_order`;
- optimistic, survives reload. Reuse the existing routes. Derived rows: keep
  reorderable for display but confirm reconcile doesn't fight the order (it
  orders by sort_order then order_index per the map §2).

## Step 3 — Slide Transactions CRUD  (MAP FIRST)
The slide's Transactions section must read/write the real
`budget_line_item_transactions` (`vendor_name·paid_at·amount·currency·receipt_id`).
- First: find/confirm the API route for line-item transactions (the map noted
  `enrichLinesWithTransactionAggregates` + the table; check
  `src/app/api/budget/line-items/[id]/…`). If none exists, that's a flagged
  decision, not an invented route.
- Add / edit (name=vendor_name, date=paid_at, amount) / delete; the line's
  `actual_cost` stays in sync via the existing `syncActualCostIfNoOverride`
  unless `actual_cost_override` (decision 6) — don't double-write.
- "Attach receipt" → link/create an `expense_receipts` row (the BUD-30 system)
  and set `receipt_id`; renaming a receipt updates the txn label (the SLIDE-06
  doc-id reference pattern).

## Step 4 — Slide Documents CRUD  (MAP FIRST)
Wire the slide's Documents to `budget_line_item_attachments`
(`file_type·file_name·file_url·id`) via the existing
`line-items/[id]/attachments/route.ts` (it exists — confirm verbs). Add (type
picker) / rename (auto-focus) / delete; undoable.

## Step 5 — Receipts column
The grid's 📎 Receipts cell → real count (transactions' receipts +
attachments) + the toaster listing them with "open line ↗", reading the same
sources as steps 3/4. No new table.

## Step 6 — Flip the default
Only after steps 1–5 are live-verified: make **Grid the default** view on
Budget → Expenses (Classic remains available via the toggle). Update the toggle
default + note in `budget.md`.

## Explicitly still deferred to Phase 4 (do NOT build here)
Income column set, settlement slide, projections, deal memos, and the
`transaction_links` person/show relational graph (the slide's "Link to a person
or show" stays a Phase-4 stub on the budget surface).

## Hard rules
- Map both sides before writing for steps 3–4; surface questions, don't guess
  routes/columns.
- Migrations (if any) 200-block, sequential, read the README; idempotent.
- Tokens; `next build --webpack`; tsc 0; eslint 0; don't regress the branch.
- **Verify before claiming** — name files/lines; mark build/code-verified vs
  needs-live. I live-verify each step on the preview via Chrome DOM before the
  default flips.
- Land smoke IDs in `budget.md` (cross-ref `grid.md`).
