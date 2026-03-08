/* ============================================
   LOWPASS — Budget Hotel Room Assignments API

   GET: List room assignments for a hotel (?hotel_booking_id=uuid).
   POST: Create room assignment.
   PATCH: Update room assignment (id + fields in body).
   DELETE: Delete room assignment.
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
  const hotelBookingId = searchParams.get('hotel_booking_id');
  if (!hotelBookingId) {
    return NextResponse.json({ error: 'hotel_booking_id is required' }, { status: 400 });
  }

  const { data: hotel } = await supabase
    .from('hotel_bookings')
    .select('id')
    .eq('id', hotelBookingId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!hotel) {
    return NextResponse.json({ error: 'Hotel booking not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('hotel_room_assignments')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .eq('hotel_booking_id', hotelBookingId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ assignments: data ?? [] });
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
    hotel_booking_id: string;
    person_name: string;
    check_in?: string | null;
    check_out?: string | null;
    nights?: number;
    room_type?: string | null;
    room_number?: string | null;
    confirmation?: string | null;
    rate_per_night?: number;
    notes?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { hotel_booking_id, person_name } = body;
  if (!hotel_booking_id || !person_name?.trim()) {
    return NextResponse.json(
      { error: 'hotel_booking_id and person_name are required' },
      { status: 400 }
    );
  }

  const { data: hotel } = await supabase
    .from('hotel_bookings')
    .select('id')
    .eq('id', hotel_booking_id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!hotel) {
    return NextResponse.json({ error: 'Hotel booking not found' }, { status: 404 });
  }

  const { data: created, error } = await supabase
    .from('hotel_room_assignments')
    .insert({
      hotel_booking_id,
      workspace_id: profile.workspace_id,
      person_name: person_name.trim(),
      check_in: body.check_in ?? null,
      check_out: body.check_out ?? null,
      nights: Number(body.nights) || 0,
      room_type: body.room_type ?? null,
      room_number: body.room_number ?? null,
      confirmation: body.confirmation ?? null,
      rate_per_night: Number(body.rate_per_night) || 0,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(created);
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
    check_in?: string | null;
    check_out?: string | null;
    nights?: number;
    room_type?: string | null;
    room_number?: string | null;
    confirmation?: string | null;
    rate_per_night?: number;
    notes?: string | null;
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

  const payload: Record<string, unknown> = {};
  if (updates.person_name !== undefined) payload.person_name = updates.person_name;
  if (updates.check_in !== undefined) payload.check_in = updates.check_in;
  if (updates.check_out !== undefined) payload.check_out = updates.check_out;
  if (updates.nights !== undefined) payload.nights = updates.nights;
  if (updates.room_type !== undefined) payload.room_type = updates.room_type;
  if (updates.room_number !== undefined) payload.room_number = updates.room_number;
  if (updates.confirmation !== undefined) payload.confirmation = updates.confirmation;
  if (updates.rate_per_night !== undefined) payload.rate_per_night = updates.rate_per_night;
  if (updates.notes !== undefined) payload.notes = updates.notes;

  const { data, error } = await supabase
    .from('hotel_room_assignments')
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
    .from('hotel_room_assignments')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
