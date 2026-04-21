/* ============================================
   LOWPASS — Budget Hotels API

   GET: List hotel_bookings for a tour (?tour_id=uuid) with room_assignments.
        Order by check_in_date.
   POST: Create hotel booking.
   PATCH: Update hotel booking (id + fields in body).
   DELETE: Delete hotel booking (cascades to room_assignments).
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

  const { data, error } = await supabase
    .from('hotel_bookings')
    .select(`
      *,
      hotel_room_assignments(*)
    `)
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tourId)
    .order('check_in_date', { ascending: true, nullsFirst: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hotels = (data ?? []).map((h) => ({
    ...h,
    room_assignments: h.hotel_room_assignments ?? [],
  }));

  // Ensure each hotel has a linked budget_line_item for the detail pop-out
  for (const h of hotels) {
    const row = h as { id: string; line_item_id?: string | null; hotel_name: string; tour_id: string };
    if (row.line_item_id) continue;
    const { data: lineItem, error: liErr } = await supabase
      .from('budget_line_items')
      .insert({
        tour_id: tourId,
        workspace_id: profile.workspace_id,
        category: 'hotels',
        label: String(row.hotel_name ?? '').trim(),
        proposed_cost: 0,
        actual_cost: 0,
        source_entity_type: 'hotel_booking',
        source_entity_id: row.id,
      })
      .select('id')
      .single();
    if (!liErr && lineItem?.id) {
      await supabase.from('hotel_bookings').update({ line_item_id: lineItem.id }).eq('id', row.id);
      row.line_item_id = lineItem.id;
    }
  }

  const lineIds = [
    ...new Set(
      hotels
        .map((x) => (x as { line_item_id?: string | null }).line_item_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const lineMetaById = new Map<string, { proposed_cost: number; actual_cost: number; status: string }>();
  if (lineIds.length > 0) {
    const { data: lineRows } = await supabase
      .from('budget_line_items')
      .select('id, proposed_cost, actual_cost, status')
      .eq('workspace_id', profile.workspace_id)
      .in('id', lineIds);
    for (const row of lineRows ?? []) {
      lineMetaById.set(String((row as { id: string }).id), {
        proposed_cost: Number((row as { proposed_cost?: number | null }).proposed_cost ?? 0),
        actual_cost: Number((row as { actual_cost?: number | null }).actual_cost ?? 0),
        status: String((row as { status?: string | null }).status ?? 'draft'),
      });
    }
  }

  const hotelsOut = hotels.map((h) => {
    const liId = (h as { line_item_id?: string | null }).line_item_id;
    const meta = liId ? lineMetaById.get(liId) : undefined;
    return {
      ...h,
      proposed_cost: meta?.proposed_cost ?? 0,
      actual_cost: meta?.actual_cost ?? 0,
      status: meta?.status ?? 'draft',
    };
  });

  return NextResponse.json({ hotels: hotelsOut });
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
    tour_id: string;
    hotel_name?: string;
    address?: string | null;
    phone?: string | null;
    cancellation_policy?: string | null;
    distance_to_venue?: string | null;
    distance_to_airport?: string | null;
    city?: string | null;
    check_in_date?: string | null;
    check_out_date?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tour_id } = body;
  if (!tour_id) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }
  const nameForRow = typeof body.hotel_name === 'string' ? body.hotel_name.trim() : '';

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tour_id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { data: created, error } = await supabase
    .from('hotel_bookings')
    .insert({
      tour_id,
      workspace_id: profile.workspace_id,
      hotel_name: nameForRow,
      address: body.address ?? null,
      phone: body.phone ?? null,
      cancellation_policy: body.cancellation_policy ?? null,
      distance_to_venue: body.distance_to_venue ?? null,
      distance_to_airport: body.distance_to_airport ?? null,
      city: body.city ?? null,
      check_in_date: body.check_in_date ?? null,
      check_out_date: body.check_out_date ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const booking = created as { id: string; line_item_id?: string | null };

  const { data: lineItem, error: liError } = await supabase
    .from('budget_line_items')
    .insert({
      tour_id,
      workspace_id: profile.workspace_id,
      category: 'hotels',
      label: nameForRow,
      proposed_cost: 0,
      actual_cost: 0,
      source_entity_type: 'hotel_booking',
      source_entity_id: booking.id,
    })
    .select('id')
    .single();

  if (!liError && lineItem) {
    const { data: updated } = await supabase
      .from('hotel_bookings')
      .update({ line_item_id: lineItem.id })
      .eq('id', booking.id)
      .select()
      .single();
    if (updated) {
      return NextResponse.json(updated);
    }
    booking.line_item_id = lineItem.id;
  }

  return NextResponse.json(booking);
}

export async function PATCH(request: Request) {
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
    id: string;
    hotel_name?: string;
    address?: string | null;
    phone?: string | null;
    cancellation_policy?: string | null;
    distance_to_venue?: string | null;
    distance_to_airport?: string | null;
    city?: string | null;
    check_in_date?: string | null;
    check_out_date?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, ...updates } = body;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.hotel_name !== undefined) payload.hotel_name = updates.hotel_name;
  if (updates.address !== undefined) payload.address = updates.address;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.cancellation_policy !== undefined) payload.cancellation_policy = updates.cancellation_policy;
  if (updates.distance_to_venue !== undefined) payload.distance_to_venue = updates.distance_to_venue;
  if (updates.distance_to_airport !== undefined) payload.distance_to_airport = updates.distance_to_airport;
  if (updates.city !== undefined) payload.city = updates.city;
  if (updates.check_in_date !== undefined) payload.check_in_date = updates.check_in_date;
  if (updates.check_out_date !== undefined) payload.check_out_date = updates.check_out_date;

  const { data, error } = await supabase
    .from('hotel_bookings')
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data as { line_item_id?: string | null; hotel_name?: string | null };
  if (updates.hotel_name !== undefined && row.line_item_id) {
    const label = String(row.hotel_name ?? '').trim();
    await supabase
      .from('budget_line_items')
      .update({ label, updated_at: new Date().toISOString() })
      .eq('id', row.line_item_id)
      .eq('workspace_id', profile.workspace_id);
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
    .from('hotel_bookings')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
