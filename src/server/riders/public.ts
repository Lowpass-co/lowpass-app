/* ============================================
   LOWPASS — Riders: the promoter's side (rebuild, Nov 2026)

   /r/<token> — one show's live rider (or the whole tour's). The token IS
   the grant: everything here uses the service role, and every read and
   write is scoped by the link the token resolves to:
     · reads only the LATEST published version of that link's tour, filtered
       to that show's date; nothing unpublished is ever served;
     · an acknowledgement is for the version the promoter was looking at
       (a newer one in between → 409, read it first);
     · a reply must name a request line that is in that version, for that
       show; replies and acknowledgements are capped per link per hour;
     · an attachment is served only when that version lists it.
   An old builder link (rider_web_links) gets "this rider has moved".
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ROUTING_VENUE_SELECT } from '@/server/advance/board';
import { inForce, isUuid, requestLine } from '@/lib/riders/blocks';
import type { LineStateView } from '@/lib/riders/render';
import { photoPathsIn } from '@/lib/riders/photos';
import { parseSnapshot } from '@/lib/riders/snapshot';
import type { RiderChange, RiderSnapshot } from '@/lib/riders/types';
import { REPLY_COLS, VERSION_COLS, toReply, toShow, toVersion, type RiderReplyRow } from './data';
import { RiderError } from './errors';
import { signPhotos } from './photos';

export const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const ACKS_PER_HOUR = 20;
const REPLIES_PER_HOUR = 60;

export interface PublicVersion {
  id: string;
  label: string;
  publishedAt: string;
  note: string | null;
  changes: RiderChange[];
}

export interface PublicRider {
  linkId: string;
  tourId: string;
  artist: string | null;
  tourName: string;
  show: { routingId: string; date: string; venue: string | null; city: string | null } | null;
  /** Newest first; [0] is the version shown. Empty = nothing published yet. */
  versions: PublicVersion[];
  snapshot: RiderSnapshot | null;
  states: Record<string, LineStateView>;
  threads: Record<string, Pick<RiderReplyRow, 'id' | 'author' | 'name' | 'body' | 'createdAt'>[]>;
  acks: { versionId: string; versionLabel: string; name: string; company: string | null; ackedAt: string }[];
  /** Signed URLs for the version's item photos (this tour's only, ~1 h). */
  photos: Record<string, string>;
}

interface LinkRow {
  id: string;
  tour_id: string;
  workspace_id: string;
  routing_id: string | null;
}

async function linkFor(service: SupabaseClient, token: string): Promise<LinkRow | null> {
  if (!TOKEN_RE.test(token)) return null;
  const { data } = await service.from('rider_links').select('id, tour_id, workspace_id, routing_id').eq('token', token).is('revoked_at', null).maybeSingle();
  return (data as LinkRow | null) ?? null;
}

/** A live link from the OLD builder (rider_web_links). Channel-list documents
 *  still share through it (PackEditor's Share panel); a rider pack's link
 *  says the rider moved — forwarding to the tour's whole-tour link only when
 *  the old link had no password (forwarding would skip it). */
export interface OldPackLink {
  kind: 'rider' | 'channel_list' | 'stage_plot';
  tourId: string | null;
  hadPassword: boolean;
}

export async function oldPackLink(service: SupabaseClient, token: string): Promise<OldPackLink | null> {
  if (!token || token.length > 200) return null;
  const { data } = await service.from('rider_web_links').select('pack_id, password_hash, revoked_at').eq('token', token).maybeSingle();
  const link = data as { pack_id: string; password_hash: string | null; revoked_at: string | null } | null;
  if (!link || link.revoked_at) return null;
  const { data: pack } = await service.from('rider_packs').select('kind, tour_id').eq('id', link.pack_id).maybeSingle();
  const p = pack as { kind: string | null; tour_id: string | null } | null;
  if (!p) return null;
  const kind = p.kind === 'channel_list' || p.kind === 'stage_plot' ? p.kind : 'rider';
  return { kind, tourId: p.tour_id, hadPassword: !!link.password_hash };
}

/** The tour's live whole-tour link (no show), if the team has made one. */
export async function tourWideToken(service: SupabaseClient, tourId: string): Promise<string | null> {
  const { data } = await service
    .from('rider_links')
    .select('token')
    .eq('tour_id', tourId)
    .is('routing_id', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { token: string } | null)?.token ?? null;
}

export async function loadPublicRider(service: SupabaseClient, token: string, opts: { recordView: boolean }): Promise<PublicRider | null> {
  const link = await linkFor(service, token);
  if (!link) return null;
  const [tourRes, versionsRes, latestRes, showRes, statesRes, repliesRes, acksRes] = await Promise.all([
    service.from('tours').select('name, artist:artists(name)').eq('id', link.tour_id).maybeSingle(),
    service.from('rider_versions').select(VERSION_COLS).eq('tour_id', link.tour_id).order('major', { ascending: false }).order('minor', { ascending: false }).limit(30),
    service.from('rider_versions').select('id, snapshot').eq('tour_id', link.tour_id).order('major', { ascending: false }).order('minor', { ascending: false }).limit(1).maybeSingle(),
    link.routing_id ? service.from('routing').select(`${ROUTING_VENUE_SELECT}, tour_id`).eq('id', link.routing_id).maybeSingle() : Promise.resolve({ data: null }),
    link.routing_id ? service.from('rider_line_states').select('block_id, state, note').eq('routing_id', link.routing_id) : Promise.resolve({ data: [] }),
    service.from('rider_replies').select(REPLY_COLS).eq('link_id', link.id).order('created_at', { ascending: true }).limit(1000),
    service.from('rider_acks').select('version_id, name, company, acked_at').eq('link_id', link.id).order('acked_at', { ascending: false }).limit(50),
  ]);
  const t = tourRes.data as { name: string | null; artist: { name: string | null } | { name: string | null }[] | null } | null;
  if (!t) return null;
  const artist = Array.isArray(t.artist) ? t.artist[0] : t.artist;
  const versions: PublicVersion[] = ((versionsRes.data ?? []) as Record<string, unknown>[]).map((r) => {
    const v = toVersion(r);
    return { id: v.id, label: v.label, publishedAt: v.publishedAt, note: v.note, changes: v.changes };
  });
  const latest = latestRes.data as { id: string; snapshot: unknown } | null;
  const snapshot = latest ? parseSnapshot(latest.snapshot) : null;
  const show = showRes.data ? toShow(showRes.data as Parameters<typeof toShow>[0]) : null;
  const states: Record<string, LineStateView> = {};
  for (const s of (statesRes.data ?? []) as { block_id: string; state: LineStateView['state']; note: string | null }[]) states[s.block_id] = { state: s.state, note: s.note };
  const threads: PublicRider['threads'] = {};
  for (const r of ((repliesRes.data ?? []) as Record<string, unknown>[]).map(toReply)) {
    (threads[r.blockId] ??= []).push({ id: r.id, author: r.author, name: r.name, body: r.body, createdAt: r.createdAt });
  }
  const label = new Map(versions.map((v) => [v.id, v.label]));
  const acks = ((acksRes.data ?? []) as { version_id: string; name: string; company: string | null; acked_at: string }[]).map((a) => ({
    versionId: a.version_id,
    versionLabel: label.get(a.version_id) ?? '?',
    name: a.name,
    company: a.company,
    ackedAt: a.acked_at,
  }));
  const photos = snapshot ? await signPhotos(service, link.workspace_id, link.tour_id, photoPathsIn(snapshot.docs.flatMap((d) => d.blocks))) : {};
  if (opts.recordView) {
    // Best-effort: a view never blocks the page.
    const { data: cur } = await service.from('rider_links').select('view_count').eq('id', link.id).maybeSingle();
    await service
      .from('rider_links')
      .update({ last_viewed_at: new Date().toISOString(), view_count: ((cur as { view_count: number } | null)?.view_count ?? 0) + 1, last_viewed_version_id: latest?.id ?? null })
      .eq('id', link.id)
      .then(
        () => null,
        () => null,
      );
  }
  return {
    linkId: link.id,
    tourId: link.tour_id,
    artist: artist?.name ?? null,
    tourName: t.name ?? 'Tour',
    show: show ? { routingId: show.routingId, date: show.date, venue: show.venue, city: show.city } : null,
    versions,
    snapshot,
    states,
    threads,
    acks,
    photos,
  };
}

async function capped(service: SupabaseClient, table: 'rider_acks' | 'rider_replies', linkId: string, limit: number): Promise<boolean> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await service
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('link_id', linkId)
    .gte(table === 'rider_acks' ? 'acked_at' : 'created_at', since);
  return (count ?? 0) >= limit;
}

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export async function ackPublic(service: SupabaseClient, token: string, input: { versionId?: unknown; name?: unknown; company?: unknown; email?: unknown }) {
  const link = await linkFor(service, token);
  if (!link) throw new RiderError(404, 'This link isn’t active any more — ask the tour manager for a new one.');
  const name = clean(input.name, 120);
  if (!name) throw new RiderError(400, 'Your name, please');
  const email = clean(input.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RiderError(400, 'That email doesn’t look right');
  const { data: latest } = await service.from('rider_versions').select('id, major, minor').eq('tour_id', link.tour_id).order('major', { ascending: false }).order('minor', { ascending: false }).limit(1).maybeSingle();
  if (!latest) throw new RiderError(409, 'Nothing has been published yet.');
  const l = latest as { id: string; major: number; minor: number };
  if (input.versionId !== l.id) throw new RiderError(409, `A newer version (${l.major}.${l.minor}) was just published — have a look, then acknowledge that one.`, 'NEWER');
  if (await capped(service, 'rider_acks', link.id, ACKS_PER_HOUR)) throw new RiderError(429, 'Too many acknowledgements from this link — try again later.');
  const { error } = await service
    .from('rider_acks')
    .insert({ workspace_id: link.workspace_id, tour_id: link.tour_id, link_id: link.id, routing_id: link.routing_id, version_id: l.id, name, company: clean(input.company, 120) || null, email: email || null });
  if (error) throw new RiderError(500, 'Couldn’t save that — try again.');
  return { versionId: l.id, label: `${l.major}.${l.minor}` };
}

export async function replyPublic(service: SupabaseClient, token: string, input: { blockId?: unknown; body?: unknown; name?: unknown }) {
  const link = await linkFor(service, token);
  if (!link) throw new RiderError(404, 'This link isn’t active any more — ask the tour manager for a new one.');
  if (!isUuid(input.blockId)) throw new RiderError(400, 'Which line?');
  const body = typeof input.body === 'string' ? input.body.trim().slice(0, 2000) : '';
  if (!body) throw new RiderError(400, 'Write a reply');
  const [{ data: latest }, showRes] = await Promise.all([
    service.from('rider_versions').select('id, snapshot').eq('tour_id', link.tour_id).order('major', { ascending: false }).order('minor', { ascending: false }).limit(1).maybeSingle(),
    link.routing_id ? service.from('routing').select('date').eq('id', link.routing_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!latest) throw new RiderError(409, 'Nothing has been published yet.');
  const snap = parseSnapshot((latest as { snapshot: unknown }).snapshot);
  const date = (showRes.data as { date: string | null } | null)?.date ?? null;
  const block = snap.docs.flatMap((d) => d.blocks).find((b) => b.id === input.blockId && b.kind === 'request' && inForce(b, date));
  if (!block || block.kind !== 'request') throw new RiderError(404, 'That line has changed since this page opened.', 'GONE');
  if (await capped(service, 'rider_replies', link.id, REPLIES_PER_HOUR)) throw new RiderError(429, 'Too many replies from this link — try again later.');
  const { data, error } = await service
    .from('rider_replies')
    .insert({
      workspace_id: link.workspace_id,
      tour_id: link.tour_id,
      link_id: link.id,
      routing_id: link.routing_id,
      block_id: block.id,
      line: requestLine(block.content, snap.party).slice(0, 300),
      version_id: (latest as { id: string }).id,
      author: 'venue',
      name: clean(input.name, 120) || null,
      body,
    })
    .select(REPLY_COLS)
    .single();
  if (error || !data) throw new RiderError(500, 'Couldn’t send that — try again.');
  const r = toReply(data as Record<string, unknown>);
  return { id: r.id, author: r.author, name: r.name, body: r.body, createdAt: r.createdAt };
}

/** The attachment a link may serve, from its latest version only. */
export async function publicAttachment(service: SupabaseClient, token: string, kind: unknown, id: unknown) {
  const link = await linkFor(service, token);
  if (!link) throw new RiderError(404, 'This link isn’t active any more.');
  const { data: latest } = await service.from('rider_versions').select('snapshot').eq('tour_id', link.tour_id).order('major', { ascending: false }).order('minor', { ascending: false }).limit(1).maybeSingle();
  if (!latest) throw new RiderError(404, 'Nothing published yet.');
  const snap = parseSnapshot((latest as { snapshot: unknown }).snapshot);
  const att = snap.attachments.find((a) => a.kind === kind && a.id && (kind !== 'file' || a.id === id));
  if (!att?.id) throw new RiderError(404, 'That attachment isn’t part of this rider.');
  return { link, attachment: att, snapshot: snap };
}

/** The latest published rider for one show, read-only — the legacy show link
 *  (/s/<token>, its own token + password gate) renders it in its Rider tab.
 *  `linkToken` is that show's live /r/ link (else the tour-wide one) when the
 *  team has made one: acknowledge, reply and the PDF live there. Writes nothing. */
export interface ShowRider {
  version: { label: string; publishedAt: string };
  snapshot: RiderSnapshot;
  states: Record<string, LineStateView>;
  date: string | null;
  routingId: string;
  linkToken: string | null;
  photos: Record<string, string>;
}

export async function loadShowRider(service: SupabaseClient, tourId: string, routingId: string): Promise<ShowRider | null> {
  const [latestRes, showRes, statesRes, linksRes, tourRes] = await Promise.all([
    service.from('rider_versions').select('major, minor, published_at, snapshot').eq('tour_id', tourId).order('major', { ascending: false }).order('minor', { ascending: false }).limit(1).maybeSingle(),
    service.from('routing').select('date').eq('id', routingId).eq('tour_id', tourId).maybeSingle(),
    service.from('rider_line_states').select('block_id, state, note').eq('tour_id', tourId).eq('routing_id', routingId),
    service.from('rider_links').select('token, routing_id').eq('tour_id', tourId).is('revoked_at', null).order('created_at', { ascending: false }).limit(200),
    service.from('tours').select('workspace_id').eq('id', tourId).maybeSingle(),
  ]);
  const latest = latestRes.data as { major: number; minor: number; published_at: string; snapshot: unknown } | null;
  if (!latest) return null;
  const states: Record<string, LineStateView> = {};
  for (const s of (statesRes.data ?? []) as { block_id: string; state: LineStateView['state']; note: string | null }[]) states[s.block_id] = { state: s.state, note: s.note };
  const links = (linksRes.data ?? []) as { token: string; routing_id: string | null }[];
  const link = links.find((l) => l.routing_id === routingId) ?? links.find((l) => l.routing_id === null) ?? null;
  const snapshot = parseSnapshot(latest.snapshot);
  const ws = (tourRes.data as { workspace_id: string } | null)?.workspace_id;
  return {
    version: { label: `${latest.major}.${latest.minor}`, publishedAt: latest.published_at },
    snapshot,
    states,
    date: (showRes.data as { date: string | null } | null)?.date ?? null,
    routingId,
    linkToken: link?.token ?? null,
    photos: ws ? await signPhotos(service, ws, tourId, photoPathsIn(snapshot.docs.flatMap((d) => d.blocks))) : {},
  };
}
