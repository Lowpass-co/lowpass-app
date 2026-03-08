/**
 * LOWPASS — Budget computation utilities
 *
 * All formulas match lowpass-budget-math-spec.md (single source of truth).
 * Uses Decimal.js for precise arithmetic (no floating-point drift).
 */

import Decimal from 'decimal.js';

export interface BudgetSummaryLine {
  label: string;
  proposed: number | null;
  actual: number | null;
  variance_pct: string;
  variance_color: 'green' | 'red' | 'amber' | 'neutral';
}

export interface BudgetSummary {
  income: {
    guarantees: BudgetSummaryLine;
    merch: BudgetSummaryLine;
    vip: BudgetSummaryLine;
    total: BudgetSummaryLine;
  };
  directExpenses: {
    salaries: BudgetSummaryLine;
    perDiem: BudgetSummaryLine;
    hotels: BudgetSummaryLine;
    flights: BudgetSummaryLine;
    transportation: BudgetSummaryLine;
    production: BudgetSummaryLine;
    subtotal: BudgetSummaryLine;
  };
  overhead: {
    accountancy: BudgetSummaryLine;
    insurance: BudgetSummaryLine;
    contingency: BudgetSummaryLine;
    subtotal: BudgetSummaryLine;
  };
  commissions: {
    rows: BudgetSummaryLine[];
    total: BudgetSummaryLine;
  };
  totalExpenses: BudgetSummaryLine;
  netProfitLoss: BudgetSummaryLine;
}

/** Input shape for computeBudgetSummary. All arrays default to [] if missing. */
export interface TourDataForSummary {
  income: Array<{
    post_tax_guarantee?: number;
    merch_income?: number;
    vip_income?: number;
    actual_guarantee?: number | null;
    actual_overage?: number | null;
    actual_merch?: number | null;
    actual_vip?: number | null;
    pre_tax_guarantee?: number;
  }>;
  line_items: Array<{ category: string; proposed_cost?: number; actual_cost?: number }>;
  personnel: Array<{
    rate_type?: string;
    show_rate?: number;
    off_rate?: number;
    rehearsal_rate?: number;
    per_diem?: number;
    advance_fee?: number;
    commission?: number;
  }>;
  payroll_entries: Array<{ total_fee?: number; total_per_diem?: number }>;
  routing: Array<{ day_type: string }>;
  commissions: Array<{ label: string; percentage?: number; basis?: string }>;
  settings: {
    insurance_pct?: number;
    contingency_pct?: number;
    accountancy_pct?: number;
  } | null;
  flights: Array<{ proposed_cost?: number; actual_cost?: number }>;
  /** If true, include commission in salary line (TM view). */
  showCommission?: boolean;
}

function d(v: number | null | undefined): Decimal {
  if (v == null || Number.isNaN(v)) return new Decimal(0);
  return new Decimal(v);
}

function sumDecimal(arr: Decimal[]): Decimal {
  return arr.reduce((a, b) => a.plus(b), new Decimal(0));
}

/** Sum only non-null values (spec: null actuals excluded from sums, not treated as 0). */
function sumActuals(values: (number | null | undefined)[]): Decimal {
  return values.reduce(
    (acc, val) =>
      val != null && !Number.isNaN(Number(val)) ? acc.plus(new Decimal(Number(val))) : acc,
    new Decimal(0)
  );
}

/**
 * Variance per math spec §9:
 * - proposed=0 and actual=0 → "—"
 * - proposed=0 and actual≠0 → "N/A"
 * - variance_pct = ((actual - proposed) / proposed) × 100
 * - ≤0% green, 0–5% amber, >5% red
 */
function makeLine(
  label: string,
  proposed: Decimal,
  actual: Decimal
): BudgetSummaryLine {
  const p = proposed.toNumber();
  const a = actual.toNumber();
  let variance_pct: string;
  let variance_color: BudgetSummaryLine['variance_color'];

  if (p === 0 && a === 0) {
    variance_pct = '—';
    variance_color = 'neutral';
  } else if (p === 0) {
    variance_pct = 'N/A';
    variance_color = 'neutral';
  } else {
    const v = ((a - p) / p) * 100;
    variance_pct = `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
    if (v <= 0) variance_color = 'green';
    else if (v <= 5) variance_color = 'amber';
    else variance_color = 'red';
  }

  return {
    label,
    proposed: p,
    actual: a,
    variance_pct,
    variance_color,
  };
}

/**
 * Compute full budget summary from tour data.
 * Formulas match lowpass-budget-math-spec.md exactly.
 */
export function computeBudgetSummary(tourData: TourDataForSummary): BudgetSummary {
  const incomeRows = tourData.income ?? [];
  const lineItems = tourData.line_items ?? [];
  const personnel = tourData.personnel ?? [];
  const payrollEntries = tourData.payroll_entries ?? [];
  const routingRows = tourData.routing ?? [];
  const commissions = tourData.commissions ?? [];
  const settings = tourData.settings ?? null;
  const flights = tourData.flights ?? [];
  const showCommission = !!tourData.showCommission;

  // Day counts from routing (§4, §5)
  const showDays = routingRows.filter((r) => r.day_type === 'show' || r.day_type === 'festival').length;
  const offDays = routingRows.filter((r) =>
    ['off', 'travel', 'press', 'radio', 'tv'].includes(r.day_type)
  ).length;
  const rehearsalDays = routingRows.filter((r) => r.day_type === 'rehearsal').length;
  const totalDays = showDays + offDays + rehearsalDays;

  // 1. Proposed Gross Income (§2) — NO overages
  const proposedGrossIncome = sumDecimal(
    incomeRows.map((i) => d(i.post_tax_guarantee))
  ).plus(sumDecimal(incomeRows.map((i) => d(i.merch_income)))).plus(
    sumDecimal(incomeRows.map((i) => d(i.vip_income)))
  );

  // 2. Actual Gross Income (§3) — null actuals excluded from sums (not treated as 0)
  const actualGuaranteeSum = sumActuals(incomeRows.map((i) => i.actual_guarantee));
  const actualOverageSum = sumActuals(incomeRows.map((i) => i.actual_overage));
  const actualMerchSum = sumActuals(incomeRows.map((i) => i.actual_merch));
  const actualVipSum = sumActuals(incomeRows.map((i) => i.actual_vip));
  const actualGrossIncome = actualGuaranteeSum.plus(actualOverageSum).plus(actualMerchSum).plus(actualVipSum);

  // Income lines (guarantees = post_tax proposed; actual = actual_guarantee + actual_overage)
  const proposedGuarantees = sumDecimal(incomeRows.map((i) => d(i.post_tax_guarantee)));
  const actualGuaranteesPlusOverage = actualGuaranteeSum.plus(actualOverageSum);
  const proposedMerch = sumDecimal(incomeRows.map((i) => d(i.merch_income)));
  const proposedVip = sumDecimal(incomeRows.map((i) => d(i.vip_income)));

  // 3 & 4. Salaries (§4) — split_rate vs day_rate, + commission if TM view
  let proposedSalaries = new Decimal(0);
  for (const p of personnel) {
    const rateType = p.rate_type ?? 'day_rate';
    let salary: Decimal;
    if (rateType === 'split_rate') {
      salary = d(showDays).times(p.show_rate ?? 0)
        .plus(d(offDays).times(p.off_rate ?? 0))
        .plus(d(rehearsalDays).times(p.rehearsal_rate ?? 0))
        .plus(d(p.advance_fee ?? 0));
    } else {
      salary = d(totalDays).times(p.off_rate ?? 0).plus(d(p.advance_fee ?? 0));
    }
    if (showCommission && (p.commission != null && Number(p.commission) !== 0)) {
      salary = salary.plus(d(totalDays).times(p.commission ?? 0));
    }
    proposedSalaries = proposedSalaries.plus(salary);
  }
  const actualSalaries = sumDecimal(payrollEntries.map((e) => d(e.total_fee)));

  // 5. Per diem (§5) — flat rate × total_days
  const proposedPerDiem = sumDecimal(
    personnel.map((p) => d(totalDays).times(p.per_diem ?? 0))
  );
  const actualPerDiem = sumDecimal(payrollEntries.map((e) => d(e.total_per_diem)));

  // Direct: hotels, flights, transport, production
  const hotelsItems = lineItems.filter((i) => i.category === 'hotels');
  const transportItems = lineItems.filter((i) => i.category.startsWith('transport_'));
  const prodItems = lineItems.filter((i) => i.category.startsWith('prod_'));

  const proposedHotels = sumDecimal(hotelsItems.map((i) => d(i.proposed_cost)));
  const actualHotels = sumActuals(hotelsItems.map((i) => i.actual_cost));
  const proposedFlights = sumDecimal(flights.map((f) => d(f.proposed_cost)));
  const actualFlights = sumActuals(flights.map((f) => f.actual_cost));
  const proposedTransport = sumDecimal(transportItems.map((i) => d(i.proposed_cost)));
  const actualTransport = sumActuals(transportItems.map((i) => i.actual_cost));
  const proposedProd = sumDecimal(prodItems.map((i) => d(i.proposed_cost)));
  const actualProd = sumActuals(prodItems.map((i) => i.actual_cost));

  // 6. Direct expenses subtotal
  const subtotalDirectProposed = proposedSalaries.plus(proposedPerDiem).plus(proposedHotels).plus(proposedFlights).plus(proposedTransport).plus(proposedProd);
  const subtotalDirectActual = actualSalaries.plus(actualPerDiem).plus(actualHotels).plus(actualFlights).plus(actualTransport).plus(actualProd);

  // 7. Overhead (§8) — accountancy_pct, insurance_pct, contingency compounds
  const accountancyPct = d(settings?.accountancy_pct ?? 0);
  const insurancePct = d(settings?.insurance_pct ?? 0.03);
  const contingencyPct = d(settings?.contingency_pct ?? 0.02);

  const accountancyProposed = accountancyPct.times(proposedGrossIncome);
  const accountancyActual = accountancyPct.times(actualGrossIncome);
  const insuranceProposed = insurancePct.times(proposedGrossIncome);
  const insuranceActual = insurancePct.times(actualGrossIncome);
  const contingencyProposed = contingencyPct.times(
    subtotalDirectProposed.plus(accountancyProposed).plus(insuranceProposed)
  );
  const contingencyActual = contingencyPct.times(
    subtotalDirectActual.plus(accountancyActual).plus(insuranceActual)
  );
  const overheadSubtotalProposed = accountancyProposed.plus(insuranceProposed).plus(contingencyProposed);
  const overheadSubtotalActual = accountancyActual.plus(insuranceActual).plus(contingencyActual);

  // 8. Commissions (§7) — per-row basis, then total
  const expensesBeforeCommProposed = subtotalDirectProposed.plus(overheadSubtotalProposed);
  const expensesBeforeCommActual = subtotalDirectActual.plus(overheadSubtotalActual);
  const sumMerchProposed = proposedMerch;
  const sumMerchActual = actualMerchSum;
  const merchExpensesProposed = new Decimal(0);
  const merchExpensesActual = new Decimal(0);
  const sumPreTaxProposed = sumDecimal(incomeRows.map((i) => d(i.pre_tax_guarantee ?? i.post_tax_guarantee))).plus(sumMerchProposed).plus(proposedVip);
  const sumPreTaxActual = actualGuaranteeSum.plus(actualOverageSum).plus(sumMerchActual).plus(actualVipSum);

  const commissionAmountsProposed: Decimal[] = [];
  const commissionAmountsActual: Decimal[] = [];
  for (const c of commissions) {
    const pct = d(c.percentage ?? 0);
    let basisProposed: Decimal;
    let basisActual: Decimal;
    switch (c.basis) {
      case 'gross':
        basisProposed = proposedGrossIncome;
        basisActual = actualGrossIncome;
        break;
      case 'net':
        basisProposed = Decimal.max(0, proposedGrossIncome.minus(expensesBeforeCommProposed));
        basisActual = Decimal.max(0, actualGrossIncome.minus(expensesBeforeCommActual));
        break;
      case 'gross_merch':
        basisProposed = sumMerchProposed;
        basisActual = sumMerchActual;
        break;
      case 'net_merch':
        basisProposed = Decimal.max(0, sumMerchProposed.minus(merchExpensesProposed));
        basisActual = Decimal.max(0, sumMerchActual.minus(merchExpensesActual));
        break;
      case 'gross_minus_tax':
        basisProposed = sumPreTaxProposed;
        basisActual = sumPreTaxActual;
        break;
      default:
        basisProposed = proposedGrossIncome;
        basisActual = actualGrossIncome;
    }
    commissionAmountsProposed.push(pct.times(basisProposed));
    commissionAmountsActual.push(pct.times(basisActual));
  }

  const totalCommissionsProposed = sumDecimal(commissionAmountsProposed);
  const totalCommissionsActual = sumDecimal(commissionAmountsActual);

  // 9. Total expenses
  const totalExpensesProposed = expensesBeforeCommProposed.plus(totalCommissionsProposed);
  const totalExpensesActual = expensesBeforeCommActual.plus(totalCommissionsActual);

  // 10. Net profit/loss
  const netProposed = proposedGrossIncome.minus(totalExpensesProposed);
  const netActual = actualGrossIncome.minus(totalExpensesActual);

  return {
    income: {
      guarantees: makeLine('Guarantees (Post-Tax)', proposedGuarantees, actualGuaranteesPlusOverage),
      merch: makeLine('Merch', proposedMerch, sumMerchActual),
      vip: makeLine('VIP', proposedVip, actualVipSum),
      total: makeLine('Total Income', proposedGrossIncome, actualGrossIncome),
    },
    directExpenses: {
      salaries: makeLine('Salaries', proposedSalaries, actualSalaries),
      perDiem: makeLine('Per Diem', proposedPerDiem, actualPerDiem),
      hotels: makeLine('Hotels', proposedHotels, actualHotels),
      flights: makeLine('Flights', proposedFlights, actualFlights),
      transportation: makeLine('Transportation', proposedTransport, actualTransport),
      production: makeLine('Production & Misc', proposedProd, actualProd),
      subtotal: makeLine('Subtotal Direct', subtotalDirectProposed, subtotalDirectActual),
    },
    overhead: {
      accountancy: makeLine('Accountancy', accountancyProposed, accountancyActual),
      insurance: makeLine('Insurance', insuranceProposed, insuranceActual),
      contingency: makeLine('Contingency', contingencyProposed, contingencyActual),
      subtotal: makeLine('Overhead Subtotal', overheadSubtotalProposed, overheadSubtotalActual),
    },
    commissions: {
      rows: commissionAmountsProposed.map((prop, i) =>
        makeLine(commissions[i]?.label ?? `Commission ${i + 1}`, prop, commissionAmountsActual[i] ?? new Decimal(0))
      ),
      total: makeLine('Total Commissions', totalCommissionsProposed, totalCommissionsActual),
    },
    totalExpenses: makeLine('Total Expenses', totalExpensesProposed, totalExpensesActual),
    netProfitLoss: makeLine('Net Profit/Loss', netProposed, netActual),
  };
}
