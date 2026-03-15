/* ============================================
   LOWPASS — Budget Dashboard Snapshot API

   GET: Returns per-tour snapshot for dashboard: tour name, budget % spent,
        net P&L (planned), next show date. Uses existing summary API per tour.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { headers } from 'next/headers';

const showDayTypes = ['show', 'festival'];

export async function GET() {
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

  const today = new Date().toISOString().slice(0, 10);

  const { data: activeTours } = await supabase
    .from('tours')
    .select('id, name')
    .eq('workspace_id', profile.workspace_id)
    .in('status', ['planning', 'active'])
    .order('start_date', { ascending: false });

  if (!activeTours?.length) {
    return NextResponse.json({ snapshots: [] });
  }

  const tourIds = activeTours.map((t) => t.id);

  // Next show date per tour (earliest show/festival date >= today)
  const { data: routingRows } = await supabase
    .from('routing')
    .select('tour_id, date, day_type')
    .in('tour_id', tourIds)
    .gte('date', today)
    .order('date', { ascending: true });

  const nextShowByTour: Record<string, string> = {};
  for (const r of routingRows ?? []) {
    const types = (r.day_type ?? '').split(',').map((s: string) => s.trim());
    if (showDayTypes.some((t) => types.includes(t)) && !nextShowByTour[r.tour_id]) {
      nextShowByTour[r.tour_id] = r.date;
    }
  }

  const headersList = await headers();
  const cookie = headersList.get('cookie') ?? '';
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const snapshots = await Promise.all(
    activeTours.map(async (tour) => {
      let totalProposedExpenses = 0;
      let totalActualExpenses = 0;
      let netPlanned = 0;

      try {
        const res = await fetch(`${base}/api/budget/summary?tour_id=${tour.id}`, {
          headers: { cookie },
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          const totalsSection = (data.sections ?? []).find((s: { title: string }) => s.title === 'TOTALS');
          if (totalsSection?.lines) {
            const expensesLine = totalsSection.lines.find((l: { label: string }) => l.label === 'Total Expenses');
            const netLine = totalsSection.lines.find((l: { label: string }) => l.label === 'Net Profit / (Loss)');
            if (expensesLine) {
              totalProposedExpenses = Number(expensesLine.proposed) || 0;
              totalActualExpenses = Number(expensesLine.actual) || 0;
            }
            if (netLine) netPlanned = Number(netLine.proposed) || 0;
          }
        }
      } catch (_) {
        // leave zeros
      }

      const budgetStatusPct =
        totalProposedExpenses > 0
          ? Math.round((totalActualExpenses / totalProposedExpenses) * 100)
          : null;

      return {
        tourId: tour.id,
        tourName: tour.name ?? '—',
        nextShowDate: nextShowByTour[tour.id] ?? null,
        totalProposedExpenses,
        totalActualExpenses,
        netPlanned,
        budgetStatusPct,
      };
    })
  );

  return NextResponse.json({ snapshots });
}
