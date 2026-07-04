import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data: person, error } = await supabase.from('persons').select('*').eq('id', id).single();
  if (error || !person) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });

  const { data: tourLinks } = await supabase
    .from('tour_personnel')
    .select('id, workspace_id, tour_id, person_id, role, employment_type, rate_currency, rate_period, starts_on, ends_on, created_at, updated_at, tours(name)')
    .eq('person_id', id)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    ...person,
    tour_personnel: (tourLinks ?? []).map((r) => {
      const tours = (r as { tours?: { name?: string } | Array<{ name?: string }> }).tours;
      return {
        ...r,
        tour_name: Array.isArray(tours) ? tours[0]?.name ?? null : tours?.name ?? null,
      };
    }),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_by: user.id };
  const keys = [
    'full_name',
    'preferred_name',
    'pronouns',
    'email',
    'phone',
    'emergency_contact',
    'passport_full_name',
    'passport_number',
    'passport_expiry',
    'passport_country',
    'date_of_birth',
    'dietary',
    'notes',
  ];
  keys.forEach((k) => {
    if (k in body) patch[k] = body[k] ?? null;
  });

  const { data, error } = await supabase
    .from('persons')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase.from('persons').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
