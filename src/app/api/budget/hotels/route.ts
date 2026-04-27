/* ============================================
   LOWPASS — Budget Hotels API (canonical hotels/rooms)
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
    .from('hotels')
    .select(`
      *,
      rooms(
        id,
        room_type,
        room_number,
        cost_amount,
        notes,
        room_assignments(
          id,
          starts_on,
          ends_on,
          person_id,
          persons(full_name)
        )
      )
    `)
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tourId)
    .order('check_in_at', { ascending: true, nullsFirst: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hotels = (data ?? []).map((h) => {
    const roomRows = (h.rooms ?? []) as Array<{
      id: string;
      room_type?: string | null;
      room_number?: string | null;
      cost_amount?: number | null;
      notes?: string | null;
      room_assignments?: Array<{
        id: string;
        starts_on: string;
        ends_on: string;
        persons?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
      }>;
    }>;
    const assignments = roomRows.flatMap((room) =>
      (room.room_assignments ?? []).map((ra) => {
        const personName = Array.isArray(ra.persons)
          ? ra.persons[0]?.full_name ?? null
          : ra.persons?.full_name ?? null;
        const checkIn = ra.starts_on ?? null;
        const checkOut = ra.ends_on ?? null;
        const nights =
          checkIn && checkOut
            ? Math.max(
                0,
                Math.round(
                  (new Date(`${checkOut}T12:00:00`).getTime() -
                    new Date(`${checkIn}T12:00:00`).getTime()) /
                    (24 * 60 * 60 * 1000)
                )
              )
            : 0;
        return {
          id: ra.id,
          room_id: room.id,
          person_name: personName,
          check_in: checkIn,
          check_out: checkOut,
          nights,
          room_type: room.room_type ?? null,
          room_number: room.room_number ?? null,
          confirmation: h.confirmation_number ?? null,
          rate_per_night: Number(room.cost_amount ?? 0),
          notes: room.notes ?? null,
        };
      })
    );
    return {
      id: h.id,
      tour_id: h.tour_id,
      line_item_id: null as string | null,
      hotel_name: h.name,
      address: h.address,
      city: h.city,
      check_in_date: h.check_in_at ? String(h.check_in_at).slice(0, 10) : null,
      check_out_date: h.check_out_at ? String(h.check_out_at).slice(0, 10) : null,
      distance_to_venue: null,
      distance_to_airport: null,
      cancellation_policy: h.notes ?? null,
      room_assignments: assignments,
    };
  });

  // Ensure each hotel has a linked budget_line_item for the detail pop-out
  for (const h of hotels) {
    const row = h as { id: string; line_item_id?: string | null; hotel_name: string; tour_id: string };
    if (row.line_item_id) continue;
    const { data: existing } = await supabase
      .from('budget_line_items')
      .select('id')
      .eq('workspace_id', profile.workspace_id)
      .eq('tour_id', tourId)
      .eq('category', 'hotels')
      .eq('hotel_id', row.id)
      .maybeSingle();
    if (existing?.id) {
      row.line_item_id = existing.id;
      continue;
    }
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
        hotel_id: row.id,
      })
      .select('id')
      .single();
    if (!liErr && lineItem?.id) {
      await supabase
        .from('budget_line_items')
        .update({ hotel_id: row.id })
        .eq('id', lineItem.id)
        .eq('workspace_id', profile.workspace_id);
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
    const derivedCost = (h.room_assignments ?? []).reduce(
      (sum: number, a: { nights?: number; rate_per_night?: number }) =>
        sum + Number(a.nights ?? 0) * Number(a.rate_per_night ?? 0),
      0
    );
    return {
      ...h,
      proposed_cost: meta?.proposed_cost ?? derivedCost,
      actual_cost: meta?.actual_cost ?? derivedCost,
      derived_cost: derivedCost,
      status: meta?.status ?? 'draft',
    };
  });

  for (const h of hotelsOut) {
    if (!(h as { line_item_id?: string | null }).line_item_id) continue;
    const id = (h as { line_item_id: string }).line_item_id;
    const target = Number((h as { derived_cost?: number }).derived_cost ?? 0);
    const current = lineMetaById.get(id);
    if (!current) continue;
    if (Number(current.proposed_cost) === target && Number(current.actual_cost) === target) continue;
    await supabase
      .from('budget_line_items')
      .update({
        proposed_cost: target,
        actual_cost: target,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', profile.workspace_id);
    (h as { proposed_cost: number; actual_cost: number }).proposed_cost = target;
    (h as { proposed_cost: number; actual_cost: number }).actual_cost = target;
  }

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
    .from('hotels')
    .insert({
      tour_id,
      workspace_id: profile.workspace_id,
      name: nameForRow,
      address: body.address ?? null,
      phone: body.phone ?? null,
      city: body.city ?? null,
      check_in_at: body.check_in_date ? `${body.check_in_date}T00:00:00Z` : null,
      check_out_at: body.check_out_date ? `${body.check_out_date}T00:00:00Z` : null,
      notes: body.cancellation_policy ?? null,
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
      hotel_id: booking.id,
    })
    .select('id')
    .single();

  if (!liError && lineItem) {
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
  if (updates.hotel_name !== undefined) payload.name = updates.hotel_name;
  if (updates.address !== undefined) payload.address = updates.address;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.cancellation_policy !== undefined) payload.notes = updates.cancellation_policy;
  if (updates.city !== undefined) payload.city = updates.city;
  if (updates.check_in_date !== undefined) payload.check_in_at = updates.check_in_date ? `${updates.check_in_date}T00:00:00Z` : null;
  if (updates.check_out_date !== undefined) payload.check_out_at = updates.check_out_date ? `${updates.check_out_date}T00:00:00Z` : null;

  const { data, error } = await supabase
    .from('hotels')
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (updates.hotel_name !== undefined) {
    const { data: line } = await supabase
      .from('budget_line_items')
      .select('id')
      .eq('workspace_id', profile.workspace_id)
      .eq('hotel_id', id)
      .maybeSingle();
    const label = String((data as { name?: string | null }).name ?? '').trim();
    if (line?.id) {
      await supabase
        .from('budget_line_items')
        .update({ label, updated_at: new Date().toISOString() })
        .eq('id', line.id)
        .eq('workspace_id', profile.workspace_id);
    }
  }

  return NextResponse.json({
    ...(data ?? {}),
    hotel_name: (data as { name?: string | null })?.name ?? null,
    check_in_date: (data as { check_in_at?: string | null })?.check_in_at?.slice(0, 10) ?? null,
    check_out_date: (data as { check_out_at?: string | null })?.check_out_at?.slice(0, 10) ?? null,
    cancellation_policy: (data as { notes?: string | null })?.notes ?? null,
  });
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
    .from('hotels')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase
    .from('budget_line_items')
    .delete()
    .eq('workspace_id', profile.workspace_id)
    .eq('hotel_id', body.id);

  return new Response(null, { status: 204 });
}
