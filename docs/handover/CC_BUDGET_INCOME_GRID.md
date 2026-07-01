# CC — Migrate the Budget **Income** tab to the canonical `<Grid>`

Adam confirmed: the Expenses tab is already on canonical `<Grid>` (BUD-46). The
budget input that's **still old** is the **Income** tab (`BudgetIncomeTab.tsx`) —
a bespoke hand-rolled inline-edit table built on
`@/components/budget/cells/BudgetCellInput`, NOT `<Grid>` and not even
`<SpreadsheetGrid>`. Bring it onto the same canonical `<Grid>` as Expenses.

## The anchor you must not break
`BudgetIncomeTab` is **routing-keyed** — one row per routing date (show), fields:
`pre_tax_guarantee`, `withholding_pct`, `pre_tax_overage`, `merch_income`,
`vip_income` + the four `actual_*` mirrors, computed `post_tax =
pre_tax × (1 − withholding/100)`, Projected↔Actual toggle.

⚠ **The Summary P&L's `income_gross` consumes these exact fields** (file header
says so). The data shape, field names, and the merge-safe upsert endpoint must stay
**byte-identical**. This is the bridge — map both sides before crossing.

## ⛔ Gated: Stage A (map, no code) → review → Stage B

### Stage A — map (NO code) → `docs/handover/BUDGET_INCOME_MAP.md`
1. `BudgetIncomeTab` render + state: how rows are built from routing, the
   inline-edit/optimistic write path, the upsert endpoint, the Projected/Actual
   toggle, the computed post-tax column.
2. The **P&L consumer**: find exactly where `income_gross` / the Summary reads these
   income fields. Name the file/function. Confirm what the migration must preserve.
3. How Expenses mounts canonical `<Grid>` (`BudgetGridView` → `@/components/grid`):
   the column model, fx/currency binding, status/derived columns, the Proposed/
   Actual/Variance pattern — so income reuses the same primitives.
4. **Decision for Adam:** income rows are routing-anchored (one per show), not
   free-add like Expenses. Two ways to render on `<Grid>`:
   - (a) **plain `<Grid>`**, rows = shows, a Date/Venue column, no add/delete —
     matches Expenses visually. Simplest. **Recommend.**
   - (b) routing-anchored (days-on-left rail) — consistent with the rail surfaces
     but heavier and not what Adam asked for.
   Map both; recommend (a); let Adam pick. Then stop.

### Stage B — build (after the map is approved)
1. Re-mount the Income tab on canonical `<Grid>` (option chosen in Stage A),
   reusing the Expenses column/fx/variance primitives. Keep Date/Venue/City + the
   Projected/Actual treatment (fold into the Grid's variance display if it fits).
2. **Preserve** every income field + the upsert endpoint + the P&L feed exactly.
   Computed post-tax = a derived read-only Grid column.
3. Delete the bespoke `BudgetCellInput` income path only if nothing else uses it
   (grep first; if shared, leave it).

## Hard rules
- Tokens; `next build --webpack`; tsc 0; eslint 0.
- **Don't change the income data shape, field names, or the P&L feed.** After build,
  the Summary P&L must show identical income_gross for the same inputs.
- **Verify before claiming** — name files/lines; mark build vs needs-live. I
  Chrome-verify: edit a guarantee/withholding/merch/VIP cell → post-tax recomputes,
  persists with no reload, AND the Summary P&L income matches. Projected↔Actual
  toggle intact.
- Land smoke IDs + add Adam's manual smokes to `SMOKE_QUEUE.md`.
