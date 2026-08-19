/* ============================================
   LOWPASS — Artist Budget Summary API

   GET /api/budget/artist-summary?artist_id=uuid&year=2026 (year optional)

   Returns all tours for an artist with their P&L summary:
   { tours: TourSummaryRow[] }

   Each row:
     tour_id, tour_name, start_date, end_date, status, continent
     income_proposed, income_actual
     expenses_proposed, expenses_actual
     net_proposed, net_actual
============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
// 2026-08-19 — Salary/Per-Diem, both sides, now come from the DERIVED budget
// lines (`source_entity_type` 'payroll' / 'payroll_per_diem'), which
// `reconcileDerivedBudgetLines` writes through fees.ts from each person's
// `personnel_rate_lines` counted with `effectiveStatuses`.
//
// Replaced two things. PROPOSED projected rate lines over TOUR-WIDE routing day
// counts — identical for every person, blind to anything painted, folding
// press/radio/tv into Travel and losing pd_only from per diem. ACTUAL summed
// `payroll_entries.total_fee`, a column that holds nothing until someone paints
// a day status, so every artist row showed £0 of actual salary on tours nobody
// had painted. Same table this route already read for hotels; no extra query.
import { derivedPayrollTotals } from '@/lib/budget/derivedPayrollTotals';

const n = (x: unknown) => (x == null ? 0 : Number(x) || 0);
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const artistId = searchParams.get('artist_id');
  const year = searchParams.get('year');

  if (!artistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 });

  const wid = profile.workspace_id;

  // ── Fetch tours for this artist ──────────────────────────────────────────
  let tourQuery = supabase
    .from('tours')
    .select('id, name, start_date, end_date, status, continent, currency')
    .eq('workspace_id', wid)
    .eq('artist_id', artistId)
    .order('start_date', { ascending: false });

  if (year) {
    // Filter tours that overlap the given year
    tourQuery = tourQuery
      .gte('end_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`);
  }

  const { data: tours, error: toursErr } = await tourQuery;
  if (toursErr) return NextResponse.json({ error: toursErr.message }, { status: 500 });
  if (!tours || tours.length === 0) return NextResponse.json({ tours: [] });

  const tourIds = tours.map(t => t.id);

  // ── Fetch all budget data for these tours in parallel ─────────────────────
  const [
    settingsRes,
    incomeRes,
    lineItemsRes,
    commissionsRes,
    flightsRes,
    routingRes,
  ] = await Promise.all([
    supabase.from('budget_settings')
      .select('tour_id, insurance_pct, contingency_pct, accountancy_pct')
      .eq('workspace_id', wid)
      .in('tour_id', tourIds),

    supabase.from('budget_income')
      .select('routing_id, post_tax_guarantee, pre_tax_guarantee, merch_income, vip_income, actual_guarantee, actual_overage, actual_merch, actual_vip')
      .eq('workspace_id', wid),

    supabase.from('budget_line_items')
      .select('tour_id, category, proposed_cost, actual_cost, source_entity_type')
      .eq('workspace_id', wid)
      .in('tour_id', tourIds),

    supabase.from('budget_commissions')
      .select('tour_id, percentage, basis')
      .eq('workspace_id', wid)
      .in('tour_id', tourIds),

    supabase.from('flights')
      .select('tour_id, cost_amount')
      .eq('workspace_id', wid)
      .in('tour_id', tourIds),

    supabase.from('routing')
      .select('id, tour_id, date, day_type')
      .in('tour_id', tourIds),
  ]);

  const settings = settingsRes.data ?? [];
  const incomeRows = incomeRes.data ?? [];
  const lineItems = lineItemsRes.data ?? [];
  const commissions = commissionsRes.data ?? [];
  const flights = flightsRes.data ?? [];
  const routing = routingRes.data ?? [];

  // Build routing_id → tour_id map for income (income is linked via routing)
  const routingTourMap: Record<string, string> = {};
  for (const r of routing) {
    routingTourMap[r.id] = r.tour_id;
  }

  // ── Per-tour aggregation ──────────────────────────────────────────────────
  const result = tours.map(tour => {
    const tid = tour.id;
    const tourRouting = routing.filter(r => r.tour_id === tid);
    const tourSettings = settings.find(s => s.tour_id === tid);

    // Show count for the row header. The off / rehearsal / total-day counts
    // that used to live here existed only to project salaries tour-wide; the
    // derived lines carry that now, per person and per painted day.
    const showDays = tourRouting.filter(r => r.day_type === 'show' || r.day_type === 'festival').length;

    // Income — filter by routing rows belonging to this tour
    const tourRoutingIds = new Set(tourRouting.map(r => r.id));
    const tourIncome = incomeRows.filter(i => tourRoutingIds.has(i.routing_id));

    const proposedIncome = sum(tourIncome.map(i => n(i.post_tax_guarantee) + n(i.merch_income) + n(i.vip_income)));
    const actualIncome = sum(tourIncome.map(i => n(i.actual_guarantee) + n(i.actual_overage) + n(i.actual_merch) + n(i.actual_vip)));

    // Line items — including the derived Salary / Per-Diem lines.
    const tourLines = lineItems.filter(i => i.tour_id === tid);

    // Salaries + Per Diem, both sides, from those derived lines. One formula.
    const { proposedSalaries, actualSalaries, proposedPerDiem, actualPerDiem } =
      derivedPayrollTotals(tourLines);

    const hotelsP = sum(tourLines.filter(i => i.category === 'hotels').map(i => n(i.proposed_cost)));
    const hotelsA = sum(tourLines.filter(i => i.category === 'hotels').map(i => n(i.actual_cost)));
    const transportP = sum(tourLines.filter(i => i.category.startsWith('transport_')).map(i => n(i.proposed_cost)));
    const transportA = sum(tourLines.filter(i => i.category.startsWith('transport_')).map(i => n(i.actual_cost)));
    const prodP = sum(tourLines.filter(i => i.category.startsWith('prod_')).map(i => n(i.proposed_cost)));
    const prodA = sum(tourLines.filter(i => i.category.startsWith('prod_')).map(i => n(i.actual_cost)));

    // Flights
    const tourFlights = flights.filter(f => f.tour_id === tid);
    const flightsP = sum(tourFlights.map(f => n(f.cost_amount)));
    const flightsA = sum(tourFlights.map(f => n(f.cost_amount)));

    const directP = proposedSalaries + proposedPerDiem + hotelsP + flightsP + transportP + prodP;
    const directA = actualSalaries + actualPerDiem + hotelsA + flightsA + transportA + prodA;

    // Overheads
    const insurancePct = n(tourSettings?.insurance_pct) || 0.03;
    const contingencyPct = n(tourSettings?.contingency_pct) || 0.02;
    const accountancyPct = n(tourSettings?.accountancy_pct);
    const insuranceP = insurancePct * proposedIncome;
    const insuranceA = insurancePct * actualIncome;
    const accountancyP = accountancyPct * proposedIncome;
    const accountancyA = accountancyPct * actualIncome;
    const contingencyP = contingencyPct * (directP + accountancyP + insuranceP);
    const contingencyA = contingencyPct * (directA + accountancyA + insuranceA);

    // Commissions
    const tourCommissions = commissions.filter(c => c.tour_id === tid);
    const beforeCommP = directP + accountancyP + insuranceP + contingencyP;
    const beforeCommA = directA + accountancyA + insuranceA + contingencyA;
    const commissionsP = sum(tourCommissions.map(c => n(c.percentage) * proposedIncome));
    const commissionsA = sum(tourCommissions.map(c => n(c.percentage) * actualIncome));

    const totalExpensesP = beforeCommP + commissionsP;
    const totalExpensesA = beforeCommA + commissionsA;
    const netP = proposedIncome - totalExpensesP;
    const netA = actualIncome - totalExpensesA;

    return {
      tour_id: tid,
      tour_name: tour.name,
      start_date: tour.start_date,
      end_date: tour.end_date,
      status: tour.status,
      continent: tour.continent,
      currency: tour.currency,
      income_proposed: proposedIncome,
      income_actual: actualIncome,
      expenses_proposed: totalExpensesP,
      expenses_actual: totalExpensesA,
      net_proposed: netP,
      net_actual: netA,
      show_count: showDays,
    };
  });

  // Rolling monthly P&L (group by month of start_date for a rough monthly view)
  const monthly: Record<string, { proposed: number; actual: number }> = {};
  for (const t of result) {
    const month = t.start_date?.slice(0, 7); // "2026-03"
    if (!month) continue;
    if (!monthly[month]) monthly[month] = { proposed: 0, actual: 0 };
    monthly[month].proposed += t.net_proposed;
    monthly[month].actual += t.net_actual;
  }
  const monthlyRolling = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));

  // Totals
  const totals = {
    income_proposed: sum(result.map(r => r.income_proposed)),
    income_actual: sum(result.map(r => r.income_actual)),
    expenses_proposed: sum(result.map(r => r.expenses_proposed)),
    expenses_actual: sum(result.map(r => r.expenses_actual)),
    net_proposed: sum(result.map(r => r.net_proposed)),
    net_actual: sum(result.map(r => r.net_actual)),
  };

  return NextResponse.json({ tours: result, totals, monthly_rolling: monthlyRolling });
}
