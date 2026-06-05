# Claude Code prompt — Stage 3: Income tab + P&L + locked formula sections

> The payoff stage: turn the budget into a real P&L (income − cost of
> goods − commissions − insurance/contingency − expenses = net), matching
> Adam's GN SUMMARY tab and the Charlotte Sands manager PDF. Also adds
> **locked formula sections** (Commission / Insurance / Contingency / COGS)
> surfaced in a preset "add section" picker. Run after Fix-pack A/B +
> linking are committed and green. Branch off latest.

---

## ⚠️ PREDICTED PITFALLS — read first, pre-empt every one
These are the exact mistakes made repeatedly on this project. Do NOT
re-make them. Each has cost a round-trip already.

1. **No `router.refresh()` after edits.** Every per-edit refresh caused a
   full-page reload flash and got removed. Use the existing OPTIMISTIC
   pattern in `BudgetSpreadsheetView.tsx` (`optimistic` state +
   `commitLineEdit` rollback; clear on `[lines]` change). New income /
   commission edits must reflect instantly with NO per-edit refresh.
2. **Popovers must portal.** Any new dropdown/menu (commission `basis`
   picker, etc.) must reuse `cells/InlineSelectCell.tsx`, which now
   portals to `document.body`. NEVER hand-roll a `position: fixed` menu —
   it breaks inside the slide-over's `transform` (the menu renders
   off-screen). If you need a select, use `InlineSelectCell`.
3. **Never `.single()` on a maybe-empty row.** It throws "Cannot coerce
   the result to a single JSON object" under RLS / 0 rows. Use
   `.maybeSingle()` and handle null with a clear JSON error, or
   `.select().single()` only on a row you just inserted.
4. **`section_id` is the grouping source, not `category`.** Income +
   every formula section must carry a real `section_id` (auto-create the
   section if missing). Do not introduce free-text category orphans.
5. **New rows append at the BOTTOM and auto-focus** for inline naming
   (matches Fix-pack B). Don't prepend.
6. **Zero-cost rows are not duplicates.** `detectDuplicates` already
   skips $0 pairs — income/placeholder rows must not trip the duplicate
   banner. Don't re-introduce the warning.
7. **Computed rows are READ-ONLY, like derived lines.** Reuse the derived
   pattern: mark formula/computed rows, block editing (PATCH 409 +
   `isUx14DerivedBudgetLine`-style guard), recompute from inputs. Users
   edit the % inputs (in settings), not the computed cell.
8. **Migrations start at 201** (200 = sections/templates; linking used
   none). Verify the next free number vs main + branches. Mirror it in
   the header; idempotent; RLS; down block. For any seed, `md5(text)::uuid`
   + `ON CONFLICT (id) DO NOTHING` is the established idempotent idiom.
9. **Actually build + verify.** `tsc` shows stale `.next/types` noise —
   ignore those, but run `next build --webpack` and report the real
   result. eslint 0. Show diffs + line ranges. Do NOT claim done without
   showing it (this has bitten us). Commit nothing.
10. **Stay in lane.** Read Operations data; don't refactor Operations.
   Don't touch the nav shell (separate initiative).
11. **Reuse Fix-pack B assets — don't reinvent.** Confirms →
   `BudgetConfirmDialog` / `useBudgetConfirm` (NEVER `window.confirm`).
   New Income rows → the same append-at-bottom + auto-focus-on-create
   pattern (`autoEditLineId` / `autoEditSectionId`). Any select (e.g. the
   commission `basis` picker) → the portaled `InlineSelectCell`. The
   branded confirm + optimistic patterns already exist; wire to them.

---

## Existing data model (reuse)
- `budget_income` (per show): `pre_tax_guarantee`, `withholding_pct`,
  `post_tax_guarantee`, `pre_tax_overage`, `post_tax_overage`,
  `merch_income`, `vip_income`, plus `actual_*` mirrors.
- `budget_commissions` (per tour): `label`, `percentage`, `basis`
  (`gross`|`net`|`gross_merch`|`net_merch`|`gross_minus_tax`),
  `order_index`. Already models "agent = gross, management = net".
- `budget_settings` (per tour): `insurance_pct`, `contingency_pct`,
  `accountancy_pct`, `track_phases`, currencies.
- `budget_sections` / `section_id` (from migration 200).

## Migration 201 (only if needed)
Add `merch_cogs_pct NUMERIC DEFAULT 0` to `budget_settings` if no
equivalent exists. Idempotent + RLS + down block. Number = 201.

## Phase A — Income tab
Add **Income** as a Budget sub-tab (Summary · Expenses · Income — the nav
prompt already reserves it). Per-show rows from `routing`: guarantee,
withholding %, (computed) post-tax, overage, merch, VIP — Projected vs
Actual, using the SAME inline-edit + optimistic pattern as the expense
grid (pitfall #1). `post_tax = pre_tax × (1 − withholding/100)` computed
server-side. Extend GET/POST `/api/budget/income`.

## Phase B — Locked formula sections + preset "add section" picker
This absorbs Adam's idea: the "+ Add section" control opens a picker
(like the Advance section menu) listing:
- **Preset sections** from the tour's template sections (plain).
- **Locked formula sections** — special, pre-wired, computed:
  - **Commission** — rows = `budget_commissions` (label, %, basis via
    `InlineSelectCell`); each computed amount = base × % where base is
    chosen by `basis`. Read-only computed cells.
  - **Insurance** = total expenses × `insurance_pct`.
  - **Contingency** = total expenses × `contingency_pct`.
  - **COGS** (cost of goods) = merch × `merch_cogs_pct` (deduction).
  - **Custom…** at the bottom — a blank user-named section.
Locked sections show a lock affordance, their formula visible, and edit
the % inputs in Settings (not the computed cell). Only one of each locked
type per tour.

## Phase C — The rollup (Summary P&L)
One server helper (single source of truth), rendered as a waterfall in
the manager-PDF order, Projected vs Actual:
```
Gross income   = Σ guarantees + overage + merch + VIP
Merch net      = merch − merch × merch_cogs_pct
Commissionable = per row, base by `basis` (gross→gross income;
                 net→income−expenses; gross_minus_tax→post-withholding;
                 *_merch→merch lines)
Commissions    = Σ (base × percentage)
Insurance      = total expenses × insurance_pct
Contingency    = total expenses × contingency_pct
Accountancy    = base × accountancy_pct
Total expenses = Σ line-item actuals (incl. derived from linking) +
                 commissions + insurance + contingency + accountancy
NET (LOSS)     = gross income − total expenses
```
Computed rows are read-only/visually distinct; recompute live via the
optimistic overlay (no reload). The per-section rollup already built
feeds "Σ line-item actuals".

## Verify
eslint 0; `next build --webpack` passes. Validate the math against:
- GN SUMMARY: agency 10% of gross; insurance 3%; contingency 2%; income
  $43,600; total expenses ≈ $48,666 projected.
- Manager PDF: commissionable $1,000; agency $100 + mgmt $150 + business
  mgmt $50 = $300; net = income − expenses − commissions.
Report diffs + line ranges + the computed totals. Commit nothing.
