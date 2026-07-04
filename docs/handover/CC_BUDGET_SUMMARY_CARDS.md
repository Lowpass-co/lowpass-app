# CC — Budget Summary → customizable card dashboard (#29). Build. Design APPROVED. Branch off `main`.

Replaces the current `BudgetSummaryTab` with a dense, customizable **brick dashboard**. The visual is signed
off by Adam — this doc pins it. Presentation-only over `computeBudgetPnl`; **no number is ever recomputed
here.** Branch `feat/budget-summary-cards` off `main` (independent of the venue/bug stack — needs nothing from
it). No migration (Phase 1 layout is in-memory).

> ## ⚙️ PROTOCOL
> Check `BudgetSummaryTab.tsx` + `api/budget/summary/route.ts` + `computeBudgetPnl.ts` first (cite the exact
> PnL fields you read). Build → floor green (tsc 0 · eslint 0 · `next build --webpack`) → Adam click-test →
> commit + PUSH + confirm `git log origin/feat/budget-summary-cards` → report hash + evidence.
>
> ## INVARIANTS
> - **Presentation-only.** Every figure comes from `computeBudgetPnl` / the summary API. Bricks NEVER
>   recompute or mutate. The reconciliation invariant + DEFAULT-content parity stay green.
> - **DEFAULT layout = today's Summary content**, same figures, just re-expressed as bricks in a sensible
>   default order — so nothing is lost on day one.
> - Tokens only (`var(--lp-*)`). Mono for numerics only. Workspace-RLS unchanged.

## The brick set (typed cards, each reads `computeBudgetPnl`)
Build these five as the default dashboard; expose the extra three as hideable/addable cards.
1. **`net-pnl` (hero, full width):** headline Net £ (`.lp-mono`, ~30px/600) + margin % + `actual` vs
   `projected` delta (green/red), and a horizontal **income → expenses → overheads split bar** (widths
   proportional; income green tint, expenses orange tint, overheads violet tint — via `color-mix` of
   `--lp-success` / `--lp-orange` / `--lp-violet`).
2. **`expenses-by-section`:** dense list — section name · thin bar (proportional, orange tint) · £ (mono),
   sorted desc. Straight from the per-section expense sums.
3. **`per-show-pnl`:** mini dense table — show · net (mono, `--lp-success` positive / `--lp-error` negative),
   hairline `--lp-border-subtle` rows, footer "N shows · avg £X".
4. **`committed-burn`:** spent £ of budget + % + a progress bar (`--lp-success`) + "committed £X ·
   remaining £Y". (Reuse the existing Remaining/committed figures — the same ones the budget header shows.)
5. **`overheads-commissions`:** the overhead % lines (Insurance / Accountancy / Contingency / Merch COGS) +
   any commissions, each as `label · base% · computed £` (mono).
Palette (hideable/addable, not shown by default): **`gross-income`**, **`total-expenses`**, **`variance`
(projected vs actual)**.

## Per-brick chrome (match the approved mock, via tokens)
- Card = `var(--lp-surface)` bg · `1px solid var(--lp-border)` · `--lp-radius-lg` (8px) · ~12–13px padding.
  Cards sit ON the page (Phase-1 "not a boxed window" rule) — no heavy outer container.
- Header = an uppercase tracked micro-label (`.lp-label-caps` treatment: 11px/700/0.09em,
  `--lp-text-tertiary`) LEFT + a faint **drag-grip (`ti-grip-vertical`) + eye (`ti-eye`)** RIGHT (the
  show/hide/reorder affordance).
- Numerics: `.lp-mono` + tabular. Labels: sentence/caps as above — never mono on labels.
- Orange restrained (accents/bars only). Green `--lp-success`, red `--lp-error` for P&L signs.
- Page header: title "Summary" + the version chip, and two controls — **"Customize"** (toggles edit mode:
  shows the grips/eyes, enables drag + hide) and **"+ Add card"** (adds a hidden palette brick).

## Interaction — Phase 1 (this build)
- **Show/hide** (eye) + **drag-reorder** the bricks. A `DashboardConfig` (ordered brick ids + hidden set)
  held **in-memory** — NO persistence yet. DEFAULT config = the five bricks above in order.
- Presentation-only: hiding/reordering NEVER changes a number; Net etc. always from `computeBudgetPnl`.
- **Defer to Phase 2 (note it, don't build):** persistence + save-as-template (reuse the `export_templates`
  workspace-scoped pattern when it lands).

Smoke `BUDG-SUM-01..`: DEFAULT dashboard shows today's Summary figures (Net matches `computeBudgetPnl`); hide a
brick → it disappears, numbers unchanged; reorder → order changes, Net unchanged; Adam click-test drives it.

## Hard rules
Branch off `main`, commit + PUSH, confirm `git log origin/feat/budget-summary-cards`, report hash + the exact
`computeBudgetPnl` fields each brick reads (proves presentation-only). Don't touch the P&L math, the versioning
lock, or the income work.
