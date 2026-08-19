/* ============================================
   LOWPASS — Budget Payroll Generate API

   POST: Auto-generate payroll entries from routing dates.
        Body: { tour_id }
        Groups routing by week (Mon–Sun), maps day_type → day_status, and
        persists the resulting `day_statuses` map. That is all it persists.

   MONEY REMOVED 2026-08-19 (M-1b). This route used to compute and store
   `total_fee` / `total_per_diem` / `advance_fee` alongside the statuses. Those
   columns have no readers any more — every money surface reads the derived
   budget lines (`@/lib/budget/derivedPayrollTotals`), which are recomputed
   from `personnel_rate_lines` + `effectiveStatuses` on every budget load and
   do not require anyone to have run this generator. Writing a second, weaker
   copy of the same total is exactly the divergence the convergence removed.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
// The day_type→status map is the canonical SSOT (effectiveDayType), so the
// statuses this seeds are the same ones the payroll display would default to.
import { dayTypeToPayStatus, type PayStatus } from '@/lib/payroll/effectiveDayType';

type DayStatus = PayStatus;

/** Get Monday (week_start) for a given date in YYYY-MM-DD */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** All dates Mon–Sun for a given week_start */
function weekDates(weekStart: string): string[] {
  const out: string[] = [];
  const d = new Date(weekStart + 'T12:00:00Z');
  for (let i = 0; i < 7; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
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

  let body: { tour_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tour_id } = body;
  if (!tour_id) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tour_id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { data: routingRows, error: routingError } = await supabase
    .from('routing')
    .select('id, date, day_type')
    .eq('tour_id', tour_id)
    .order('date');

  if (routingError) {
    return NextResponse.json({ error: routingError.message }, { status: 500 });
  }

  const { data: personnelRows, error: personnelError } = await supabase
    .from('personnel_rates')
    .select('id')
    .eq('tour_id', tour_id)
    .eq('workspace_id', profile.workspace_id);

  if (personnelError) {
    return NextResponse.json({ error: personnelError.message }, { status: 500 });
  }

  const routingByDate = new Map<string, { day_type: string }>();
  const weekStarts = new Set<string>();
  for (const r of routingRows ?? []) {
    const dateStr = typeof r.date === 'string' ? r.date.slice(0, 10) : '';
    if (dateStr) {
      routingByDate.set(dateStr, { day_type: String((r as { day_type?: string }).day_type ?? '').trim() });
      weekStarts.add(getWeekStart(dateStr));
    }
  }

  const sortedWeekStarts = Array.from(weekStarts).sort();
  const personnel = personnelRows ?? [];
  let generated = 0;

  for (const person of personnel) {
    for (const weekStart of sortedWeekStarts) {
      const dates = weekDates(weekStart);
      const dayStatuses: Record<string, DayStatus> = {};
      for (const dateStr of dates) {
        const r = routingByDate.get(dateStr);
        dayStatuses[dateStr] = r ? dayTypeToPayStatus(r.day_type) : 'no_tour';
      }
      const { error: upsertError } = await supabase
        .from('payroll_entries')
        .upsert(
          {
            tour_id,
            workspace_id: profile.workspace_id,
            personnel_id: person.id,
            week_start: weekStart,
            day_statuses: dayStatuses,
            notes: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'personnel_id,week_start' }
        );
      if (!upsertError) generated++;
    }
  }

  return NextResponse.json({
    generated,
    weeks: sortedWeekStarts.length,
  });
}
