# CC — P&L / Summary → brick dashboard builder (#29). Stage A (map + plan + phasing). Gated. Branch off `main`.

Adam wants the budget **Summary** rebuilt from the current fixed report into a **configurable brick/card
dashboard** he can arrange — the financial equivalent of the export template builder. **Map it, propose a
phasing, surface the decisions. No code.**

## ⛔ Stage A — MAP ONLY → `PNL_DASHBOARD_MAP.md`
1. **Map the current Summary.** `src/components/budget/BudgetSummaryTab.tsx` (+ `ArtistBudgetSummary*`,
   `src/app/api/budget/summary/route.ts`) renders today's headline cards (Gross Income · Total Expenses ·
   Net) + the grouped P&L report, all from **`computeBudgetPnl`** (the `incomeBreakdown` + per-section
   sums). Map exactly what data is available to render (the PnL pairs, the income breakdown, per-show, the
   overheads/commissions) — this is the brick "data palette."
2. **Propose the brick model.** A dashboard = an ordered/positioned set of **bricks**, each a typed card
   reading from `computeBudgetPnl` (e.g. `pnl-net`, `gross-income`, `expense-by-section`, `variance`,
   `per-show-pnl`, `merch`, `burn-rate`, `top-variances`). Recommend: the brick **type set**, the layout
   model (a simple grid / drag-reorder — mirror the export template builder's section model so it's
   familiar), and that bricks are **presentation-only** (numbers always from `computeBudgetPnl`, never
   recomputed — the reconciliation invariant holds).
3. **Persistence + sharing.** A dashboard layout is a config (like a template). Recommend reusing the
   **`export_templates` pattern** (a `dashboard_layouts` table OR a layout in budget settings) —
   workspace-scoped, a default per tour/workspace. Decide: per-tour layout vs a saveable/shareable
   workspace template (mirror the export D-SHARE decision — workspace-scoped + copy-on-apply).
4. **Phasing.** Recommend the smallest useful Phase 1 (e.g. the fixed bricks rendered + show/hide/reorder,
   no persistence), then styling, then save/apply. Be honest about effort.
5. **Blast radius.** Don't touch `computeBudgetPnl`'s math (the P&L stays the single source); the Summary's
   existing consumers; the versioning lock; the income work. Confirm the dashboard is **read-only over the
   P&L**.

Surface the brick-type set + the layout/persistence model + the phasing with recommendations. **Then stop.**

## Hard rules
- **Branch off `main`. Commit the map + PUSH. Confirm `git log origin/<branch>`.** Name real files/lines.
- Presentation-only — the dashboard NEVER changes the numbers (P&L from `computeBudgetPnl`). Workspace-RLS
  on any layout storage. Reuse the export template-builder patterns where they fit (familiar + proven).
