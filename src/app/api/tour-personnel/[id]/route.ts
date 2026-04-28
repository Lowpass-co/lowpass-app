import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type Params = { params: Promise<{ id: string }> };

const EMPLOYMENT = new Set(['staff', 'freelance', 'crew', 'band', 'mgmt']);
const RATE_PERIODS = new Set(['day', 'week', 'flat', 'hour']);

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ('role' in body) {
    if (typeof body.role !== 'string' || body.role.trim() === '') {
      return NextResponse.json({ error: 'role must be a non-empty string' }, { status: 400 });
    }
    patch.role = body.role;
  }
  if ('employment_type' in body) {
    const v = body.employment_type;
    if (v !== null && (typeof v !== 'string' || !EMPLOYMENT.has(v))) {
      return NextResponse.json({ error: 'Invalid employment_type' }, { status: 400 });
    }
    patch.employment_type = v;
  }
  if ('rate_amount' in body) {
    const v = body.rate_amount;
    if (v !== null && typeof v !== 'number' && typeof v !== 'string') {
      return NextResponse.json({ error: 'Invalid rate_amount' }, { status: 400 });
    }
    patch.rate_amount = v === null || v === '' ? null : Number(v);
  }
  if ('rate_currency' in body) {
    const v = body.rate_currency;
    if (v !== null && (typeof v !== 'string' || v.length > 3)) {
      return NextResponse.json({ error: 'Invalid rate_currency' }, { status: 400 });
    }
    patch.rate_currency = v;
  }
  if ('rate_period' in body) {
    const v = body.rate_period;
    if (v !== null && (typeof v !== 'string' || !RATE_PERIODS.has(v))) {
      return NextResponse.json({ error: 'Invalid rate_period' }, { status: 400 });
    }
    patch.rate_period = v;
  }
  if ('starts_on' in body) {
    patch.starts_on = typeof body.starts_on === 'string' && body.starts_on ? body.starts_on : null;
  }
  if ('ends_on' in body) {
    patch.ends_on = typeof body.ends_on === 'string' && body.ends_on ? body.ends_on : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to patch' }, { status: 400 });
  }

  const { data: existing, error: loadErr } = await supabase
    .from('tour_personnel')
    .select('id, workspace_id')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('tour_personnel')
    .update(patch)
    .eq('id', id)
    .select(
      'id, workspace_id, tour_id, person_id, role, employment_type, rate_amount, rate_currency, rate_period, starts_on, ends_on, created_at, updated_at, tours(name)',
    )
    .single();

  if (error) {
    if (error.code === 'PGRST301' || error.message.toLowerCase().includes('permission')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Conflict — duplicate role for this person on tour' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tours = (data as { tours?: { name?: string } | Array<{ name?: string }> | null }).tours;
  const tourName = Array.isArray(tours) ? tours[0]?.name ?? null : tours?.name ?? null;

  return NextResponse.json({
    id: data.id,
    workspace_id: data.workspace_id,
    tour_id: data.tour_id,
    person_id: data.person_id,
    role: data.role,
    employment_type: data.employment_type,
    rate_amount: data.rate_amount,
    rate_currency: data.rate_currency,
    rate_period: data.rate_period,
    starts_on: data.starts_on,
    ends_on: data.ends_on,
    created_at: data.created_at,
    updated_at: data.updated_at,
    tour_name: tourName,
  });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: isAdmin, error: rpcErr } = await supabase.rpc('is_workspace_admin');
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { id } = await params;

  const { data: existing, error: loadErr } = await supabase
    .from('tour_personnel')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase.from('tour_personnel').delete().eq('id', id);
  if (error) {
    if (error.message.toLowerCase().includes('permission') || error.code === 'PGRST301') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return new Response(null, { status: 204 });
}
