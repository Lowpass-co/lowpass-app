import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { refreshDerivedLines } from '@/server/budget/reconcileDerivedLines';

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data, error } = await supabase.from('flights').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Whitelist, as POST /api/flights does — this used to spread the raw body,
  // so a client could rewrite id / workspace_id / tour_id / created_by.
  const WRITABLE = [
    'show_id', 'airline', 'flight_number', 'pnr', 'confirmation',
    'origin_airport', 'destination_airport', 'depart_at', 'arrive_at',
    'cost_amount', 'cost_currency', 'passenger_ids', 'notes',
    'person_name', 'role', 'leg_order',
  ] as const;
  const patch: Record<string, unknown> = { updated_by: user.id };
  for (const k of WRITABLE) if (k in body) patch[k] = body[k];

  const { data, error } = await supabase
    .from('flights')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Money repair — the flight editor never reached the budget. It does now.
  await refreshDerivedLines(supabase, data?.tour_id as string | undefined, data?.workspace_id as string | undefined, 'flights');
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data: gone, error } = await supabase.from('flights').delete().eq('id', id).select('tour_id, workspace_id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = (gone as Array<{ tour_id?: string; workspace_id?: string }> | null)?.[0];
  await refreshDerivedLines(supabase, row?.tour_id, row?.workspace_id, 'flights');
  return new Response(null, { status: 204 });
}
