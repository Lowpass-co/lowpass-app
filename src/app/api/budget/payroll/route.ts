/* ============================================
   LOWPASS — Budget Payroll API

   GET: Payroll entries for a tour (?tour_id=uuid, ?week_start= optional).
        Joined with personnel_rates. Order week_start, personnel order_index.
   POST: Create/update payroll entry (upsert personnel_id + week_start).
        Auto-computes total_fee and total_per_diem per math spec §6.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type DayStatus = 'show' | 'off_travel' | 'rehearsal' | 'no_tour';

function countDayStatuses(
  dayStatuses: Record<string, DayStatus> | null | undefined
): { show: number; offTravel: number; rehearsal: number; active: number } {
  const statuses = dayStatuses ?? {};
  let show = 0;
  let offTravel = 0;
  let rehearsal = 0;
  for (const v of Object.values(statuses)) {
    if (v === 'show') show++;
    else if (v === 'off_travel') offTravel++;
    else if (v === 'rehearsal') rehearsal++;
  }
  const active = show + offTravel + rehearsal;
  return { show, offTravel, rehearsal, active };
}

/**
 * Math spec §6:
 * split_rate: week_fee = (week_show_days × show_rate) + (week_off_days × off_rate) + (week_rehearsal_days × rehearsal_rate) + week_advance_fee
 * day_rate: week_fee = active_days × off_rate + week_advance_fee
 * week_per_diem = (week_show_days + week_off_days + week_rehearsal_days) × per_diem_rate
 */
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
  const weekStart = searchParams.get('week_start');
  if (!tourId) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  let query = supabase
    .from('payroll_entries')
    .select(`
      *,
      personnel_rates(person_name, role, person_type, rate_type, show_rate, off_rate, rehearsal_rate, per_diem, advance_fee, commission, order_index)
    `)
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tourId)
    .order('week_start')
    .order('personnel(order_index)');

  if (weekStart) {
    query = query.eq('week_start', weekStart);
  }

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = (rows ?? []).map((row) => {
    const p = row.personnel_rates ?? row.personnel;
    return {
      ...row,
      personnel: Array.isArray(p) ? p[0] : p,
    };
  });
  entries.sort((a, b) => {
    const ws = (a.week_start ?? '').localeCompare(b.week_start ?? '');
    if (ws !== 0) return ws;
    const oa = (a.personnel as { order_index?: number } | undefined)?.order_index ?? 0;
    const ob = (b.personnel as { order_index?: number } | undefined)?.order_index ?? 0;
    return oa - ob;
  });

  return NextResponse.json({ entries });
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

  let body: {
    tour_id: string;
    personnel_id: string;
    person_id?: string | null;
    week_start: string;
    day_statuses?: Record<string, DayStatus>;
    advance_fee?: number;
    notes?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tour_id, personnel_id, week_start } = body;
  if (!tour_id || !personnel_id || !week_start) {
    return NextResponse.json(
      { error: 'tour_id, personnel_id, and week_start are required' },
      { status: 400 }
    );
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

  const { data: personnel, error: personnelError } = await supabase
    .from('personnel_rates')
    .select('id, rate_type, show_rate, off_rate, rehearsal_rate, per_diem, advance_fee')
    .eq('id', personnel_id)
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tour_id)
    .single();

  if (personnelError || !personnel) {
    return NextResponse.json({ error: 'Personnel rate not found' }, { status: 404 });
  }

  const dayStatuses = (body.day_statuses ?? {}) as Record<string, DayStatus>;
  const advanceFee = Number(body.advance_fee) || 0;
  const { total_fee, total_per_diem } = computeWeekFeeAndPerDiem(
    dayStatuses,
    personnel,
    advanceFee
  );

  const payload = {
    tour_id,
    workspace_id: profile.workspace_id,
    personnel_id,
    person_id: body.person_id ?? null,
    week_start,
    day_statuses: dayStatuses,
    advance_fee: advanceFee,
    total_fee,
    total_per_diem,
    notes: body.notes ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('payroll_entries')
    .upsert(payload, { onConflict: 'personnel_id,week_start' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
