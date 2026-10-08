/* ============================================
   LOWPASS — Budget Summary API

   GET: the tour's P&L (?tour_id=uuid), as summary sections.

   Money repair (Oct 2026): this route now computes NOTHING of its own. It
   loads the tour through `loadTourPnl` — the same inputs and the same pure
   `computeBudgetPnl` the Budget page's Summary uses — and only reshapes the
   result into the section/line format its callers read. The formula it used
   to carry here was wrong in five ways: income from every tour in the
   workspace, 0% insurance read as 3% (and 0% contingency as 2%), commission
   percentages not normalised, no currency conversion, and every category
   outside hotels / transport / production silently dropped.

   `dayCount` is still returned: it is a fact about the routing, not money.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadTourPnl } from '@/server/budget/loadTourPnl';

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

  let bundle;
  try {
    bundle = await loadTourPnl(supabase, tourId, wid);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const { pnl, breakdown: b, routingDays, tourCurrency } = bundle;

  // --- Day counts (routing facts, not money) ---
  const showDays = routingDays.filter((r) => r.day_type === 'show' || r.day_type === 'festival').length;
  const offDays = routingDays.filter((r) => ['off', 'travel', 'press', 'radio', 'tv'].includes(String(r.day_type))).length;
  const rehearsalDays = routingDays.filter((r) => r.day_type === 'rehearsal').length;
  const totalDays = showDays + offDays + rehearsalDays;

  const ib = pnl.incomeBreakdown;
  const pair = (label: string, p: { projected: number; actual: number }) => line(label, p.projected, p.actual);
  const sections: SummarySection[] = [
    {
      title: 'INCOME',
      lines: [
        line('Guarantees (Post-Tax)', ib.guarantee.projected + ib.overage.projected, ib.guarantee.actual + ib.overage.actual),
        pair('Merch', ib.merch),
        pair('VIP', ib.vip),
        ...(ib.deductions.actual ? [line('Settlement deductions', 0, -ib.deductions.actual)] : []),
      ],
      subtotal: pair('Total Income', pnl.grossIncome),
    },
    {
      title: 'DIRECT EXPENSES',
      lines: [
        pair('Salaries', b.salaries),
        pair('Per Diem', b.perDiem),
        pair('Hotels', b.hotels),
        pair('Flights', b.flights),
        pair('Transportation', b.transport),
        pair('Production & Misc', b.production),
      ],
      subtotal: pair('Subtotal Direct', pnl.baseExpenses),
    },
    {
      title: 'OVERHEADS',
      lines: [
        pair('Accountancy', pnl.accountancy),
        pair('Insurance', pnl.insurance),
        pair('Contingency', pnl.contingency),
        pair('Commissions', pnl.commissions),
        ...(pnl.cogs.projected || pnl.cogs.actual ? [pair('Merch COGS', pnl.cogs)] : []),
      ],
    },
    {
      title: 'TOTALS',
      lines: [
        pair('Total Expenses', pnl.totalExpenses),
        pair('Net Profit / (Loss)', pnl.net),
      ],
    },
  ];

  return NextResponse.json({
    sections,
    dayCount: { showDays, offDays, rehearsalDays, totalDays },
    currency: tourCurrency,
    // Additive: the canonical figures, and the currencies converted 1:1 for
    // lack of a rate (so a caller can warn rather than trust them).
    pnl,
    fx_missing: bundle.fxMissing,
  });
}
