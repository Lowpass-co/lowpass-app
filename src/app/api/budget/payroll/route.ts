/* ============================================
   LOWPASS — Budget Payroll API

   GET: Payroll entries for a tour (?tour_id=uuid, ?week_start= optional).
        Joined with personnel_rates. Order week_start, personnel order_index.
   POST: Create/update payroll entry (upsert personnel_id + week_start).
        Persists ONE thing: `day_statuses`, the record of what was painted.

   ─────────────────────────────────────────────────────────────────────
   THIS ROUTE NO LONGER COMPUTES MONEY. 2026-08-19 (M-1b, formula 3).
   ─────────────────────────────────────────────────────────────────────
   It used to write `total_fee` / `total_per_diem` on every paint, and the
   arithmetic was wrong in a way nothing could see:

     const base = computeTotals(lines.filter((l) => l.basis !== 'flat_once'), counts);
     const total_fee = base.totalFee + advanceFee;   // advanceFee = 0, always

   `flat_once` is BOTH a5 Advance and a7 Flat tour, so both were dropped, and
   `body.advance_fee` — which `usePayrollGrid` carries as a type field and
   never actually sends — came back `undefined`, so `Number(undefined) || 0`
   re-added nothing. Painting a day therefore REWROTE a persisted money column
   with the advance removed and Flat tour never in it at all.

   The column is not being repaired, it is being retired (Adam's ruling): the
   canonical persisted total is the derived budget line, written through
   `fees.ts` by `reconcileDerivedBudgetLines`, which exists whether or not
   anyone painted anything. Every reader has moved
   (`@/lib/budget/derivedPayrollTotals`), so the columns now have zero readers
   and migration 265 drops them.

   `advance_fee` is no longer written either — the same paint zeroed the stored
   per-week advance, and the payroll export was reading it. The rate card's a5
   line is the single source for the advance now, same as everywhere else.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { type PayStatus } from '@/lib/payroll/effectiveDayType';
import { isPayrollFinalized, PAYROLL_FINALIZED_ERROR } from '@/lib/payroll/finalize';

type DayStatus = PayStatus;

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
      personnel_rates(person_name, role, person_type, rate_type, per_diem, advance_fee, commission, order_index)
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

  // M1-C — reject day-status writes when the tour's payroll is finalized (locked).
  if (await isPayrollFinalized(supabase, tour_id)) {
    return NextResponse.json({ error: PAYROLL_FINALIZED_ERROR }, { status: 409 });
  }

  const { data: personnel, error: personnelError } = await supabase
    .from('personnel_rates')
    .select('id')
    .eq('id', personnel_id)
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tour_id)
    .single();

  if (personnelError || !personnel) {
    return NextResponse.json({ error: 'Personnel rate not found' }, { status: 404 });
  }

  const dayStatuses = (body.day_statuses ?? {}) as Record<string, DayStatus>;

  // The paint record, and nothing else. `total_fee`, `total_per_diem` and
  // `advance_fee` are deliberately ABSENT from this payload — see the header.
  // Supabase's upsert only writes the columns it is given, so an existing row's
  // stale values are left alone rather than being overwritten with a wrong one.
  const payload = {
    tour_id,
    workspace_id: profile.workspace_id,
    personnel_id,
    person_id: body.person_id ?? null,
    week_start,
    day_statuses: dayStatuses,
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
