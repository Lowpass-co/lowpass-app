/* ============================================
   LOWPASS — Budget Payroll Generate API

   POST: Auto-generate payroll entries from routing dates.
        Body: { tour_id }
        Groups routing by week (Mon–Sun), maps day_type → day_status,
        computes total_fee and total_per_diem per math spec §6.
        Advance_fee applied to week 1 only per person.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type DayStatus = 'show' | 'off_travel' | 'rehearsal' | 'no_tour';
type RoutingDayType = string;

/** Get Monday (week_start) for a given date in YYYY-MM-DD */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Map routing day_type to payroll day_status */
function dayTypeToStatus(dayType: RoutingDayType): DayStatus {
  const t = (dayType ?? '').toLowerCase();
  if (t === 'show' || t === 'festival') return 'show';
  if (t === 'rehearsal') return 'rehearsal';
  if (['off', 'travel', 'press', 'radio', 'tv'].includes(t)) return 'off_travel';
  return 'off_travel';
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

function countDayStatuses(
  dayStatuses: Record<string, DayStatus>
): { show: number; offTravel: number; rehearsal: number; active: number } {
  let show = 0;
  let offTravel = 0;
  let rehearsal = 0;
  for (const v of Object.values(dayStatuses)) {
    if (v === 'show') show++;
    else if (v === 'off_travel') offTravel++;
    else if (v === 'rehearsal') rehearsal++;
  }
  const active = show + offTravel + rehearsal;
  return { show, offTravel, rehearsal, active };
}

function computeWeekFeeAndPerDiem(
  dayStatuses: Record<string, DayStatus>,
  personnel: {
    rate_type: string;
    show_rate: number;
    off_rate: number;
    rehearsal_rate: number;
    per_diem: number;
  },
  advanceFee: number
): { total_fee: number; total_per_diem: number } {
  const { show, offTravel, rehearsal, active } = countDayStatuses(dayStatuses);
  const rateType = (personnel?.rate_type ?? 'day_rate') as string;
  let totalFee: number;
  if (rateType === 'split_rate') {
    const showRate = Number(personnel.show_rate) || 0;
    const offRate = Number(personnel.off_rate) || 0;
    const rehRate = Number(personnel.rehearsal_rate) || 0;
    totalFee = show * showRate + offTravel * offRate + rehearsal * rehRate + advanceFee;
  } else {
    const offRate = Number(personnel.off_rate) || 0;
    totalFee = active * offRate + advanceFee;
  }
  const perDiemRate = Number(personnel.per_diem) || 0;
  const totalPerDiem = active * perDiemRate;
  return { total_fee: totalFee, total_per_diem: totalPerDiem };
}

export async function POST(request: Request) {
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
    .select('id, rate_type, show_rate, off_rate, rehearsal_rate, per_diem, advance_fee')
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
      routingByDate.set(dateStr, { day_type: (r.day_type as string) ?? 'show' });
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
        dayStatuses[dateStr] = r ? dayTypeToStatus(r.day_type) : 'no_tour';
      }
      const advanceFee = weekIndex === 0 ? advanceFeeTotal : 0;
      const { total_fee, total_per_diem } = computeWeekFeeAndPerDiem(
        dayStatuses,
        person,
        advanceFee
      );
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
