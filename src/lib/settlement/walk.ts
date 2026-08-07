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

/* ============================================
   Deal & box office (migration 262) — ADDITIVE. computeWalk above is untouched:
   guarantee-only settlements stay bit-identical. computeBoxOffice is a pure
   calculator for percentage deals whose result is APPLIED to reconciled_overage
   only by an explicit user click — never silently.

   Gross box office
     − BO fees (facility / ticket / CC)             → Net box office
     − Show expenses                                 → Split pool
     × deal %                                        → Artist share
     + bonus (v1 tier rule)
     greater-of vs guarantee, expressed as overage  → Resolved overage
   ============================================ */

/** Deduction kinds that belong to the box-office waterfall (NOT the
 *  guarantee-side deductions group in the walk UI). Their amounts still count
 *  in Σ(deductions) → reconciled_deductions so the income cascade is unmoved. */
export const BO_FEE_KINDS = ['facility_fee', 'ticket_fees', 'cc_fees'] as const;

export interface DealInput {
  dealType: string | null;
  dealPct: number | null;
  bonusThreshold: number | null;
  bonusPct: number | null;
  ticketPrice: number | null;
  ticketCapacity: number | null;
  comps: number | null;
  ticketsSold: number | null;
  grossBO: number | null;
}

export function computeBoxOffice(
  deal: DealInput,
  boFees: { amount: number }[],
  expensesTotal: number,
  guarantee: number,
): {
  grossBO: number;
  feesTotal: number;
  netBO: number;
  splitPool: number;
  artistShare: number;
  bonus: number;
  resolvedOverage: number;
} | null {
  // Only percentage deals have a waterfall. Guarantee / flat / festival / null
  // deals return null — the legacy walk is the whole story for them.
  if (deal.dealType !== 'guarantee_plus' && deal.dealType !== 'door_deal') return null;
  if (deal.dealPct == null) return null;

  // Gross basis: an entered gross wins; else tickets × price; else nothing to compute.
  const grossBO =
    deal.grossBO ??
    (deal.ticketsSold != null && deal.ticketPrice != null ? deal.ticketsSold * deal.ticketPrice : null);
  if (grossBO == null) return null;

  const feesTotal = sum(boFees);
  const netBO = grossBO - feesTotal;
  const splitPool = netBO - expensesTotal;
  const artistShare = Math.max(0, splitPool) * (deal.dealPct / 100);

  // Bonus — v1 rule: a per-ticket kicker above the threshold. Fires ONLY when
  // threshold, bonus % and ticket price are all set and tickets sold exceeds
  // the threshold: (ticketsSold − threshold) × ticketPrice × bonusPct/100.
  // Anything richer (tiered ladders, per-cap bonuses) is a later iteration.
  const bonus =
    deal.bonusThreshold != null &&
    deal.bonusPct != null &&
    deal.ticketsSold != null &&
    deal.ticketsSold > deal.bonusThreshold &&
    deal.ticketPrice != null
      ? (deal.ticketsSold - deal.bonusThreshold) * deal.ticketPrice * (deal.bonusPct / 100)
      : 0;

  // The greater-of rule expressed as OVERAGE ON TOP of the guarantee: the walk
  // already pays the guarantee, so the artist earns max(guarantee, share+bonus)
  // ⇔ guarantee + max(0, share + bonus − guarantee). A door deal with
  // guarantee 0 therefore surfaces the full share as overage.
  const resolvedOverage = Math.max(0, artistShare + bonus - guarantee);

  return { grossBO, feesTotal, netBO, splitPool, artistShare, bonus, resolvedOverage };
}
