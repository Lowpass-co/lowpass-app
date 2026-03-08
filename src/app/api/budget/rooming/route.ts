/* ============================================
   LOWPASS — Budget Rooming Grid API

   GET: Rooming grid for a tour (?tour_id=uuid).
        Returns grid_by_person (grouped by person) and routing_dates (columns).
        Order: routing dates ascending, persons by role then name.
   POST: Upsert single entry or bulk entries.
        Single: { tour_id, person_name, role?, routing_id, room_type }
        Bulk: { entries: [{ tour_id, person_name, role?, routing_id, room_type }] }
   DELETE: Remove rooming entry (id in body).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tour_id');
  if (!tourId) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { data: routingRows, error: routingError } = await supabase
    .from('routing')
    .select('id, date, venue_name, city')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });

  if (routingError) {
    return NextResponse.json({ error: routingError.message }, { status: 500 });
  }

  const routingDates = routingRows ?? [];
  const routingIds = routingDates.map((r) => r.id);

  if (routingIds.length === 0) {
    return NextResponse.json({
      grid_by_person: [],
      routing_dates: routingDates,
    });
  }

  const { data: gridRows, error: gridError } = await supabase
    .from('rooming_grid')
    .select('*, routing(date, venue_name, city)')
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tourId)
    .in('routing_id', routingIds);

  if (gridError) {
    return NextResponse.json({ error: gridError.message }, { status: 500 });
  }

  const byPerson = new Map<string, { person_name: string; role: string | null; entries: unknown[] }>();
  for (const row of gridRows ?? []) {
    const name = row.person_name as string;
    if (!byPerson.has(name)) {
      byPerson.set(name, {
        person_name: name,
        role: (row.role as string) ?? null,
        entries: [],
      });
    }
    const r = row.routing as unknown;
    const entry = {
      ...row,
      routing: Array.isArray(r) ? r[0] : r,
    };
    byPerson.get(name)!.entries.push(entry);
  }

  const gridByPerson = Array.from(byPerson.values());
  gridByPerson.sort((a, b) => {
    const roleCmp = (a.role ?? '').localeCompare(b.role ?? '');
    if (roleCmp !== 0) return roleCmp;
    return (a.person_name ?? '').localeCompare(b.person_name ?? '');
  });

  return NextResponse.json({
    grid_by_person: gridByPerson,
    routing_dates: routingDates,
  });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: {
    tour_id?: string;
    person_name?: string;
    role?: string | null;
    routing_id?: string;
    room_type?: string;
    entries?: Array<{
      tour_id: string;
      person_name: string;
      role?: string | null;
      routing_id: string;
      room_type?: string;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const entries = body.entries;
  const isBulk = Array.isArray(entries) && entries.length > 0;

  if (isBulk) {
    for (const e of entries) {
      if (!e.tour_id || !e.person_name?.trim() || !e.routing_id) {
        return NextResponse.json(
          { error: 'Each entry must have tour_id, person_name, and routing_id' },
          { status: 400 }
        );
      }
    }
    const { data: tour } = await supabase
      .from('tours')
      .select('id')
      .eq('id', entries[0].tour_id)
      .eq('workspace_id', profile.workspace_id)
      .single();
    if (!tour) {
      return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
    }
    const payloads = entries.map((e) => ({
      tour_id: e.tour_id,
      workspace_id: profile.workspace_id,
      person_name: e.person_name.trim(),
      role: e.role ?? null,
      routing_id: e.routing_id,
      room_type: (e.room_type ?? '-').trim(),
    }));
    const { data: upserted, error } = await supabase
      .from('rooming_grid')
      .upsert(payloads, { onConflict: 'tour_id,person_name,routing_id' })
      .select();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ entries: upserted ?? [] });
  }

  const { tour_id, person_name, routing_id } = body;
  if (!tour_id || !person_name?.trim() || !routing_id) {
    return NextResponse.json(
      { error: 'tour_id, person_name, and routing_id are required' },
      { status: 400 }
    );
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tour_id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const payload = {
    tour_id,
    workspace_id: profile.workspace_id,
    person_name: person_name.trim(),
    role: body.role ?? null,
    routing_id,
    room_type: (body.room_type ?? '-').trim(),
  };

  const { data, error } = await supabase
    .from('rooming_grid')
    .upsert(payload, { onConflict: 'tour_id,person_name,routing_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: { id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('rooming_grid')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
