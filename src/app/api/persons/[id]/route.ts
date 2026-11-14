/* GET a person (⌘K / entity chips). Read-only since Nov 2026: `persons` is a
   copy of the People record kept in step by the database (migration 285) —
   edit the person through /api/personnel/[id]. */
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
