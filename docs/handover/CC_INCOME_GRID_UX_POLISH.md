# CC — Income Grid UX polish (Adam's feedback after live use). Branch off `main`.

The income grid (`BudgetIncomeGrid.tsx`) is functionally good (Phases 1–3 verified) but has
real usability problems in daily use. Six fixes, all UX/presentation — **no data-model
change, no engine-math change**. Adam's priority for the whole budget: *customisable, easy to
use, easy to glean info from.* Branch off `main`; usual hygiene (push + `git log
origin/<branch>` before reporting).

## 1. The routing block must read as a SEPARATE, uneditable reference (headline ask)
`date / daytype / venue / city` (`:181-184`) are `ro:true` but look identical to the editable
income cells, so it's unclear they're pulled from routing and can't be edited here. Make them
a **visually distinct, frozen reference block**: freeze those columns (Grid `frozenCols`),
give them a muted/recessed treatment (token background, not the editable-cell look), and a
clear divider before the first editable income column. It should read as "this strip is the
routing — drawn from elsewhere, look-don't-touch," almost a separate grid. (`#` idx can join
the frozen block.)

## 2. ACTUAL vs PROJECTED is confusing — make it unmistakable
There's a Projected/Actual view toggle, but once you're in a view the numbers don't announce
whether they're forecast or real. Make the active view **loud**: a prominent state on the
toggle + a one-line context cue ("Projected = forecast from the deal inputs" / "Actual =
settled figures"), and consider a subtle tint difference between the two views so a glance
tells you which you're in. Where a column is engine-projected vs hand-entered, signal it
(e.g. a small "ƒ"/calc affordance on materialised cells).

## 3. Editing a projection input jumps the cursor to A1 (annoying bug)
After a projection-input edit (`PROJECTION_INPUT_COLS`, `:33`) the code bumps `gridKey` to
**remount** the grid so the engine-materialised overage/merch/VIP appear (`:80, :164`) — which
resets selection to A1. The canonical `<Grid>` is ref-sourced (ignores prop changes after
mount), so the remount is how the new values currently surface. **Fix: don't lose the
cursor.** Either (a) **preserve + restore the active cell/selection across the refresh**
(capture before remount, restore after), or (b) add a small **imperative cell-update** to
`<Grid>` (update specific cells by id without remounting) and patch only the recomputed
overage/merch/VIP. Recommend (b) if clean — it's reusable and avoids the flash; (a) is the
minimal fix. **Acceptance: editing Deal/Cap/Sell-thru/etc. updates the projected cells with
NO cursor jump and no full-grid flash.**

## 4. Per-show currency is stuck on the tour currency (GBP)
The currency dropdown options are `[native, ...Object.keys(fxRates)]` (`:73`) — so if the tour
has no FX rates configured, **the only option is GBP** and you can't set a EUR show. Chicken-
and-egg. Fixes: (a) offer a **standard currency list** (GBP/USD/EUR/CAD/AUD/… ISO) in the
picker, not just rates that already exist; (b) picking a currency with no rate yet should be
**frictionless** — default it 1:1 with a clear "add FX rate" nudge (or inline-add the rate),
not silently unavailable; (c) **bonus**: default a show's currency from its routing
**country** (UK→GBP, US→USD, EU→EUR…) so most shows are right without touching it. Keep the
Phase-2 FX map + conversion exactly as-is underneath.

## 5. Header names are cryptic / vague — rename for humans
Current terse headers → clearer: `Ccy`→**Currency**, `@ Tix`→**Tier @ (tix)**, `↑ %`→**Tier
rate %**, `WH`→**Withhold %**, `Post-tax`→keep but tooltip, `Deal %`→fine, `Deal`→**Deal
type**. Add short header tooltips for the projection inputs (what each feeds). Plain English
over jargon.

## 6. Density / left-side readability
The grid is cramped and text-heavy on the left. With the routing block separated (#1), tidy
the rest: sensible column widths, don't crowd the venue/city text, consistent number
alignment, a touch more row breathing room. Token-clean throughout.

## Hard rules
- No data-model / engine-math change — this is `BudgetIncomeGrid.tsx` chrome + the currency
  options source + (maybe) a small `<Grid>` cell-update method. Don't regress P1–P3, the
  versioning lock (proposed cells read-only when locked), or the FX conversion.
- Tokens only; `next build --webpack`; tsc 0; eslint 0.
- **Verify before claiming** — name files/lines; push the hash; confirm the commit is on the
  remote branch. I Chrome-verify: routing block reads as a frozen reference; edit a deal input
  → projected cells update with no cursor jump; set a EUR show + rate → converts; headers
  read clearly. Adam eyeballs density/look.
