import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const tourId = searchParams.get('tour_id');
  const ownership = searchParams.get('ownership');
  const category = searchParams.get('category');
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 100) || 100, 1), 300);

  let query = supabase
    .from('gear')
    .select(`
      *,
      tour_gear(*)
    `)
    .eq('workspace_id', profile.workspace_id)
    .order('name', { ascending: true })
    .limit(limit);

  if (q) query = query.or(`name.ilike.%${q}%,manufacturer.ilike.%${q}%,model.ilike.%${q}%,category.ilike.%${q}%`);
  if (ownership) query = query.eq('ownership', ownership);
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];
  if (tourId) {
    rows = rows.filter((row) =>
      ((row as { tour_gear?: Array<{ tour_id?: string }> }).tour_gear ?? []).some((tg) => tg.tour_id === tourId)
    );
  }
  return NextResponse.json({ gear: rows });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('gear')
    .insert({
      workspace_id: profile.workspace_id,
      name,
      category: body.category ?? null,
      manufacturer: body.manufacturer ?? null,
      model: body.model ?? null,
      serial_number: body.serial_number ?? null,
      ownership: body.ownership ?? 'owned',
      owner_label: body.owner_label ?? null,
      hire_cost_amount: body.hire_cost_amount ?? null,
      hire_cost_currency: body.hire_cost_currency ?? 'GBP',
      hire_cost_period: body.hire_cost_period ?? null,
      notes: body.notes ?? null,
      image_url: body.image_url ?? null,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
