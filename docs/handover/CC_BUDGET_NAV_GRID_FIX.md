# Claude Code prompt — Budget grid coverage + nav prominence + layer collapse

> Post-merge fixes from Adam's click-test of the grid+nav on main. Three
> issues: (1) the budget grid didn't get the new look, (2) the top product
> bar is too quiet, (3) the budget top is over-layered. Branch off main
> (e.g. `feat/budget-nav-grid-fix`). Use the UI/UX skill. Visual/shell
> only — no schema, no P&L math. Deliver per fix; report honestly.

## Pitfalls (each has cost a round-trip)
- No per-edit `router.refresh()`; popovers reuse the portaled
  `InlineSelectCell`; pure helpers stay out of `'use client'` modules;
  `.maybeSingle()`; reuse `BudgetConfirmDialog`. Token-clean
  (`var(--lp-…)`/`color-mix`), no hardcoded hex (orange tints hex+alpha).
  `next build --webpack` green; eslint 0; show diffs + ranges; commit
  nothing. **Verify in a webpack dev server** (`npm run dev` here is
  `next dev --webpack`, NOT Turbopack — it runs fine; click through).

## Fix 1 — Bring `BudgetSpreadsheetView` into the grid standard (the "didn't push")
The grid-system pass restyled the shared `SpreadsheetGrid` + `DataTable`,
but the Budget tab renders the **bespoke `BudgetSpreadsheetView`**, which
was skipped — so it's still narrow, left-aligned, cosy, and on the old
`useBudgetDensity`. Bring it to the SAME standard the primitives now use:
- **Fill the container width** + render as ONE elevated panel (own bg,
  border + faint ring) so it matches `SpreadsheetGrid`. Remove the
  left-align/`maxWidth` confinement.
- Wire it to the shared **`useAppDensity`** (drop the local
  `useBudgetDensity` path) so Compact/Comfortable/Spacious actually resize
  its rows + type, **default Comfortable** (the large/readable size).
- The Income tab grid must match too.
(Long-term these could migrate onto `SpreadsheetGrid`; for now just match
the standard on the bespoke component.)

## Fix 2 — Make the top product bar obvious
`TopProductNav` is too thin/quiet to read as primary nav. Give it weight:
larger item text, a clear **active state** (the current product —
e.g. Budget — gets a solid brand treatment: orange text + subtle filled
pill/background, not just a faint colour), and enough bar height/contrast
that it's unmistakably the app's top-level nav. Keep the hover dropdowns.

## Fix 3 — Collapse the budget top layers (reference mock provided)
Right now it's four stacked layers before a line item: product bar →
Summary/Expenses/Income sub-bar → tour identity header → burn bar. Collapse
to TWO bands + content:
- **Band 1:** the prominent product bar (Fix 2).
- **Band 2 — one context band:** compact tour identity (avatar + artist ·
  tour name) on the left, **Summary · Expenses · Income as clear tabs**
  (active = underline/weight, unmistakably tabs) next to it, and the
  right-side actions (Display currency, Export, Settings gear) on the
  right. This MERGES the old separate sub-bar + tour-header into one row,
  so the tabs sit WITH the budget and a whole stacked layer disappears.
- Then the **burn bar**, then the **grid**.
Apply the same context-band pattern to the other tour-scoped products
where it makes sense (Operations etc.) so it's consistent — but Budget is
the one to get right first.

## Verify
`next build --webpack` green; eslint 0. In the dev server: Budget grid is
full-width + elevated + resizes with the density toggle (default
Comfortable); the product bar reads as the primary nav with a clear active
state; the budget top is two bands (product bar + context band with tabs)
then burn bar then grid — not four stacked layers. Show diffs + ranges.
