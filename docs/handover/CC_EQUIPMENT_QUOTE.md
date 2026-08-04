# CC — Equipment quote: rate change (done), currency switcher, search, multi-select, grid port

Adam's asks, 2026-07-23. Item 1 is already committed by Cowork; 2–5 are yours.

## 1. Day rate 1% → 3% — DONE, but it needs a backfill decision
`src/lib/rental-pricing.ts` now exports `DAY_RATE_PCT_OF_VALUE = 0.03` and `dayRateFromPurchase()` uses it. Comments updated in `rental-pricing.ts` and `components/equipment/types.ts`. No other file inlines the number.

**The hazard, and why it isn't finished.** `isDayRateManual()` has an inference branch for legacy rows where `day_rate_manual IS NULL`: it compares the stored `day_rate` against the *current* auto value and calls it manual if they differ. Changing the percentage therefore reclassifies every legacy auto-priced row as manual — so those items keep their old 1% price and only new/explicitly-auto items price at 3%. To Adam that will look like the change half-worked.

Rows with `day_rate_manual = false` are fine: the flag short-circuits the inference and they re-derive at 3% immediately.

**Establish the numbers first** (Adam runs, this is read-only):
```sql
SELECT
  count(*) FILTER (WHERE day_rate_manual IS NULL)  AS legacy_inferred,
  count(*) FILTER (WHERE day_rate_manual IS FALSE) AS explicit_auto,
  count(*) FILTER (WHERE day_rate_manual IS TRUE)  AS explicit_manual,
  count(*) FILTER (WHERE day_rate_manual IS NULL
                    AND purchase_cost > 0
                    AND abs(day_rate - round(purchase_cost * 0.01, 2)) <= 0.005) AS legacy_that_were_auto_at_1pct
FROM public.rental_inventory;
```
The last number is the population at risk: legacy rows that were auto at 1% and will now be misread as manual.

### RESOLVED 2026-07-23 — no backfill needed, no migration
Adam ran the query. Result:
```
legacy_inferred 0 · explicit_auto 33 · explicit_manual 0 · were_auto_at_1pct 0
```
**All 33 inventory rows carry `day_rate_manual = false`.** The flag short-circuits the inference branch, so every row re-derives from `purchase_cost` at the new percentage the moment the code deploys. Nothing is misclassified, nothing is frozen, no migration required.

Consequences to be aware of rather than act on:
- **Every auto-priced item's day rate triples** (1% → 3% of value) as soon as this ships. That is the intent, but it changes the price of every open quote that hasn't frozen its rates. Check whether any live/sent quote should keep its old pricing before deploying — `rental_job_items.day_rate_override` is the existing escape hatch for pinning a line.
- Items with `purchase_cost` null or 0 are unaffected: `effectiveInventoryDayRate` falls through to the stored `day_rate`. If any of the 33 are in that state their rate won't move, which is correct but may look inconsistent.
- The inference branch in `isDayRateManual()` is now dead code for real data. **Keep it** — it's the safety net for any row that arrives with a NULL flag (e.g. a direct SQL insert or a future import path) — but it is no longer load-bearing.

## 2. Currency switcher with live rates
**Reuse the existing FX path — do not add a second one.** The app already has `POST /api/budget/exchange-rate` and `/api/budget/fx-rates`, and the budget surfaces already display in a chosen currency. Map the equipment quote onto that machinery.

Today currency is baked into the formatter: `fmtUSD()` in `components/equipment/types.ts:145` hardcodes `'$'`, and `rental_inventory` already carries `value_currency`. So:
- Replace `fmtUSD` with a currency-aware formatter taking `(amount, currency)`. It has ~15 call sites across `JobDetail`, `InventoryTab`, `exportJobPdf` — change them all; leaving a mixed pair is how "$" ends up printed on a euro quote.
- The **job** carries the display currency (a quote is denominated once, not per line). Store it on `rental_jobs`; migration needed.
- Item values stay in their own `value_currency`; convert at render using the existing rate service. **Show the rate and its date on the quote** — a converted price with no visible rate is unauditable, and this document goes to clients.
- **Freeze the rate onto the job when the quote is sent/accepted.** Live rates are right while quoting and wrong afterwards; a client who accepted at Tuesday's rate must not see Friday's. Same live-until-committed pattern as the tour FX ruling.
- If no rate is available, surface it like the budget's existing "No FX rate" warning rather than silently converting 1:1.

## 3. Search + 4. Multi-select
Both are `InventoryTab` / the job's add-item picker.
- **Search**: filter on name, category, manufacturer/model, serial. Debounced client-side filter is fine at this list size — check the row count before reaching for anything server-side.
- **Multi-select**: checkbox column + shift-click range + "add N selected to job", writing through the existing add-item path in one call, not N calls. Selection state clears after adding.
- Adding an item already on the job should increment quantity rather than create a duplicate row — confirm current behaviour before choosing.

## 5. Port to the drag-in grid — assess before committing
Adam: *"eventually it'll look like the advance grids where you drag things in. if it's easy to port it, awesome."*

**Report feasibility before building.** The relevant precedents are `<SpreadsheetGrid>` (`docs/components/SPREADSHEET_GRID_CONTRACT.md`) and the drag/paint work from G2. Questions to answer first: does the quote's line model (inventory ref + quantity + rate override) fit the grid's row contract, or would it need a bespoke cell type? Does the grid support drag-from-an-external-list, or only in-grid drag? If it's a fit, port it; **if it needs the grid primitive changed, stop and say so** — changing a shared primitive used by Budget, Channel list and Routing to serve the quote builder is not "easy", and that trade needs Adam.

## EQ-R2 — Adam's annotated walk, 2026-07-23. Format fixes + the picker interaction, banked WITH the line-table port.

### R2-1 — The picker: kill the checkboxes, select the row (his main ask)
Adam, verbatim: *"ugly boxes, lets do highlight row. Then qty appears in line. At the minute it doesn't make sense to select a global qty for all selected items."*

The current design has checkboxes plus a **single** `QTY EACH` and `RATE OVERRIDE` applied to the whole selection — which is wrong the moment you select two different items, because 3× of one and 1× of another is the normal case.

Replace with:
- **Click the row to select it.** No checkbox. Selected row takes the orange treatment (the G2-2b selected-row grammar — inset ring / tint, not a border that shifts layout). Shift-click still extends a range.
- **On selection the row reveals inline `qty` and `rate` inputs**, right-aligned in that row, defaulting to 1 and the item's effective day rate. Each selected row carries its own values.
- **Add** then inserts every selected row with its own qty/rate in one batched call (keep the existing single-call insert).
- The global `QTY EACH` / `RATE OVERRIDE` fields are deleted, not hidden — they're the thing being replaced.
- Selection clears after add.

### R2-2 — The add panel collapses
The whole search + picker + add block should be collapsible, defaulting open when the quote has no lines and collapsed once it does — the line table is the working surface once you're editing rather than building. Persist the state per user like the nav rail does.

### R2-3 — The page title is clipped
`RENTAL JOBS` is cut off at the top by the bar above it. Fix the sticky/overflow interaction so the title clears the workspace tab bar at every width Adam uses (he's on ~1500 and ~1900). Check the same page at both.

### R2-4 — Pricing panel: "Items subtotal" wraps onto two lines
In the PRICING card, the `Items subtotal` label and its value collide and wrap. Fix the label/value layout so label and figure sit on one line each at panel width, with the number right-aligned and mono (money grammar). Check the other rows in that card at the same time — discount and Total should align to the same right edge.

### R2-5 — Edit doesn't work for dates
Adam: *"edit doesnt work for dates etc."* The **Edit** button on a job doesn't let dates be changed. Diagnose before fixing — is the field absent from the edit form, present but not persisting, or persisting but not re-rendering? Report which. Note that `billable days` is derived from start/end via `calcRentalBillableDays`, so a date change must re-derive it and every line's subtotal.

### R2-6 — Verify currency actually converts
Adam: *"making sure currency change changes pricing correctly."* This is the acceptance test for item 2, and it needs migration 253 pasted first. Switch USD → GBP and confirm: every line's day rate AND subtotal convert (not just the symbol), the items subtotal / discount / total all convert, the rate and its date are visible, and re-exporting the PDF uses the frozen rate. **The failure mode to hunt is the one you already caught once: new symbol over an unconverted number.**

## Order
1 is done pending Adam's backfill choice · then 3 + 4 (self-contained, immediately useful) · then 2 (needs a migration + the freeze decision) · then 5 (assess, then decide).

## Gates
Floor green · **money harnesses 64/21/15 after item 1 and item 2** — rental pricing sits beside the budget engine and a rate change must not move tour money · migrations paste-gated · raw git evidence + **Vercel deployment confirmed against the commit hash** (P0-A silently never deployed; don't repeat it).
