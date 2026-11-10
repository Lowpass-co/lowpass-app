/* ============================================
   LOWPASS — Parking maps: server reads and writes (Nov 2026, Adam)

   loadParkingMap  — the show, its venue (name + coordinates) and its map, if
                     any. Reads only; opening the editor writes nothing.
   saveParkingMap  — insert on first save, then update guarded by `version`:
                     a save that names a stale version gets ParkingConflict
                     (409) with the current row, never a silent overwrite.
   recordPdf       — remember the last exported PDF (a tour Files row).
   loadParkingIndex — Production › Parking: the tour's show days and their maps.

   Every write passes through parseMapBody() first (the route does that);
   tenancy is the route's requireWrite + tourGate AND the table's RLS, which
   checks the routing row belongs to the tour in the caller's workspace.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveVenue, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import { ROUTING_VENUE_SELECT } from '@/server/advance/board';
import { ParkingInputError, type ParkingDrawing, type ParkingMapData, type ParkingItem } from '@/lib/parking/model';
import type { LatLng, View } from '@/lib/parking/geo';
import { summariseMap } from '@/lib/parking/summary';
import { drawableKind } from '@/lib/parking/drawings';
import { linkedFiles } from '@/server/files/entityLinks';

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
  /** Migration 288; absent on a database that hasn't had it pasted yet. */
  drawings?: ParkingDrawing[] | null;
}

const BASE_COLS =
  'id, workspace_id, tour_id, routing_id, canonical_venue_id, anchor_lat, anchor_lng, view, items, notes, version, pdf_file_id, pdf_exported_at, updated_at';
const MAP_COLS = `${BASE_COLS}, drawings`;

type PgErr = { code?: string; message?: string } | null;
/** The drawings column isn't there yet (migration 288 not pasted). */
const noDrawingsColumn = (e: PgErr) => !!e && (e.code === '42703' || e.code === 'PGRST204') && /drawings/.test(e.message ?? '');

/** Run a query with the drawings column; on a database without it (the code
 *  deployed before migration 288 was pasted), run it again without — so
 *  parking keeps working, minus drawings. */
export async function withDrawings<T>(q: (cols: string, drawings: boolean) => PromiseLike<{ data: T; error: PgErr }>): Promise<{ data: T; error: PgErr }> {
  const first = await q(MAP_COLS, true);
  if (!noDrawingsColumn(first.error)) return first;
  return q(BASE_COLS, false);
}
const NEEDS_288 = 'Venue drawings need migration 288 — paste it in the Supabase SQL editor, then try again.';

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
    drawings: Array.isArray(row.drawings) ? row.drawings : [],
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
  const { data } = await withDrawings((cols) => client.from('parking_maps').select(cols).eq('routing_id', routingId).maybeSingle<MapRow>());
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
  // Without migration 288 a map still saves — unless it has drawings to keep.
  const write = (withCol: boolean) => {
    if (!withCol && data.drawings.length) throw new ParkingInputError(NEEDS_288);
    return withCol ? { ...fields, drawings: data.drawings } : fields;
  };

  if (version == null) {
    // First save. A concurrent first save loses on the unique key → conflict.
    const { data: row, error } = await withDrawings((cols, withCol) =>
      client
        .from('parking_maps')
        .insert({
          ...write(withCol),
          workspace_id: show.workspaceId,
          tour_id: show.tourId,
          routing_id: show.routingId,
          canonical_venue_id: show.venue.canonicalId,
          version: 1,
          created_by: userId,
        })
        .select(cols)
        .single<MapRow>(),
    );
    if (error) {
      if (error.code === '23505') {
        const current = await loadParkingMap(client, show.routingId);
        if (current) throw new ParkingConflict(current);
      }
      throw new Error(error.message);
    }
    if (!row) throw new Error('The map was not saved.');
    return toSaved(row, null);
  }

  const { data: rows, error } = await withDrawings((cols, withCol) =>
    client
      .from('parking_maps')
      .update({ ...write(withCol), version: version + 1 })
      .eq('routing_id', show.routingId)
      .eq('version', version)
      .select(cols),
  );
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
  const { data: rows, error } = await withDrawings((cols) =>
    client
      .from('parking_maps')
      .update({ pdf_file_id: file.id, pdf_exported_at: new Date().toISOString() })
      .eq('routing_id', args.show.routingId)
      .select(cols),
  );
  if (error) throw new Error(error.message);
  const row = (rows as MapRow[] | null)?.[0];
  if (!row) throw new ParkingNotFound('Save the map before exporting it.');
  return toSaved(row, file.file_name);
}

/* ── Production › Parking: every show on the tour, with its map ─────────── */

export interface ParkingIndexRow {
  routingId: string;
  date: string;
  dayType: string | null;
  venue: string | null;
  city: string | null;
  summary: string | null;
  hasMap: boolean;
  updatedAt: string | null;
  pdfExportedAt: string | null;
}

/** Days off and travel days have no parking — unless a map was already drawn. */
const NO_PARKING_DAYS = new Set(['off', 'travel']);

export async function loadParkingIndex(client: SupabaseClient, tourId: string): Promise<ParkingIndexRow[]> {
  const [{ data: days }, { data: maps }] = await Promise.all([
    client.from('routing').select(`${ROUTING_VENUE_SELECT}, tour_id`).eq('tour_id', tourId).order('date', { ascending: true }),
    client.from('parking_maps').select('routing_id, items, updated_at, pdf_exported_at').eq('tour_id', tourId),
  ]);
  const byShow = new Map(
    ((maps ?? []) as { routing_id: string; items: ParkingItem[] | null; updated_at: string; pdf_exported_at: string | null }[]).map((m) => [m.routing_id, m]),
  );
  return ((days ?? []) as (RoutingVenueSource & { id: string; date: string; day_type: string | null })[])
    .filter((d) => byShow.has(d.id) || !NO_PARKING_DAYS.has((d.day_type ?? 'show').toLowerCase()))
    .map((d) => {
      const m = byShow.get(d.id);
      const v = resolveVenue(d);
      return {
        routingId: d.id,
        date: d.date,
        dayType: d.day_type ?? null,
        venue: v.name,
        city: v.city ?? d.city ?? null,
        summary: m ? summariseMap(Array.isArray(m.items) ? m.items : []) : null,
        hasMap: !!m,
        updatedAt: m?.updated_at ?? null,
        pdfExportedAt: m?.pdf_exported_at ?? null,
      };
    });
}

/* ── Venue drawings: which files can be one, and last time's at this venue ── */

export interface DrawingFile {
  id: string;
  name: string;
  mime: string | null;
  kind: 'pdf' | 'image';
  /** Where the browser signs it from (Storage RLS still applies). */
  bucket: string | null;
  path: string | null;
  /** "Tour files" or where it was linked from. */
  from: string;
}

export { drawableKind };

type FileRefRow = { id: string; file_name: string | null; file_type: string | null; storage_provider: string | null; provider_file_id: string | null };
const FILE_REF_COLS = 'id, file_name, file_type, storage_provider, provider_file_id';

/** The tour's own PDFs / images, files linked to this show or its venue, and
 *  any files the map's drawings already use (a drawing reused from another
 *  tour at this venue). Workspace-scoped, and RLS on top. */
export async function loadDrawingFiles(client: SupabaseClient, show: ParkingShow, ids: string[]): Promise<DrawingFile[]> {
  const out = new Map<string, DrawingFile>();
  const put = (r: FileRefRow, from: string) => {
    const kind = drawableKind(r.file_name, r.file_type);
    if (!kind || out.has(r.id)) return;
    out.set(r.id, { id: r.id, name: r.file_name ?? 'Drawing', mime: r.file_type, kind, bucket: r.storage_provider, path: r.provider_file_id, from });
  };
  const { data: tourFiles } = await client
    .from('file_references')
    .select(FILE_REF_COLS)
    .eq('workspace_id', show.workspaceId)
    .eq('linked_to_type', 'tour')
    .eq('linked_to_id', show.tourId);
  for (const r of (tourFiles ?? []) as FileRefRow[]) put(r, 'Tour files');
  try {
    const linked = await linkedFiles(client, { workspaceId: show.workspaceId, type: 'show', id: show.routingId });
    for (const f of linked) {
      put(
        { id: f.id, file_name: f.name, file_type: f.type, storage_provider: f.bucket, provider_file_id: f.path },
        f.via === 'venue' ? `Linked to the venue${f.tourName ? ` · ${f.tourName}` : ''}` : 'Linked to this show',
      );
    }
  } catch {
    /* links are a convenience here; the tour's own files still list */
  }
  const missing = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id) && !out.has(id));
  if (missing.length) {
    const { data } = await client.from('file_references').select(FILE_REF_COLS).eq('workspace_id', show.workspaceId).in('id', missing);
    for (const r of (data ?? []) as FileRefRow[]) put(r, 'Used on this map');
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface VenueReuse {
  routingId: string;
  updatedAt: string;
  anchor: LatLng;
  drawings: ParkingDrawing[];
}

/** The latest OTHER map at this venue in this workspace that has drawings —
 *  so a venue gets calibrated once, not once a tour. Null without a library
 *  venue, or before migration 288. */
export async function loadVenueReuse(client: SupabaseClient, show: ParkingShow): Promise<VenueReuse | null> {
  if (!show.venue.canonicalId) return null;
  const { data, error } = await client
    .from('parking_maps')
    .select('routing_id, anchor_lat, anchor_lng, drawings, updated_at')
    .eq('workspace_id', show.workspaceId)
    .eq('canonical_venue_id', show.venue.canonicalId)
    .neq('routing_id', show.routingId)
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error) return null;
  const hit = ((data ?? []) as { routing_id: string; anchor_lat: number; anchor_lng: number; drawings: ParkingDrawing[] | null; updated_at: string }[]).find(
    (r) => Array.isArray(r.drawings) && r.drawings.length,
  );
  if (!hit) return null;
  return { routingId: hit.routing_id, updatedAt: hit.updated_at, anchor: { lat: Number(hit.anchor_lat), lng: Number(hit.anchor_lng) }, drawings: hit.drawings! };
}
