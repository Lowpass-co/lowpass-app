/* ============================================
   LOWPASS — Riders: bring over the old builder's riders (Nov 2026)

   Adam chose "move them over, delete old". One click (admin / manager) on
   the Riders page: every old rider pack (rider_packs kind 'rider') not yet
   brought over is converted (lib/riders/legacy.ts) and
     · a tour or show pack → appended to that tour's Tech / Hospitality
       document (a show pack's blocks apply on that show's date only);
     · an artist pack → a workspace rider template, tagged with the artist.
   rider_legacy_imports records each pack, so a second click does nothing
   twice. The old rows are never touched or deleted.
   ============================================ */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { convertLegacyPack, type LegacySection } from '@/lib/riders/legacy';
import { placeBlocks } from '@/lib/riders/starters';
import { RiderError, ensureRider, insertBlocks } from './actions';

interface OldPack {
  id: string;
  title: string | null;
  scope: string | null;
  kind: string | null;
  tour_id: string | null;
  routing_id: string | null;
  artist_id: string | null;
  cover_disclaimer: string | null;
}

async function pending(client: SupabaseClient, workspaceId: string): Promise<OldPack[]> {
  const [{ data: packs }, { data: done }] = await Promise.all([
    client.from('rider_packs').select('id, title, scope, kind, tour_id, routing_id, artist_id, cover_disclaimer').eq('workspace_id', workspaceId),
    client.from('rider_legacy_imports').select('pack_id').eq('workspace_id', workspaceId),
  ]);
  const seen = new Set(((done ?? []) as { pack_id: string }[]).map((d) => d.pack_id));
  return ((packs ?? []) as OldPack[]).filter((p) => (p.kind ?? 'rider') === 'rider' && !seen.has(p.id));
}

export async function legacyCount(client: SupabaseClient, workspaceId: string): Promise<number> {
  try {
    return (await pending(client, workspaceId)).length;
  } catch {
    return 0;
  }
}

export async function bringOver(client: SupabaseClient, workspaceId: string, userId: string): Promise<{ riders: number; templates: number; empty: number }> {
  const packs = await pending(client, workspaceId);
  let riders = 0;
  let templates = 0;
  let empty = 0;
  for (const pack of packs) {
    const [{ data: sections }, routing] = await Promise.all([
      client.from('rider_sections').select('title, sort_order, section_type, fields, metadata').eq('pack_id', pack.id),
      pack.routing_id ? client.from('routing').select('date').eq('id', pack.routing_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const showDate = (routing.data as { date: string | null } | null)?.date ?? null;
    const { kind, blocks } = convertLegacyPack(pack, (sections ?? []) as LegacySection[], pack.routing_id ? showDate : null);
    let target = 'skipped:empty';
    if (!blocks.length) empty++;
    else if (pack.tour_id) {
      const title = (pack.title ?? '').trim();
      // The old pack's name heads its blocks (dated like them, for a show pack).
      const heading = title ? [{ kind: 'heading' as const, content: { text: title.slice(0, 200), level: 1 as const }, from: blocks[0].from, until: blocks[0].until }] : [];
      const riderId = await ensureRider(client, pack.tour_id, workspaceId, kind, userId);
      const { data: last } = await client.from('rider_blocks').select('position').eq('rider_id', riderId).order('position', { ascending: false }).limit(1);
      const after = ((last ?? []) as { position: string }[])[0]?.position ?? null;
      const rows = placeBlocks([...heading, ...blocks], () => randomUUID(), after, null);
      for (let i = 0; i < rows.length; i += 400) {
        await insertBlocks(
          client,
          pack.tour_id,
          riderId,
          rows.slice(i, i + 400).map((r) => ({ id: r.id, kind: r.kind, content: r.content, position: r.position, from: r.from, until: r.until })),
          userId,
        );
      }
      target = `rider:${riderId}`;
      riders++;
    } else {
      const { data, error } = await client
        .from('rider_templates')
        .insert({ workspace_id: workspaceId, name: (pack.title ?? '').trim().slice(0, 120) || 'Rider template', kind, artist_id: pack.artist_id, blocks, created_by: userId })
        .select('id')
        .single();
      if (error || !data) throw new RiderError(500, `Couldn’t bring over “${pack.title ?? 'a rider'}”`);
      target = `template:${(data as { id: string }).id}`;
      templates++;
    }
    const { error } = await client.from('rider_legacy_imports').insert({ pack_id: pack.id, workspace_id: workspaceId, tour_id: pack.tour_id, target });
    if (error && error.code !== '23505') throw new RiderError(500, 'Couldn’t record the bring-over');
  }
  return { riders, templates, empty };
}
