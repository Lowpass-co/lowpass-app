# Claude Code prompt — Budget finishing sprint (post-merge, current)

> Everything is merged to main now (budget redesign + P&L core + linking
> + stage-plot/rider/channel-list + the Riders server/client fix). This is
> the single remaining sprint. Cut a fresh branch off main
> (e.g. `feat/budget-finish`). Deliver PHASE BY PHASE, each independently
> committable; report honestly what's done vs not. This supersedes the
> older CC_BUDGET_SPRINT_FINISH / FIXPACK_C docs.

---

## ⚠️ PREDICTED PITFALLS — pre-empt every one (each has cost a round-trip)
1. **No per-edit `router.refresh()`.** Reuse the optimistic pattern in
   `BudgetSpreadsheetView.tsx` (`optimistic` state + `commitLineEdit`
   rollback; cleared on `[lines]`). New income rows, formula edits,
   transactions, the phase toggle — all reflect instantly, NO reload.
2. **Pure functions that the SERVER calls must NOT live in a `'use client'`
   module.** This is what crashed Riders ("riderPackRowsFromServer is on
   the client"). Put shared pure helpers in a plain `.ts` (no `'use
   client'`) and import from both sides. Types can be re-exported from a
   client module; functions cannot be called server-side from one.
3. **Popovers must reuse the portaled `cells/InlineSelectCell.tsx`** —
   never hand-roll `position: fixed` (breaks inside the slide-over
   `transform`).
4. **Never `.single()` on a maybe-empty row** → `.maybeSingle()` + null
   handling.
5. **`section_id` is the only grouping concept.** Don't surface
   `category` (Phase 4.1 removes it).
6. **New rows append at the BOTTOM + auto-focus** (`autoEditLineId`).
7. **$0 rows are not duplicates** (`detectDuplicates` already skips them).
8. **Computed/derived rows are READ-ONLY** (reuse the derived-line +
   `isUx14DerivedBudgetLine` pattern; users edit inputs, not results).
9. **Migrations: 200/201/202 are used and applied.** Phase 1 needs NO new
   migration (the `*_basis` + `merch_cogs_pct` columns already exist). If
   you genuinely need a new column, start at 203 — idempotent, RLS, down
   block, `md5()::uuid` + `ON CONFLICT` for seeds.
10. **Build + verify; don't over-claim.** `next build --webpack` green;
    eslint 0; ignore stale `.next/types` noise but report the real build;
    show diffs + line ranges. Reuse `BudgetConfirmDialog`/`useBudgetConfirm`
    (never `window.confirm`).
11. **VALIDATE COMPONENTS, NOT JUST TOTALS.** The P&L total matched GN
    ($48,666) while insurance/contingency were individually wrong — the
    total hid it. Check each computed line against the reference, not just
    the bottom line.

---

## Phase 1 — Fix the P&L insurance/contingency base (do FIRST; it's wrong now)
`computeBudgetPnl.ts` puts insurance + contingency on *total expenses*.
Adam's GN sheet does NOT: insurance = % of **gross income**, contingency
= % of **expenses before contingency**. The basis columns ALREADY EXIST
on `budget_settings` (`insurance_basis`, `contingency_basis`,
`accountancy_basis`, `merch_cogs_pct`) — so NO migration. Just:
- Make `computeBudgetPnl.ts` read each `*_basis` and compute against it:
  - `income_gross` = Σ guarantees + overage + merch + VIP.
  - `expenses_total` = Σ line-item actuals + commissions + insurance + contingency.
  - `expenses_pre_contingency` = Σ line-item actuals + commissions + insurance.
  - Defaults if a basis is null: insurance `income_gross`, contingency
    `expenses_pre_contingency`, accountancy `income_gross` (GN convention).
- Settings UI: a small `InlineSelectCell` basis picker beside each %.
- **Re-validate component-by-component (pitfall #11):** with GN inputs,
  insurance = 3% × $43,600 = **$1,308.00**, contingency = 2% × pre-cont =
  **$954.25**, total ≈ **$48,666**. Report all three.

## Phase 2 — Income tab
Add **Income** as the third Budget sub-tab (Summary · Expenses · Income).
Per-show rows from `routing`: guarantee, withholding %, computed post-tax
= pre_tax × (1 − withholding/100), overage, merch, VIP — Projected vs
Actual, same inline-edit + optimistic + append + auto-focus pattern as the
expense grid. Extend GET/POST `/api/budget/income`. The P&L's
`income_gross` already expects these.

## Phase 3 — Locked formula sections + preset "add section" picker
"+ Add section" opens a picker (Advance-section style):
- **Preset sections** from the tour's template sections (plain).
- **Locked formula sections** (computed, read-only, lock affordance,
  formula visible; edit the % in Settings, not the cell):
  - **Commission** — rows from `budget_commissions` (label, %, basis via
    `InlineSelectCell`); amount = base × % per basis.
  - **Insurance** / **Contingency** — per Phase 1 basis.
  - **COGS** = merch × `merch_cogs_pct`.
  - **Custom…** — blank user-named section.
- One of each locked type per tour. Values already come from
  `computeBudgetPnl` — surface them so grid + Summary read the same numbers.

## Phase 4 — Cleanup
1. **Retire Category from the UI.** Remove `CategoryChipDropdown` from the
   slide-over; Section is the only grouping control. Keep `category` in
   the DB; switch any grouping/dup-detection still keyed on it to
   `section_id`.
2. **Phase toggle must not reload.** Optimistic client state drives
   `BudgetPhaseStripReveal` `visible` (smooth slide); persist
   `track_phases` in the background; no `router.refresh()`. Lift
   `trackPhases` to a shared client context if needed.
3. **Transactions slide-over optimistic.** Adding/editing a transaction in
   `TransactionsSection` currently `router.refresh()`es and closes the
   panel — make it optimistic (stays open, instant, persist in background).
4. **Template editor polish:** uniform System/Yours rows; the editable
   name box shouldn't look cheap; move the expand chevron so it doesn't
   shove "Apply to tour"; add a **Copy** button to custom templates.
5. **Section subtotal to the LEFT** — move each section header's
   est/act/var beside the name + trash so it stops drifting.
6. **Snappy bulk delete** — optimistic remove + batched requests.

## Verify (per phase)
eslint 0; `next build --webpack` green. Phase 1: report insurance /
contingency / total individually vs GN. Phases 2/3: optimistic, no reload,
read-only formula cells. Phase 4: no Category control, phase toggle
animates without reload, transactions stay open. Show diffs + line ranges;
say honestly what's done vs not.
