/* ============================================
   LOWPASS — Advance dropdown options (workspace)

   GET: ?kind= — list options for kind (catering_buyout, rider_status, meal_type, …)
   POST: { kind, label } — add option
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function getWorkspaceId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  return profile?.workspace_id ?? null;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) return NextResponse.json({ options: [] });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind')?.trim();
  if (!kind) return NextResponse.json({ error: 'kind required' }, { status: 400 });

  const { data: rows, error } = await supabase
    .from('advance_dropdown_options')
    .select('id, label, sort_order')
    .eq('workspace_id', workspaceId)
    .eq('kind', kind)
    .order('sort_order', { ascending: true })
    .order('label');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const options = (rows ?? []).map((r) => ({ id: r.id, label: r.label }));
  return NextResponse.json({ options });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { kind?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const kind = typeof body.kind === 'string' ? body.kind.trim() : '';
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!kind || !label) return NextResponse.json({ error: 'kind and label required' }, { status: 400 });

  const { data: existing } = await supabase
    .from('advance_dropdown_options')
    .select('sort_order')
    .eq('workspace_id', workspaceId)
    .eq('kind', kind)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (existing?.sort_order ?? -1) + 1;

  const { data: row, error } = await supabase
    .from('advance_dropdown_options')
    .insert({ workspace_id: workspaceId, kind, label, sort_order })
    .select('id, label, sort_order')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: row.id, label: row.label });
}
