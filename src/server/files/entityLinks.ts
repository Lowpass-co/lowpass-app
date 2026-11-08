/* ============================================
   LOWPASS — files linked to shows, venues and people (Nov 2026, Adam)

   file_entity_links (migration 283) says "also show this file here". A file
   still lives in tour Files (file_references.linked_to_*); a link never moves
   or copies it, and unlinking never deletes it.

   What each page shows (linkedFiles):
     show   → files linked to the show
              + files linked to its venue, from ANY tour in this workspace
              + files that were uploaded onto the show itself (linked_to routing)
     venue  → files linked to the venue
     person → files linked to the person
   Each file says which tour it came from, so a venue pack from last year's
   run is obvious.

   Every function takes the caller's session client (RLS) AND checks
   workspace_id explicitly — canonical_venues is shared across workspaces, so a
   venue id alone must never be enough to see anything.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveVenue, type CanonicalVenueRow, type RoutingVenueSource } from '@/lib/venues/resolveVenue';

export type EntityType = 'show' | 'venue' | 'person';
export const ENTITY_TYPES: readonly EntityType[] = ['show', 'venue', 'person'];

export class LinkError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface LinkedFile {
  id: string;
  name: string;
  size: number;
  type: string | null;
  addedAt: string;
  bucket: string | null;
  path: string | null;
  tourId: string | null;
  tourName: string | null;
  /** Why it's on this page. 'home' = uploaded onto the show itself. */
  via: EntityType | 'home';
  /** The link to remove with × (null for 'home' files, which aren't links). */
  linkId: string | null;
}

interface FileRow {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number;
  storage_provider: string | null;
  provider_file_id: string | null;
  linked_to_type: string;
  linked_to_id: string | null;
  created_at: string;
}

const FILE_COLS = 'id, file_name, file_type, file_size, storage_provider, provider_file_id, linked_to_type, linked_to_id, created_at';
const ROUTING_VENUE_COLS = 'id, tour_id, date, day_type, city, country, address, venue_name, venue_phone, venue_website, venue_capacity, venue_frozen_at, canonical_venue_id';

type RoutingRow = RoutingVenueSource & { id: string; tour_id: string; date: string | null; canonical_venue_id: string | null };

/** Routing rows (with their canonical venue attached) for resolveVenue. */
async function routingWithVenues(client: SupabaseClient, rows: RoutingRow[]): Promise<RoutingRow[]> {
  const ids = [...new Set(rows.map((r) => r.canonical_venue_id).filter(Boolean))] as string[];
  if (!ids.length) return rows;
  const { data } = await client.from('canonical_venues').select('id, name, address, city, country, capacity').in('id', ids);
  const byId = new Map(((data ?? []) as CanonicalVenueRow[]).map((v) => [v.id, v]));
  return rows.map((r) => (r.canonical_venue_id && byId.has(r.canonical_venue_id) ? { ...r, canonical: byId.get(r.canonical_venue_id) } : r));
}

async function tourIdsOf(client: SupabaseClient, workspaceId: string): Promise<Set<string>> {
  const { data } = await client.from('tours').select('id').eq('workspace_id', workspaceId);
  return new Set(((data ?? []) as { id: string }[]).map((t) => t.id));
}

/** A show (routing row) on one of this workspace's tours, or null. */
async function showInWorkspace(client: SupabaseClient, workspaceId: string, showId: string): Promise<RoutingRow | null> {
  const { data } = await client.from('routing').select(ROUTING_VENUE_COLS).eq('id', showId).maybeSingle();
  const r = data as RoutingRow | null;
  if (!r) return null;
  const { data: t } = await client.from('tours').select('id').eq('id', r.tour_id).eq('workspace_id', workspaceId).maybeSingle();
  return t ? r : null;
}

/** Is this entity something this workspace can link to? */
async function assertEntity(client: SupabaseClient, workspaceId: string, type: EntityType, id: string): Promise<void> {
  if (type === 'show') {
    if (!(await showInWorkspace(client, workspaceId, id))) throw new LinkError(404, 'Show not found.');
    return;
  }
  if (type === 'person') {
    const { data } = await client.from('persons').select('id').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
    if (!data) throw new LinkError(404, 'Person not found.');
    return;
  }
  // A venue is linkable only if one of YOUR shows is there (canonical venues are global).
  const tours = await tourIdsOf(client, workspaceId);
  const { data } = await client.from('routing').select('tour_id').eq('canonical_venue_id', id);
  if (!((data ?? []) as { tour_id: string }[]).some((r) => tours.has(r.tour_id))) throw new LinkError(404, 'Venue not found on your tours.');
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

export async function linkedFiles(client: SupabaseClient, args: { workspaceId: string; type: EntityType; id: string }): Promise<LinkedFile[]> {
  const { workspaceId, type, id } = args;
  const wanted: Array<{ type: EntityType; id: string }> = [{ type, id }];
  let homeFiles: FileRow[] = [];
  if (type === 'show') {
    const show = await showInWorkspace(client, workspaceId, id);
    if (!show) throw new LinkError(404, 'Show not found.');
    if (show.canonical_venue_id) wanted.push({ type: 'venue', id: show.canonical_venue_id });
    const { data } = await client
      .from('file_references')
      .select(FILE_COLS)
      .eq('workspace_id', workspaceId)
      .eq('linked_to_type', 'routing')
      .eq('linked_to_id', id);
    homeFiles = (data ?? []) as FileRow[];
  }

  const links: Array<{ id: string; file_id: string; entity_type: EntityType; entity_id: string }> = [];
  for (const w of wanted) {
    const { data, error } = await client
      .from('file_entity_links')
      .select('id, file_id, entity_type, entity_id')
      .eq('workspace_id', workspaceId)
      .eq('entity_type', w.type)
      .eq('entity_id', w.id);
    if (error) throw new LinkError(500, error.message);
    links.push(...((data ?? []) as typeof links));
  }

  const fileIds = [...new Set(links.map((l) => l.file_id))];
  let linkedRows: FileRow[] = [];
  if (fileIds.length) {
    const { data } = await client.from('file_references').select(FILE_COLS).eq('workspace_id', workspaceId).in('id', fileIds);
    linkedRows = (data ?? []) as FileRow[];
  }

  // Which tour each file lives on: tour files directly, show files via their show.
  const all = [...homeFiles, ...linkedRows];
  const routingIds = [...new Set(all.filter((f) => f.linked_to_type === 'routing' && f.linked_to_id).map((f) => f.linked_to_id!))];
  const routingTour = new Map<string, string>();
  if (routingIds.length) {
    const { data } = await client.from('routing').select('id, tour_id').in('id', routingIds);
    for (const r of (data ?? []) as { id: string; tour_id: string }[]) routingTour.set(r.id, r.tour_id);
  }
  const tourOf = (f: FileRow) => (f.linked_to_type === 'tour' ? f.linked_to_id : f.linked_to_type === 'routing' && f.linked_to_id ? routingTour.get(f.linked_to_id) ?? null : null);
  const tourIds = [...new Set(all.map(tourOf).filter(Boolean))] as string[];
  const tourName = new Map<string, string>();
  if (tourIds.length) {
    const { data } = await client.from('tours').select('id, name').eq('workspace_id', workspaceId).in('id', tourIds);
    for (const t of (data ?? []) as { id: string; name: string }[]) tourName.set(t.id, t.name);
  }

  const toLinked = (f: FileRow, via: LinkedFile['via'], linkId: string | null): LinkedFile => {
    const tid = tourOf(f);
    return {
      id: f.id,
      name: f.file_name,
      size: f.file_size,
      type: f.file_type,
      addedAt: f.created_at,
      bucket: f.storage_provider,
      path: f.provider_file_id,
      tourId: tid,
      tourName: tid ? tourName.get(tid) ?? null : null,
      via,
      linkId,
    };
  };

  // One row per file. The most specific reason wins: the show itself, then a
  // direct link, then the venue.
  const out = new Map<string, LinkedFile>();
  const rank: Record<LinkedFile['via'], number> = { home: 0, show: 1, person: 1, venue: 2 };
  const put = (lf: LinkedFile) => {
    const cur = out.get(lf.id);
    if (!cur || rank[lf.via] < rank[cur.via]) out.set(lf.id, lf);
  };
  for (const f of homeFiles) put(toLinked(f, 'home', null));
  const byId = new Map(linkedRows.map((f) => [f.id, f]));
  for (const l of links) {
    const f = byId.get(l.file_id);
    if (f) put(toLinked(f, l.entity_type, l.id));
  }
  return [...out.values()].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export interface LinkTarget {
  type: EntityType;
  id: string;
  label: string;
  sub: string | null;
}

/** What a tour's files can be linked to: its shows, the venues they're at, its crew. */
export async function linkTargets(client: SupabaseClient, args: { workspaceId: string; tourId: string }): Promise<LinkTarget[]> {
  const { data: tour } = await client.from('tours').select('id').eq('id', args.tourId).eq('workspace_id', args.workspaceId).maybeSingle();
  if (!tour) throw new LinkError(404, 'Tour not found.');
  const { data: rows } = await client.from('routing').select(ROUTING_VENUE_COLS).eq('tour_id', args.tourId).order('date', { ascending: true });
  const routing = await routingWithVenues(client, (rows ?? []) as RoutingRow[]);
  const out: LinkTarget[] = [];
  const venues = new Map<string, LinkTarget>();
  for (const r of routing) {
    const v = resolveVenue(r);
    if (r.day_type === 'show' || r.day_type === 'festival') {
      out.push({ type: 'show', id: r.id, label: [r.date, v.name ?? v.city].filter(Boolean).join(' · ') || 'Show', sub: v.city });
    }
    if (r.canonical_venue_id && !venues.has(r.canonical_venue_id)) {
      venues.set(r.canonical_venue_id, { type: 'venue', id: r.canonical_venue_id, label: v.name ?? 'Venue', sub: v.city });
    }
  }
  out.push(...venues.values());
  const { data: crew } = await client.from('tour_personnel').select('person_id').eq('tour_id', args.tourId);
  const personIds = [...new Set(((crew ?? []) as { person_id: string }[]).map((c) => c.person_id))];
  if (personIds.length) {
    const { data: people } = await client.from('persons').select('id, full_name, preferred_name').eq('workspace_id', args.workspaceId).in('id', personIds);
    for (const p of ((people ?? []) as { id: string; full_name: string; preferred_name: string | null }[]).sort((a, b) => a.full_name.localeCompare(b.full_name))) {
      out.push({ type: 'person', id: p.id, label: p.preferred_name || p.full_name, sub: p.preferred_name ? p.full_name : null });
    }
  }
  return out;
}

/** The links a file has (for the "Link to…" dialog). */
export async function linksOfFile(client: SupabaseClient, args: { workspaceId: string; fileId: string }): Promise<Array<{ id: string; type: EntityType; entityId: string }>> {
  const { data, error } = await client
    .from('file_entity_links')
    .select('id, entity_type, entity_id')
    .eq('workspace_id', args.workspaceId)
    .eq('file_id', args.fileId);
  if (error) throw new LinkError(500, error.message);
  return ((data ?? []) as { id: string; entity_type: EntityType; entity_id: string }[]).map((l) => ({ id: l.id, type: l.entity_type, entityId: l.entity_id }));
}

/* ── Writing ─────────────────────────────────────────────────────────────── */

export async function addLink(
  client: SupabaseClient,
  args: { workspaceId: string; userId: string; fileId: string; type: EntityType; entityId: string },
): Promise<{ id: string }> {
  const { data: file } = await client.from('file_references').select('id').eq('id', args.fileId).eq('workspace_id', args.workspaceId).maybeSingle();
  if (!file) throw new LinkError(404, 'File not found.');
  await assertEntity(client, args.workspaceId, args.type, args.entityId);
  const { data: existing } = await client
    .from('file_entity_links')
    .select('id')
    .eq('workspace_id', args.workspaceId)
    .eq('file_id', args.fileId)
    .eq('entity_type', args.type)
    .eq('entity_id', args.entityId)
    .maybeSingle();
  if (existing) return existing as { id: string };
  const { data, error } = await client
    .from('file_entity_links')
    .insert({ workspace_id: args.workspaceId, file_id: args.fileId, entity_type: args.type, entity_id: args.entityId, created_by: args.userId })
    .select('id')
    .single();
  if (error || !data) {
    // Two tabs linking the same thing at once: the unique key wins, the result is the same.
    if (error && (error as { code?: string }).code === '23505') {
      const { data: again } = await client.from('file_entity_links').select('id').eq('file_id', args.fileId).eq('entity_type', args.type).eq('entity_id', args.entityId).maybeSingle();
      if (again) return again as { id: string };
    }
    throw new LinkError(500, error?.message ?? 'Couldn’t link the file.');
  }
  return data as { id: string };
}

export async function removeLink(client: SupabaseClient, args: { workspaceId: string; id: string }): Promise<void> {
  const { data, error } = await client.from('file_entity_links').delete().eq('id', args.id).eq('workspace_id', args.workspaceId).select('id');
  if (error) throw new LinkError(500, error.message);
  if (!data || (data as unknown[]).length === 0) throw new LinkError(404, 'Link not found.');
}

/** The venue a show is at (for "every show at <venue>"), named via resolveVenue. */
export async function showVenue(client: SupabaseClient, args: { workspaceId: string; showId: string }): Promise<{ id: string; name: string } | null> {
  const show = await showInWorkspace(client, args.workspaceId, args.showId);
  if (!show?.canonical_venue_id) return null;
  const [withVenue] = await routingWithVenues(client, [show]);
  return { id: show.canonical_venue_id, name: resolveVenue(withVenue).name ?? 'this venue' };
}
