/* ============================================
   LOWPASS — Budget Flights API

   GET: List flight_bookings for a tour (?tour_id=uuid).
        Order by departure_date, person_name, leg_order.
   POST: Create flight booking.
   PATCH: Update flight booking (id + fields in body).
   DELETE: Delete flight booking (id in body).
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
    .from('flight_bookings')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tourId)
    .order('departure_date', { ascending: true, nullsFirst: false })
    .order('person_name')
    .order('leg_order');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ flights: data ?? [] });
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
    person_name: string;
    role?: string | null;
    origin_code?: string | null;
    destination_code?: string | null;
    proposed_cost?: number;
    actual_cost?: number;
    airline?: string | null;
    flight_number?: string | null;
    confirmation?: string | null;
    departure_date?: string | null;
    departure_time?: string | null;
    leg_order?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tour_id, person_name } = body;
  if (!tour_id || !person_name?.trim()) {
    return NextResponse.json(
      { error: 'tour_id and person_name are required' },
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

  const { data: created, error } = await supabase
    .from('flight_bookings')
    .insert({
      tour_id,
      workspace_id: profile.workspace_id,
      person_name: person_name.trim(),
      role: body.role ?? null,
      origin_code: body.origin_code ?? null,
      destination_code: body.destination_code ?? null,
      proposed_cost: Number(body.proposed_cost) || 0,
      actual_cost: Number(body.actual_cost) || 0,
      airline: body.airline ?? null,
      flight_number: body.flight_number ?? null,
      confirmation: body.confirmation ?? null,
      departure_date: body.departure_date ?? null,
      departure_time: body.departure_time ?? null,
      leg_order: Number(body.leg_order) || 1,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const flight = created as { id: string; line_item_id?: string | null };
  const label = `${body.person_name.trim()}: ${body.origin_code ?? ''}→${body.destination_code ?? ''}`;

  const { data: lineItem, error: liError } = await supabase
    .from('budget_line_items')
    .insert({
      tour_id,
      workspace_id: profile.workspace_id,
      category: 'flights',
      label,
      proposed_cost: Number(body.proposed_cost) || 0,
      actual_cost: Number(body.actual_cost) || 0,
      source_entity_type: 'flight_booking',
      source_entity_id: flight.id,
    })
    .select('id')
    .single();

  if (!liError && lineItem) {
    const { data: updated } = await supabase
      .from('flight_bookings')
      .update({ line_item_id: lineItem.id })
      .eq('id', flight.id)
      .select()
      .single();
    if (updated) {
      return NextResponse.json(updated);
    }
    flight.line_item_id = lineItem.id;
  }

  return NextResponse.json(flight);
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
    person_name?: string;
    role?: string | null;
    origin_code?: string | null;
    destination_code?: string | null;
    proposed_cost?: number;
    actual_cost?: number;
    airline?: string | null;
    flight_number?: string | null;
    confirmation?: string | null;
    departure_date?: string | null;
    departure_time?: string | null;
    leg_order?: number;
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
  if (updates.person_name !== undefined) payload.person_name = updates.person_name;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.origin_code !== undefined) payload.origin_code = updates.origin_code;
  if (updates.destination_code !== undefined) payload.destination_code = updates.destination_code;
  if (updates.proposed_cost !== undefined) payload.proposed_cost = updates.proposed_cost;
  if (updates.actual_cost !== undefined) payload.actual_cost = updates.actual_cost;
  if (updates.airline !== undefined) payload.airline = updates.airline;
  if (updates.flight_number !== undefined) payload.flight_number = updates.flight_number;
  if (updates.confirmation !== undefined) payload.confirmation = updates.confirmation;
  if (updates.departure_date !== undefined) payload.departure_date = updates.departure_date;
  if (updates.departure_time !== undefined) payload.departure_time = updates.departure_time;
  if (updates.leg_order !== undefined) payload.leg_order = updates.leg_order;

  const { data, error } = await supabase
    .from('flight_bookings')
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
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
    .from('flight_bookings')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
