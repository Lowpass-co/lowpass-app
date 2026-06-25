/* ============================================
   LOWPASS — Budget FX rates (Income Redesign Phase 2)

   Per-tour, UNVERSIONED conversion assumptions (1 <currency> = rate <tour ccy>),
   used to total per-show foreign income into the tour currency in the P&L.

   GET    ?tour_id=        → { rates: [{currency, rate_to_tour_currency}] }
   POST   { tour_id, currency, rate } → upsert on (tour_id, currency)
   DELETE { tour_id, currency }       → remove a currency's rate
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function ws(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' as const, status: 401 };
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).maybeSingle();
  if (!profile?.workspace_id) return { error: 'No workspace' as const, status: 403 };
  return { workspaceId: profile.workspace_id as string };
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const w = await ws(supabase);
  if ('error' in w) return NextResponse.json({ error: w.error }, { status: w.status });
  const tourId = new URL(request.url).searchParams.get('tour_id');
  if (!tourId) return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  const { data, error } = await supabase
    .from('budget_fx_rates')
    .select('currency, rate_to_tour_currency')
    .eq('tour_id', tourId)
    .eq('workspace_id', w.workspaceId)
    .order('currency', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rates: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const w = await ws(supabase);
  if ('error' in w) return NextResponse.json({ error: w.error }, { status: w.status });
  let body: { tour_id?: string; currency?: string; rate?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const tourId = body.tour_id;
  const currency = body.currency?.trim().toUpperCase();
  const rate = Number(body.rate);
  if (!tourId || !currency) return NextResponse.json({ error: 'tour_id and currency are required' }, { status: 400 });
  if (!Number.isFinite(rate) || rate <= 0) return NextResponse.json({ error: 'rate must be a positive number' }, { status: 400 });

  // workspace-scope the tour
  const { data: tour } = await supabase.from('tours').select('id').eq('id', tourId).eq('workspace_id', w.workspaceId).maybeSingle();
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('budget_fx_rates')
    .upsert(
      { tour_id: tourId, workspace_id: w.workspaceId, currency, rate_to_tour_currency: rate, updated_at: new Date().toISOString() },
      { onConflict: 'tour_id,currency' },
    )
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const w = await ws(supabase);
  if ('error' in w) return NextResponse.json({ error: w.error }, { status: w.status });
  let body: { tour_id?: string; currency?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const tourId = body.tour_id;
  const currency = body.currency?.trim().toUpperCase();
  if (!tourId || !currency) return NextResponse.json({ error: 'tour_id and currency are required' }, { status: 400 });
  const { error } = await supabase
    .from('budget_fx_rates')
    .delete()
    .eq('tour_id', tourId).eq('workspace_id', w.workspaceId).eq('currency', currency);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
