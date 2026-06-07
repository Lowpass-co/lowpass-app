# Claude Code prompt — App-wide grid design system (RUN FIRST)

> Make every grid in the app look + feel like the budget grid Adam likes:
> full-width, elevated, large/scannable, with a 3-level density that works
> everywhere. Do it ONCE in the shared primitives so all consumers
> inherit it — don't restyle grids one by one. Pairs with
> `CC_NAV_IA_TWO_BAR.md` (run AFTER this); see "How these feed each other"
> at the bottom. Branch off main (e.g. `feat/grid-system`). Use the UI/UX
> skill. Deliver phase-by-phase; verify EVERY consumer; report honestly.

## The two primitives + the density factory
- **`src/components/spreadsheet-grid/SpreadsheetGrid.tsx`** — spreadsheets.
  Consumers: budget (via `budget/sections/*.columns.ts`), channel list
  (`ChannelListTourSheet`), payroll (`PayrollRatesSpreadsheet`).
- **`src/components/data-table/DataTable.tsx`** — lists. Consumers: tours,
  riders (`RiderPacksTourClient`), gear, advance (overview, flights),
  deal-memos, personnel, files.
- **`src/lib/density/createDensity.tsx`** — existing factory; today each
  feature spins its OWN context (Budget/Equipment/Personnel). Unify.

## Hard rules / pitfalls (each has cost a round-trip)
- **High blast radius** — these primitives back every table. Change the
  PRIMITIVE, then open each consumer and confirm it still renders. Don't
  break operations/channel-list/payroll/advance.
- No per-edit `router.refresh()`; popovers reuse the portaled
  `cells/InlineSelectCell.tsx`; pure helpers stay out of `'use client'`;
  `.maybeSingle()`; `section_id` is the grouping concept; reuse
  `BudgetConfirmDialog`. Token-clean (`var(--lp-…)`/`color-mix`), no
  hardcoded hex. `next build --webpack` green; eslint 0; show diffs +
  ranges; commit nothing.

## Phase 1 — One shared density (3 levels, default Comfortable, everywhere)
- Build a single app-level density on `createDensity`: **Compact**
  (today's cosy), **Comfortable** (large/readable — the DEFAULT),
  **Spacious** (bigger). Persist one preference (localStorage).
- Both `SpreadsheetGrid` and `DataTable` consume it; the per-feature
  contexts (`BudgetDensityContext`, `EquipmentDensityContext`,
  `PersonnelDensityContext`) either delegate to it or are replaced so
  there's ONE source of truth. The density toggle changes row height +
  type size on EVERY grid, not just budget (it currently doesn't
  propagate). Verify on budget, channel list, payroll, tours, personnel.

## Phase 2 — SpreadsheetGrid visual standard
In `SpreadsheetGrid` (so budget + channel list + payroll all inherit):
- **Fill the container width** + render as ONE elevated panel (own bg,
  border + faint ring) so it "pops" off the page. No left-align/confine.
- Header row, data rows, section headers tuned for scanning: tabular
  right-aligned numerics, consistent column padding, clear header/row
  hierarchy at each density.
- **Section headers = `NAME · count` only** — drop the repeated
  `est…·act…·var…` triplet. Verify against budget, channel list, payroll.

## Phase 3 — DataTable visual standard
Bring `DataTable` to the same language (elevation, fill-width, density,
type scale, header treatment) so lists and spreadsheets read as one
family. Verify tours, riders, gear, advance overview/flights, personnel,
deal-memos.

## Phase 4 — Budget burn-bar summary (budget-only)
Replace the budget KPI cards with the burn bar (mock provided): big
**Remaining** runway, a spent/budget **meter** with a **committed
marker**, turns **red** past 100%, and a **variance** read. The est/act/
var summary now lives ONLY here. Use the UI/UX skill — bespoke, not a
generic KPI row. This one stays budget-specific (don't push it into the
shared primitives).

## How these feed each other (read before sequencing)
- This prompt makes every grid **fill its container** + share density +
  look consistent — it works in the CURRENT shell immediately.
- `CC_NAV_IA_TWO_BAR.md` then **reclaims the sidebar width** (top product
  bar). Because the grids already fill their container, they automatically
  use the reclaimed width — no rework, no moving target.
- Both share the one density preference + the grid tokens. RUN THIS FIRST,
  then the nav.

## Verify
`next build --webpack` green; eslint 0. Walk every consumer above and
confirm: full-width + elevated, density toggle changes size on all of
them (default Comfortable), section headers are name·count, budget shows
the burn bar. Report diffs + ranges + what you verified, honestly.
