'use client';

import { useState, useEffect, Fragment } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Single P&L line with proposed, actual, and variance (math spec §9, §14) */
export interface BudgetSummaryLine {
  label: string;
  proposed: number;
  actual: number;
  variancePct: number | null;
  varianceDisplay: string;
}

/** Section of the P&L (INCOME, EXPENSES, etc.) */
export interface BudgetSummarySection {
  title: string;
  lines: BudgetSummaryLine[];
  subtotal?: BudgetSummaryLine;
}

function varianceDisplay(proposed: number, actual: number): string {
  if (proposed === 0 && actual === 0) return '—';
  if (proposed === 0) return 'N/A';
  const pct = ((actual - proposed) / proposed) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function varianceColor(proposed: number, actual: number): string {
  if (proposed === 0 && actual === 0) return 'text-lp-text-tertiary';
  if (proposed === 0) return 'text-lp-text-secondary';
  const pct = ((actual - proposed) / proposed) * 100;
  if (pct <= 0) return 'text-emerald-600 dark:text-emerald-400';
  if (pct <= 5) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

type RoutingRow = { id: string; date: string; day_type: string };
type PersonnelRateRow = {
  id: string;
  rate_type: string;
  show_rate: number;
  off_rate: number;
  rehearsal_rate: number;
  per_diem: number;
  advance_fee: number;
  commission?: number;
};
type PayrollEntryRow = { total_fee: number; total_per_diem: number };
type LineItemRow = { category: string; proposed_cost: number; actual_cost: number };
type CommissionRow = { label: string; percentage: number; basis: string };
type BudgetIncomeRow = {
  post_tax_guarantee: number;
  merch_income: number;
  vip_income: number;
  actual_guarantee: number | null;
  actual_overage: number | null;
  actual_merch: number | null;
  actual_vip: number | null;
  pre_tax_guarantee?: number;
};
type SettingsRow = { insurance_pct: number; contingency_pct: number; accountancy_pct: number };
type FlightRow = { proposed_cost: number; actual_cost: number };

export function SummaryTab({
  tourId,
  showCommission = false,
}: {
  tourId: string;
  showCommission?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<BudgetSummarySection[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/budget/settings?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/budget/income?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { income: [] })),
      fetch(`/api/tours/${tourId}/routing`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/budget/personnel-rates?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { personnel_rates: [] })),
      fetch(`/api/budget/payroll?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { entries: [] })),
      fetch(`/api/budget/line-items?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { line_items: [] })),
      fetch(`/api/budget/commissions?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { commissions: [] })),
      fetch(`/api/budget/flights?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { flights: [] })),
    ])
      .then(([settings, incomeRes, routing, personnelRes, payrollRes, lineItemsRes, commissionsRes, flightsRes]) => {
        const incomeRows: BudgetIncomeRow[] = incomeRes?.income ?? [];
        const routingRows: RoutingRow[] = Array.isArray(routing) ? routing : [];
        const personnel: PersonnelRateRow[] = personnelRes?.personnel_rates ?? [];
        const payrollEntries: PayrollEntryRow[] = payrollRes?.entries ?? [];
        const lineItems: LineItemRow[] = lineItemsRes?.line_items ?? [];
        const commissions: CommissionRow[] = commissionsRes?.commissions ?? [];
        const flights: FlightRow[] = flightsRes?.flights ?? [];
        const settingsRow: SettingsRow | null = settings;

        const showDays = routingRows.filter((r) => r.day_type === 'show' || r.day_type === 'festival').length;
        const offDays = routingRows.filter((r) =>
          ['off', 'travel', 'press', 'radio', 'tv'].includes(r.day_type)
        ).length;
        const rehearsalDays = routingRows.filter((r) => r.day_type === 'rehearsal').length;
        const totalDays = showDays + offDays + rehearsalDays;

        const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
        const n = (x: number | null | undefined) => (x == null ? 0 : Number(x));

        const proposedGrossIncome =
          sum(incomeRows.map((i) => i.post_tax_guarantee)) +
          sum(incomeRows.map((i) => i.merch_income)) +
          sum(incomeRows.map((i) => i.vip_income));
        const actualGrossIncome =
          sum(incomeRows.map((i) => n(i.actual_guarantee))) +
          sum(incomeRows.map((i) => n(i.actual_overage))) +
          sum(incomeRows.map((i) => n(i.actual_merch))) +
          sum(incomeRows.map((i) => n(i.actual_vip)));

        const proposedSalaries = personnel.reduce((acc, p) => {
          const rateType = p.rate_type ?? 'day_rate';
          let salary: number;
          if (rateType === 'split_rate') {
            salary =
              showDays * Number(p.show_rate) +
              offDays * Number(p.off_rate) +
              rehearsalDays * Number(p.rehearsal_rate ?? 0) +
              Number(p.advance_fee ?? 0);
          } else {
            salary = totalDays * Number(p.off_rate) + Number(p.advance_fee ?? 0);
          }
          if (showCommission && (p as { commission?: number }).commission) {
            salary += totalDays * Number((p as { commission?: number }).commission);
          }
          return acc + salary;
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

        const insurancePct = Number(settingsRow?.insurance_pct ?? 0.03);
        const contingencyPct = Number(settingsRow?.contingency_pct ?? 0.02);
        const accountancyPct = Number(settingsRow?.accountancy_pct ?? 0);

        const accountancyProposed = accountancyPct * proposedGrossIncome;
        const accountancyActual = accountancyPct * actualGrossIncome;
        const insuranceProposed = insurancePct * proposedGrossIncome;
        const insuranceActual = insurancePct * actualGrossIncome;
        const contingencyProposed =
          contingencyPct * (subtotalDirectProposed + accountancyProposed + insuranceProposed);
        const contingencyActual = contingencyPct * (subtotalDirectActual + accountancyActual + insuranceActual);

        const merchExpensesProposed = 0;
        const merchExpensesActual = 0;
        const sumMerchProposed = sum(incomeRows.map((i) => i.merch_income));
        const sumMerchActual = sum(incomeRows.map((i) => n(i.actual_merch)));
        const sumPreTaxProposed = sum(incomeRows.map((i) => i.pre_tax_guarantee ?? i.post_tax_guarantee)) + sumMerchProposed + sum(incomeRows.map((i) => i.vip_income));
        const sumPreTaxActual = sum(incomeRows.map((i) => n(i.actual_guarantee))) + sum(incomeRows.map((i) => n(i.actual_overage))) + sumMerchActual + sum(incomeRows.map((i) => n(i.actual_vip)));
        const expensesBeforeCommProposed = subtotalDirectProposed + accountancyProposed + insuranceProposed + contingencyProposed;
        const expensesBeforeCommActual = subtotalDirectActual + accountancyActual + insuranceActual + contingencyActual;

        const commissionAmountsProposed = commissions.map((c) => {
          const pct = Number(c.percentage) || 0;
          let basisVal: number;
          switch (c.basis) {
            case 'gross':
              basisVal = proposedGrossIncome;
              break;
            case 'net':
              basisVal = Math.max(0, proposedGrossIncome - expensesBeforeCommProposed);
              break;
            case 'gross_merch':
              basisVal = sumMerchProposed;
              break;
            case 'net_merch':
              basisVal = Math.max(0, sumMerchProposed - merchExpensesProposed);
              break;
            case 'gross_minus_tax':
              basisVal = sumPreTaxProposed;
              break;
            default:
              basisVal = proposedGrossIncome;
          }
          return pct * basisVal;
        });
        const commissionAmountsActual = commissions.map((c) => {
          const pct = Number(c.percentage) || 0;
          let basisVal: number;
          switch (c.basis) {
            case 'gross':
              basisVal = actualGrossIncome;
              break;
            case 'net':
              basisVal = Math.max(0, actualGrossIncome - expensesBeforeCommActual);
              break;
            case 'gross_merch':
              basisVal = sumMerchActual;
              break;
            case 'net_merch':
              basisVal = Math.max(0, sumMerchActual - merchExpensesActual);
              break;
            case 'gross_minus_tax':
              basisVal = sumPreTaxActual;
              break;
            default:
              basisVal = actualGrossIncome;
          }
          return pct * basisVal;
        });
        const totalCommissionsProposed = sum(commissionAmountsProposed);
        const totalCommissionsActual = sum(commissionAmountsActual);

        const totalExpensesProposed = expensesBeforeCommProposed + totalCommissionsProposed;
        const totalExpensesActual = expensesBeforeCommActual + totalCommissionsActual;
        const netProposed = proposedGrossIncome - totalExpensesProposed;
        const netActual = actualGrossIncome - totalExpensesActual;

        const line = (label: string, prop: number, act: number): BudgetSummaryLine => ({
          label,
          proposed: prop,
          actual: act,
          variancePct: prop === 0 && act === 0 ? null : prop === 0 ? null : ((act - prop) / prop) * 100,
          varianceDisplay: varianceDisplay(prop, act),
        });

        setSections([
          {
            title: 'INCOME',
            lines: [
              line('Guarantees (Post-Tax)', sum(incomeRows.map((i) => i.post_tax_guarantee)), sum(incomeRows.map((i) => n(i.actual_guarantee))) + sum(incomeRows.map((i) => n(i.actual_overage)))),
              line('Merch', sum(incomeRows.map((i) => i.merch_income)), sumMerchActual),
              line('VIP', sum(incomeRows.map((i) => i.vip_income)), sum(incomeRows.map((i) => n(i.actual_vip)))),
            ],
            subtotal: line('Total Income', proposedGrossIncome, actualGrossIncome),
          },
          {
            title: 'DIRECT EXPENSES',
            lines: [
              line('Salaries', proposedSalaries, actualSalaries),
              line('Per Diem', proposedPerDiem, actualPerDiem),
              line('Hotels', proposedHotels, actualHotels),
              line('Flights', proposedFlights, actualFlights),
              line('Transportation', proposedTransport, actualTransport),
              line('Production & Misc', proposedProd, actualProd),
            ],
            subtotal: line('Subtotal Direct', subtotalDirectProposed, subtotalDirectActual),
          },
          {
            title: 'OVERHEADS',
            lines: [
              line('Accountancy', accountancyProposed, accountancyActual),
              line('Insurance', insuranceProposed, insuranceActual),
              line('Contingency', contingencyProposed, contingencyActual),
              line('Commissions', totalCommissionsProposed, totalCommissionsActual),
            ],
          },
          {
            title: 'TOTALS',
            lines: [
              line('Total Expenses', totalExpensesProposed, totalExpensesActual),
              line('Net Profit / (Loss)', netProposed, netActual),
            ],
          },
        ]);
      })
      .catch((err) => setError(err?.message ?? 'Failed to load summary'))
      .finally(() => setLoading(false));
  }, [tourId, showCommission]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading summary…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-lp-border bg-lp-surface">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-lp-border">
            <th className="bg-lp-bg-tertiary/50 px-4 py-3 text-left font-semibold text-lp-text">Line</th>
            <th className="bg-lp-bg-tertiary/50 px-4 py-3 text-right font-semibold text-lp-text w-32">Proposed</th>
            <th className="bg-lp-bg-tertiary/50 px-4 py-3 text-right font-semibold text-lp-text w-32">Actual</th>
            <th className="bg-lp-bg-tertiary/50 px-4 py-3 text-right font-semibold text-lp-text w-24">Variance</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section, idx) => (
            <Fragment key={idx}>
              <tr>
                <td colSpan={4} className="bg-lp-bg-tertiary/30 px-4 py-2 font-medium uppercase tracking-wider text-lp-text-secondary">
                  {section.title}
                </td>
              </tr>
              {section.lines.map((row, lineIdx) => (
                <tr key={`${idx}-${lineIdx}`} className="border-b border-lp-border/60">
                  <td className="px-4 py-2 text-lp-text">{row.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-lp-text">
                    {row.proposed.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-lp-text">
                    {row.actual.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className={cn('px-4 py-2 text-right tabular-nums font-medium', varianceColor(row.proposed, row.actual))}>
                    {row.varianceDisplay}
                  </td>
                </tr>
              ))}
              {section.subtotal && (
                <tr className="border-b border-lp-border bg-lp-bg-tertiary/20">
                  <td className="px-4 py-2 font-bold text-lp-text">{section.subtotal.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-bold text-lp-text">
                    {section.subtotal.proposed.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-bold text-lp-text">
                    {section.subtotal.actual.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className={cn('px-4 py-2 text-right tabular-nums font-bold', varianceColor(section.subtotal.proposed, section.subtotal.actual))}>
                    {section.subtotal.varianceDisplay}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
