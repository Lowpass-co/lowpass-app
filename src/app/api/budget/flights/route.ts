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
    .from('flights')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tourId)
    .order('depart_at', { ascending: true, nullsFirst: false })
    .order('person_name')
    .order('leg_order');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const flightsRaw = (data ?? []) as Array<{
    id: string;
    person_name: string;
    role: string | null;
    origin_airport: string;
    destination_airport: string;
    depart_at: string;
    airline: string | null;
    flight_number: string | null;
    leg_order: number;
    cost_amount: number | null;
    confirmation: string | null;
  }>;
  const flightIds = flightsRaw.map((f) => f.id);
  const { data: lineItems } = flightIds.length
    ? await supabase
        .from('budget_line_items')
        .select('id, flight_id')
        .eq('workspace_id', profile.workspace_id)
        .eq('tour_id', tourId)
        .eq('category', 'flights')
        .in('flight_id', flightIds)
    : { data: [] as Array<{ id: string; flight_id: string | null }> };

  const lineItemByFlight = new Map<string, string>();
  (lineItems ?? []).forEach((row) => {
    if (row.flight_id) lineItemByFlight.set(row.flight_id, row.id);
  });

  for (const f of flightsRaw) {
    if (lineItemByFlight.has(f.id)) continue;
    const label = `${f.person_name}: ${f.origin_airport}→${f.destination_airport}`;
    const { data: lineItem } = await supabase
      .from('budget_line_items')
      .insert({
        tour_id: tourId,
        workspace_id: profile.workspace_id,
        category: 'flights',
        label,
        proposed_cost: Number(f.cost_amount) || 0,
        actual_cost: Number(f.cost_amount) || 0,
        source_entity_type: 'flight',
        source_entity_id: f.id,
        flight_id: f.id,
      })
      .select('id')
      .single();
    if (lineItem?.id) lineItemByFlight.set(f.id, lineItem.id);
  }
  const flights = flightsRaw.map((f) => {
    const date = f.depart_at?.slice(0, 10) ?? null;
    const time = f.depart_at?.slice(11, 16) ?? null;
    const cost = Number(f.cost_amount) || 0;
    return {
      id: f.id,
      line_item_id: lineItemByFlight.get(f.id) ?? null,
      person_name: f.person_name,
      role: f.role,
      origin_code: f.origin_airport,
      destination_code: f.destination_airport,
      departure_date: date,
      departure_time: time,
      airline: f.airline,
      flight_number: f.flight_number,
      leg_order: f.leg_order,
      proposed_cost: cost,
      actual_cost: cost,
      confirmation: f.confirmation,
    };
  });
  return NextResponse.json({ flights });
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

  const nowIso = new Date().toISOString();
  const departureDate = body.departure_date ?? nowIso.slice(0, 10);
  const departureTime = body.departure_time ?? '00:00';
  const departAt = new Date(`${departureDate}T${departureTime}:00Z`).toISOString();
  const arriveAt = new Date(new Date(departAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
  const costAmount = Number(body.actual_cost ?? body.proposed_cost) || 0;

  const { data: created, error } = await supabase
    .from('flights')
    .insert({
      tour_id,
      workspace_id: profile.workspace_id,
      person_name: person_name.trim(),
      role: body.role ?? null,
      origin_airport: (body.origin_code ?? 'TBD').toUpperCase(),
      destination_airport: (body.destination_code ?? 'TBD').toUpperCase(),
      cost_amount: costAmount,
      cost_currency: 'GBP',
      airline: body.airline ?? null,
      flight_number: body.flight_number ?? null,
      pnr: body.confirmation ?? null,
      confirmation: body.confirmation ?? null,
      depart_at: departAt,
      arrive_at: arriveAt,
      leg_order: Number(body.leg_order) || 1,
      created_by: user.id,
      updated_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const flight = created as {
    id: string;
    line_item_id?: string | null;
    origin_airport: string;
    destination_airport: string;
    depart_at: string;
    cost_amount: number | null;
  };
  const label = `${body.person_name.trim()}: ${(body.origin_code ?? 'TBD').toUpperCase()}→${(body.destination_code ?? 'TBD').toUpperCase()}`;

  const { data: lineItem, error: liError } = await supabase
    .from('budget_line_items')
    .insert({
      tour_id,
      workspace_id: profile.workspace_id,
      category: 'flights',
      label,
      proposed_cost: costAmount,
      actual_cost: costAmount,
      source_entity_type: 'flight',
      source_entity_id: flight.id,
      flight_id: flight.id,
    })
    .select('id')
    .single();

  const response = {
    ...flight,
    line_item_id: liError ? null : lineItem?.id ?? null,
    origin_code: flight.origin_airport,
    destination_code: flight.destination_airport,
    departure_date: flight.depart_at?.slice(0, 10) ?? null,
    departure_time: flight.depart_at?.slice(11, 16) ?? null,
    proposed_cost: Number(flight.cost_amount) || 0,
    actual_cost: Number(flight.cost_amount) || 0,
  };
  return NextResponse.json(response);
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

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
  if (updates.person_name !== undefined) payload.person_name = updates.person_name;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.origin_code !== undefined) payload.origin_airport = updates.origin_code;
  if (updates.destination_code !== undefined) payload.destination_airport = updates.destination_code;
  if (updates.proposed_cost !== undefined || updates.actual_cost !== undefined) {
    payload.cost_amount = Number(updates.actual_cost ?? updates.proposed_cost) || 0;
  }
  if (updates.airline !== undefined) payload.airline = updates.airline;
  if (updates.flight_number !== undefined) payload.flight_number = updates.flight_number;
  if (updates.confirmation !== undefined) {
    payload.confirmation = updates.confirmation;
    payload.pnr = updates.confirmation;
  }
  if (updates.departure_date !== undefined || updates.departure_time !== undefined) {
    const { data: existing } = await supabase
      .from('flights')
      .select('depart_at')
      .eq('id', id)
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    const existingDate = existing?.depart_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const existingTime = existing?.depart_at?.slice(11, 16) ?? '00:00';
    const nextDate = updates.departure_date ?? existingDate;
    const nextTime = updates.departure_time ?? existingTime;
    const nextDepart = new Date(`${nextDate}T${nextTime}:00Z`).toISOString();
    payload.depart_at = nextDepart;
    payload.arrive_at = new Date(new Date(nextDepart).getTime() + 2 * 60 * 60 * 1000).toISOString();
  }
  if (updates.leg_order !== undefined) payload.leg_order = updates.leg_order;

  const { data, error } = await supabase
    .from('flights')
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await supabase
    .from('budget_line_items')
    .update({
      label: `${data.person_name}: ${data.origin_airport}→${data.destination_airport}`,
      proposed_cost: Number(data.cost_amount) || 0,
      actual_cost: Number(data.cost_amount) || 0,
      source_entity_type: 'flight',
      source_entity_id: data.id,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', profile.workspace_id)
    .eq('flight_id', data.id);
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
    .from('flights')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
