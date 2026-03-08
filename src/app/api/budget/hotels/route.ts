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

  return NextResponse.json({ hotels });
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
    hotel_name: string;
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

  const { tour_id, hotel_name } = body;
  if (!tour_id || !hotel_name?.trim()) {
    return NextResponse.json(
      { error: 'tour_id and hotel_name are required' },
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
    .from('hotel_bookings')
    .insert({
      tour_id,
      workspace_id: profile.workspace_id,
      hotel_name: hotel_name.trim(),
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
