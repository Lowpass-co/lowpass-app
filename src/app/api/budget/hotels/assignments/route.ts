/* ============================================
   LOWPASS — Budget Hotel Room Assignments API (canonical)
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
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
  const hotelId = searchParams.get('hotel_booking_id');
  if (!hotelId) {
    return NextResponse.json({ error: 'hotel_booking_id is required' }, { status: 400 });
  }

  const { data: hotel } = await supabase
    .from('hotels')
    .select('id')
    .eq('id', hotelId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!hotel) {
    return NextResponse.json({ error: 'Hotel booking not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('rooms')
    .select(`
      id,
      room_number,
      room_type,
      cost_amount,
      notes,
      room_assignments(
        id,
        starts_on,
        ends_on,
        persons(full_name)
      )
    `)
    .eq('workspace_id', profile.workspace_id)
    .eq('hotel_id', hotelId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const assignments = (data ?? []).flatMap((room) =>
    ((room as { room_assignments?: Array<{ id: string; starts_on: string; ends_on: string; persons?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null }> }).room_assignments ?? []).map((ra) => {
      const person = Array.isArray(ra.persons) ? ra.persons[0] : ra.persons;
      return {
        id: ra.id,
        person_name: person?.full_name ?? null,
        check_in: ra.starts_on,
        check_out: ra.ends_on,
        nights: 0,
        room_type: (room as { room_type?: string | null }).room_type ?? null,
        room_number: (room as { room_number?: string | null }).room_number ?? null,
        confirmation: null,
        rate_per_night: Number((room as { cost_amount?: number | null }).cost_amount ?? 0),
        notes: (room as { notes?: string | null }).notes ?? null,
      };
    })
  );
  return NextResponse.json({ assignments });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
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
    .from('hotels')
    .select('id')
    .eq('id', hotel_booking_id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!hotel) {
    return NextResponse.json({ error: 'Hotel booking not found' }, { status: 404 });
  }

  const { data: person } = await supabase
    .from('persons')
    .select('id')
    .eq('workspace_id', profile.workspace_id)
    .ilike('full_name', person_name.trim())
    .maybeSingle();
  if (!person?.id) {
    return NextResponse.json({ error: 'person_name must match an existing person' }, { status: 400 });
  }

  let roomId = '';
  const { data: matchedRoom } = await supabase
    .from('rooms')
    .select('id')
    .eq('workspace_id', profile.workspace_id)
    .eq('hotel_id', hotel_booking_id)
    .eq('room_number', body.room_number ?? null)
    .eq('room_type', body.room_type ?? null)
    .maybeSingle();
  if (matchedRoom?.id) {
    roomId = matchedRoom.id;
  } else {
    const { data: createdRoom, error: roomErr } = await supabase
      .from('rooms')
      .insert({
        workspace_id: profile.workspace_id,
        hotel_id: hotel_booking_id,
        room_number: body.room_number ?? null,
        room_type: body.room_type ?? null,
        cost_amount: Number(body.rate_per_night) || 0,
        notes: body.notes ?? null,
      })
      .select('id')
      .single();
    if (roomErr || !createdRoom?.id) {
      return NextResponse.json({ error: roomErr?.message ?? 'Failed to create room' }, { status: 500 });
    }
    roomId = createdRoom.id;
  }

  const { data: created, error } = await supabase
    .from('room_assignments')
    .insert({
      workspace_id: profile.workspace_id,
      room_id: roomId,
      person_id: person.id,
      starts_on: body.check_in ?? new Date().toISOString().slice(0, 10),
      ends_on: body.check_out ?? body.check_in ?? new Date().toISOString().slice(0, 10),
    })
    .select(`
      id,
      starts_on,
      ends_on,
      rooms(room_number, room_type, cost_amount, notes),
      persons(full_name)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const personRef = Array.isArray((created as { persons?: unknown }).persons)
    ? ((created as { persons?: Array<{ full_name?: string | null }> }).persons ?? [])[0]
    : (created as { persons?: { full_name?: string | null } | null }).persons;
  const roomRef = Array.isArray((created as { rooms?: unknown }).rooms)
    ? ((created as { rooms?: Array<{ room_number?: string | null; room_type?: string | null; cost_amount?: number | null; notes?: string | null }> }).rooms ?? [])[0]
    : (created as { rooms?: { room_number?: string | null; room_type?: string | null; cost_amount?: number | null; notes?: string | null } | null }).rooms;
  return NextResponse.json({
    id: (created as { id: string }).id,
    person_name: personRef?.full_name ?? person_name.trim(),
    check_in: (created as { starts_on: string }).starts_on,
    check_out: (created as { ends_on: string }).ends_on,
    nights: Number(body.nights) || 0,
    room_type: roomRef?.room_type ?? null,
    room_number: roomRef?.room_number ?? null,
    confirmation: body.confirmation ?? null,
    rate_per_night: Number(roomRef?.cost_amount ?? 0),
    notes: roomRef?.notes ?? null,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
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

  const { data: existing, error: existingErr } = await supabase
    .from('room_assignments')
    .select('id, room_id, person_id')
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
    .single();
  if (existingErr || !existing) {
    return NextResponse.json({ error: existingErr?.message ?? 'Assignment not found' }, { status: 404 });
  }

  const assignPayload: Record<string, unknown> = {};
  if (updates.check_in !== undefined) assignPayload.starts_on = updates.check_in;
  if (updates.check_out !== undefined) assignPayload.ends_on = updates.check_out;
  if (updates.person_name !== undefined) {
    const { data: person } = await supabase
      .from('persons')
      .select('id')
      .eq('workspace_id', profile.workspace_id)
      .ilike('full_name', updates.person_name.trim())
      .maybeSingle();
    if (person?.id) assignPayload.person_id = person.id;
  }
  if (Object.keys(assignPayload).length > 0) {
    const { error: assignErr } = await supabase
      .from('room_assignments')
      .update(assignPayload)
      .eq('id', id)
      .eq('workspace_id', profile.workspace_id);
    if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });
  }

  const roomPayload: Record<string, unknown> = {};
  if (updates.room_type !== undefined) roomPayload.room_type = updates.room_type;
  if (updates.room_number !== undefined) roomPayload.room_number = updates.room_number;
  if (updates.rate_per_night !== undefined) roomPayload.cost_amount = updates.rate_per_night;
  if (updates.notes !== undefined) roomPayload.notes = updates.notes;
  if (Object.keys(roomPayload).length > 0) {
    const { error: roomErr } = await supabase
      .from('rooms')
      .update(roomPayload)
      .eq('id', existing.room_id)
      .eq('workspace_id', profile.workspace_id);
    if (roomErr) return NextResponse.json({ error: roomErr.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('room_assignments')
    .select(`
      id,
      starts_on,
      ends_on,
      persons(full_name),
      rooms(room_type, room_number, cost_amount, notes)
    `)
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const personRef = Array.isArray((data as { persons?: unknown }).persons)
    ? ((data as { persons?: Array<{ full_name?: string | null }> }).persons ?? [])[0]
    : (data as { persons?: { full_name?: string | null } | null }).persons;
  const roomRef = Array.isArray((data as { rooms?: unknown }).rooms)
    ? ((data as { rooms?: Array<{ room_number?: string | null; room_type?: string | null; cost_amount?: number | null; notes?: string | null }> }).rooms ?? [])[0]
    : (data as { rooms?: { room_number?: string | null; room_type?: string | null; cost_amount?: number | null; notes?: string | null } | null }).rooms;
  return NextResponse.json({
    id: (data as { id: string }).id,
    person_name: personRef?.full_name ?? updates.person_name ?? null,
    check_in: (data as { starts_on: string }).starts_on,
    check_out: (data as { ends_on: string }).ends_on,
    nights: updates.nights ?? 0,
    room_type: roomRef?.room_type ?? null,
    room_number: roomRef?.room_number ?? null,
    confirmation: updates.confirmation ?? null,
    rate_per_night: Number(roomRef?.cost_amount ?? 0),
    notes: roomRef?.notes ?? null,
  });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
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
    .from('room_assignments')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
