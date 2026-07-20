# Smoke — Settlement (M1-B)

The Walk surface at `/budget/[tourId]/settlement` — the itemized settlement build.
Money math is the harness-proven `computeWalk` (src/lib/settlement/walk.ts); read
path is `loadTourSettlementWalks`; itemized lines persist via
`/api/budget/settlement/lines`; grain fields via `/api/budget/settlement`.

Format: see [README.md](README.md).

---

#### SET-01 — Walk math matches the harness
**Do**: Open a show's Walk. Read Guarantee → Adjusted gross → Show net → Artist
total → Balance due → Outstanding.
**Expect**: each subtotal equals `computeWalk`: Adjusted gross = Guarantee −
Σdeductions; Show net = Adjusted gross − Σexpenses; Artist total = Show net +
overage + merch; Balance due = Artist total − deposit; Outstanding = Balance due −
Σpayments. Totals are mono, 18px on the key lines, labels 11px caps; negative values
render red. A show with only the legacy single deductions value walks to the same
net (the "Legacy value" note shows until it's itemized). Matches
`settlement reconcile: 21 checks passed`. **Code-verified**; **Needs-live**.

#### SET-02 — Itemized rows persist
**Do**: Add a deduction (kind + label + amount), a show expense, and a payment.
Reload.
**Expect**: each line persists (`settlement_deductions` / `settlement_expenses` /
`settlement_payments`), the Walk recomputes, and the settlement row is created on
first add if it didn't exist. Deductions also push Σ into
`settlement.reconciled_deductions` so the income P&L cascade carries the itemized
total unchanged. **Code-verified**; **Needs-live**.

#### SET-03 — Payment reduces Outstanding
**Do**: Note Balance due. Log a payment for part of it.
**Expect**: Outstanding = Balance due − Σpayments drops by the payment amount; the
payment shows a method chip (Wire/Check/Cash/ACH) + date. **Code-verified**;
**Needs-live**.

#### SET-04 — Full & Final clears the catch-up queue
**Do**: In the shows list, note a past show flagged **Due** (amber). Open it, tick
**Full & Final**.
**Expect**: the show flips to **Settled** (green) and drops out of the "N shows
played, not settled" count (the M1-A data-health banner + this list read the SAME
`dataHealth.unsettledShows` derivation). **Code-verified**; **Needs-live**.

#### SET-05 — Settlement PDF renders the Walk
**Do**: On a show's Walk, click **Export PDF**.
**Expect**: a branded one-show PDF downloads through the shared export shell
(letterhead + `renderDocument`): the full Walk (Guarantee → Adjusted gross → Show net
→ Artist total → Balance due → Outstanding), itemized deductions/expenses/payments,
and the **Full & Final / Open** state chip. One show per document; money is the same
`computeWalk` as the on-screen Walk (WYSIWYG — the `/export/preview` route returns the
identical body HTML). `buildSettlementExport` in the shared `build.ts`, surface added
to `template-config` (`'settlement'`). **Code-verified**; **Needs-live**.
