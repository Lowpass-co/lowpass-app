/* ============================================
   LOWPASS — Budget Summary API

   GET: Returns pre-computed P&L summary for a tour (?tour_id=uuid).
        Consolidates 8 separate queries into one endpoint.
        All math follows the budget spec (§9, §14).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { computeTotals } from '@/lib/payroll/fees';
import { loadTourRateContext, rateLinesFor } from '@/lib/payroll/loadRateLines';

interface SummaryLine {
  label: string;
  proposed: number;
  actual: number;
  variancePct: number | null;
  varianceDisplay: string;
}

interface SummarySection {
  title: string;
  lines: SummaryLine[];
  subtotal?: SummaryLine;
}

function variance(proposed: number, actual: number): { pct: number | null; display: string } {
  if (proposed === 0 && actual === 0) return { pct: null, display: '—' };
  if (proposed === 0) return { pct: null, display: 'N/A' };
  const pct = ((actual - proposed) / proposed) * 100;
  return { pct, display: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` };
}

function line(label: string, proposed: number, actual: number): SummaryLine {
  const v = variance(proposed, actual);
  return { label, proposed, actual, variancePct: v.pct, varianceDisplay: v.display };
}

const n = (x: number | null | undefined): number => (x == null ? 0 : Number(x) || 0);
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tour_id');
  if (!tourId) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  const wid = profile.workspace_id;

  // All 8 queries in parallel — single round trip to Supabase
  const [
    tourRes,
    settingsRes,
    incomeRes,
    routingRes,
    personnelRes,
    payrollRes,
    lineItemsRes,
    commissionsRes,
    flightsRes,
  ] = await Promise.all([
    supabase
      .from('tours')
      .select('currency')
      .eq('id', tourId)
      .eq('workspace_id', wid)
      .maybeSingle(),
    supabase
      .from('budget_settings')
      .select('insurance_pct, contingency_pct, accountancy_pct')
      .eq('workspace_id', wid)
      .eq('tour_id', tourId)
      .maybeSingle(),
    supabase
      .from('budget_income')
      .select('post_tax_guarantee, merch_income, vip_income, actual_guarantee, actual_overage, actual_merch, actual_vip, pre_tax_guarantee')
      .eq('workspace_id', wid),
    supabase
      .from('routing')
      .select('id, date, day_type')
      .eq('tour_id', tourId),
    supabase
      .from('personnel_rates')
      .select('id')
      .eq('workspace_id', wid)
      .eq('tour_id', tourId),
    supabase
      .from('payroll_entries')
      .select('total_fee, total_per_diem')
      .eq('tour_id', tourId)
      .eq('workspace_id', wid),
    supabase
      .from('budget_line_items')
      .select('category, proposed_cost, actual_cost')
      .eq('workspace_id', wid)
      .eq('tour_id', tourId),
    supabase
      .from('budget_commissions')
      .select('label, percentage, basis')
      .eq('workspace_id', wid)
      .eq('tour_id', tourId),
    supabase
      .from('flights')
      .select('cost_amount')
      .eq('workspace_id', wid)
      .eq('tour_id', tourId),
  ]);

  // Extract data with safe fallbacks
  const settings = settingsRes.data;
  const incomeRows = incomeRes.data ?? [];
  const routingRows = routingRes.data ?? [];
  const personnel = personnelRes.data ?? [];
  const payrollEntries = payrollRes.data ?? [];
  const lineItems = lineItemsRes.data ?? [];
  const commissions = commissionsRes.data ?? [];
  const flights = flightsRes.data ?? [];

  // --- Day counts ---
  const showDays = routingRows.filter((r) => r.day_type === 'show' || r.day_type === 'festival').length;
  const offDays = routingRows.filter((r) =>
    ['off', 'travel', 'press', 'radio', 'tv'].includes(r.day_type)
  ).length;
  const rehearsalDays = routingRows.filter((r) => r.day_type === 'rehearsal').length;
  const totalDays = showDays + offDays + rehearsalDays;

  // --- Income ---
  const proposedGrossIncome =
    sum(incomeRows.map((i) => n(i.post_tax_guarantee))) +
    sum(incomeRows.map((i) => n(i.merch_income))) +
    sum(incomeRows.map((i) => n(i.vip_income)));
  const actualGrossIncome =
    sum(incomeRows.map((i) => n(i.actual_guarantee))) +
    sum(incomeRows.map((i) => n(i.actual_overage))) +
    sum(incomeRows.map((i) => n(i.actual_merch))) +
    sum(incomeRows.map((i) => n(i.actual_vip)));

  // --- Salaries (rates SSOT) ---
  // Compute each person's fee + per-diem from personnel_rate_lines via the
  // engine, not the legacy personnel_rates.* columns. computeTotals over the
  // default lines reproduces the old split/day-rate arithmetic exactly (the
  // day-rate branch was already totalDays×off_rate = the a6 line).
  const rateCtx = await loadTourRateContext(supabase, tourId, wid);
  const dayCounts = { show: showDays, offTravel: offDays, rehearsal: rehearsalDays, active: totalDays };
  let proposedSalaries = 0;
  let proposedPerDiem = 0;
  for (const p of personnel) {
    const totals = computeTotals(rateLinesFor(rateCtx, p.id), dayCounts);
    proposedSalaries += totals.totalFee;
    proposedPerDiem += totals.totalPerDiem;
  }
  const actualSalaries = sum(payrollEntries.map((e) => n(e.total_fee)));
  const actualPerDiem = sum(payrollEntries.map((e) => n(e.total_per_diem)));

  // --- Direct expense categories ---
  const hotelsItems = lineItems.filter((i) => i.category === 'hotels');
  const transportItems = lineItems.filter((i) => i.category.startsWith('transport_'));
  const prodItems = lineItems.filter((i) => i.category.startsWith('prod_'));
  const proposedHotels = sum(hotelsItems.map((i) => n(i.proposed_cost)));
  const actualHotels = sum(hotelsItems.map((i) => n(i.actual_cost)));
  const proposedFlights = sum(flights.map((f) => n(f.cost_amount)));
  const actualFlights = sum(flights.map((f) => n(f.cost_amount)));
  const proposedTransport = sum(transportItems.map((i) => n(i.proposed_cost)));
  const actualTransport = sum(transportItems.map((i) => n(i.actual_cost)));
  const proposedProd = sum(prodItems.map((i) => n(i.proposed_cost)));
  const actualProd = sum(prodItems.map((i) => n(i.actual_cost)));

  const subtotalDirectProposed =
    proposedSalaries + proposedPerDiem + proposedHotels + proposedFlights + proposedTransport + proposedProd;
  const subtotalDirectActual =
    actualSalaries + actualPerDiem + actualHotels + actualFlights + actualTransport + actualProd;

  // --- Overheads (math spec §14: accountancy & insurance on gross, contingency on direct + acc + ins) ---
  const insurancePct = n(settings?.insurance_pct) || 0.03;
  const contingencyPct = n(settings?.contingency_pct) || 0.02;
  const accountancyPct = n(settings?.accountancy_pct);

  const accountancyProposed = accountancyPct * proposedGrossIncome;
  const accountancyActual = accountancyPct * actualGrossIncome;
  const insuranceProposed = insurancePct * proposedGrossIncome;
  const insuranceActual = insurancePct * actualGrossIncome;
  const contingencyProposed =
    contingencyPct * (subtotalDirectProposed + accountancyProposed + insuranceProposed);
  const contingencyActual = contingencyPct * (subtotalDirectActual + accountancyActual + insuranceActual);

  // --- Commissions (math spec §14: basis types) ---
  const sumMerchProposed = sum(incomeRows.map((i) => n(i.merch_income)));
  const sumMerchActual = sum(incomeRows.map((i) => n(i.actual_merch)));
  const sumPreTaxProposed =
    sum(incomeRows.map((i) => n(i.pre_tax_guarantee) || n(i.post_tax_guarantee))) +
    sumMerchProposed +
    sum(incomeRows.map((i) => n(i.vip_income)));
  const sumPreTaxActual =
    sum(incomeRows.map((i) => n(i.actual_guarantee))) +
    sum(incomeRows.map((i) => n(i.actual_overage))) +
    sumMerchActual +
    sum(incomeRows.map((i) => n(i.actual_vip)));

  const expensesBeforeCommProposed =
    subtotalDirectProposed + accountancyProposed + insuranceProposed + contingencyProposed;
  const expensesBeforeCommActual =
    subtotalDirectActual + accountancyActual + insuranceActual + contingencyActual;

  function commissionBasis(basis: string, isProposed: boolean): number {
    const gross = isProposed ? proposedGrossIncome : actualGrossIncome;
    const expenses = isProposed ? expensesBeforeCommProposed : expensesBeforeCommActual;
    const merch = isProposed ? sumMerchProposed : sumMerchActual;
    const preTax = isProposed ? sumPreTaxProposed : sumPreTaxActual;
    switch (basis) {
      case 'gross': return gross;
      case 'net': return Math.max(0, gross - expenses);
      case 'gross_merch': return merch;
      case 'net_merch': return Math.max(0, merch); // no merch expenses tracked yet
      case 'gross_minus_tax': return preTax;
      default: return gross;
    }
  }

  const totalCommissionsProposed = sum(
    commissions.map((c) => (n(c.percentage)) * commissionBasis(c.basis, true))
  );
  const totalCommissionsActual = sum(
    commissions.map((c) => (n(c.percentage)) * commissionBasis(c.basis, false))
  );

  // --- Totals ---
  const totalExpensesProposed = expensesBeforeCommProposed + totalCommissionsProposed;
  const totalExpensesActual = expensesBeforeCommActual + totalCommissionsActual;
  const netProposed = proposedGrossIncome - totalExpensesProposed;
  const netActual = actualGrossIncome - totalExpensesActual;

  // Build sections
  const sections: SummarySection[] = [
    {
      title: 'INCOME',
      lines: [
        line(
          'Guarantees (Post-Tax)',
          sum(incomeRows.map((i) => n(i.post_tax_guarantee))),
          sum(incomeRows.map((i) => n(i.actual_guarantee))) + sum(incomeRows.map((i) => n(i.actual_overage)))
        ),
        line('Merch', sum(incomeRows.map((i) => n(i.merch_income))), sumMerchActual),
        line('VIP', sum(incomeRows.map((i) => n(i.vip_income))), sum(incomeRows.map((i) => n(i.actual_vip)))),
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
  ];

  const currency: string = (tourRes?.data as { currency?: string } | null)?.currency ?? 'GBP';
  return NextResponse.json({ sections, dayCount: { showDays, offDays, rehearsalDays, totalDays }, currency });
}
