# CC — Budget loose ends (small, after the merge / alongside rooming)

Phase 3 budget is verified done (BUD-41…47). Two small loose ends from the live
verify:

## BUD-49 — transaction DELETE affordance
During the live verify of BUD-43, **no discoverable delete control was found on a
transaction row** (hovering the row surfaced nothing). The DELETE route exists
(`budget_line_item_transactions` DELETE is wired), so this is a UI gap, not a
backend one.
- Confirm whether a transaction row has a clear, discoverable **delete** (trash /
  ✕). If it's there and I just missed it, note where. If it's missing, **add one**
  (per-row, consistent with the slide's other affordances).
- After delete, the line's `actual_cost` follows the existing rule (last-txn
  removal preserves actual; otherwise re-syncs) — already correct, don't change.

## Cleanup (data, not code)
There's a **leftover empty "New transaction" (£0) row on the Freight line** in tour
"Simple Plan Support | Fall'26" — test residue from the verify. Harmless (£0). It
clears the moment the delete affordance above is used; Adam will remove it in his
smoke, or you can if convenient.

## Not loose ends (already correct)
- BUD-47 client-side Actual sync — verified correct both directions; keep it.
- BUD-48 receipt-number-on-reload — code done; it's in Adam's smoke queue.

## Hard rules
Tokens; `next build --webpack`; tsc 0; eslint 0; don't regress BUD-41…48. Verify
before claiming; I'll Chrome-verify the delete affordance. Land BUD-49 in
`budget.md`.
