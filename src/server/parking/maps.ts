/* ============================================
   LOWPASS — Parking maps: server reads and writes (Nov 2026, Adam)

   loadParkingMap  — the show, its venue (name + coordinates) and its map, if
                     any. Reads only; opening the editor writes nothing.
   saveParkingMap  — insert on first save, then update guarded by `version`:
                     a save that names a stale version gets ParkingConflict
                     (409) with the current row, never a silent overwrite.
   recordPdf       — remember the last exported PDF (a tour Files row).

   Every write passes through parseMapBody() first (the route does that);
   tenancy is the route's requireWrite + tourGate AND the table's RLS, which
   checks the routing row belongs to the tour in the caller's workspace.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveVenue, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import { ROUTING_VENUE_SELECT } from '@/server/advance/board';
import type { ParkingMapData, ParkingItem } from '@/lib/parking/model';
import type { LatLng, View } from '@/lib/parking/geo';

export interface ParkingShow {
  tourId: string;
  routingId: string;
  workspaceId: string;
  date: string;
  dayType: string | null;
  venue: { name: string | null; address: string | null; city: string | null; canonicalId: string | null; coords: LatLng | null };
}

export interface SavedParkingMap extends ParkingMapData {
  id: string;
  version: number;
  updatedAt: string;
  pdf: { fileId: string; name: string | null; exportedAt: string | null } | null;
}

interface MapRow {
  id: string;
  workspace_id: string;
  tour_id: string;
  routing_id: string;
  canonical_venue_id: string | null;
  anchor_lat: number;
  anchor_lng: number;
  view: View;
  items: ParkingItem[];
  notes: string;
  version: number;
  pdf_file_id: string | null;
  pdf_exported_at: string | null;
  updated_at: string;
}

const MAP_COLS =
  'id, workspace_id, tour_id, routing_id, canonical_venue_id, anchor_lat, anchor_lng, view, items, notes, version, pdf_file_id, pdf_exported_at, updated_at';

export class ParkingConflict extends Error {
  constructor(public current: SavedParkingMap) {
    super('Someone else saved this map since you opened it.');
  }
}

export class ParkingNotFound extends Error {}

function toSaved(row: MapRow, pdfName: string | null): SavedParkingMap {
  return {
    id: row.id,
    version: row.version,
    updatedAt: row.updated_at,
    anchor: { lat: Number(row.anchor_lat), lng: Number(row.anchor_lng) },
    view: row.view,
    items: Array.isArray(row.items) ? row.items : [],
    notes: row.notes ?? '',
    pdf: row.pdf_file_id ? { fileId: row.pdf_file_id, name: pdfName, exportedAt: row.pdf_exported_at } : null,
  };
}

async function pdfName(client: SupabaseClient, fileId: string | null): Promise<string | null> {
  if (!fileId) return null;
  const { data } = await client.from('file_references').select('file_name').eq('id', fileId).maybeSingle<{ file_name: string | null }>();
  return data?.file_name ?? null;
}

export async function loadParkingShow(client: SupabaseClient, tourId: string, routingId: string): Promise<ParkingShow | null> {
  const [{ data: tour }, { data: routing }] = await Promise.all([
    client.from('tours').select('id, workspace_id').eq('id', tourId).maybeSingle<{ id: string; workspace_id: string }>(),
    client.from('routing').select(`${ROUTING_VENUE_SELECT}, tour_id`).eq('id', routingId).eq('tour_id', tourId).maybeSingle(),
  ]);
  if (!tour || !routing) return null;
  const r = routing as RoutingVenueSource & { id: string; date: string; day_type: string | null; canonical_venue_id: string | null };
  const venue = resolveVenue(r);
  let coords: LatLng | null = null;
  if (r.canonical_venue_id) {
    const { data: cv } = await client
      .from('canonical_venues')
      .select('lat, lng')
      .eq('id', r.canonical_venue_id)
      .maybeSingle<{ lat: number | null; lng: number | null }>();
    if (cv && cv.lat != null && cv.lng != null && Number.isFinite(Number(cv.lat)) && Number.isFinite(Number(cv.lng))) {
      coords = { lat: Number(cv.lat), lng: Number(cv.lng) };
    }
  }
  return {
    tourId,
    routingId,
    workspaceId: tour.workspace_id,
    date: r.date,
    dayType: r.day_type ?? null,
    venue: { name: venue.name, address: venue.address, city: venue.city, canonicalId: r.canonical_venue_id ?? null, coords },
  };
}

export async function loadParkingMap(client: SupabaseClient, routingId: string): Promise<SavedParkingMap | null> {
  const { data } = await client.from('parking_maps').select(MAP_COLS).eq('routing_id', routingId).maybeSingle<MapRow>();
  if (!data) return null;
  return toSaved(data, await pdfName(client, data.pdf_file_id));
}

export async function saveParkingMap(
  client: SupabaseClient,
  args: { show: ParkingShow; userId: string; data: ParkingMapData; version: number | null },
): Promise<SavedParkingMap> {
  const { show, userId, data, version } = args;
  const fields = {
    anchor_lat: data.anchor.lat,
    anchor_lng: data.anchor.lng,
    view: data.view,
    items: data.items,
    notes: data.notes,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  if (version == null) {
    // First save. A concurrent first save loses on the unique key → conflict.
    const { data: row, error } = await client
      .from('parking_maps')
      .insert({
        ...fields,
        workspace_id: show.workspaceId,
        tour_id: show.tourId,
        routing_id: show.routingId,
        canonical_venue_id: show.venue.canonicalId,
        version: 1,
        created_by: userId,
      })
      .select(MAP_COLS)
      .single<MapRow>();
    if (error) {
      if (error.code === '23505') {
        const current = await loadParkingMap(client, show.routingId);
        if (current) throw new ParkingConflict(current);
      }
      throw new Error(error.message);
    }
    return toSaved(row, null);
  }

  const { data: rows, error } = await client
    .from('parking_maps')
    .update({ ...fields, version: version + 1 })
    .eq('routing_id', show.routingId)
    .eq('version', version)
    .select(MAP_COLS);
  if (error) throw new Error(error.message);
  const row = (rows as MapRow[] | null)?.[0];
  if (!row) {
    const current = await loadParkingMap(client, show.routingId);
    if (!current) throw new ParkingNotFound('This map no longer exists.');
    throw new ParkingConflict(current);
  }
  return toSaved(row, await pdfName(client, row.pdf_file_id));
}

/** Remember the PDF just exported. The file must be in this workspace (RLS + the check). */
export async function recordPdf(
  client: SupabaseClient,
  args: { show: ParkingShow; fileId: string },
): Promise<SavedParkingMap> {
  const { data: file } = await client
    .from('file_references')
    .select('id, file_name')
    .eq('id', args.fileId)
    .eq('workspace_id', args.show.workspaceId)
    .maybeSingle<{ id: string; file_name: string | null }>();
  if (!file) throw new ParkingNotFound('That file isn’t in this workspace.');
  const { data: rows, error } = await client
    .from('parking_maps')
    .update({ pdf_file_id: file.id, pdf_exported_at: new Date().toISOString() })
    .eq('routing_id', args.show.routingId)
    .select(MAP_COLS);
  if (error) throw new Error(error.message);
  const row = (rows as MapRow[] | null)?.[0];
  if (!row) throw new ParkingNotFound('Save the map before exporting it.');
  return toSaved(row, file.file_name);
}
