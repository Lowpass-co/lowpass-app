/* ============================================
   LOWPASS — Parking: driver links, the server (Nov 2026, Adam — migration 289)

   OWNER (RLS client, the route's requireWrite + tourGate):
     createDriverLink   → the token, ONCE (only its sha-256 is stored)
     listDriverLinks / revokeDriverLink
   PUBLIC (service-role client — the token is the grant):
     touchLink          → the live link; counts the view or TAKES a 3D open
                          through parking_share_touch() (atomic, capped)
     driverMapPayload   → that ONE show's map, venue and drawings — the
                          drawings' files signed only if the map uses them
                          and they're in the link's workspace. Nothing else
                          from the workspace leaves.
   ============================================ */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateToken } from '@/lib/rider-packs/web-links';
import { TOKEN_RE, linkState, remaining3d, type DriverLinkRow } from '@/lib/parking/driverLinks';
import type { ParkingDrawing, ParkingItem } from '@/lib/parking/model';
import type { LatLng, View } from '@/lib/parking/geo';
import { loadParkingMap, loadParkingShow, type ParkingShow } from './maps';

export class DriverLinkError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const COLS = 'id, workspace_id, tour_id, routing_id, label, expires_at, revoked_at, max_3d_opens, opens_3d, views, last_viewed_at, created_at';

export interface OwnerDriverLink {
  id: string;
  label: string | null;
  expiresAt: string;
  revoked: boolean;
  state: ReturnType<typeof linkState>;
  views: number;
  opens3d: number;
  max3d: number;
  lastViewedAt: string | null;
  createdAt: string | null;
}

const toOwner = (r: DriverLinkRow, now = new Date()): OwnerDriverLink => ({
  id: r.id,
  label: r.label,
  expiresAt: r.expires_at,
  revoked: !!r.revoked_at,
  state: linkState(r, now),
  views: r.views,
  opens3d: r.opens_3d,
  max3d: r.max_3d_opens,
  lastViewedAt: r.last_viewed_at ?? null,
  createdAt: r.created_at ?? null,
});

/* ── Owner ────────────────────────────────────────────────── */

export async function createDriverLink(
  client: SupabaseClient,
  args: { show: ParkingShow; userId: string; input: { label: string | null; hours: number; max3d: number }; now?: Date },
): Promise<{ token: string; link: OwnerDriverLink }> {
  const { show, userId, input } = args;
  const now = args.now ?? new Date();
  // A link to nothing helps nobody: the map must have been saved.
  const map = await loadParkingMap(client, show.routingId);
  if (!map) throw new DriverLinkError(409, 'no_map', 'Draw the map first — there’s nothing to send yet.');
  const token = generateToken();
  const { data, error } = await client
    .from('parking_share_links')
    .insert({
      workspace_id: show.workspaceId,
      tour_id: show.tourId,
      routing_id: show.routingId,
      token_hash: hashToken(token),
      label: input.label,
      expires_at: new Date(now.getTime() + input.hours * 3_600_000).toISOString(),
      max_3d_opens: input.max3d,
      opens_3d: 0,
      views: 0,
      created_by: userId,
    })
    .select(COLS)
    .single();
  if (error || !data) {
    if (error && /parking_share_links/.test(error.message) && /(does not exist|relation)/.test(error.message)) {
      throw new DriverLinkError(503, 'needs_289', 'Driver links need migration 289 — paste it in the Supabase SQL editor, then try again.');
    }
    throw new DriverLinkError(500, 'error', error?.message ?? 'Couldn’t make the link.');
  }
  return { token, link: toOwner(data as DriverLinkRow, now) };
}

export async function listDriverLinks(client: SupabaseClient, routingId: string, now = new Date()): Promise<OwnerDriverLink[]> {
  const { data, error } = await client.from('parking_share_links').select(COLS).eq('routing_id', routingId).order('created_at', { ascending: false }).limit(50);
  if (error) return []; // before migration 289: no links yet
  return ((data ?? []) as DriverLinkRow[]).map((r) => toOwner(r, now));
}

export async function revokeDriverLink(client: SupabaseClient, args: { routingId: string; id: string; now?: Date }): Promise<void> {
  const { data, error } = await client
    .from('parking_share_links')
    .update({ revoked_at: (args.now ?? new Date()).toISOString() })
    .eq('id', args.id)
    .eq('routing_id', args.routingId)
    .is('revoked_at', null)
    .select('id');
  if (error) throw new DriverLinkError(500, 'error', error.message);
  if (!(data ?? []).length) throw new DriverLinkError(404, 'not_found', 'That link isn’t on this map, or it’s already off.');
}

/* ── Public ───────────────────────────────────────────────── */

type TouchRow = DriverLinkRow & { took: boolean };

/** Token → the live link, counting this view (or taking a 3D open). */
export async function touchLink(service: SupabaseClient, token: string, take3d: boolean, now = new Date()): Promise<DriverLinkRow> {
  if (!TOKEN_RE.test(token)) throw new DriverLinkError(404, 'not_found', 'This link doesn’t exist.');
  const { data, error } = await service.rpc('parking_share_touch', { p_token_hash: hashToken(token), p_take_3d: take3d });
  if (error) throw new DriverLinkError(500, 'error', 'Couldn’t open this link.');
  const row = ((data ?? []) as TouchRow[])[0];
  if (!row) throw new DriverLinkError(404, 'not_found', 'This link doesn’t exist.');
  const state = linkState(row, now);
  if (state === 'revoked') throw new DriverLinkError(410, 'revoked', 'This link has been turned off.');
  if (state === 'expired') throw new DriverLinkError(410, 'expired', 'This link has expired — ask for a new one.');
  if (!row.took) throw new DriverLinkError(429, 'no_3d_left', 'This link has used all its 3D views — the plan still works.');
  return row;
}

export interface DriverDrawingFile {
  id: string;
  name: string;
  kind: 'pdf' | 'image';
  url: string;
}

export interface DriverMapPayload {
  label: string | null;
  expiresAt: string;
  remaining3d: number;
  venue: { name: string | null; city: string | null };
  date: string;
  map: { anchor: LatLng; view: View; items: ParkingItem[]; notes: string; drawings: ParkingDrawing[] };
  files: DriverDrawingFile[];
}

export interface SignStorage {
  sign(bucket: string, path: string, seconds: number): Promise<string | null>;
}

export const supabaseSignStorage = (service: SupabaseClient): SignStorage => ({
  async sign(bucket, path, seconds) {
    const { data } = await service.storage.from(bucket).createSignedUrl(path, seconds);
    return data?.signedUrl ?? null;
  },
});

/** Drawing files are signed for this long — the page renders them on open. */
export const DRIVER_FILE_SECONDS = 600;

export async function driverMapPayload(service: SupabaseClient, storage: SignStorage, link: DriverLinkRow): Promise<DriverMapPayload> {
  const show = await loadParkingShow(service, link.tour_id, link.routing_id);
  const map = await loadParkingMap(service, link.routing_id);
  if (!show || !map || show.workspaceId !== link.workspace_id) throw new DriverLinkError(404, 'not_found', 'This map isn’t available any more.');
  // Only the files this map's drawings use, and only from the link's workspace.
  const ids = [...new Set(map.drawings.map((d) => d.fileId))];
  const files: DriverDrawingFile[] = [];
  if (ids.length) {
    const { data } = await service
      .from('file_references')
      .select('id, file_name, storage_provider, provider_file_id')
      .eq('workspace_id', link.workspace_id)
      .in('id', ids);
    for (const f of (data ?? []) as { id: string; file_name: string; storage_provider: string | null; provider_file_id: string | null }[]) {
      const d = map.drawings.find((x) => x.fileId === f.id);
      if (!d || !f.storage_provider || !f.provider_file_id) continue;
      const url = await storage.sign(f.storage_provider, f.provider_file_id, DRIVER_FILE_SECONDS);
      if (url) files.push({ id: f.id, name: f.file_name, kind: d.kind, url });
    }
  }
  const { pages: _pages, cam3d: _cam, level: _level, ...view } = map.view;
  void _pages;
  void _cam;
  void _level;
  return {
    label: link.label,
    expiresAt: link.expires_at,
    remaining3d: remaining3d(link),
    venue: { name: show.venue.name, city: show.venue.city },
    date: show.date,
    map: { anchor: map.anchor, view, items: map.items, notes: map.notes, drawings: map.drawings.filter((d) => files.some((f) => f.id === d.fileId)) },
    files,
  };
}
