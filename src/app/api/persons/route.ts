import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const tourId = searchParams.get('tour_id');
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '50') || 50, 1), 200);

  let query = supabase
    .from('persons')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .order('full_name', { ascending: true })
    .limit(limit);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,preferred_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const persons = data ?? [];

  if (!tourId || persons.length === 0) return NextResponse.json({ persons });

  const ids = persons.map((p) => p.id);
  const { data: links } = await supabase
    .from('tour_personnel')
    .select('person_id')
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tourId)
    .in('person_id', ids);
  const onTour = new Set((links ?? []).map((r) => r.person_id as string));
  persons.sort((a, b) => {
    const ao = onTour.has(a.id) ? 0 : 1;
    const bo = onTour.has(b.id) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return String(a.full_name ?? '').localeCompare(String(b.full_name ?? ''));
  });

  return NextResponse.json({ persons });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const fullName = String(body.full_name ?? '').trim();
  if (!fullName) return NextResponse.json({ error: 'full_name is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('persons')
    .insert({
      workspace_id: profile.workspace_id,
      full_name: fullName,
      preferred_name: body.preferred_name ?? null,
      pronouns: body.pronouns ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      emergency_contact: body.emergency_contact ?? null,
      passport_full_name: body.passport_full_name ?? null,
      passport_number: body.passport_number ?? null,
      passport_expiry: body.passport_expiry ?? null,
      passport_country: body.passport_country ?? null,
      date_of_birth: body.date_of_birth ?? null,
      dietary: body.dietary ?? null,
      notes: body.notes ?? null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
