/* ============================================
   LOWPASS — Single workspace personnel row

   GET, PATCH, DELETE — workspace scoped.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function assertWorkspacePerson(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  personnelId: string
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .single();
  if (!profile?.workspace_id) return { error: 'No workspace' as const, status: 403 };

  const { data: row, error } = await supabase
    .from('personnel')
    .select('*')
    .eq('id', personnelId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (error || !row) return { error: 'Not found' as const, status: 404 };
  return { profile, row };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const res = await assertWorkspacePerson(supabase, user.id, id);
  if ('error' in res && res.error) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }
  return NextResponse.json(res.row);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const check = await assertWorkspacePerson(supabase, user.id, id);
  if ('error' in check && check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }
  const { row } = check;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const str = (k: string) =>
    body[k] !== undefined ? (body[k] == null ? null : String(body[k]).trim() || null) : undefined;

  if (body.name !== undefined) {
    const n = typeof body.name === 'string' ? body.name.trim() : '';
    if (!n) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    updates.name = n;
  }
  if (body.role !== undefined) updates.role = typeof body.role === 'string' ? body.role : '';
  if (body.email !== undefined) updates.email = str('email');
  if (body.phone !== undefined) updates.phone = str('phone');
  if (body.home_airport !== undefined) updates.home_airport = str('home_airport');
  if (body.dietary_needs !== undefined) updates.dietary_needs = str('dietary_needs');
  if (body.merch_size !== undefined) updates.merch_size = str('merch_size');
  if (body.preferences !== undefined) updates.preferences = str('preferences');
  if (body.standard_rates !== undefined && typeof body.standard_rates === 'object' && body.standard_rates) {
    const prev = (row as { standard_rates?: Record<string, unknown> }).standard_rates ?? {};
    updates.standard_rates = { ...prev, ...(body.standard_rates as Record<string, unknown>) };
  }
  if (body.passport_info !== undefined && typeof body.passport_info === 'object' && body.passport_info) {
    const prev = (row as { passport_info?: Record<string, unknown> }).passport_info ?? {};
    updates.passport_info = { ...prev, ...(body.passport_info as Record<string, unknown>) };
  }
  if (body.extended_profile !== undefined && typeof body.extended_profile === 'object' && body.extended_profile) {
    const prev = (row as { extended_profile?: Record<string, unknown> }).extended_profile ?? {};
    updates.extended_profile = { ...prev, ...(body.extended_profile as Record<string, unknown>) };
  }

  const { data, error } = await supabase.from('personnel').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const check = await assertWorkspacePerson(supabase, user.id, id);
  if ('error' in check && check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { error } = await supabase.from('personnel').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
