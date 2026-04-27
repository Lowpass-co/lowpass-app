/* ============================================
   LOWPASS — Contact picker

   GET /api/contacts/pick?tour_id=<uuid>&q=<string>&limit=<int>

   Returns:
     {
       tour_personnel: [{ source, id, name, role, email, phone, ... }],
       contacts:       [{ source, id, name, role, email, phone, ... }]
     }

   Used by the rider-pack Contact field picker (design §7).
   tour_personnel is included only when tour_id is present.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const MAX_LIMIT = 50;

type PickerEntry = {
  source: 'tour_personnel' | 'contact';
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
};

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tour_id');
  const q = (searchParams.get('q') ?? '').trim();
  let limit = Number(searchParams.get('limit') ?? 20);
  if (!Number.isFinite(limit) || limit <= 0) limit = 20;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  // Workspace check
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  // --- tour_personnel (only when tour_id given) ---
  let tourPersonnel: PickerEntry[] = [];

  if (tourId) {
    // Verify the tour belongs to this workspace.
    const { data: tour } = await supabase
      .from('tours')
      .select('id')
      .eq('id', tourId)
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();

    if (tour) {
      // personnel_tour_assignments joined to personnel.
      // Column names confirmed in Step 0 — if personnel has different
      // column names, stop and report instead of guessing.
      const { data: rows } = await supabase
        .from('personnel_tour_assignments')
        .select(`
          id,
          role_on_tour,
          personnel:personnel_id (
            id, name, email, phone
          )
        `)
        .eq('tour_id', tourId)
        .limit(limit);

      tourPersonnel = (rows ?? [])
        .map((r: Record<string, unknown>) => {
          const p = (r.personnel ?? {}) as {
            name?: string;
            email?: string;
            phone?: string;
          };
          return {
            source: 'tour_personnel' as const,
            id: r.id as string,
            name: p.name ?? '',
            role: (r.role_on_tour as string | null) ?? null,
            email: p.email ?? null,
            phone: p.phone ?? null,
            company: null,
            notes: null,
          };
        })
        .filter((p) => !q || matchesQuery(p, q));
    }
  }

  // --- contacts ---
  let contactsQuery = supabase
    .from('contacts')
    .select('id, first_name, last_name, role, email, phone, venue_name, notes')
    .eq('workspace_id', profile.workspace_id)
    .order('last_name', { ascending: true })
    .limit(limit);

  if (q) {
    // Supabase PostgREST OR filter: any of these columns ilike %q%
    // Keep `%` escaping simple — q arrives trimmed; we don't allow wildcards.
    const pattern = `%${q.replace(/[%_]/g, '\\$&')}%`;
    contactsQuery = contactsQuery.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},role.ilike.${pattern},venue_name.ilike.${pattern}`,
    );
  }

  const { data: contactRows, error: contactsErr } = await contactsQuery;
  if (contactsErr) {
    return NextResponse.json({ error: contactsErr.message }, { status: 500 });
  }

  const contacts: PickerEntry[] = (contactRows ?? []).map((c) => ({
    source: 'contact' as const,
    id: c.id,
    name: [c.first_name ?? '', c.last_name ?? ''].filter(Boolean).join(' ').trim(),
    role: c.role ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    company: c.venue_name ?? null,
    notes: c.notes ?? null,
  }));

  return NextResponse.json({ tour_personnel: tourPersonnel, contacts });
}

function matchesQuery(
  p: { name?: string; role?: string | null; email?: string | null },
  q: string,
): boolean {
  const needle = q.toLowerCase();
  return (
    (p.name ?? '').toLowerCase().includes(needle) ||
    (p.role ?? '').toLowerCase().includes(needle) ||
    (p.email ?? '').toLowerCase().includes(needle)
  );
}
