# BUDGET_POLISH_MAP — Stage A (map only, no code)

> Part A (budget tabs/layout) + Part B (5 polish items). One branch.
> **Status:** Stage B applied. tsc 0, eslint 0, `next build --webpack` green.
> Adam's decisions: Reports → **remove + redirect** (`resolveBudgetTab`
> `'reports' → 'summary'`); 4th tab → **"Settings", plain** (moved into the main
> row). Awaiting Chrome-verify (BUD-56/57, INC-01, MTX-03/05, ROOM-01).

---

## Part A — Budget Phase 0: tabs + layout

### Current state (mapped)
- **Tab set + resolution:** `budget-tab-utils.ts:17-40`. `BudgetTab =
  'summary' | 'budget' | 'income' | 'reports' | 'settings'`. `resolveBudgetTab`
  defaults **unknown/`actuals` → `budget`**; `summary`/`income`/`reports`/
  `settings` pass through.
- **The bar:** `BudgetContextBand.tsx:64-72` (a `<ProductSubBar>`), sticky in a
  `z-30` wrapper (`:53`). It already renders:
  - `items` (main tabs): **Summary**, **Expenses** (`key:'budget'`, already
    relabelled), **Income** (`:65-67`).
  - `cornerItems` (right, icon’d): **Reports** (BarChart3), **Settings**
    (`:69-72`).
  - `rightSlot`: density toggle + `BudgetExportControls` (`:73-81`).
  - `leftSlot`: `TourIdentityChip` (`:57-63`).
- **Tab bodies** (`budget/[tourId]/page.tsx`):
  - `summary` → `BudgetSummaryTab` (`:276-289`)
  - `budget` → `BudgetGridToggle{ classic: BudgetSpreadsheetView, grid:
    BudgetGridView }` or `BudgetEmptyState` (`:291-330`)
  - `income` → `BudgetIncomeGrid` (`:336-338`)
  - `reports` → `BudgetTabPlaceholder` **stub** (`:345-353`) — links to
    `?tab=budget` export
  - `settings` → `BudgetSettingsTab` (`:355-357`)
  - (`actuals` already removed — comment `:340-343`)

So the visible bar today is `Summary · Expenses · Income … [Reports][Settings]`.
Adam’s target is **SUMMARY | EXPENSES | INCOME | SETTINGS/GLOBAL** (4 equal
tabs, no Reports).

### §A1 — Decisions for Adam
1. **Reports** (a placeholder stub today). Options:
   - **(a) Remove from the bar + redirect the route** *(recommended, matches
     Adam’s lean).* Drop the `reports` cornerItem; change `resolveBudgetTab` so
     `'reports' → 'summary'` (stale `?tab=reports` renders Summary, **no 404**);
     delete the `reports` body block (`page.tsx:345-353`) + the now-unused
     `BudgetTabPlaceholder` import if nothing else uses it. The PDF/XLSX export
     already lives in the band’s `rightSlot`, so no capability is lost.
   - (b) Fold into Summary as a section — more work, Summary already carries
     charts/variance; defer.
   - (c) Keep as a 5th tab — rejected (it’s an empty stub; Adam wants 4).
2. **4th tab label — “Settings” vs “Global”.** Adam wrote “SETTINGS/GLOBAL”.
   Recommend **keep `Settings`** (the versioning work plugs in here; clear
   today), and move it from `cornerItems` into the main `items` row so the bar
   reads the 4 equal tabs. Note: “Global” is the natural rename when versioning
   lands (global vs per-version settings) — flag, don’t do it now.
3. **Density toggle + Export** stay in `rightSlot` (not tabs).

### Stage B (Part A)
- `BudgetContextBand.tsx`: main `items` = `[Summary, Expenses, Income,
  Settings]`; remove Reports; drop the `cornerItems` array (or keep empty);
  `BarChart3` import goes. Settings keeps its `Settings` icon or renders plain —
  decide in build (lean: plain text tab to match the others).
- `budget-tab-utils.ts`: drop `'reports'` from the `BudgetTab` union; map the
  raw string `'reports' → 'summary'` in `resolveBudgetTab` (redirect-by-resolve).
- `page.tsx`: delete the `tab === 'reports'` block (`:345-353`); remove the
  `BudgetTabPlaceholder` import if unused elsewhere (grep first).
- **Layout cleanup targets** (header/tab bar breathing room): the 3 stacked
  sticky bars (`BudgetContextBand` + `BudgetBurnBar` + `BudgetPhaseStripGate`,
  `page.tsx:260-273`) read dense; the content wrapper is `space-y-6 px-4 pt-4`
  (`:275`). Targets: tab-row gap/padding + identity-chip spacing in
  `ProductSubBar`/`BudgetContextBand`, and the vertical rhythm between the
  sticky band and the first content. Token-only; no content/route changes.
- **Keep working:** the Grid/Classic toggle (`BudgetGridToggle`), all tab
  bodies, `?tab=` routing.
- Smoke `budget.md`: **BUD-56** — bar reads `SUMMARY | EXPENSES | INCOME |
  SETTINGS`; `?tab=reports` lands on Summary (no 404); Grid/Classic toggle +
  every tab body still render.

---

## Part B — Polish batch (5 items)

### MTX-03 — rooming room-code tints (distinct per type)
- **Current:** TWO palette sources, both collapse the DBL variants:
  - `RoomingMatrix.tsx:22-28` `ROOM_OPTCOLORS`: `SGL → --color-lp-day-travel`
    (blue), `DBL (A|B|C|D) → --color-lp-day-rehearsal` (violet). → "all blue/
    purple".
  - `useRoomingGrid.ts:48-52` `roomCodeTint`: `SGL → day-travel`, `startsWith
    'DBL' → day-rehearsal`. Same collapse (used by the Cards view).
- **Tokens available** (`globals.css:79-86`): 8 distinct day hues —
  `--color-lp-day-{show=green, off=grey, travel=blue, rehearsal=violet,
  press=pink, radio=amber, tv=red, festival=orange}`. Enough to give SGL +
  DBL A/B/C/D **five distinct** token colours.
- **Stage B:** make `roomCodeTint` the **single source**, mapping each code to a
  distinct token (e.g. SGL=travel, DBL(A)=show, DBL(B)=press, DBL(C)=radio,
  DBL(D)=tv — exact pairing decided in build), and have `RoomingMatrix`’s
  `ROOM_OPTCOLORS` derive from the same map (one palette, matrix + cards agree).
  Tokens only. No data/write change.
- Smoke `operations.md`: **MTX-03** — each room code shows a distinct tint;
  matrix + Cards agree.

### ROOM-01 — rooming Cards view refresh
- **Current:** `RoomingCards.tsx` (RoutingRail + per-night room cards + a pool;
  assign via picking a code, unassign via chip ✕). `ASSIGNABLE` hardcoded list
  (`:18`). Chrome is dated vs the Grid surfaces.
- **Stage B:** restyle cards/buttons/dropdowns/chips to the canonical grid
  chrome (panel surface, border, radius, token colours; room chips use the new
  MTX-03 tint). Behaviour (saveCell optimistic write) unchanged → budget feed
  untouched. Token-only.
- Smoke `operations.md`: **ROOM-01** — Cards view matches the current canonical
  look; assign/unassign still works.

### MTX-05 — payroll Days-matrix header crowding
- **Current:** `PayrollDaysMatrix.tsx` `DayHeader` (~`:32-63`) stacks, in a
  narrow `w:92` column: week label (8px, only on week-start), date (10px), city
  (9px, `maxWidth:80` ellipsis), day-type pill (8px + dot). They collide.
- **Stage B:** give them breathing room — spacing/line-height/font-size tweaks +
  tighter truncation (e.g. clamp city width, drop or shrink the day-type pill on
  non-show days, ensure the week label doesn’t overlap the date). Token-only;
  layout/typography only — no data change. (Note: `RoomingMatrix` has a sibling
  `DayHeader`; MTX-05 is **payroll only** per the prompt.)
- Smoke `operations.md`: **MTX-05** — payroll day headers legible, no overlap.

### Budget "Add transaction" — obvious control
- **Current:** the slide-over has `addTxn()` (`GridSlideOver.tsx:~462`, calls
  `lineApi.addTransaction(uid)`), but the only visible affordance is the
  **trailing empty/placeholder row** in the transactions table (under
  Uncategorised) — not discoverable.
- **Stage B:** add a clear **"+ Add transaction"** button in the slide-over’s
  transactions section (the canonical place a user looks) wired to the existing
  `addTxn()`; keep the trailing-row path working. (Stage B will pin the exact
  JSX line in the transactions render block of `renderExpenseSlide`.)
- Smoke `budget.md`: **BUD-57** — a labelled "Add transaction" control is
  visible in the line slide-over; clicking it adds a row via the real route.

### INC-01 — income grid routing columns
- **Current:** `BudgetIncomeGrid.tsx` packs routing context into ONE `show`
  text column via `showLabel` (`:34-35`, `date.slice(5) · venue||city`). Columns
  are `idx · show · money…` (`:124-156`).
- **Data:** `IncomeRow` (`income.ts:38-52`) carries `date, venue_name, city` —
  but **NOT `day_type`**, even though the source fetches it
  (`income.ts:14,30,68,77`) and `toIncomeRows` (`:95-127`) simply **drops it**.
- **Stage B:** add `day_type` to `IncomeRow` + thread it through both maps in
  `toIncomeRows` (`:99-116`); add **read-only** columns **Date · Type
  (Show/Travel/Off) · Venue · City** to the income grid (replacing or flanking
  the combined `show` column). Read-only display from the routing the rows
  already carry — `onEdit` ignores them, so the income field names + the
  `post_tax`/`/api/budget/income` write path stay **byte-identical** (no P&L
  regression). Type label via the routing `day_type` (map to Show/Travel/Off,
  like the matrices’ `labelForDayType`).
- Smoke `budget.md`: **INC-01** — income grid shows Date · Type · Venue · City;
  totals/P&L unchanged.

---

## Hard-rule compliance (Stage A)
- ✅ Tab set/resolution/bodies pinned (`budget-tab-utils.ts:17-40`,
  `BudgetContextBand.tsx:64-72`, `page.tsx:276-357`); Reports decision framed
  (recommend remove-from-bar + resolve→summary).
- ✅ Each Part B item pinned to exact files/lines, with the data gap named
  (INC-01: `day_type` dropped in `toIncomeRows`; MTX-03: two collapsing palette
  sources; Add-txn: handler exists, affordance hidden).
- ✅ Token-only paths confirmed (day-hue tokens enumerated for MTX-03).
- ✅ No regression surface: routing columns + tints are display-only; budget tab
  bodies, matrices, income write path, and the Grid are untouched in behaviour.
- ⛔ **No code written.** Stopping for review — esp. §A1 (Reports + the 4th-tab
  label) and the MTX-03 code→colour pairing.
