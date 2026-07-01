# CC — Income projection FIX: outputs won't compute reliably (critical). Branch off `main`.

Adam's live VS test: the projected **Overage doesn't compute** ("seems not to"), adding
`$/head` makes it show a wrong number (~100), and the deal columns are confusing. I traced it
— the **engine math is correct** (verified 2,871.05 to the cent), and the route's recompute +
config-defaulting are correct. The bug is in the **grid contract around the output cells**.

## Root cause (found)
`income/route.ts` only recomputes an output when the edit body **omits** it:
`recomputeOverage = has(OVERAGE_INPUTS) && body.pre_tax_overage === undefined`. But the grid
makes **Overage / Merch / VIP editable**, and they carry a **persistent `0`**. So the moment a
`0` (or any stray value) lands in `pre_tax_overage`, the row is treated as a **manual
override** and the engine **stops computing it** — the projected overage silently freezes. The
outputs must be **computed by default and only manually overridden deliberately** (Adam's exact
ask).

## Fixes
1. **Make Overage / Merch / VIP computed-locked (the core fix).** In the **Projected** view
   they render **read-only + computed (the ƒ marker)** — driven by the engine, never a stray
   edit. To hand-enter a value: an explicit **override** action (right-click / a small "override"
   affordance) → a **warning** ("This replaces the formula for this cell") → then editable +
   flagged as overridden. **Deleting an overridden value → "Revert to formula?"** → clears the
   override and the engine recomputes. (Until override is built, simplest correct interim:
   make these cells read-only in Projected so a stray value can't suppress the formula.)
2. **Kill the persistent "0".** A not-yet-computable output (missing inputs → engine returns
   null) shows **blank / "—"**, NOT a literal `0`. A stored `0` must not read as a manual
   override — distinguish "no value / compute me" from "user typed 0".
3. **Materialise reliably on every input edit.** Confirm `PROJECTION_INPUT_COLS` covers **all**
   OVERAGE/MERCH/VIP inputs (cap, sell-thru, face, deal type/pct/threshold/above, withholding,
   guarantee, $/head, fee%, vip tix/price) so the grid refreshes the materialised cells no
   matter which input changed — and that the imperative `updateRowCells` always reflects the
   POST's recomputed `pre_tax_overage/merch_income/vip_income`.
4. **Reproduce + verify Adam's case.** Build the **O2 Apollo** row he hit: Cap **3500**,
   Sell-thru **90**, Face **£40**, Deal **VS**, Deal% **80**, Withhold **10**, Guarantee
   **£1000**, with the default 0.65 haircut / 8% tax. Hand-calc the overage and confirm the
   grid shows it (not 0, not 100). Fix whatever diverges.
5. **`$/head` + `fee%` live in ONE place.** Today they're both per-show grid columns **and**
   Settings "projection defaults" — duplicated and confusing. Keep the **Settings values as the
   tour default** and the **per-show grid columns as an optional override that pre-fills from
   the default**; make that relationship obvious (e.g. show the column value greyed when it's
   inheriting the default), and don't present the same number as two independent editable
   fields.
6. **Haircut clarity.** Label it clearly and add a tooltip: *"Overage haircut — projected
   overage is discounted to this fraction (default 65%) to budget conservatively."* Same for
   the tax %.

## Out of scope here (separate ticket #28 — income grid polish r2)
The number-spinner box styling, deal-type type-to-select, and per-tour column hide/show are
cosmetic polish — leave them to #28. **This ticket is the functional correctness**: outputs
compute and can't be silently suppressed.

## Hard rules
- **Don't change the engine math** (`incomeProjection.ts`) — it's verified. This is the grid
  contract + the output-cell lock + the persistent-0 fix.
- **Branch off `main`. Commit to the feature branch and PUSH. Confirm `git log origin/<branch>`
  before reporting.** Don't regress P1/P2, the versioning lock, the income breakdown in the P&L.
- Tokens; `next build --webpack`; tsc 0; eslint 0.
- **Verify before claiming** — reproduce the O2 Apollo case; name files/lines; push the hash. I
  Chrome-verify: set the inputs → overage computes to the hand-calc; type into a locked output →
  warning, not a silent formula kill; delete an override → reverts to formula; no stray 0.
