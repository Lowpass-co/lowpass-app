/* ============================================
   LOWPASS — Settlement Walk (M1-B) — the ONE settlement money function

   Guarantee
     − Withholding / deductions (itemized)        → Adjusted gross
     − Show expenses (itemized)                    → Show net
     + Bonus / overage
     + Merch                                       → Artist total
     − Deposit received                            → Balance due
     − Payments logged                             → Outstanding

   This is a pure function — the settlement route + Walk panel + PDF all compute
   from it, and the reconcile harness (settlement/reconcile.harness.ts) proves it
   reproduces the LEGACY single-number net (g + o + m − d) exactly when deductions
   are itemized to the same total and expenses/deposit are zero. That equivalence
   is the hard gate before the engine reads the new itemized tables.

   No currency conversion here — every amount is already in the settlement's
   currency (the tour currency). Money math only.
   ============================================ */

export interface LineAmount {
  amount: number;
}

export interface WalkInput {
  guarantee: number;
  /** Itemized deductions (withholding/tax/venue_cost/commission/other). */
  deductions: LineAmount[];
  /** Itemized show expenses. */
  expenses: LineAmount[];
  /** Bonus / overage. */
  overage: number;
  /** Merch income (kept in the walk — matches the legacy net g+o+m−d). */
  merch: number;
  /** Deposit already received (reduces the balance due). */
  depositReceived: number;
  /** Payments logged against this settlement. */
  payments: LineAmount[];
}

export interface Walk {
  guarantee: number;
  deductionsTotal: number;
  adjustedGross: number;
  expensesTotal: number;
  showNet: number;
  overage: number;
  merch: number;
  artistTotal: number;
  depositReceived: number;
  balanceDue: number;
  paymentsTotal: number;
  outstanding: number;
}

const sum = (lines: LineAmount[]): number =>
  lines.reduce((n, l) => n + (Number(l.amount) || 0), 0);

export function computeWalk(input: WalkInput): Walk {
  const guarantee = Number(input.guarantee) || 0;
  const overage = Number(input.overage) || 0;
  const merch = Number(input.merch) || 0;
  const depositReceived = Number(input.depositReceived) || 0;

  const deductionsTotal = sum(input.deductions);
  const adjustedGross = guarantee - deductionsTotal;

  const expensesTotal = sum(input.expenses);
  const showNet = adjustedGross - expensesTotal;

  const artistTotal = showNet + overage + merch;
  const balanceDue = artistTotal - depositReceived;

  const paymentsTotal = sum(input.payments);
  const outstanding = balanceDue - paymentsTotal;

  return {
    guarantee,
    deductionsTotal,
    adjustedGross,
    expensesTotal,
    showNet,
    overage,
    merch,
    artistTotal,
    depositReceived,
    balanceDue,
    paymentsTotal,
    outstanding,
  };
}

/** The legacy settlement net, verbatim from settlement/route.ts (`g + o + m − d`).
 *  Kept here so the harness can assert the new walk reproduces it exactly. */
export function legacyNet(guarantee: number, overage: number, merch: number, deductions: number): number {
  return guarantee + overage + merch - deductions;
}
