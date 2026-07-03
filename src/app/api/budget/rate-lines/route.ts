/* ============================================
   LOWPASS — personnel_rate_lines amount write (b2 UI phase)

   PATCH { personnel_rate_id, rate_type_id, amount } → upsert the one amount for
   a person-on-tour × rate type. The dynamic Rates grid writes here (one cell =
   one line). Workspace-scoped; the tour is derived from the personnel_rates row
   so the client can't spoof it.

   MONEY: writing a line amount is what the grid edits now. The legacy
   personnel_rates.* columns stay frozen — a later cleanup migration drops them.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  const wid = profile.workspace_id as string;

  let body: { personnel_rate_id?: string; rate_type_id?: string; amount?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { personnel_rate_id, rate_type_id } = body;
  if (!personnel_rate_id || !rate_type_id) {
    return NextResponse.json({ error: 'personnel_rate_id and rate_type_id are required' }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 });
  }

  // Derive tour_id from the person's rate card (and confirm it's ours).
  const { data: pr } = await supabase
    .from('personnel_rates')
    .select('id, tour_id, workspace_id')
    .eq('id', personnel_rate_id)
    .eq('workspace_id', wid)
    .maybeSingle<{ id: string; tour_id: string; workspace_id: string }>();
  if (!pr) return NextResponse.json({ error: 'Rate card not found' }, { status: 404 });

  // Confirm the type is visible to this workspace (global default or ours).
  const { data: rt } = await supabase
    .from('rate_types')
    .select('id')
    .eq('id', rate_type_id)
    .or(`workspace_id.is.null,workspace_id.eq.${wid}`)
    .maybeSingle<{ id: string }>();
  if (!rt) return NextResponse.json({ error: 'Rate type not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('personnel_rate_lines')
    .upsert(
      {
        tour_id: pr.tour_id,
        workspace_id: wid,
        personnel_rate_id,
        rate_type_id,
        amount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'personnel_rate_id,rate_type_id' },
    )
    .select('id, personnel_rate_id, rate_type_id, amount')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Save failed' }, { status: 500 });
  return NextResponse.json(data);
}
