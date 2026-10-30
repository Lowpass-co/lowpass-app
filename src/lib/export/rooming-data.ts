/* ============================================
   LOWPASS — Rooming export data loader (#8 Document Export, Rooming slice)

   Mirrors the rooming PAGE's loaders (src/app/(app)/operations/[tourId]/rooming/
   page.tsx) so the exported hotel rooming-list matches exactly what the Rooming
   surface shows — same canonical source (hotels / rooms / room_assignments /
   persons, migration 051) and the same roster filter (only tour-roster members'
   assignments render; a not-yet-linked null person_id is kept, never dropped).

   Oct 2026 — the grid's one-row-per-person-per-night data is turned into real
   stays (src/lib/rooming/stays.ts): one line per room per run of nights, a
   single per person, sharers together, nobody-staying nights left out.

   Read-only. Caller has already auth'd + workspace-scoped the tour. Adds the
   letterhead inputs (artist name + logo) the shared shell needs.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import { isPlaceholderHotelName } from '@/lib/rooming/nightsSummary';
import { buildStays, summariseStays, type NightInput, type Stay, type StaySummary } from '@/lib/rooming/stays';

export interface RoomingAssignmentRow {
  guest: string | null;
  roomType: string | null;
  roomNumber: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  /** Stable key for grouping guests who share a room (one per stay). */
  roomKey: string;
}

export interface RoomingHotel {
  /** Null for an unbooked night (a placeholder the grid made) — the heading
   *  then says no hotel is booked yet, with the city. */
  name: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  confirmation: string | null;
  /** Earliest check-in / latest check-out across this hotel's stays. */
  spanStart: string | null;
  spanEnd: string | null;
  /** One per room per unbroken run of nights with the same guests. */
  stays: Stay[];
  summary: StaySummary;
  /** The same, one row per guest per stay (the Excel sheet's shape). */
  rows: RoomingAssignmentRow[];
}

export interface RoomingExportData {
  tour: { id: string; name: string; start_date: string | null; end_date: string | null };
  artist: { name: string } | null;
  /** Raw (network) artist logo URL — the route inlines it to a data URI. */
  logoUrl: string | null;
  hotels: RoomingHotel[];
}

export async function loadRoomingExportData(
  supabase: SupabaseClient,
  tour: { id: string; name: string; start_date: string | null; end_date: string | null; artist_id: string | null },
  workspaceId: string,
  opts?: { range?: { from: string | null; to: string | null } },
): Promise<RoomingExportData> {
  const tourId = tour.id;
  const range = opts?.range;

  const [hotelsRes, rosterRes, artistRes] = await Promise.all([
    // Same query the rooming page runs (hotel → rooms → assignments → guest).
    supabase
      .from('hotels')
      .select('*, rooms(*, room_assignments(*, persons(full_name)))')
      .eq('tour_id', tourId)
      .eq('workspace_id', workspaceId)
      .order('check_in_at', { ascending: true, nullsFirst: true }),
    supabase.from('tour_personnel').select('person_id').eq('tour_id', tourId),
    tour.artist_id
      ? supabase.from('artists').select('id, name, branding, spotify_id, spotify_image_url').eq('id', tour.artist_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const rosterPersonIds = new Set(
    ((rosterRes.data ?? []) as Array<{ person_id?: string | null }>).map((r) => r.person_id).filter((id): id is string => Boolean(id)),
  );

  const hotelsRaw = (hotelsRes.data ?? []) as Array<{
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    phone?: string | null;
    confirmation_number?: string | null;
    rooms?: Array<{
      id?: string;
      room_type?: string | null;
      room_number?: string | null;
      room_assignments?: Array<{
        person_id?: string | null;
        starts_on: string;
        ends_on: string;
        persons?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
      }>;
    }>;
  }>;

  // Every guest-night, then stays. Unbooked nights (the grid's per-night
  // placeholder hotels) are grouped by city so a run of them reads as one
  // block, not a hotel per night.
  const groupKey = (h: (typeof hotelsRaw)[number]) =>
    isPlaceholderHotelName(h.name) || !h.name?.trim() ? `~unbooked|${(h.city ?? '').trim().toLowerCase()}` : h.id;
  const nights: NightInput[] = [];
  for (const h of hotelsRaw) {
    const key = groupKey(h);
    for (const room of h.rooms ?? []) {
      for (const ra of room.room_assignments ?? []) {
        // Mirror the page filter: roster members (or a not-yet-linked null id).
        if (ra.person_id && !rosterPersonIds.has(ra.person_id)) continue;
        const person = Array.isArray(ra.persons) ? ra.persons[0] : ra.persons;
        nights.push({
          hotelKey: key,
          person: person?.full_name ?? null,
          // Unbooked nights are separate placeholder hotels (separate room
          // rows per night): identify their rooms by code so a run merges.
          roomId: key.startsWith('~unbooked|') ? null : room.id ?? null,
          roomType: room.room_type ?? null,
          roomNumber: room.room_number ?? null,
          startsOn: ra.starts_on,
          endsOn: ra.ends_on,
        });
      }
    }
  }
  const stays = buildStays(nights, range);

  const seen = new Set<string>();
  const hotels: RoomingHotel[] = [];
  for (const h of hotelsRaw) {
    const key = groupKey(h);
    if (seen.has(key)) continue;
    seen.add(key);
    const own = stays.filter((s) => s.hotelKey === key);
    if (!own.length) continue; // nobody staying — not a line on a rooming list
    const unbooked = key.startsWith('~unbooked|');
    hotels.push({
      name: unbooked ? null : h.name,
      address: unbooked ? null : h.address ?? null,
      city: h.city ?? null,
      country: h.country ?? null,
      phone: unbooked ? null : h.phone ?? null,
      confirmation: unbooked ? null : h.confirmation_number ?? null,
      spanStart: own.reduce<string | null>((m, s) => (m === null || s.checkIn < m ? s.checkIn : m), null),
      spanEnd: own.reduce<string | null>((m, s) => (m === null || s.checkOut > m ? s.checkOut : m), null),
      stays: own,
      summary: summariseStays(own),
      rows: own.flatMap((s, i) =>
        s.guests.map((g) => ({ guest: g, roomType: s.roomType, roomNumber: s.roomNumber, checkIn: s.checkIn, checkOut: s.checkOut, nights: s.nights, roomKey: `${key}#${i}` })),
      ),
    });
  }
  hotels.sort((a, b) => (a.spanStart ?? '').localeCompare(b.spanStart ?? ''));

  const artistRow = artistRes.data as { id: string; name: string; branding: unknown; spotify_id: string | null; spotify_image_url: string | null } | null;
  const logoUrl = artistRow ? await resolveArtistLogoUrl(artistRow) : null;

  return {
    tour: { id: tourId, name: tour.name, start_date: tour.start_date, end_date: tour.end_date },
    artist: artistRow ? { name: artistRow.name } : null,
    logoUrl,
    hotels,
  };
}
