/* ============================================
   LOWPASS — Rooming export data loader (#8 Document Export, Rooming slice)

   Mirrors the rooming PAGE's loaders (src/app/(app)/operations/[tourId]/rooming/
   page.tsx) so the exported hotel rooming-list matches exactly what the Rooming
   surface shows — same canonical source (hotels / rooms / room_assignments /
   persons, migration 051), the same roster filter (only tour-roster members'
   assignments render; a not-yet-linked null person_id is kept, never dropped),
   and the same nights derivation.

   Read-only. Caller has already auth'd + workspace-scoped the tour. Adds the
   letterhead inputs (artist name + logo) the shared shell needs.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';

export interface RoomingAssignmentRow {
  guest: string | null;
  roomType: string | null;
  roomNumber: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  /** Stable key for grouping guests who share a room (Part E). */
  roomKey: string;
}

export interface RoomingHotel {
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  /** Earliest check-in / latest check-out across this hotel's rows. */
  spanStart: string | null;
  spanEnd: string | null;
  rows: RoomingAssignmentRow[];
}

export interface RoomingExportData {
  tour: { id: string; name: string; start_date: string | null; end_date: string | null };
  artist: { name: string } | null;
  /** Raw (network) artist logo URL — the route inlines it to a data URI. */
  logoUrl: string | null;
  hotels: RoomingHotel[];
}

const nightsBetween = (checkIn: string, checkOut: string): number =>
  Math.max(
    0,
    Math.round(
      (new Date(`${checkOut}T12:00:00`).getTime() - new Date(`${checkIn}T12:00:00`).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Presentation-only nights/checkout calc (Part E — fix the off-by-one). A block
 *  whose stored ends_on is on/before its starts_on is ONE night: nights = 1,
 *  check-out = the day after check-in. Multi-day stays are unchanged (ends_on is the
 *  checkout date). Never mutates the source room data. */
function stayNights(startsOn: string, endsOn: string): { nights: number; checkOut: string } {
  const raw = nightsBetween(startsOn, endsOn);
  if (raw < 1) return { nights: 1, checkOut: addDays(startsOn, 1) };
  return { nights: raw, checkOut: endsOn };
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

  const hotels: RoomingHotel[] = hotelsRaw.map((h) => {
    const rows: RoomingAssignmentRow[] = (h.rooms ?? []).flatMap((room) => {
      const roomKey = room.id ?? `${room.room_type ?? ''}|${room.room_number ?? ''}`;
      return (room.room_assignments ?? [])
        // Mirror the page filter: roster members (or a not-yet-linked null id).
        .filter((ra) => !ra.person_id || rosterPersonIds.has(ra.person_id))
        // Part E/G shared date range — keep stays that OVERLAP [from,to] (null = open).
        .filter((ra) => (!range?.from || ra.ends_on >= range.from) && (!range?.to || ra.starts_on <= range.to))
        .map((ra) => {
          const person = Array.isArray(ra.persons) ? ra.persons[0] : ra.persons;
          const { nights, checkOut } = stayNights(ra.starts_on, ra.ends_on);
          return {
            guest: person?.full_name ?? null,
            roomType: room.room_type ?? null,
            roomNumber: room.room_number ?? null,
            checkIn: ra.starts_on,
            checkOut,
            nights,
            roomKey,
          };
        });
    });
    // Group guests sharing a room: order by room, then check-in, then guest.
    rows.sort(
      (a, b) =>
        a.roomKey.localeCompare(b.roomKey) ||
        (a.checkIn ?? '').localeCompare(b.checkIn ?? '') ||
        (a.guest ?? '').localeCompare(b.guest ?? ''),
    );
    const spanStart = rows.reduce<string | null>((min, r) => (min === null || r.checkIn < min ? r.checkIn : min), null);
    const spanEnd = rows.reduce<string | null>((max, r) => (max === null || r.checkOut > max ? r.checkOut : max), null);
    return { name: h.name, address: h.address ?? null, city: h.city ?? null, country: h.country ?? null, phone: h.phone ?? null, spanStart, spanEnd, rows };
  });

  const artistRow = artistRes.data as { id: string; name: string; branding: unknown; spotify_id: string | null; spotify_image_url: string | null } | null;
  const logoUrl = artistRow ? await resolveArtistLogoUrl(artistRow) : null;

  return {
    tour: { id: tourId, name: tour.name, start_date: tour.start_date, end_date: tour.end_date },
    artist: artistRow ? { name: artistRow.name } : null,
    logoUrl,
    hotels,
  };
}
