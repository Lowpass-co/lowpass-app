# Claude Code prompt — Budget finishing sprint (Stage 3 A/B + base fix + cleanup)

> Covers everything left on the budget: the insurance/contingency base
> fix, the two unbuilt Stage 3 phases (Income tab, locked formula
> sections), and the Fix-pack C cleanup. Phase C (the P&L core,
> `computeBudgetPnl.ts`) is already built — do NOT rebuild it; extend it.
> Deliver PHASE BY PHASE, each independently committable; report honestly
> what's done vs not (pitfall #9 below). Branch off latest committed.

---

## ⚠️ PREDICTED PITFALLS — pre-empt every one (these have each cost a round-trip)
1. **No per-edit `router.refresh()`.** Use the existing optimistic
   pattern (`optimistic` state + `commitLineEdit` rollback). New Income
   rows, formula edits, transactions — all reflect instantly, no reload.
2. **Popovers must reuse the portaled `cells/InlineSelectCell.tsx`** —
   never hand-roll `position: fixed` (breaks inside the slide-over
   `transform`).
3. **Never `.single()` on a maybe-empty row** → `.maybeSingle()` + null
   handling.
4. **`section_id` is the only grouping concept.** Don't surface
   `category` (see Phase 4.1).
5. **New rows append at the BOTTOM + auto-focus** (`autoEditLineId`).
6. **$0 rows are not duplicates** (`detectDuplicates` already skips them).
7. **Computed/derived rows are READ-ONLY** (reuse the derived-line +
   `isUx14DerivedBudgetLine` pattern; users edit inputs, not results).
8. **Migrations start at 202** (200 sections, 201 merch_cogs). Idempotent,
   RLS, down block, `md5()::uuid` + `ON CONFLICT` for any seed.
9. **Build + verify; don't over-claim.** `next build --webpack` green;
   eslint 0; ignore stale `.next/types` tsc noise but report the real
   build; show diffs + line ranges; commit nothing.
10. **Reuse Fix-pack B assets:** `BudgetConfirmDialog`/`useBudgetConfirm`
    (never `window.confirm`); the append+auto-focus pattern.
11. **VALIDATE COMPONENTS, NOT JUST TOTALS.** Last pass, total expenses
    matched GN ($48,666) while insurance/contingency were individually
    wrong — the total hid it. Always check each computed line against the
    reference sheet, not the bottom line alone.

---

## Phase 1 — Insurance / contingency base fix (do FIRST; the P&L is wrong without it)
The P&L currently computes insurance and contingency as % of *total
expenses*. Adam's GN sheet does NOT: insurance = % of **gross income**,
contingency = % of **expenses before contingency**. Make the base
**configurable**, defaulting to the GN convention.

- **Migration 202**: add to `budget_settings` —
  `insurance_basis TEXT DEFAULT 'income_gross'`,
  `contingency_basis TEXT DEFAULT 'expenses_pre_contingency'`,
  `accountancy_basis TEXT DEFAULT 'income_gross'`. Idempotent + RLS + down.
- **Basis vocabulary** (compute in `computeBudgetPnl.ts`):
  - `income_gross` = Σ guarantees + overage + merch + VIP.
  - `expenses_total` = Σ line-item actuals + commissions + insurance + contingency.
  - `expenses_pre_contingency` = Σ line-item actuals + commissions + insurance (i.e. everything except contingency itself).
- Apply each %'s configured basis. Settings UI: a small `InlineSelectCell`
  basis picker next to each of insurance / contingency / accountancy %.
- **Re-validate component-by-component (pitfall #11):** with GN inputs and
  defaults, insurance = 3% × $43,600 = **$1,308.00**, contingency = 2% ×
  pre-contingency = **$954.25**, total ≈ **$48,666**. Report all three,
  not just the total.

## Phase 2 — Income tab
Add **Income** as the third Budget sub-tab (Summary · Expenses · Income).
Per-show rows from `routing`: guarantee, withholding %, (computed)
post-tax = pre_tax × (1 − withholding/100), overage, merch, VIP —
Projected vs Actual, using the SAME inline-edit + optimistic + append +
auto-focus pattern as the expense grid. Extend GET/POST
`/api/budget/income`. The P&L's `income_gross` already expects these.

## Phase 3 — Locked formula sections + preset "add section" picker
"+ Add section" opens a picker (Advance-section style) listing:
- **Preset sections** from the tour's template sections (plain).
- **Locked formula sections** (computed, read-only, lock affordance,
  formula visible; edit the % in Settings, not the cell):
  - **Commission** — rows from `budget_commissions` (label, %, basis via
    `InlineSelectCell`); amount = base × % per `basis`.
  - **Insurance** = income/expenses × insurance_pct (per Phase 1 basis).
  - **Contingency** = base × contingency_pct (per Phase 1 basis).
  - **COGS** = merch × merch_cogs_pct.
  - **Custom…** at the bottom — blank user-named section.
- One of each locked type per tour. The values already exist in
  `computeBudgetPnl` — this phase surfaces them as sections, so the grid
  and the Summary waterfall read the same numbers.

## Phase 4 — Cleanup (was Fix-pack C)
1. **Retire Category from the UI.** Remove `CategoryChipDropdown` from the
   slide-over; Section is the only grouping control. Keep `category` in
   the DB; switch any grouping/dup-detection that still keys on it to
   `section_id`.
2. **Phase toggle must not reload** (FAIL): optimistic client state drives
   `BudgetPhaseStripReveal` `visible` (smooth slide), persist
   `track_phases` in the background, no `router.refresh()`. Lift
   `trackPhases` to a shared client context if needed.
3. **Transactions slide-over optimistic.** Adding/editing a transaction in
   `TransactionsSection` currently `router.refresh()`es and closes the
   panel — give it the optimistic treatment (stays open, instant, persist
   in background).
4. **Template editor polish:** uniform System/Yours rows; the editable
   name box shouldn't look cheap; move the expand chevron so it doesn't
   shove "Apply to tour"; add a **Copy** button to custom templates.
5. **Section subtotal to the LEFT** — move each section header's
   est/act/var to sit by the name + trash so it stops drifting.
6. **Snappy bulk delete** — optimistic remove + batched requests.

## Verify (per phase)
eslint 0; `next build --webpack` green. Phase 1: report insurance /
contingency / total individually vs GN. Phase 2/3: optimistic, no reload,
read-only formula cells. Phase 4: no Category control, phase toggle
animates without reload, transactions stay open. Show diffs + line ranges;
commit nothing; say honestly what's done vs not.
