/* ============================================
   LOWPASS — Riders: writing (rebuild, Nov 2026 — migration 301)

   Every write goes through the caller's client, so the database's
   production-area rules decide who may (the routes check requireWrite first
   for a clear 403). Block content always passes parseContent; positions are
   checked keys. A block saves against its version: a stale save gets
   RiderError 409 with the block as it is now, and the editor asks whose wins.
   ============================================ */

import { randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBlockKind, isUuid, parseContent, parseDates } from '@/lib/riders/blocks';
import { isPositionKey, keyBetween } from '@/lib/riders/position';
import { attachmentsWanted, buildSnapshot, parseSnapshot, toSnapDoc } from '@/lib/riders/snapshot';
import { parseTemplateBlocks, placeBlocks, starterById, type TemplateBlock } from '@/lib/riders/starters';
import { diffSnapshots, nextVersion, showsAffected, versionLabel } from '@/lib/riders/summary';
import { RIDER_DEFAULT_TITLE, RIDER_KINDS, type BlockKind, type LineState, type ResolvedAttachment, type RiderBlock, type RiderKind, type RiderSnapshot, type SnapDoc } from '@/lib/riders/types';
import {
  BLOCK_COLS,
  LINK_COLS,
  REPLY_COLS,
  VERSION_COLS,
  crewCount,
  loadRiderShows,
  toBlock,
  toLink,
  toReply,
  toVersion,
  tourHasChannelList,
  tourStagePlot,
  type RiderLinkRow,
  type RiderReplyRow,
  type RiderVersionMeta,
} from './data';

export class RiderError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public data?: unknown,
  ) {
    super(message);
  }
}

const isKind = (v: unknown): v is RiderKind => typeof v === 'string' && (RIDER_KINDS as readonly string[]).includes(v);
export const newToken = (): string => randomBytes(24).toString('base64url');

function fail(error: { message?: string; code?: string } | null, what: string): never {
  if (error?.code === '42501' || /row-level security/i.test(error?.message ?? '')) throw new RiderError(403, 'You can view this rider but not change it.');
  throw new RiderError(500, `Couldn’t ${what}${error?.message ? ` (${error.message})` : ''}`);
}

/* ---------- documents ---------- */

export async function ensureRider(client: SupabaseClient, tourId: string, workspaceId: string, kind: RiderKind, userId: string, title?: string): Promise<string> {
  const { data: have } = await client.from('riders').select('id').eq('tour_id', tourId).eq('kind', kind).maybeSingle();
  if (have) return (have as { id: string }).id;
  const { data, error } = await client
    .from('riders')
    .insert({ workspace_id: workspaceId, tour_id: tourId, kind, title: (title ?? '').trim().slice(0, 200) || RIDER_DEFAULT_TITLE[kind], created_by: userId })
    .select('id')
    .single();
  if (error?.code === '23505') {
    const { data: again } = await client.from('riders').select('id').eq('tour_id', tourId).eq('kind', kind).maybeSingle();
    if (again) return (again as { id: string }).id;
  }
  if (error || !data) fail(error, 'create the rider');
  return (data as { id: string }).id;
}

export async function setTitle(client: SupabaseClient, tourId: string, riderId: string, title: string): Promise<void> {
  const { error, data } = await client.from('riders').update({ title: title.trim().slice(0, 200), updated_at: new Date().toISOString() }).eq('id', riderId).eq('tour_id', tourId).select('id');
  if (error) fail(error, 'rename the rider');
  if (!data?.length) throw new RiderError(404, 'Rider not found');
}

export async function setParty(client: SupabaseClient, tourId: string, workspaceId: string, size: number | null, userId: string): Promise<void> {
  const party = size === null ? null : Math.min(999, Math.max(1, Math.floor(size)));
  const { error } = await client
    .from('rider_settings')
    .upsert({ tour_id: tourId, workspace_id: workspaceId, party_size: party, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'tour_id' });
  if (error) fail(error, 'save the touring party');
}

/* ---------- blocks ---------- */

export interface BlockInput {
  id?: unknown;
  kind?: unknown;
  content?: unknown;
  position?: unknown;
  from?: unknown;
  until?: unknown;
}

function blockRow(riderId: string, b: BlockInput, userId: string) {
  if (!isBlockKind(b.kind)) throw new RiderError(400, 'Unknown block kind');
  if (!isPositionKey(b.position)) throw new RiderError(400, 'Bad position');
  const d = parseDates(b.from, b.until);
  return {
    ...(isUuid(b.id) ? { id: b.id } : {}),
    // workspace_id / tour_id: the database copies them from the rider (trigger, 301).
    rider_id: riderId,
    kind: b.kind,
    content: parseContent(b.kind, b.content),
    position: b.position,
    applies_from: d.from,
    applies_until: d.until,
    updated_by: userId,
  };
}

async function riderOnTour(client: SupabaseClient, tourId: string, riderId: unknown): Promise<string> {
  if (!isUuid(riderId)) throw new RiderError(400, 'Which rider?');
  const { data } = await client.from('riders').select('id').eq('id', riderId).eq('tour_id', tourId).maybeSingle();
  if (!data) throw new RiderError(404, 'Rider not found');
  return riderId;
}

export async function insertBlocks(client: SupabaseClient, tourId: string, riderIdRaw: unknown, blocks: BlockInput[], userId: string): Promise<RiderBlock[]> {
  if (!Array.isArray(blocks) || !blocks.length || blocks.length > 500) throw new RiderError(400, 'Send 1–500 blocks');
  const riderId = await riderOnTour(client, tourId, riderIdRaw);
  const rows = blocks.map((b) => blockRow(riderId, b, userId));
  const { data, error } = await client.from('rider_blocks').insert(rows).select(BLOCK_COLS);
  if (error?.code === '23505') throw new RiderError(409, 'That block already exists — reload.', 'DUPLICATE');
  if (error) fail(error, 'add to the rider');
  return ((data ?? []) as Record<string, unknown>[]).map(toBlock).filter((b): b is RiderBlock => !!b);
}

export interface BlockPatch {
  id?: unknown;
  ifVersion?: unknown;
  kind?: unknown;
  content?: unknown;
  position?: unknown;
  from?: unknown;
  until?: unknown;
}

export async function updateBlock(client: SupabaseClient, tourId: string, p: BlockPatch, userId: string): Promise<RiderBlock> {
  if (!isUuid(p.id)) throw new RiderError(400, 'Which block?');
  const ifVersion = Number(p.ifVersion);
  if (!Number.isInteger(ifVersion) || ifVersion < 1) throw new RiderError(400, 'Missing version');
  const set: Record<string, unknown> = { updated_by: userId };
  let kind: BlockKind | null = null;
  if (p.kind !== undefined) {
    if (!isBlockKind(p.kind)) throw new RiderError(400, 'Unknown block kind');
    kind = p.kind;
    set.kind = p.kind;
  }
  if (p.content !== undefined) {
    if (!kind) {
      const { data } = await client.from('rider_blocks').select('kind').eq('id', p.id).eq('tour_id', tourId).maybeSingle();
      if (!data) throw new RiderError(404, 'Block not found');
      kind = (data as { kind: BlockKind }).kind;
    }
    set.content = parseContent(kind, p.content);
  } else if (kind) set.content = parseContent(kind, {});
  if (p.position !== undefined) {
    if (!isPositionKey(p.position)) throw new RiderError(400, 'Bad position');
    set.position = p.position;
  }
  if (p.from !== undefined || p.until !== undefined) {
    const d = parseDates(p.from, p.until);
    set.applies_from = d.from;
    set.applies_until = d.until;
  }
  const { data, error } = await client.from('rider_blocks').update(set).eq('id', p.id).eq('tour_id', tourId).eq('version', ifVersion).select(BLOCK_COLS).maybeSingle();
  if (error) fail(error, 'save');
  if (data) return toBlock(data as Record<string, unknown>)!;
  const { data: now } = await client.from('rider_blocks').select(BLOCK_COLS).eq('id', p.id).eq('tour_id', tourId).maybeSingle();
  if (!now) throw new RiderError(404, 'That block was deleted', 'GONE');
  throw new RiderError(409, 'Someone changed this a moment ago', 'STALE', toBlock(now as Record<string, unknown>));
}

export async function deleteBlocks(client: SupabaseClient, tourId: string, ids: unknown[]): Promise<number> {
  const list = (Array.isArray(ids) ? ids : []).filter(isUuid).slice(0, 500);
  if (!list.length) throw new RiderError(400, 'Which blocks?');
  const { data, error } = await client.from('rider_blocks').delete().in('id', list).eq('tour_id', tourId).select('id');
  if (error) fail(error, 'delete');
  return data?.length ?? 0;
}

/* ---------- templates ---------- */

export type StartSource = { starter: string } | { template: string } | { rider: string } | { blank: true };

async function sourceBlocks(client: SupabaseClient, source: StartSource): Promise<{ blocks: TemplateBlock[]; title: string | null }> {
  if ('blank' in source) return { blocks: [], title: null };
  if ('starter' in source) {
    const s = starterById(source.starter);
    if (!s) throw new RiderError(404, 'Template not found');
    return { blocks: s.blocks, title: null };
  }
  if ('template' in source) {
    if (!isUuid(source.template)) throw new RiderError(400, 'Which template?');
    const { data } = await client.from('rider_templates').select('blocks').eq('id', source.template).maybeSingle();
    if (!data) throw new RiderError(404, 'Template not found');
    return { blocks: parseTemplateBlocks((data as { blocks: unknown }).blocks), title: null };
  }
  if (!isUuid(source.rider)) throw new RiderError(400, 'Which rider?');
  const [{ data: rider }, { data: rows }] = await Promise.all([
    client.from('riders').select('title').eq('id', source.rider).maybeSingle(),
    client.from('rider_blocks').select(BLOCK_COLS).eq('rider_id', source.rider).limit(5000),
  ]);
  if (!rider) throw new RiderError(404, 'Rider not found');
  const blocks = ((rows ?? []) as Record<string, unknown>[])
    .map(toBlock)
    .filter((b): b is RiderBlock => !!b)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
    // Another tour's dates mean nothing here.
    .map((b) => ({ kind: b.kind, content: b.content, from: null, until: null }) as TemplateBlock);
  return { blocks, title: (rider as { title: string | null }).title };
}

/** Fill a document from a starter / template / another tour's rider / blank.
 *  replace: delete what's there first; else the blocks go after it. */
export async function startFrom(
  client: SupabaseClient,
  tourId: string,
  workspaceId: string,
  kindRaw: unknown,
  source: StartSource,
  opts: { replace: boolean; userId: string },
): Promise<string> {
  if (!isKind(kindRaw)) throw new RiderError(400, 'Tech or Hospitality?');
  const { blocks, title } = await sourceBlocks(client, source);
  const riderId = await ensureRider(client, tourId, workspaceId, kindRaw, opts.userId, title ?? undefined);
  let after: string | null = null;
  if (opts.replace) {
    const { error } = await client.from('rider_blocks').delete().eq('rider_id', riderId);
    if (error) fail(error, 'clear the rider');
  } else {
    const { data } = await client.from('rider_blocks').select('position').eq('rider_id', riderId).order('position', { ascending: false }).limit(1);
    after = ((data ?? []) as { position: string }[])[0]?.position ?? null;
  }
  if (blocks.length) {
    const rows = placeBlocks(blocks, () => randomUUID(), after, null);
    await insertBlocks(
      client,
      tourId,
      riderId,
      rows.map((r) => ({ id: r.id, kind: r.kind, content: r.content, position: r.position, from: r.from, until: r.until })),
      opts.userId,
    );
  }
  return riderId;
}

export async function saveAsTemplate(client: SupabaseClient, tourId: string, workspaceId: string, riderIdRaw: unknown, nameRaw: unknown, userId: string): Promise<string> {
  const riderId = await riderOnTour(client, tourId, riderIdRaw);
  const name = typeof nameRaw === 'string' ? nameRaw.trim().slice(0, 120) : '';
  if (!name) throw new RiderError(400, 'Give the template a name');
  const [{ data: rider }, { data: rows }, { data: tour }] = await Promise.all([
    client.from('riders').select('kind').eq('id', riderId).maybeSingle(),
    client.from('rider_blocks').select(BLOCK_COLS).eq('rider_id', riderId).limit(5000),
    client.from('tours').select('artist_id').eq('id', tourId).maybeSingle(),
  ]);
  const blocks = ((rows ?? []) as Record<string, unknown>[])
    .map(toBlock)
    .filter((b): b is RiderBlock => !!b)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
    .map((b) => ({ kind: b.kind, content: b.content }));
  const { data, error } = await client
    .from('rider_templates')
    .insert({ workspace_id: workspaceId, name, kind: (rider as { kind: RiderKind } | null)?.kind ?? 'tech', artist_id: (tour as { artist_id: string | null } | null)?.artist_id ?? null, blocks, created_by: userId })
    .select('id')
    .single();
  if (error || !data) fail(error, 'save the template');
  return (data as { id: string }).id;
}

/* ---------- publish ---------- */

export async function resolveAttachments(client: SupabaseClient, tourId: string, docs: readonly SnapDoc[]): Promise<ResolvedAttachment[]> {
  const want = attachmentsWanted(docs);
  const [channel, plot, files] = await Promise.all([
    want.channelList ? tourHasChannelList(client, tourId) : Promise.resolve(null),
    want.stagePlot ? tourStagePlot(client, tourId) : Promise.resolve(null),
    want.fileIds.length
      ? client.from('file_references').select('id, file_name').in('id', want.fileIds).eq('linked_to_type', 'tour').eq('linked_to_id', tourId)
      : Promise.resolve({ data: [] as { id: string; file_name: string | null }[] }),
  ]);
  const out: ResolvedAttachment[] = [];
  if (want.channelList) out.push({ kind: 'channel_list', id: channel ? tourId : null, label: 'Input list' });
  if (want.stagePlot) out.push({ kind: 'stage_plot', id: plot?.id ?? null, label: 'Stage plot' });
  for (const f of ((files as { data: unknown }).data ?? []) as { id: string; file_name: string | null }[]) out.push({ kind: 'file', id: f.id, label: f.file_name || 'File' });
  return out;
}

/** The documents as they stand (the draft), ready to freeze. */
export async function draftSnapshot(client: SupabaseClient, tourId: string): Promise<RiderSnapshot> {
  const [{ data: tour }, { data: riders }, { data: rows }, { data: settings }, crew] = await Promise.all([
    client.from('tours').select('name, artist:artists(name)').eq('id', tourId).maybeSingle(),
    client.from('riders').select('id, kind, title').eq('tour_id', tourId),
    client.from('rider_blocks').select(BLOCK_COLS).eq('tour_id', tourId).limit(5000),
    client.from('rider_settings').select('party_size').eq('tour_id', tourId).maybeSingle(),
    crewCount(client, tourId),
  ]);
  if (!tour) throw new RiderError(404, 'Tour not found');
  const t = tour as { name: string | null; artist: { name: string | null } | { name: string | null }[] | null };
  const artist = Array.isArray(t.artist) ? t.artist[0] : t.artist;
  const blocks = ((rows ?? []) as Record<string, unknown>[]).map(toBlock).filter((b): b is RiderBlock => !!b);
  const docs = ((riders ?? []) as { id: string; kind: string; title: string | null }[])
    .filter((r) => isKind(r.kind))
    .map((r) => toSnapDoc({ kind: r.kind as RiderKind, title: r.title ?? '' }, blocks.filter((b) => b.riderId === r.id)));
  const setting = (settings as { party_size: number | null } | null)?.party_size ?? null;
  return buildSnapshot({
    tourName: t.name ?? 'Tour',
    artistName: artist?.name ?? null,
    party: setting ?? (crew > 0 ? crew : null),
    docs,
    attachments: await resolveAttachments(client, tourId, docs),
  });
}

export async function latestVersion(client: SupabaseClient, tourId: string): Promise<(RiderVersionMeta & { snapshot: RiderSnapshot }) | null> {
  const { data } = await client
    .from('rider_versions')
    .select(`${VERSION_COLS}, snapshot`)
    .eq('tour_id', tourId)
    .order('major', { ascending: false })
    .order('minor', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return { ...toVersion(row), snapshot: parseSnapshot(row.snapshot) };
}

export async function publish(
  client: SupabaseClient,
  tourId: string,
  workspaceId: string,
  input: { bump?: unknown; note?: unknown },
  userId: string,
): Promise<{ version: RiderVersionMeta; affected: string[] }> {
  const [next, prev, shows] = await Promise.all([draftSnapshot(client, tourId), latestVersion(client, tourId), loadRiderShows(client, tourId)]);
  if (!next.docs.some((d) => d.blocks.length)) throw new RiderError(400, 'There’s nothing in the rider to publish yet.', 'EMPTY');
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (prev && same({ d: prev.snapshot.docs, p: prev.snapshot.party, a: prev.snapshot.attachments }, { d: next.docs, p: next.party, a: next.attachments })) {
    throw new RiderError(409, `Nothing has changed since version ${prev.label}.`, 'UNCHANGED');
  }
  const bump = input.bump === 'major' ? 'major' : 'minor';
  const v = nextVersion(prev ? { major: prev.major, minor: prev.minor } : null, bump);
  const changes = diffSnapshots(prev?.snapshot ?? null, next);
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) || null : null;
  const { data, error } = await client
    .from('rider_versions')
    .insert({ workspace_id: workspaceId, tour_id: tourId, major: v.major, minor: v.minor, note, changes, snapshot: next, published_by: userId })
    .select(VERSION_COLS)
    .single();
  if (error?.code === '23505') throw new RiderError(409, `Someone just published version ${versionLabel(v)} — reload to see it.`, 'RACE');
  if (error || !data) fail(error, 'publish');
  const today = new Date().toISOString().slice(0, 10);
  const affected = showsAffected(prev?.snapshot ?? null, next, shows, today).map((s) => s.routingId);
  return { version: toVersion(data as Record<string, unknown>), affected };
}

/* ---------- links, sends, replies, settled lines ---------- */

export async function ensureLinks(client: SupabaseClient, tourId: string, workspaceId: string, routingIds: unknown[], userId: string): Promise<RiderLinkRow[]> {
  const wanted = [...new Set((Array.isArray(routingIds) ? routingIds : []).map((r) => (r === null ? null : isUuid(r) ? r : undefined)))].filter((r): r is string | null => r !== undefined).slice(0, 300);
  if (!wanted.length) throw new RiderError(400, 'Which shows?');
  const { data: live } = await client.from('rider_links').select(LINK_COLS).eq('tour_id', tourId).is('revoked_at', null);
  const have = ((live ?? []) as Record<string, unknown>[]).map(toLink);
  const missing = wanted.filter((r) => !have.some((l) => l.routingId === r));
  if (missing.length) {
    const { error } = await client
      .from('rider_links')
      .insert(missing.map((routing_id) => ({ workspace_id: workspaceId, tour_id: tourId, routing_id, token: newToken(), created_by: userId })));
    if (error && error.code !== '23505') fail(error, 'make the link');
    const { data: again } = await client.from('rider_links').select(LINK_COLS).eq('tour_id', tourId).is('revoked_at', null);
    return ((again ?? []) as Record<string, unknown>[]).map(toLink).filter((l) => wanted.includes(l.routingId));
  }
  return have.filter((l) => wanted.includes(l.routingId));
}

/** Turn a link off and make the show a fresh one (the old URL stops working). */
export async function replaceLink(client: SupabaseClient, tourId: string, workspaceId: string, linkId: unknown, userId: string): Promise<RiderLinkRow> {
  if (!isUuid(linkId)) throw new RiderError(400, 'Which link?');
  const { data: old, error } = await client.from('rider_links').update({ revoked_at: new Date().toISOString() }).eq('id', linkId).eq('tour_id', tourId).is('revoked_at', null).select('routing_id, recipient_name, recipient_email').maybeSingle();
  if (error) fail(error, 'turn the link off');
  if (!old) throw new RiderError(404, 'Link not found');
  const o = old as { routing_id: string | null; recipient_name: string | null; recipient_email: string | null };
  const { data, error: e2 } = await client
    .from('rider_links')
    .insert({ workspace_id: workspaceId, tour_id: tourId, routing_id: o.routing_id, token: newToken(), recipient_name: o.recipient_name, recipient_email: o.recipient_email, created_by: userId })
    .select(LINK_COLS)
    .single();
  if (e2 || !data) fail(e2, 'make the new link');
  return toLink(data as Record<string, unknown>);
}

export async function recordSends(
  client: SupabaseClient,
  tourId: string,
  workspaceId: string,
  sends: { linkId?: unknown; versionId?: unknown; email?: unknown; name?: unknown }[],
  userId: string,
): Promise<number> {
  const list = (Array.isArray(sends) ? sends : []).filter((s) => isUuid(s.linkId) && isUuid(s.versionId)).slice(0, 300);
  if (!list.length) throw new RiderError(400, 'Nothing to record');
  const { data: links } = await client.from('rider_links').select('id, routing_id').eq('tour_id', tourId).in('id', list.map((s) => s.linkId as string));
  const routing = new Map(((links ?? []) as { id: string; routing_id: string | null }[]).map((l) => [l.id, l.routing_id]));
  const rows = list
    .filter((s) => routing.has(s.linkId as string))
    .map((s) => ({
      workspace_id: workspaceId,
      tour_id: tourId,
      link_id: s.linkId,
      routing_id: routing.get(s.linkId as string) ?? null,
      version_id: s.versionId,
      recipient_email: typeof s.email === 'string' ? s.email.trim().slice(0, 200) || null : null,
      sent_by: userId,
    }));
  if (!rows.length) throw new RiderError(404, 'Link not found');
  const { error } = await client.from('rider_sends').insert(rows);
  if (error) fail(error, 'record the send');
  // Remember who it went to, for next time.
  await Promise.all(
    list
      .filter((s) => typeof s.email === 'string' && s.email.trim())
      .map((s) =>
        client
          .from('rider_links')
          .update({ recipient_email: (s.email as string).trim().slice(0, 200), ...(typeof s.name === 'string' ? { recipient_name: s.name.trim().slice(0, 120) || null } : {}) })
          .eq('id', s.linkId as string)
          .eq('tour_id', tourId),
      ),
  );
  return rows.length;
}

export async function answerReply(
  client: SupabaseClient,
  tourId: string,
  workspaceId: string,
  input: { linkId?: unknown; blockId?: unknown; body?: unknown },
  user: { id: string; name: string | null },
): Promise<RiderReplyRow> {
  if (!isUuid(input.linkId) || !isUuid(input.blockId)) throw new RiderError(400, 'Which line?');
  const body = typeof input.body === 'string' ? input.body.trim().slice(0, 2000) : '';
  if (!body) throw new RiderError(400, 'Write a reply');
  const { data: first } = await client.from('rider_replies').select('routing_id, line').eq('tour_id', tourId).eq('link_id', input.linkId).eq('block_id', input.blockId).limit(1).maybeSingle();
  if (!first) throw new RiderError(404, 'Thread not found');
  const f = first as { routing_id: string | null; line: string };
  const { data, error } = await client
    .from('rider_replies')
    .insert({ workspace_id: workspaceId, tour_id: tourId, link_id: input.linkId, routing_id: f.routing_id, block_id: input.blockId, line: f.line, author: 'tour', name: user.name, body, created_by: user.id })
    .select(REPLY_COLS)
    .single();
  if (error || !data) fail(error, 'send the reply');
  return toReply(data as Record<string, unknown>);
}

export async function resolveThread(client: SupabaseClient, tourId: string, input: { linkId?: unknown; blockId?: unknown; reopen?: unknown }, userId: string): Promise<void> {
  if (!isUuid(input.linkId) || !isUuid(input.blockId)) throw new RiderError(400, 'Which line?');
  const reopen = input.reopen === true;
  const { error } = await client
    .from('rider_replies')
    .update(reopen ? { resolved_at: null, resolved_by: null } : { resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq('tour_id', tourId)
    .eq('link_id', input.linkId)
    .eq('block_id', input.blockId);
  if (error) fail(error, 'update the thread');
}

export async function setLineState(
  client: SupabaseClient,
  tourId: string,
  workspaceId: string,
  input: { routingId?: unknown; blockId?: unknown; state?: unknown; note?: unknown },
  userId: string,
): Promise<void> {
  if (!isUuid(input.routingId) || !isUuid(input.blockId)) throw new RiderError(400, 'Which line and show?');
  if (input.state === null) {
    const { error } = await client.from('rider_line_states').delete().eq('tour_id', tourId).eq('routing_id', input.routingId).eq('block_id', input.blockId);
    if (error) fail(error, 'clear the line');
    return;
  }
  const state = (['confirmed', 'substitute', 'cut'] as LineState[]).find((s) => s === input.state);
  if (!state) throw new RiderError(400, 'Confirmed, substitute or cut?');
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 300) || null : null;
  const { error } = await client
    .from('rider_line_states')
    .upsert(
      { workspace_id: workspaceId, tour_id: tourId, routing_id: input.routingId, block_id: input.blockId, state, note, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: 'routing_id,block_id' },
    );
  if (error) fail(error, 'save the line');
}

/** A new block id + key at the end of a rider (used by bring-over). */
export function tailKey(last: string | null): string {
  return keyBetween(last, null);
}
