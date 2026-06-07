# Claude Code prompt — Budget visual pass (scannable, full-width, burn bar)

> Pure visual/interaction polish on the budget grid — no schema, no P&L
> math changes. Goal: make it read as a big, clean spreadsheet, not a
> cosy left-aligned list. Cut a fresh branch off main (e.g.
> `feat/budget-visual`). Use the UI/UX skill for craft. Deliver per task,
> commit-able; report honestly.

## Hard rules / pitfalls (each has cost a round-trip)
- **No per-edit `router.refresh()`** — reuse the optimistic overlay.
- **Popovers reuse the portaled `cells/InlineSelectCell.tsx`** — never
  hand-roll `position: fixed` (breaks in the slide-over `transform`).
- **Pure helpers the server calls must NOT live in `'use client'`
  modules** (the Riders crash).
- `.maybeSingle()` not `.single()`; `section_id` is the grouping concept
  (Category is retired); reuse `BudgetConfirmDialog`.
- Token-clean (`var(--lp-…)` / `color-mix`); no hardcoded hex (orange
  tints hex+alpha only). `next build --webpack` green; eslint 0; show
  diffs + line ranges; commit nothing.

## Task 1 — Full-width, elevated grid
Today the grid is left-aligned and confined, leaving the right half of
the screen empty even at the loosest setting. Make it **fill the
available width** and render as **one elevated panel** — its own
background, a border + faint ring — so it visibly "pops" off the page as
a grid surface (reference: the band-pic mock Adam likes). Remove the
max-width / left bias. The Income tab grid gets the same treatment.

## Task 2 — Three-level density that works EVERYWHERE
There's a density toggle but it doesn't propagate. Make it **three
levels** driven by the existing `BudgetDensityContext`:
- **Compact** — today's cosy size.
- **Comfortable** — large/readable (~44px rows, ~14px text). **This is
  the new DEFAULT.**
- **Spacious** — bigger again.
Persist per-tour (localStorage, like the group-by pref) and **apply on
every budget surface** — the main grid, the Income tab, section headers,
and any other budget table — not just the main grid (it currently
doesn't reach them). Verify each surface visibly changes size.

## Task 3 — Burn-bar summary (replace the stat strip)
Replace the four KPI cards with a single budget **burn bar** (reference
mock provided to Adam):
- Lead with **Remaining** (the runway number) large, with "of $X budget".
- A horizontal **meter**: filled portion = spent / budget, a track for
  the rest; show "Spent $X · NN% used" above and "Committed $X" below.
- A thin **marker** on the bar where Committed sits.
- The bar turns **red** (danger token) once spent crosses 100% of budget.
- A **Variance** read on the right (actuals vs estimate), up/down arrow,
  red over / green under.
Use the UI/UX skill — this should feel bespoke to a finance tool, not a
generic KPI row. Token-clean, works in light + dark.

## Task 4 — One summary, clean section headers
The est/act/var summary now lives ONLY in the burn bar up top. **Section
group headers become just `NAME · count`** — drop the repeated
`est … · act … · var …` triplet from every header (and the duplicate in
the filter bar). One summary place, quiet headers, easy to scan.

Keep all existing buttons/affordances (Open, Add line, Add section,
status pills, the row controls).

## Verify
`next build --webpack` green; eslint 0. Confirm: grid is full-width +
elevated; density toggle changes size on the main grid AND the Income tab
AND section headers (default = Comfortable); burn bar renders, crosses-100
turns red, committed marker shows; section headers are name · count only.
Show diffs + line ranges; say honestly what's done vs not.
