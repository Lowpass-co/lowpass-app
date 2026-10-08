/* ============================================
   LOWPASS — Budget Hotels API (canonical hotels/rooms)
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  computeHotelTotals,
  loadTourMoneyContext,
  reconcileDerivedBudgetLines,
  refreshDerivedLines,
} from '@/server/budget/reconcileDerivedLines';

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

  // Money repair — this GET used to WRITE: it created placeholder lines and
  // rewrote every hotel line's proposed AND actual with its own formula
  // (nights × rate PER OCCUPANT, so a shared room cost double), fighting the
  // budget's reconcile (per ROOM) on every load and erasing receipt actuals.
  // Now the one derived-line writer refreshes the hotel lines, and this route
  // only reads them back alongside the same per-room total it used.
  await reconcileDerivedBudgetLines(supabase, tourId, profile.workspace_id, { families: ['hotel_booking'] });
  const money = await loadTourMoneyContext(supabase, tourId, profile.workspace_id).catch(() => null);
  const totals = money
    ? (await computeHotelTotals(supabase, tourId, profile.workspace_id, money).catch(() => null))?.totals ?? null
    : null;

  const hotelIds = hotels.map((h) => h.id);
  const { data: lineRows } = hotelIds.length
    ? await supabase
        .from('budget_line_items')
        .select('id, source_entity_id, proposed_cost, actual_cost, status')
        .eq('workspace_id', profile.workspace_id)
        .eq('tour_id', tourId)
        .eq('source_entity_type', 'hotel_booking')
        .in('source_entity_id', hotelIds)
    : { data: [] as Array<{ id: string; source_entity_id: string; proposed_cost: number | null; actual_cost: number | null; status: string | null }> };
  const lineByHotel = new Map(
    (lineRows ?? []).map((r) => [String((r as { source_entity_id: string }).source_entity_id), r as {
      id: string; proposed_cost: number | null; actual_cost: number | null; status: string | null;
    }]),
  );

  const hotelsOut = hotels.map((h) => {
    const line = lineByHotel.get(h.id);
    const derivedCost = totals?.get(h.id)?.total ?? 0;
    return {
      ...h,
      line_item_id: line?.id ?? null,
      proposed_cost: line ? Number(line.proposed_cost ?? 0) : derivedCost,
      actual_cost: line ? Number(line.actual_cost ?? 0) : derivedCost,
      derived_cost: derivedCost,
      status: line?.status ?? 'draft',
    };
  });

  return NextResponse.json({ hotels: hotelsOut });
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

  // The hotel's budget line is created by the one derived-line writer (it used
  // to be inserted here too — a second writer, and a duplicate-line race).
  await refreshDerivedLines(supabase, tour_id, profile.workspace_id, 'rooming');
  const { data: line } = await supabase
    .from('budget_line_items')
    .select('id')
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tour_id)
    .eq('source_entity_type', 'hotel_booking')
    .eq('source_entity_id', booking.id)
    .maybeSingle();
  booking.line_item_id = (line?.id as string | undefined) ?? null;

  return NextResponse.json(booking);
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

  // Name / city / check-in feed the budget line's label — refresh it.
  await refreshDerivedLines(supabase, (data as { tour_id?: string } | null)?.tour_id, profile.workspace_id, 'rooming');

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

  const { data: gone, error } = await supabase
    .from('hotels')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id)
    .select('tour_id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The hotel's budget line follows the shared rule: removed if nothing is
  // attached, otherwise kept as a manual line with its receipts. (This used to
  // delete it outright — taking any receipts' transactions with it.)
  const goneTour = (gone as Array<{ tour_id?: string }> | null)?.[0]?.tour_id;
  await refreshDerivedLines(supabase, goneTour, profile.workspace_id, 'rooming');

  return new Response(null, { status: 204 });
}
