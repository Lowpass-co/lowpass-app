/* ============================================
   LOWPASS — Riders: reading (rebuild, Nov 2026 — migration 301)

   `loadRiderEditor` is everything the Riders page needs in ONE fan-out (no
   waterfall): both documents and their blocks, the party, the latest
   published version (with its snapshot, to show what's changed since),
   the shows, their links / sends / acknowledgements / replies / settled
   lines, the tour's files for the attachment picker, the templates.
   Reads only, through the caller's client: the database decides what they
   see (production area) — except the embedded input list / stage plot and
   the item photos, read with the service role pinned to this tour
   (server/riders/embeds.ts, photos.ts), after the caller's own read of the
   tour has succeeded.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { ROUTING_VENUE_SELECT } from '@/server/advance/board';
import { emptyEmbeds } from '@/lib/riders/embeds';
import { photoPathsIn } from '@/lib/riders/photos';
import { buildEmbeds } from './embeds';
import { signPhotos } from './photos';
import { resolveVenue, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import { blockFromRow } from '@/lib/riders/blocks';
import { parseSnapshot } from '@/lib/riders/snapshot';
import { versionLabel } from '@/lib/riders/summary';
import { byPosition } from '@/lib/riders/position';
import { RIDER_KINDS, type LineState, type RiderBlock, type RiderChange, type RiderEmbeds, type RiderKind, type RiderSnapshot } from '@/lib/riders/types';

export interface RiderDocRow {
  id: string;
  kind: RiderKind;
  title: string;
}
export interface RiderShow {
  routingId: string;
  date: string;
  dayType: string | null;
  venue: string | null;
  city: string | null;
}
export interface RiderLinkRow {
  id: string;
  routingId: string | null;
  token: string;
  recipientName: string | null;
  recipientEmail: string | null;
  createdAt: string;
  lastViewedAt: string | null;
  lastViewedVersionId: string | null;
  viewCount: number;
}
export interface RiderVersionMeta {
  id: string;
  major: number;
  minor: number;
  label: string;
  note: string | null;
  publishedAt: string;
  publishedBy: string | null;
  changes: RiderChange[];
}
export interface RiderSendRow {
  linkId: string;
  versionId: string;
  sentAt: string;
}
export interface RiderAckRow {
  id: string;
  linkId: string;
  routingId: string | null;
  versionId: string;
  name: string;
  company: string | null;
  email: string | null;
  ackedAt: string;
}
export interface RiderReplyRow {
  id: string;
  linkId: string;
  routingId: string | null;
  blockId: string;
  line: string;
  author: 'venue' | 'tour';
  name: string | null;
  body: string;
  createdAt: string;
  resolvedAt: string | null;
}
export interface RiderStateRow {
  routingId: string;
  blockId: string;
  state: LineState;
  note: string | null;
}

export interface RiderEditorData {
  tour: { id: string; name: string; workspaceId: string; artistId: string | null; artistName: string | null };
  riders: RiderDocRow[];
  blocks: RiderBlock[];
  party: { setting: number | null; crew: number };
  latest: (RiderVersionMeta & { snapshot: RiderSnapshot }) | null;
  versions: RiderVersionMeta[];
  shows: RiderShow[];
  links: RiderLinkRow[];
  sends: RiderSendRow[];
  acks: RiderAckRow[];
  replies: RiderReplyRow[];
  states: RiderStateRow[];
  /** Last advance recipient per show (the Notify default when a link has none). */
  advanceRecipients: Record<string, { name: string | null; email: string | null }>;
  files: { id: string; name: string }[];
  /** The tour's crew, for "Add from crew" in Key contacts. */
  crew: { personId: string; name: string; role: string; email: string; phone: string }[];
  has: { channelList: boolean; stagePlot: boolean };
  templates: { id: string; name: string; kind: RiderKind; artistId: string | null }[];
  /** The tour's input list(s) / stage plot(s) as they stand now (the live
   *  copies the Input list / Stage plot blocks show; Publish freezes them). */
  embeds: RiderEmbeds;
  /** Signed URLs for the item photos in the blocks (path → URL, ~1 h). */
  photoUrls: Record<string, string>;
}

const NOT_SHOW_DAYS = new Set(['off', 'travel']);

/* ---------- row mappers (shared with the write routes) ---------- */

export const BLOCK_COLS = 'id, rider_id, position, kind, content, applies_from, applies_until, version, updated_by, updated_at';

export const toBlock = blockFromRow;

export const VERSION_COLS = 'id, major, minor, note, changes, published_by, published_at';

export function toVersion(r: Record<string, unknown>): RiderVersionMeta {
  const major = Number(r.major) || 1;
  const minor = Number(r.minor) || 0;
  return {
    id: String(r.id),
    major,
    minor,
    label: versionLabel({ major, minor }),
    note: (r.note as string | null) ?? null,
    publishedAt: String(r.published_at),
    publishedBy: (r.published_by as string | null) ?? null,
    changes: Array.isArray(r.changes) ? (r.changes as RiderChange[]) : [],
  };
}

export const LINK_COLS = 'id, routing_id, token, recipient_name, recipient_email, created_at, last_viewed_at, last_viewed_version_id, view_count';

export function toLink(r: Record<string, unknown>): RiderLinkRow {
  return {
    id: String(r.id),
    routingId: (r.routing_id as string | null) ?? null,
    token: String(r.token),
    recipientName: (r.recipient_name as string | null) ?? null,
    recipientEmail: (r.recipient_email as string | null) ?? null,
    createdAt: String(r.created_at),
    lastViewedAt: (r.last_viewed_at as string | null) ?? null,
    lastViewedVersionId: (r.last_viewed_version_id as string | null) ?? null,
    viewCount: Number(r.view_count) || 0,
  };
}

export const REPLY_COLS = 'id, link_id, routing_id, block_id, line, author, name, body, created_at, resolved_at';

export function toReply(r: Record<string, unknown>): RiderReplyRow {
  return {
    id: String(r.id),
    linkId: String(r.link_id),
    routingId: (r.routing_id as string | null) ?? null,
    blockId: String(r.block_id),
    line: String(r.line ?? ''),
    author: r.author === 'tour' ? 'tour' : 'venue',
    name: (r.name as string | null) ?? null,
    body: String(r.body ?? ''),
    createdAt: String(r.created_at),
    resolvedAt: (r.resolved_at as string | null) ?? null,
  };
}

export function toShow(r: RoutingVenueSource & { id: string; date: string; day_type: string | null }): RiderShow {
  const v = resolveVenue(r);
  return { routingId: r.id, date: r.date, dayType: r.day_type ?? null, venue: v.name, city: v.city ?? (r as { city?: string | null }).city ?? null };
}

/** The tour's show days (not days off / travel), in date order. */
export async function loadRiderShows(client: SupabaseClient, tourId: string): Promise<RiderShow[]> {
  const { data } = await client.from('routing').select(`${ROUTING_VENUE_SELECT}, tour_id`).eq('tour_id', tourId).order('date', { ascending: true });
  return ((data ?? []) as (RoutingVenueSource & { id: string; date: string; day_type: string | null })[])
    .filter((d) => d.date && !NOT_SHOW_DAYS.has((d.day_type ?? 'show').toLowerCase()))
    .map(toShow);
}

/** The tour's stage plot (the newest), if it has one. */
export async function tourStagePlot(client: SupabaseClient, tourId: string): Promise<{ id: string; title: string } | null> {
  const { data: packs } = await client.from('rider_packs').select('id, title').eq('tour_id', tourId).eq('kind', 'stage_plot').order('updated_at', { ascending: false });
  const list = (packs ?? []) as { id: string; title: string | null }[];
  if (!list.length) return null;
  const { data: plots } = await client.from('stage_plots').select('id, rider_pack_id').in('rider_pack_id', list.map((p) => p.id));
  const byPack = new Map(((plots ?? []) as { id: string; rider_pack_id: string }[]).map((p) => [p.rider_pack_id, p.id]));
  const pack = list.find((p) => byPack.has(p.id));
  return pack ? { id: byPack.get(pack.id)!, title: pack.title || 'Stage plot' } : null;
}

/** Does the tour have a channel list (any channel_list pack on it)? */
export async function tourHasChannelList(client: SupabaseClient, tourId: string): Promise<{ title: string } | null> {
  const { data } = await client.from('rider_packs').select('id, title').eq('tour_id', tourId).eq('kind', 'channel_list').order('updated_at', { ascending: false }).limit(1);
  const row = ((data ?? []) as { id: string; title: string | null }[])[0];
  return row ? { title: row.title || 'Input list' } : null;
}

async function loadCrew(client: SupabaseClient, tourId: string): Promise<RiderEditorData['crew']> {
  const { data: rows } = await client.from('tour_personnel').select('person_id, role').eq('tour_id', tourId);
  const list = ((rows ?? []) as { person_id: string | null; role: string | null }[]).filter((r) => r.person_id);
  if (!list.length) return [];
  const { data: people } = await client.from('persons').select('id, name, email, phone').in('id', list.map((r) => r.person_id as string));
  const byId = new Map(((people ?? []) as { id: string; name: string | null; email: string | null; phone: string | null }[]).map((p) => [p.id, p]));
  return list
    .map((r) => {
      const p = byId.get(r.person_id as string);
      return p ? { personId: p.id, name: p.name ?? '', role: r.role ?? '', email: p.email ?? '', phone: p.phone ?? '' } : null;
    })
    .filter((x): x is RiderEditorData['crew'][number] => !!x && !!x.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function crewCount(client: SupabaseClient, tourId: string): Promise<number> {
  const { count } = await client.from('tour_personnel').select('id', { count: 'exact', head: true }).eq('tour_id', tourId);
  return count ?? 0;
}

export async function loadRiderEditor(
  client: SupabaseClient,
  tourId: string,
  service: SupabaseClient = createServiceSupabaseClient() as unknown as SupabaseClient,
): Promise<RiderEditorData | null> {
  // Shared by the fan-out and the embeds (Promise.resolve runs each query once).
  const tourP = Promise.resolve(client.from('tours').select('id, name, workspace_id, artist_id, artist:artists(name)').eq('id', tourId).maybeSingle());
  const showsP = loadRiderShows(client, tourId);
  const embedsP = Promise.all([tourP, showsP]).then(([t, shows]) => {
    const ws = (t.data as { workspace_id?: string } | null)?.workspace_id;
    return ws ? buildEmbeds(service, { tourId, workspaceId: ws, shows }) : null;
  });
  const [tourRes, ridersRes, blocksRes, settingsRes, versionsRes, latestRes, shows, linksRes, sendsRes, acksRes, repliesRes, statesRes, filesRes, crew, plot, channel, templatesRes, intakeRes, crewList, embeds] =
    await Promise.all([
      tourP,
      client.from('riders').select('id, kind, title').eq('tour_id', tourId),
      client.from('rider_blocks').select(BLOCK_COLS).eq('tour_id', tourId).limit(5000),
      client.from('rider_settings').select('party_size').eq('tour_id', tourId).maybeSingle(),
      client.from('rider_versions').select(VERSION_COLS).eq('tour_id', tourId).order('major', { ascending: false }).order('minor', { ascending: false }).limit(100),
      client.from('rider_versions').select(`${VERSION_COLS}, snapshot`).eq('tour_id', tourId).order('major', { ascending: false }).order('minor', { ascending: false }).limit(1).maybeSingle(),
      showsP,
      client.from('rider_links').select(LINK_COLS).eq('tour_id', tourId).is('revoked_at', null),
      client.from('rider_sends').select('link_id, version_id, sent_at').eq('tour_id', tourId).order('sent_at', { ascending: false }).limit(1000),
      client.from('rider_acks').select('id, link_id, routing_id, version_id, name, company, email, acked_at').eq('tour_id', tourId).order('acked_at', { ascending: false }).limit(1000),
      client.from('rider_replies').select(REPLY_COLS).eq('tour_id', tourId).order('created_at', { ascending: true }).limit(2000),
      client.from('rider_line_states').select('routing_id, block_id, state, note').eq('tour_id', tourId),
      client.from('file_references').select('id, file_name').eq('linked_to_type', 'tour').eq('linked_to_id', tourId).order('created_at', { ascending: false }).limit(300),
      crewCount(client, tourId),
      tourStagePlot(client, tourId),
      tourHasChannelList(client, tourId),
      client.from('rider_templates').select('id, name, kind, artist_id').order('name', { ascending: true }),
      client.from('advance_intake_links').select('routing_id, recipient_name, recipient_email, created_at').eq('tour_id', tourId).order('created_at', { ascending: false }).limit(500),
      loadCrew(client, tourId).catch(() => [] as RiderEditorData['crew']),
      embedsP.catch(() => null),
    ]);
  const tour = tourRes.data as { id: string; name: string | null; workspace_id: string; artist_id: string | null; artist: { name: string | null } | { name: string | null }[] | null } | null;
  if (!tour) return null;
  const artist = Array.isArray(tour.artist) ? tour.artist[0] : tour.artist;

  const riders = ((ridersRes.data ?? []) as { id: string; kind: string; title: string | null }[])
    .filter((r): r is { id: string; kind: RiderKind; title: string | null } => (RIDER_KINDS as readonly string[]).includes(r.kind))
    .map((r) => ({ id: r.id, kind: r.kind, title: r.title ?? '' }))
    .sort((a, b) => RIDER_KINDS.indexOf(a.kind) - RIDER_KINDS.indexOf(b.kind));

  const latestRow = latestRes.data as (Record<string, unknown> & { snapshot: unknown }) | null;
  const advanceRecipients: RiderEditorData['advanceRecipients'] = {};
  for (const r of (intakeRes.data ?? []) as { routing_id: string | null; recipient_name: string | null; recipient_email: string | null }[]) {
    if (r.routing_id && r.recipient_email && !advanceRecipients[r.routing_id]) advanceRecipients[r.routing_id] = { name: r.recipient_name, email: r.recipient_email };
  }

  const blocks = ((blocksRes.data ?? []) as Record<string, unknown>[]).map(toBlock).filter((b): b is RiderBlock => !!b).sort(byPosition);
  const photoUrls = await signPhotos(service, tour.workspace_id, tour.id, photoPathsIn(blocks)).catch(() => ({}));

  return {
    tour: { id: tour.id, name: tour.name ?? 'Tour', workspaceId: tour.workspace_id, artistId: tour.artist_id, artistName: artist?.name ?? null },
    riders,
    blocks,
    party: { setting: (settingsRes.data as { party_size: number | null } | null)?.party_size ?? null, crew },
    latest: latestRow ? { ...toVersion(latestRow), snapshot: parseSnapshot(latestRow.snapshot) } : null,
    versions: ((versionsRes.data ?? []) as Record<string, unknown>[]).map(toVersion),
    shows,
    links: ((linksRes.data ?? []) as Record<string, unknown>[]).map(toLink),
    sends: ((sendsRes.data ?? []) as { link_id: string; version_id: string; sent_at: string }[]).map((s) => ({ linkId: s.link_id, versionId: s.version_id, sentAt: s.sent_at })),
    acks: ((acksRes.data ?? []) as Record<string, unknown>[]).map((a) => ({
      id: String(a.id),
      linkId: String(a.link_id),
      routingId: (a.routing_id as string | null) ?? null,
      versionId: String(a.version_id),
      name: String(a.name ?? ''),
      company: (a.company as string | null) ?? null,
      email: (a.email as string | null) ?? null,
      ackedAt: String(a.acked_at),
    })),
    replies: ((repliesRes.data ?? []) as Record<string, unknown>[]).map(toReply),
    states: ((statesRes.data ?? []) as { routing_id: string; block_id: string; state: LineState; note: string | null }[]).map((s) => ({
      routingId: s.routing_id,
      blockId: s.block_id,
      state: s.state,
      note: s.note,
    })),
    advanceRecipients,
    files: ((filesRes.data ?? []) as { id: string; file_name: string | null }[]).map((f) => ({ id: f.id, name: f.file_name || 'File' })),
    crew: crewList,
    has: { channelList: !!channel, stagePlot: !!plot },
    templates: ((templatesRes.data ?? []) as { id: string; name: string; kind: string; artist_id: string | null }[])
      .filter((t): t is { id: string; name: string; kind: RiderKind; artist_id: string | null } => (RIDER_KINDS as readonly string[]).includes(t.kind))
      .map((t) => ({ id: t.id, name: t.name, kind: t.kind, artistId: t.artist_id })),
    embeds: embeds ?? emptyEmbeds(),
    photoUrls,
  };
}
