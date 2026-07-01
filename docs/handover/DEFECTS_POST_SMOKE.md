# Post-smoke defects + backlog (Adam's full smoke, 2026-06)

Captured from Adam's manual smoke of the merged grid overhaul + riders. Tagged
**[BUG]** (fix), **[UX]** (polish), **[DESIGN]** (needs Adam's decision before code).
Priority: P0 (broken on main) → P1 (functional) → P2 (polish) → Dn (design).

---

## P0 — Budget surface CRASH
- **[BUG] Budget didn't load** on the **Good Neighbours / South Africa Aug'26** tour —
  full server-side render failure (error boundary + "logged"). Simple Plan works;
  Good Neighbours crashes → a data-shape edge case. Prime suspect: the income
  prop-feed now runs server-side in `page.tsx` (`loadTourIncome`). **NEEDS the actual
  stack trace** (console on the crashed page, or the tour URL so Claude can pull it).
  Until fixed, consider whether to hotfix or temporarily revert the income prop-feed.

## P1 — `<Grid>` core (affects EVERY grid — budget, income, payroll, rooming, channel)
- **[BUG] Tab skips two cells** — advances 2 instead of 1 (seen on budget AND income).
- **[BUG] Copy-paste doesn't refresh the pasted cell** — value pastes but the display
  shows the stale figure until reload.
- **[UX→FEATURE] Excel fill-handle** — drag out from a cell's bottom-right corner to
  fill a range (down a column / across) with instant update.
- **[UX] Interaction model (all grids):** click = select cell; **click again opens the
  dropdown menu**; **Tab moves to next cell AND auto-opens its menu**. Apply to payroll
  + rooming matrices especially.

## P1 — Payroll
- **[BUG] PAY-01** — Days-matrix edits **don't persist** when you nav to Rates & back.
- **[BUG] PAY-04** — Summary totals ≠ Rates totals. (May share PAY-01's root.)
- **[UX] MTX-05** — Days-matrix headers cramped + overlapping (week label vs date vs
  city collide — see screenshot). Needs spacing/organisation.
- **[FEATURE] MTX-06** — Days matrix needs a **total** (show income/fee per person,
  e.g. beside the name).

## P1 — Riders / Channel list
- **[BUG] Create rider** — no "New rider pack" button anywhere; can't create a pack
  (and the only one was deleted in RID-03). Open + Delete work; Create is missing.
- **[DESIGN] CL-01 — Channel list should be a standalone entity.** Today it only
  exists *inside* a rider; there's no way to create one to test. Adam wants: create a
  channel list independently → **link** it to a rider (not nest it within one). This is
  an architecture change (decouple channel list from rider-pack ownership). Needs a
  design pass.

## P1 — Budget
- **[BUG] BUD-01** — receipt chip shows a generic **"R-001"** placeholder instead of
  the real receipt number after reload.
- **[UX] Add-transaction button** — needs an obvious "Add transaction" control, not
  just the empty row at the bottom under Uncategorised.

## P2 — Rooming
- **[UX] MTX-03 / room tints** — room-code cells are all blue or purple; need distinct
  colours per room type (SGL/DBL/TWIN/etc.).
- **[UX] ROOM-01 Cards view** — functional but ugly; needs current visuals, buttons,
  dropdowns.

## P2 — Income (quick)
- **[FEATURE] INC-01** — add **Date · Show/Travel/Off · Venue · City** columns to the
  income grid (routing context, like the matrices' day headers).
- **[FEATURE] INC-05 — per-show currency.** Currency is global only; EU shows are in
  EUR. Need a per-row currency override.

---

## Design rethinks (Adam decides before any CC code)
- **D1 — Income Actuals → Settlement.** Adam: income shouldn't have a generic
  "Actuals" column. **Projected** merch/VIP should be **formula-driven** ($/head ×
  capacity × assumed sellout %) living in budget income; **Actuals** should come from
  **Settlement** (the existing settlement tool feeds income actuals). Needs: where the
  projected-formula inputs live, and how Settlement writes back to income actuals.
- **D2 — Summary / P&L redesign.** INC-04 passed but the Summary page is "ugly, old-
  fashioned, hard to parse." Candidate for the same canonical treatment.
- **D3 — Channel-list decoupling** (see CL-01 above) — standalone entity + link model.

---

## ✅ Passed (no action)
MTX-01/02, ROOM-02/03, PAY-03, RID-03, INC-06, BUD-02/03/04. MTX-04 passes except the
copy-paste-stale bug (above). MTX-07 "kinda" (budget invariant — recheck after fixes).
INC-04 P&L parity passes (Summary redesign is D2). Riders Open/RID-01/02 verified.
