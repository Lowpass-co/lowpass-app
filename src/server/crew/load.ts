/* ============================================
   LOWPASS — crew on a phone (Nov 2026, Adam): what a Member needs on the day
   — the shows, each show's advance info, its parking map, the tour's files.

   Every read goes through the SIGNED-IN client, so the database's tour
   access (293) decides what comes back; `access` only decides what to ASK
   for (no point querying parking for someone without Parking). Writes nothing.
   Sits beside Daysheets, not instead of it (Adam).
   ============================================ */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ROUTING_VENUE_SELECT } from '@/server/advance/board';
import { resolveVenuesForRows, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import { viewerCan, type ViewerAccess } from '@/lib/permissions/tourAccess';
import { driverMapPayload, supabaseSignStorage, type DriverMapPayload } from '@/server/parking/driverLinks';
import type { DriverLinkRow } from '@/lib/parking/driverLinks';

export type CrewTour = { id: string; name: string; startDate: string | null; endDate: string | null; artistName: string | null };

export async function loadCrewTours(client: SupabaseClient): Promise<CrewTour[]> {
  const { data } = await client
    .from('tours')
    .select('id, name, start_date, end_date, artist:artists(name)')
    .order('start_date', { ascending: true });
  return ((data ?? []) as unknown as { id: string; name: string | null; start_date: string | null; end_date: string | null; artist: { name: string } | null }[]).map((t) => ({
    id: t.id,
    name: t.name ?? 'Untitled tour',
    startDate: t.start_date,
    endDate: t.end_date,
    artistName: t.artist?.name ?? null,
  }));
}

/** Tours still running or ahead first, then past ones (most recent first). */
export function orderCrewTours(tours: CrewTour[], today: string): CrewTour[] {
  const live = tours.filter((t) => !t.endDate || t.endDate >= today);
  const past = tours.filter((t) => t.endDate && t.endDate < today).reverse();
  return [...live, ...past];
}

export type CrewDay = {
  id: string;
  date: string;
  dayType: string | null;
  city: string | null;
  venue: string | null;
  hasParking: boolean;
};

export type CrewTourData = {
  tour: CrewTour;
  days: CrewDay[];
  files: { id: string; name: string; folder: string | null }[];
  can: { advance: boolean; parking: boolean; files: boolean };
};

export async function loadCrewTour(client: SupabaseClient, tourId: string, access: ViewerAccess | null): Promise<CrewTourData | null> {
  const can = { advance: viewerCan(access, 'advance'), parking: viewerCan(access, 'parking'), files: viewerCan(access, 'files') };
  const [{ data: tour }, { data: days }, maps, files] = await Promise.all([
    client.from('tours').select('id, name, start_date, end_date, artist:artists(name)').eq('id', tourId).maybeSingle(),
    client.from('routing').select(`${ROUTING_VENUE_SELECT}, tour_id`).eq('tour_id', tourId).order('date', { ascending: true }),
    can.parking ? client.from('parking_maps').select('routing_id').eq('tour_id', tourId) : Promise.resolve({ data: [] }),
    can.files
      ? client
          .from('file_references')
          .select('id, file_name, metadata')
          .eq('linked_to_type', 'tour')
          .eq('linked_to_id', tourId)
          .order('file_name', { ascending: true })
          .limit(500)
      : Promise.resolve({ data: [] }),
  ]);
  if (!tour) return null;
  const t = tour as unknown as { id: string; name: string | null; start_date: string | null; end_date: string | null; artist: { name: string } | null };
  const rows = (days ?? []) as unknown as (RoutingVenueSource & { id: string; date: string; day_type: string | null; city: string | null })[];
  const venues = await resolveVenuesForRows(client, rows);
  const withMap = new Set(((maps.data ?? []) as { routing_id: string }[]).map((m) => m.routing_id));
  return {
    tour: { id: t.id, name: t.name ?? 'Untitled tour', startDate: t.start_date, endDate: t.end_date, artistName: t.artist?.name ?? null },
    days: rows.map((r) => ({
      id: r.id,
      date: r.date,
      dayType: r.day_type,
      city: venues.get(r.id)?.city ?? r.city ?? null,
      venue: venues.get(r.id)?.name ?? null,
      hasParking: withMap.has(r.id),
    })),
    files: ((files.data ?? []) as { id: string; file_name: string; metadata: { folder?: string | null } | null }[]).map((f) => ({
      id: f.id,
      name: f.file_name,
      folder: f.metadata?.folder ?? null,
    })),
    can,
  };
}

/** A show's parking map for a signed-in Member — the driver page's payload,
 *  read through THEIR access (their client signs the drawing files, so a
 *  drawing whose file they can't open is left off). No 3D, no expiry. */
export async function loadCrewParking(
  client: SupabaseClient,
  workspaceId: string,
  tourId: string,
  routingId: string,
): Promise<DriverMapPayload | null> {
  const asLink: DriverLinkRow = {
    id: 'crew',
    workspace_id: workspaceId,
    tour_id: tourId,
    routing_id: routingId,
    label: null,
    expires_at: '9999-12-31T00:00:00Z',
    revoked_at: null,
    max_3d_opens: 0,
    opens_3d: 0,
    views: 0,
  };
  try {
    return await driverMapPayload(client, supabaseSignStorage(client), asLink);
  } catch {
    return null;
  }
}
