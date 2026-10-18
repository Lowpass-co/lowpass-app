/* ============================================
   LOWPASS — Budget FX rates (Income Redesign Phase 2)

   Per-tour, UNVERSIONED conversion assumptions (1 <currency> = rate <tour ccy>),
   used to total per-show foreign income into the tour currency in the P&L.

   GET    ?tour_id=        → { rates: [{currency, rate_to_tour_currency, updated_at}] }
   (read-only since Oct 2026 — rates are fetched live, see liveFx.ts)
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
    .select('currency, rate_to_tour_currency, updated_at')
    .eq('tour_id', tourId)
    .eq('workspace_id', w.workspaceId)
    .order('currency', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rates: data ?? [] });
}

/* POST / DELETE removed (Oct 2026): exchange rates are LIVE, never typed. The
   budget page refreshes them hourly and Settings → "Refresh now" refetches on
   demand — both via src/server/budget/liveFx.ts (/api/budget/exchange-rate). */
