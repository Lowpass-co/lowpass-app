/**
 * Shared commission basis + amount math (math spec §7).
 * Used by CommissionsTab and spreadsheet CommissionsGrid.
 */

export type CommissionContextIncomeRow = {
  post_tax_guarantee: number;
  post_tax_overage?: number;
  pre_tax_guarantee?: number;
  pre_tax_overage?: number;
  withholding_pct?: number;
  merch_income: number;
  vip_income: number;
  actual_guarantee: number | null;
  actual_overage: number | null;
  actual_merch: number | null;
  actual_vip: number | null;
};

type LineItemRow = { category: string; proposed_cost: number; actual_cost: number };
type PersonnelRateRow = {
  rate_type: string;
  show_rate: number;
  off_rate: number;
  rehearsal_rate?: number;
  per_diem: number;
  advance_fee: number;
};
type PayrollEntryRow = { total_fee: number; total_per_diem: number };
type FlightRow = { proposed_cost: number; actual_cost: number };
export type CommissionSettingsRow = { insurance_pct: number; contingency_pct: number; accountancy_pct: number };

export function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}

function n(x: number | null | undefined): number {
  return x == null ? 0 : Number(x);
}

function derivedPostTaxGuarantee(row: CommissionContextIncomeRow): number {
  const preTax = n(row.pre_tax_guarantee);
  const withholdingPct = n(row.withholding_pct);
  return preTax * (1 - withholdingPct / 100);
}

function derivedPostTaxOverage(row: CommissionContextIncomeRow): number {
  const preTax = n(row.pre_tax_overage);
  const withholdingPct = n(row.withholding_pct);
  return preTax * (1 - withholdingPct / 100);
}

/** Compute basis values and then commission amounts (math spec §7). */
export function computeCommissionContext(
  incomeRows: CommissionContextIncomeRow[],
  lineItems: LineItemRow[],
  personnel: PersonnelRateRow[],
  payrollEntries: PayrollEntryRow[],
  flights: FlightRow[],
  settings: CommissionSettingsRow | null,
  routingShowDays: number,
  routingOffDays: number,
  routingRehearsalDays: number,
  totalDays: number
) {
  const proposedGrossIncome =
    sum(incomeRows.map((i) => {
      const postTax = i.post_tax_guarantee;
      return postTax == null ? derivedPostTaxGuarantee(i) : n(postTax);
    })) +
    sum(incomeRows.map((i) => {
      const postTaxOverage = i.post_tax_overage;
      return postTaxOverage == null ? derivedPostTaxOverage(i) : n(postTaxOverage);
    })) +
    sum(incomeRows.map((i) => i.merch_income)) +
    sum(incomeRows.map((i) => i.vip_income));
  const actualGrossIncome =
    sum(incomeRows.map((i) => n(i.actual_guarantee))) +
    sum(incomeRows.map((i) => n(i.actual_overage))) +
    sum(incomeRows.map((i) => n(i.actual_merch))) +
    sum(incomeRows.map((i) => n(i.actual_vip)));

  const proposedSalaries = personnel.reduce((acc, p) => {
    const rateType = p.rate_type ?? 'day_rate';
    if (rateType === 'split_rate') {
      return (
        acc +
        routingShowDays * Number(p.show_rate) +
        routingOffDays * Number(p.off_rate) +
        routingRehearsalDays * Number(p.rehearsal_rate ?? 0) +
        Number(p.advance_fee ?? 0)
      );
    }
    return acc + totalDays * Number(p.off_rate) + Number(p.advance_fee ?? 0);
  }, 0);
  const actualSalaries = sum(payrollEntries.map((e) => Number(e.total_fee)));
  const proposedPerDiem = personnel.reduce((acc, p) => acc + totalDays * Number(p.per_diem ?? 0), 0);
  const actualPerDiem = sum(payrollEntries.map((e) => Number(e.total_per_diem)));

  const hotelsItems = lineItems.filter((i) => i.category === 'hotels');
  const transportItems = lineItems.filter((i) => i.category.startsWith('transport_'));
  const prodItems = lineItems.filter((i) => i.category.startsWith('prod_'));
  const proposedHotels = sum(hotelsItems.map((i) => i.proposed_cost));
  const actualHotels = sum(hotelsItems.map((i) => i.actual_cost));
  const proposedFlights = sum(flights.map((f) => f.proposed_cost));
  const actualFlights = sum(flights.map((f) => f.actual_cost));
  const proposedTransport = sum(transportItems.map((i) => i.proposed_cost));
  const actualTransport = sum(transportItems.map((i) => i.actual_cost));
  const proposedProd = sum(prodItems.map((i) => i.proposed_cost));
  const actualProd = sum(prodItems.map((i) => i.actual_cost));

  const subtotalDirectProposed =
    proposedSalaries + proposedPerDiem + proposedHotels + proposedFlights + proposedTransport + proposedProd;
  const subtotalDirectActual =
    actualSalaries + actualPerDiem + actualHotels + actualFlights + actualTransport + actualProd;

  const insurancePct = Number(settings?.insurance_pct ?? 0.03);
  const contingencyPct = Number(settings?.contingency_pct ?? 0.02);
  const accountancyPct = Number(settings?.accountancy_pct ?? 0);
  const accountancyProposed = accountancyPct * proposedGrossIncome;
  const accountancyActual = accountancyPct * actualGrossIncome;
  const insuranceProposed = insurancePct * proposedGrossIncome;
  const insuranceActual = insurancePct * actualGrossIncome;
  const contingencyProposed =
    contingencyPct * (subtotalDirectProposed + accountancyProposed + insuranceProposed);
  const contingencyActual = contingencyPct * (subtotalDirectActual + accountancyActual + insuranceActual);

  const expensesBeforeCommProposed =
    subtotalDirectProposed + accountancyProposed + insuranceProposed + contingencyProposed;
  const expensesBeforeCommActual =
    subtotalDirectActual + accountancyActual + insuranceActual + contingencyActual;

  const merchExpensesProposed = 0;
  const merchExpensesActual = 0;
  const sumMerchProposed = sum(incomeRows.map((i) => i.merch_income));
  const sumMerchActual = sum(incomeRows.map((i) => n(i.actual_merch)));
  const sumPreTaxProposed =
    sum(incomeRows.map((i) => i.pre_tax_guarantee ?? i.post_tax_guarantee)) +
    sumMerchProposed +
    sum(incomeRows.map((i) => i.vip_income));
  const sumPreTaxActual =
    sum(incomeRows.map((i) => n(i.actual_guarantee))) +
    sum(incomeRows.map((i) => n(i.actual_overage))) +
    sumMerchActual +
    sum(incomeRows.map((i) => n(i.actual_vip)));

  const basisValueProposed = (basis: string): number => {
    switch (basis) {
      case 'gross':
        return proposedGrossIncome;
      case 'net':
        return Math.max(0, proposedGrossIncome - expensesBeforeCommProposed);
      case 'gross_merch':
        return sumMerchProposed;
      case 'net_merch':
        return Math.max(0, sumMerchProposed - merchExpensesProposed);
      case 'gross_minus_tax':
        return sumPreTaxProposed;
      default:
        return proposedGrossIncome;
    }
  };
  const basisValueActual = (basis: string): number => {
    switch (basis) {
      case 'gross':
        return actualGrossIncome;
      case 'net':
        return Math.max(0, actualGrossIncome - expensesBeforeCommActual);
      case 'gross_merch':
        return sumMerchActual;
      case 'net_merch':
        return Math.max(0, sumMerchActual - merchExpensesActual);
      case 'gross_minus_tax':
        return sumPreTaxActual;
      default:
        return actualGrossIncome;
    }
  };

  const amountProposed = (pct: number, basis: string) => pct * basisValueProposed(basis);
  const amountActual = (pct: number, basis: string) => pct * basisValueActual(basis);

  return {
    amountProposed,
    amountActual,
    proposedGrossIncome,
    actualGrossIncome,
    subtotalDirectProposed,
    subtotalDirectActual,
    accountancyPct,
    insurancePct,
    contingencyPct,
    accountancyProposed,
    accountancyActual,
    insuranceProposed,
    insuranceActual,
    contingencyProposed,
    contingencyActual,
  };
}
