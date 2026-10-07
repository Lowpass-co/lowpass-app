/* ============================================
   LOWPASS — Budget Payroll API

   GET: Payroll entries for a tour (?tour_id=uuid, ?week_start= optional).
        Joined with personnel_rates. Order week_start, personnel order_index.
   POST: Merge a paint into a person's week (personnel_id + week_start).
        Body carries `changes` — ONLY the cells that changed (null = clear) —
        and the server merges them atomically (migration 269's
        payroll_merge_day_statuses, else a compare-and-swap retry). The old
        body replaced the whole week with the browser's copy, so two quick
        paints in one week lost the first (money audit #1, Oct 2026).

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
import { isPayrollFinalized, PAYROLL_FINALIZED_ERROR } from '@/lib/payroll/finalize';
import { mergeDayStatuses, parseDayStatusChanges, type DayStatusChanges } from '@/lib/payroll/mergeDayStatuses';
import { refreshDerivedLines } from '@/server/budget/reconcileDerivedLines';

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
    /** The cells this paint changed: date → status, or null to clear. */
    changes?: unknown;
    /** LEGACY — a whole-week map from an old client. Merged, never replaced. */
    day_statuses?: unknown;
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

  const changes = parseDayStatusChanges(body.changes ?? body.day_statuses ?? {});
  if (!changes) {
    return NextResponse.json({ error: 'changes must map YYYY-MM-DD dates to a status or null' }, { status: 400 });
  }
  // Every changed date must sit inside this row's week.
  const weekEnd = new Date(`${week_start}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const lastDay = weekEnd.toISOString().slice(0, 10);
  if (Object.keys(changes).some((d) => d < week_start || d > lastDay)) {
    return NextResponse.json({ error: 'a changed date falls outside week_start’s week' }, { status: 400 });
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

  const saved = await mergePaint(supabase, {
    tourId: tour_id,
    workspaceId: profile.workspace_id,
    personnelId: personnel_id,
    personId: body.person_id ?? null,
    weekStart: week_start,
    changes,
    notes: body.notes,
  });
  if ('error' in saved) {
    return NextResponse.json({ error: saved.error }, { status: saved.status });
  }

  // Money repair — the paint is a salary / per-diem change. Refresh the
  // budget's payroll lines now, not whenever someone next opens Budget.
  await refreshDerivedLines(supabase, tour_id, profile.workspace_id, 'payroll');
  return NextResponse.json(saved.row);
}

/**
 * Merge a paint into the stored week ATOMICALLY.
 *
 * Preferred path: the `payroll_merge_day_statuses` function (migration 269) —
 * one INSERT … ON CONFLICT DO UPDATE that merges under the row lock.
 *
 * Fallback (269 not pasted yet): read → merge → write-if-unchanged, retried.
 * The write only lands if `updated_at` is still what we read, so a paint that
 * raced in between is merged on the next attempt instead of overwritten.
 *
 * Notes are only written when the caller sends them — a paint used to null the
 * week's notes every time.
 */
async function mergePaint(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  a: {
    tourId: string;
    workspaceId: string;
    personnelId: string;
    personId: string | null;
    weekStart: string;
    changes: DayStatusChanges;
    notes: string | null | undefined;
  },
): Promise<{ row: unknown } | { error: string; status: number }> {
  const rpc = await supabase.rpc('payroll_merge_day_statuses', {
    p_tour_id: a.tourId,
    p_personnel_id: a.personnelId,
    p_week_start: a.weekStart,
    p_changes: a.changes,
    p_person_id: a.personId,
    p_set_notes: a.notes !== undefined,
    p_notes: a.notes ?? null,
  });
  if (!rpc.error) return { row: rpc.data };
  const missingFn = rpc.error.code === 'PGRST202' || rpc.error.code === '42883';
  if (!missingFn) return { error: rpc.error.message, status: 500 };

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: cur, error: readErr } = await supabase
      .from('payroll_entries')
      .select('id, day_statuses, updated_at')
      .eq('personnel_id', a.personnelId)
      .eq('week_start', a.weekStart)
      .maybeSingle();
    if (readErr) return { error: readErr.message, status: 500 };

    if (!cur) {
      const { data, error } = await supabase
        .from('payroll_entries')
        .insert({
          tour_id: a.tourId,
          workspace_id: a.workspaceId,
          personnel_id: a.personnelId,
          person_id: a.personId,
          week_start: a.weekStart,
          day_statuses: mergeDayStatuses({}, a.changes),
          ...(a.notes !== undefined ? { notes: a.notes } : {}),
        })
        .select()
        .single();
      if (error?.code === '23505') continue; // another paint created the week first
      if (error) return { error: error.message, status: 500 };
      return { row: data };
    }

    const row = cur as { id: string; day_statuses: Record<string, string> | null; updated_at: string };
    const { data, error } = await supabase
      .from('payroll_entries')
      .update({
        day_statuses: mergeDayStatuses(row.day_statuses, a.changes),
        updated_at: new Date().toISOString(),
        ...(a.personId ? { person_id: a.personId } : {}),
        ...(a.notes !== undefined ? { notes: a.notes } : {}),
      })
      .eq('id', row.id)
      .eq('updated_at', row.updated_at)
      .select()
      .maybeSingle();
    if (error) return { error: error.message, status: 500 };
    if (data) return { row: data };
    // Someone else wrote this week between our read and our write — go again.
  }
  return { error: 'The week kept changing while saving — please retry', status: 409 };
}
