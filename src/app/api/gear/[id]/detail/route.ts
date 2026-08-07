/* ============================================
   LOWPASS — GET /api/gear/[id]/detail (gear slide-over, 2026-08-06)

   Everything the gear detail slide-over shows: the gear row, its tour
   deployments (tour_gear joined to tours for names + dates), its recent
   physical movements (rental_movements — gear-first since migration 255,
   tolerated absent/legacy), and server-computed hire totals.

   Auth mirrors /api/gear GET exactly (user → profile.workspace_id).

   TOTALS SEMANTICS. period (week/day/flat/…) is free text on the gear +
   tour_gear rows, so we do NOT multiply by nights — that would invent a
   number. We sum the RESOLVED per-deployment amount (tour override, else
   the gear default) grouped by (currency, period), and report each bucket
   verbatim: "1,200.00 GBP / week × 3". Honest, not clever.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

interface TourGearRow {
  id: string;
  tour_id: string;
  tour_ownership: string | null;
  tour_hire_cost_amount: number | null;
  tour_hire_cost_currency: string | null;
  tour_hire_cost_period: string | null;
  starts_on: string | null;
  ends_on: string | null;
  quantity: number | null;
  notes: string | null;
  tours: { id: string; name: string | null; start_date: string | null; end_date: string | null; currency: string | null } | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { data: gear, error: gearErr } = await supabase
    .from('gear')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();
  if (gearErr) return NextResponse.json({ error: gearErr.message }, { status: 500 });
  if (!gear) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: dg } = await supabase
    .from('tour_gear')
    .select('*, tours(id, name, start_date, end_date, currency)')
    .eq('gear_id', id)
    .eq('workspace_id', profile.workspace_id);
  const deployments = (dg ?? []) as unknown as TourGearRow[];
  deployments.sort((a, b) => (b.starts_on ?? '').localeCompare(a.starts_on ?? ''));

  /* Movements — gear-first since 255. A pre-255 project (or one where the
     column is missing) 42703s; we swallow it and return [] rather than
     failing the whole panel. */
  let movements: Array<Record<string, unknown>> = [];
  try {
    const { data: mv, error: mvErr } = await supabase
      .from('rental_movements')
      .select('id, movement_type, notes, created_at, rental_job_id, rental_jobs(name)')
      .eq('gear_id', id)
      .eq('workspace_id', profile.workspace_id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!mvErr && mv) movements = mv as Array<Record<string, unknown>>;
  } catch {
    movements = [];
  }

  /* Totals — resolved amount per (currency, period), plus span. */
  const buckets = new Map<string, { currency: string; period: string; amount: number; count: number }>();
  let firstOut: string | null = null;
  let lastOut: string | null = null;
  for (const d of deployments) {
    const amount = d.tour_hire_cost_amount ?? (gear.hire_cost_amount as number | null) ?? null;
    const currency = d.tour_hire_cost_currency ?? (gear.hire_cost_currency as string | null) ?? 'GBP';
    const period = d.tour_hire_cost_period ?? (gear.hire_cost_period as string | null) ?? '';
    if (amount != null) {
      const key = `${currency}|${period}`;
      const b = buckets.get(key) ?? { currency, period, amount: 0, count: 0 };
      b.amount += amount * (d.quantity ?? 1);
      b.count += 1;
      buckets.set(key, b);
    }
    if (d.starts_on) {
      if (!firstOut || d.starts_on < firstOut) firstOut = d.starts_on;
      if (!lastOut || d.starts_on > lastOut) lastOut = d.starts_on;
    }
  }

  return NextResponse.json({
    gear,
    deployments,
    movements,
    totals: {
      deploymentCount: deployments.length,
      hireByBucket: Array.from(buckets.values()),
      firstOut,
      lastOut,
    },
  });
}
