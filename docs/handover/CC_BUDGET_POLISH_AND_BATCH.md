# CC — Budget Phase-0 tabs/layout + the polish batch (combined)

Lower-risk UX work across budget/rooming/payroll/income. All gated (Stage A map →
review → Stage B). Two parts; keep them in one branch.

---

## Part A — Budget Phase 0: consistent tabs + layout
Adam wants the budget's inner tabs to read exactly: **`SUMMARY | EXPENSES | INCOME |
SETTINGS/GLOBAL`** — consistent, clean, and the base the versioning work (later) plugs
into.

Today (`src/app/(app)/budget/[tourId]/page.tsx`) the tabs are Summary / Budget(=Expenses)
/ Income / **Reports** / Settings (driven by `?tab=` + `resolveBudgetTab`).

### Stage A → `docs/handover/BUDGET_POLISH_MAP.md`
1. Map the current tab set + how `?tab=` resolves + each tab's component.
2. **Decision for Adam:** Adam's four omit **Reports** (it's a placeholder today). Map
   the options — drop it, fold it into Summary, or keep as a 5th — and recommend.
   (Reports was a stub; I lean "remove from the bar, keep the route as a redirect.")
3. Note the layout cleanup targets (cramped header, spacing) you'll touch.

### Stage B
- Rename **Budget → Expenses**; order `SUMMARY | EXPENSES | INCOME | SETTINGS/GLOBAL`;
  resolve Reports per the decision (don't 404 stale `?tab=reports` — redirect it).
- General layout cleanup of the budget header/tab bar. Keep all existing tab content +
  the Grid/Classic toggle working.

---

## Part B — Polish batch (5 items)
1. **MTX-03 — rooming room-code tints.** Room codes all read blue/purple. Give each
   room **type** a distinct token-based colour (SGL / DBL / TWIN / TRIPLE / …) so a
   matrix is scannable by colour. Tokens only.
2. **ROOM-01 — rooming Cards view.** Functional but dated. Refresh visuals/buttons/
   dropdowns to the current canonical look (match the Grid surfaces' chrome).
3. **MTX-05 — payroll Days-matrix header crowding.** The week label / date / city /
   day-type overlap in the day-column headers (`DayHeader` in `PayrollDaysMatrix.tsx`).
   Give them breathing room — spacing/sizing/truncation so they don't collide.
4. **Budget "Add transaction" button.** Adam: it's not obvious — the only way is the
   empty row at the bottom under Uncategorised. Add a clear **"Add transaction"**
   control where a user expects it (in the line's slide-over / on the line). Keep the
   existing add path working.
5. **INC-01 — income grid routing columns.** Add **Date · Show/Travel/Off · Venue ·
   City** columns to the income grid (the routing context, like the matrices' day
   headers). Read-only, from the routing the income rows already carry.

---

## Hard rules
- Tokens only — no hardcoded colours/sizes (esp. the room-tint palette + headers).
- `next build --webpack`; tsc 0; eslint 0. Don't regress budget tab content, the
  rooming/payroll matrices, income totals/P&L feed, or the Grid.
- **Verify before claiming** — name files/lines; push + "Pushed `<hash>`". I
  Chrome-verify each: budget tabs read SUMMARY|EXPENSES|INCOME|SETTINGS; room tints
  distinct; Cards refreshed; payroll headers uncramped; add-transaction obvious;
  income shows Date/type/Venue/City.
- Land smoke IDs in the relevant smoke files.

## NOT in this prompt
Spreadsheet formula input (`=1+1` → 2), fill-handle, click-to-open-menu, live totals —
those are the **Grid-v2** pass (#5), separate.
