/* ============================================
   LOWPASS — Budget Payroll Generate API

   POST: Auto-generate payroll entries from routing dates.
        Body: { tour_id }
        Groups routing by week (Mon–Sun), maps day_type → day_status,
        computes total_fee and total_per_diem per math spec §6.
        Advance_fee applied to week 1 only per person.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
// b2 — totals now sum a person's rate lines (personnel_rate_lines × rate_types)
// via computeTotals; day counting + the day_type→status map come from the
// canonical SSOTs (fees.countDayStatuses / effectiveDayType.dayTypeToPayStatus)
// so generate can never disagree with the payroll display.
import { computeTotals, countDayStatuses } from '@/lib/payroll/fees';
import { dayTypeToPayStatus, type PayStatus } from '@/lib/payroll/effectiveDayType';
import { loadTourRateContext, rateLinesFor } from '@/lib/payroll/loadRateLines';

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
    .select('id, rate_type, per_diem, advance_fee')
    .eq('tour_id', tour_id)
    .eq('workspace_id', profile.workspace_id);

  if (personnelError) {
    return NextResponse.json({ error: personnelError.message }, { status: 500 });
  }

  // b2 — the rate-lines source: the workspace catalog + every person's lines.
  const rateCtx = await loadTourRateContext(supabase, tour_id, profile.workspace_id as string);

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
    const advanceFeeTotal = Number(person.advance_fee) || 0;
    let weekIndex = 0;
    for (const weekStart of sortedWeekStarts) {
      const dates = weekDates(weekStart);
      const dayStatuses: Record<string, DayStatus> = {};
      for (const dateStr of dates) {
        const r = routingByDate.get(dateStr);
        dayStatuses[dateStr] = r ? dayTypeToPayStatus(r.day_type) : 'no_tour';
      }
      const advanceFee = weekIndex === 0 ? advanceFeeTotal : 0;
      // Rate-lines totals: sum this person's lines over the week's day counts.
      // The advance is a flat_once charge applied ONCE (week 0) — so drop
      // flat_once lines for weeks > 0. Reconciles to the legacy per-week math
      // for both split_rate (a1/a2/a3) and day_rate (a6) — proven in the harness.
      const counts = countDayStatuses(dayStatuses);
      // Rates SSOT — lines from personnel_rate_lines; ctx.legacyByRateId carries
      // the fallback (advance included) so no legacy column is named here. The
      // a5 advance line equals the card's advance_fee, matching advanceFeeTotal.
      const allLines = rateLinesFor(rateCtx, person.id as string);
      const lines = weekIndex === 0 ? allLines : allLines.filter((l) => l.basis !== 'flat_once');
      const { totalFee: total_fee, totalPerDiem: total_per_diem } = computeTotals(lines, counts);
      const { error: upsertError } = await supabase
        .from('payroll_entries')
        .upsert(
          {
            tour_id,
            workspace_id: profile.workspace_id,
            personnel_id: person.id,
            week_start: weekStart,
            day_statuses: dayStatuses,
            advance_fee: advanceFee,
            total_fee,
            total_per_diem,
            notes: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'personnel_id,week_start' }
        );
      if (!upsertError) generated++;
      weekIndex++;
    }
  }

  return NextResponse.json({
    generated,
    weeks: sortedWeekStarts.length,
  });
}
