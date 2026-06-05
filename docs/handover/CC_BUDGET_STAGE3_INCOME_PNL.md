# Claude Code prompt — Stage 3: Income tab + P&L formulas

> The bit that turns the budget from an expense list into a real P&L,
> matching Adam's GN SUMMARY tab and the Charlotte Sands manager PDF.
> Run after Fix-pack A + Polish-pack. Branch off the latest budget branch.
> Deliver in phases; verify each.

## Goal
A budget that calculates a **net profit/(loss)** the way the reference
sheets do: income (guarantees, overage, merch, VIP) minus cost-of-goods,
minus commissions (agent vs management, gross vs net), minus insurance /
contingency / accountancy, minus expenses. Spreadsheet-style: the %
inputs live in settings, the derived rows are computed live (not typed).

## Existing data model (reuse — mostly there already)
- `budget_income` (per routing/show): `pre_tax_guarantee`, `withholding_pct`,
  `post_tax_guarantee`, `pre_tax_overage`, `post_tax_overage`,
  `merch_income`, `vip_income`, `drop_count`, plus `actual_*` mirrors.
- `budget_commissions` (per tour): `label`, `percentage`, `basis`
  (`gross` | `net` | `gross_merch` | `net_merch` | `gross_minus_tax`),
  `order_index`. This already models "agent = gross, management = net".
- `budget_settings` (per tour): `insurance_pct`, `contingency_pct`,
  `accountancy_pct`, currencies, exchange rate.

## Migration 201 (only if needed)
- Add `merch_cogs_pct NUMERIC DEFAULT 0` to `budget_settings` (cost of
  goods on merch) if no equivalent exists. Number starts at 201 per the
  clean-break rule. Idempotent + RLS + down block, per
  `database/migrations/README.md`.

## Phase A — Income tab
- Add an **Income** sub-tab to Budget (wired by the nav prompt as
  Summary · Expenses · Income). Per-show rows sourced from `routing`:
  guarantee, withholding %, (computed) post-tax guarantee, overage,
  merch, VIP — Projected vs Actual columns, same inline-edit + optimistic
  pattern as the expense grid. API: GET/POST `/api/budget/income`
  (already exists — extend as needed). post_tax = pre_tax × (1 −
  withholding/100), computed server-side.

## Phase B — Commission & % settings
- In Budget → Settings: edit `budget_commissions` rows (label, %, basis
  dropdown: gross / net / gross−tax / gross-merch / net-merch) and the
  `insurance_pct` / `contingency_pct` / `accountancy_pct` / `merch_cogs_pct`.
  Style the basis picker like the grid's custom dropdown.

## Phase C — The rollup (Summary P&L)
Compute server-side (one helper, single source of truth) and render a P&L
on the Summary tab in the order the manager PDF uses:

```
Gross income      = Σ guarantees + overage + merch + VIP        (per show)
Merch net         = merch − merch × merch_cogs_pct
Commissionable    = per commission row, base chosen by `basis`
  (gross → gross income; net → income − expenses; gross_minus_tax →
   post-withholding; *_merch → merch lines)
Commissions       = Σ (base × percentage)
Insurance         = total expenses × insurance_pct
Contingency       = total expenses × contingency_pct
Accountancy       = base × accountancy_pct
Total expenses    = Σ line-item actuals + commissions + insurance +
                    contingency + accountancy
NET PROFIT/(LOSS) = gross income − total expenses
```

Show it as a clear waterfall: Income → less commissions & taxes (each
row) → less expenses → **Net**, Projected vs Actual, with the per-section
expense rollup already built feeding "Σ line-item actuals". Derived rows
are read-only/computed (visually distinct from typed cells), and recompute
live as inputs change (reuse the optimistic overlay so there's no page
reload).

## Hard rules
- Reuse the optimistic, no-per-edit-refresh pattern. Token-clean. eslint 0
  + tsc clean + `next build --webpack`. Don't touch the nav shell here.
  Show diffs + line ranges; verify with the GN numbers (income $43,600;
  agency 10% gross = $4,360) and report. Commit nothing.

## Reference figures to validate against
- GN SUMMARY: Agency 10% of gross; Insurance 3%; Contingency 2%; income
  $43,600; total expenses ≈ $48,666 projected.
- Manager PDF: commissionable income $1,000; agency $100 + management
  $150 + business mgmt $50 = $300 commissions; net = income − expenses −
  commissions.
