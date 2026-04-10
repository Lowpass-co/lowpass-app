/* ============================================
   LOWPASS — Workspace Personnel (roster)

   GET: List personnel in current user's workspace.
   POST: Create person (LP-##### id auto).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const DEFAULT_STANDARD_RATES = {
  show_day_rate: 0,
  off_day_rate: 0,
  travel_day_rate: 0,
  per_diem_rate: 0,
  currency: 'GBP',
};

async function nextLpId(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  workspaceId: string
): Promise<string> {
  const { data } = await supabase.from('personnel').select('lp_id').eq('workspace_id', workspaceId);
  let max = 0;
  for (const row of data ?? []) {
    const m = /^LP-(\d+)$/i.exec((row as { lp_id: string }).lp_id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `LP-${String(max + 1).padStart(5, '0')}`;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('personnel')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .order('lp_id', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ personnel: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const lp_id = await nextLpId(supabase, profile.workspace_id);

  const standard_rates = {
    ...DEFAULT_STANDARD_RATES,
    ...(typeof body.standard_rates === 'object' && body.standard_rates !== null
      ? (body.standard_rates as Record<string, unknown>)
      : {}),
  };

  const passport_info =
    typeof body.passport_info === 'object' && body.passport_info !== null
      ? body.passport_info
      : {};
  const extended_profile =
    typeof body.extended_profile === 'object' && body.extended_profile !== null
      ? body.extended_profile
      : {};

  const insert = {
    workspace_id: profile.workspace_id,
    lp_id,
    name,
    role: typeof body.role === 'string' ? body.role : '',
    email: body.email != null ? String(body.email).trim() || null : null,
    phone: body.phone != null ? String(body.phone).trim() || null : null,
    home_airport: body.home_airport != null ? String(body.home_airport).trim() || null : null,
    dietary_needs: body.dietary_needs != null ? String(body.dietary_needs).trim() || null : null,
    merch_size: body.merch_size != null ? String(body.merch_size).trim() || null : null,
    preferences: body.preferences != null ? String(body.preferences).trim() || null : null,
    standard_rates,
    passport_info,
    extended_profile,
  };

  let { data, error } = await supabase.from('personnel').insert(insert).select().single();

  if (
    error &&
    (error.message?.includes('extended_profile') || error.message?.includes('schema cache'))
  ) {
    const { extended_profile: _e, ...withoutExt } = insert as typeof insert & { extended_profile?: unknown };
    const retry = await supabase.from('personnel').insert(withoutExt).select().single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Duplicate LP id — retry' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
