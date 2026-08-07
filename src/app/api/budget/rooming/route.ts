/* ============================================
   LOWPASS — Budget Rooming Grid API (canonical room assignments)
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { placeholderHotelName } from '@/lib/rooming/nightsSummary';

/** The day after `date` (YYYY-MM-DD), UTC-safe. */
function nextDayIso(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

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

  const { data: assignmentRows, error: gridError } = await supabase
    .from('room_assignments')
    .select(`
      id,
      starts_on,
      ends_on,
      persons(id, full_name),
      rooms(room_type, hotels!inner(tour_id))
    `)
    .eq('workspace_id', profile.workspace_id)
    .eq('rooms.hotels.tour_id', tourId);

  if (gridError) {
    return NextResponse.json({ error: gridError.message }, { status: 500 });
  }

  const byPerson = new Map<string, { person_name: string; role: string | null; person_id: string | null; entries: unknown[] }>();
  for (const row of assignmentRows ?? []) {
    const personRef = Array.isArray((row as { persons?: unknown }).persons)
      ? ((row as { persons?: Array<{ id?: string; full_name?: string | null }> }).persons ?? [])[0]
      : (row as { persons?: { id?: string; full_name?: string | null } | null }).persons;
    const roomRef = Array.isArray((row as { rooms?: unknown }).rooms)
      ? ((row as { rooms?: Array<{ room_type?: string | null }> }).rooms ?? [])[0]
      : (row as { rooms?: { room_type?: string | null } | null }).rooms;
    const personName = String(personRef?.full_name ?? '').trim();
    if (!personName) continue;
    if (!byPerson.has(personName)) {
      byPerson.set(personName, {
        person_name: personName,
        role: null,
        person_id: personRef?.id ?? null,
        entries: [],
      });
    }
    const start = (row as { starts_on: string }).starts_on;
    const end = (row as { ends_on: string }).ends_on;
    const roomType = roomRef?.room_type ?? '-';
    for (const routing of routingDates) {
      if (routing.date >= start && routing.date <= end) {
        byPerson.get(personName)!.entries.push({
          id: (row as { id: string }).id,
          routing_id: routing.id,
          room_type: roomType,
          routing: {
            date: routing.date,
            venue_name: routing.venue_name,
            city: routing.city,
          },
        });
      }
    }
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
    tour_id?: string;
    person_id?: string | null;
    person_name?: string;
    role?: string | null;
    routing_id?: string;
    room_type?: string;
    /** Assumed nightly rate from the rooming grid — persisted as the room's
     *  cost so the budget Accommodation line is costed (OPS-04). */
    cost_amount?: number | null;
    entries?: Array<{
      tour_id: string;
      person_id?: string | null;
      person_name: string;
      role?: string | null;
      routing_id: string;
      room_type?: string;
      cost_amount?: number | null;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const entries = body.entries;
  const workEntries = Array.isArray(entries) && entries.length > 0
    ? entries
    : [{
        tour_id: body.tour_id!,
        person_id: body.person_id ?? null,
        person_name: body.person_name!,
        role: body.role ?? null,
        routing_id: body.routing_id!,
        room_type: body.room_type ?? '-',
        cost_amount: body.cost_amount ?? null,
      }];

  for (const e of workEntries) {
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
    .eq('id', workEntries[0].tour_id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const upserted: unknown[] = [];
  for (const entry of workEntries) {
    const personName = entry.person_name.trim();
    const { data: routing } = await supabase
      .from('routing')
      .select('id, date, city')
      .eq('id', entry.routing_id)
      .eq('tour_id', entry.tour_id)
      .maybeSingle();
    if (!routing?.id) continue;

    const personId = entry.person_id ?? (
      await supabase
        .from('persons')
        .select('id')
        .eq('workspace_id', profile.workspace_id)
        .ilike('full_name', personName)
        .maybeSingle()
    ).data?.id;
    if (!personId) continue;

    const routingDate = (routing as { date: string }).date;
    const routingCity = ((routing as { city?: string | null }).city ?? '').trim() || null;
    const dateIso = `${routingDate}T12:00:00`;

    const { data: hotels } = await supabase
      .from('hotels')
      .select('id, name, check_in_at, check_out_at')
      .eq('workspace_id', profile.workspace_id)
      .eq('tour_id', entry.tour_id)
      .order('check_in_at', { ascending: true, nullsFirst: true });

    // REUSE any existing hotel whose stay window covers this night — including
    // previously auto-created placeholders — so re-running the grid never
    // stacks duplicate placeholder hotels for the same date.
    const coveringHotel = (hotels ?? []).find((h) => {
      const start = (h as { check_in_at?: string | null }).check_in_at;
      const end = (h as { check_out_at?: string | null }).check_out_at;
      const s = start ? new Date(start).getTime() : Number.NEGATIVE_INFINITY;
      const e = end ? new Date(end).getTime() : Number.POSITIVE_INFINITY;
      const d = new Date(dateIso).getTime();
      return d >= s && d <= e;
    }) as { id: string; name?: string | null; check_in_at?: string | null; check_out_at?: string | null } | undefined;
    let targetHotelId = coveringHotel?.id ?? null;

    if (coveringHotel) {
      // Heal a LEGACY auto-placeholder in place: rename 'Unassigned Hotel' to
      // the honest 'Hotel — {city} · {date}' and stretch its same-day
      // 00:00→23:59 window to next-day 00:00 so the stay reads as ONE night.
      // Only the exact auto-created shape (legacy name + both timestamps on
      // this routing date) is touched — user-edited hotels are never renamed.
      const legacyName = String(coveringHotel.name ?? '').trim().toLowerCase() === 'unassigned hotel';
      const sameDay =
        String(coveringHotel.check_in_at ?? '').slice(0, 10) === routingDate &&
        String(coveringHotel.check_out_at ?? '').slice(0, 10) === routingDate;
      if (legacyName && sameDay) {
        await supabase
          .from('hotels')
          .update({
            name: placeholderHotelName(routingCity, routingDate),
            city: routingCity,
            check_out_at: `${nextDayIso(routingDate)}T00:00:00Z`,
          })
          .eq('id', coveringHotel.id)
          .eq('workspace_id', profile.workspace_id);
      }
    } else {
      // No covering hotel → create ONE placeholder for this night, named
      // honestly from what's known ('Hotel — {city} · {date}'; see
      // placeholderHotelName — the name IS the placeholder marker, the hotels
      // table has no metadata column). check_out = next day 00:00 so the range
      // is a true ONE-night stay; the noon-probe coverage check above still
      // matches this date only (next date 12:00 > next date 00:00), so every
      // uncovered night keeps its own placeholder.
      const { data: createdHotel } = await supabase
        .from('hotels')
        .insert({
          workspace_id: profile.workspace_id,
          tour_id: entry.tour_id,
          name: placeholderHotelName(routingCity, routingDate),
          city: routingCity,
          check_in_at: `${routingDate}T00:00:00Z`,
          check_out_at: `${nextDayIso(routingDate)}T00:00:00Z`,
        })
        .select('id')
        .single();
      targetHotelId = createdHotel?.id ?? null;
    }
    if (!targetHotelId) continue;

    const roomType = (entry.room_type ?? '-').trim();
    // Assumed nightly rate → room cost (OPS-04). 0/absent leaves cost as-is.
    const costAmount = Number(entry.cost_amount);
    const hasCost = Number.isFinite(costAmount) && costAmount > 0;
    let roomId =
      (
        await supabase
          .from('rooms')
          .select('id')
          .eq('workspace_id', profile.workspace_id)
          .eq('hotel_id', targetHotelId)
          .eq('room_type', roomType)
          .maybeSingle()
      ).data?.id ?? null;

    if (!roomId) {
      const { data: createdRoom } = await supabase
        .from('rooms')
        .insert({
          workspace_id: profile.workspace_id,
          hotel_id: targetHotelId,
          room_type: roomType,
          cost_amount: hasCost ? costAmount : 0,
        })
        .select('id')
        .single();
      roomId = createdRoom?.id ?? null;
    } else if (hasCost) {
      // Keep the room's cost in step with the latest assumed rate.
      await supabase
        .from('rooms')
        .update({ cost_amount: costAmount })
        .eq('id', roomId)
        .eq('workspace_id', profile.workspace_id);
    }
    if (!roomId) continue;

    const { data: existingAssignment } = await supabase
      .from('room_assignments')
      .select('id')
      .eq('workspace_id', profile.workspace_id)
      .eq('person_id', personId)
      .eq('starts_on', routingDate)
      .eq('ends_on', routingDate)
      .maybeSingle();

    if (existingAssignment?.id) {
      const { data: updated } = await supabase
        .from('room_assignments')
        .update({ room_id: roomId })
        .eq('id', existingAssignment.id)
        .select()
        .single();
      if (updated) upserted.push(updated);
    } else {
      const { data: inserted } = await supabase
        .from('room_assignments')
        .insert({
          workspace_id: profile.workspace_id,
          room_id: roomId,
          person_id: personId,
          starts_on: routingDate,
          ends_on: routingDate,
        })
        .select()
        .single();
      if (inserted) upserted.push(inserted);
    }
  }

  return NextResponse.json(Array.isArray(entries) ? { entries: upserted } : (upserted[0] ?? null));
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
