/* ============================================
   LOWPASS — Rider/Pack section resolver

   Given a pack, return its sections merged with parent folders'
   sections so the UI can show "inherited from tour" / etc.

   Resolution order: show > tour > artist. First match per
   section_key wins. Parent chain is defined by
   rider_folders.inherit_from_folder_id (show → tour → artist).

   Multiple riders per scope are allowed; each pack belongs to
   one folder, and inheritance follows folder links, not
   a single parent pack per (artist, tour, show).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PackScope,
  RiderPack,
  RiderSection,
  ResolvedSection,
  ResolvedPack,
  SubSnake,
  SectionStageIO,
  ChannelListRow,
  SectionType,
} from './types';

/** Walk folder.parent chain; collect (pack id, scope) for each parent folder. */
async function resolveParentPackIds(
  supabase: SupabaseClient,
  pack: RiderPack,
): Promise<Array<{ id: string; scope: PackScope }>> {
  const parents: Array<{ id: string; scope: PackScope }> = [];
  if (!pack.folder_id) {
    // Pre-migration rows should not exist after 039; keep empty
    return parents;
  }

  const { data: startFolder } = await supabase
    .from('rider_folders')
    .select('id, inherit_from_folder_id')
    .eq('id', pack.folder_id)
    .maybeSingle();
  if (!startFolder) return parents;

  let nextFolderId: string | null = startFolder.inherit_from_folder_id;
  const visited = new Set<string>([startFolder.id]);

  while (nextFolderId) {
    if (visited.has(nextFolderId)) break;
    visited.add(nextFolderId);

    const { data: parentFolder } = await supabase
      .from('rider_folders')
      .select('id, scope, inherit_from_folder_id')
      .eq('id', nextFolderId)
      .maybeSingle();
    if (!parentFolder) break;

    const { data: parentPack } = await supabase
      .from('rider_packs')
      .select('id')
      .eq('folder_id', parentFolder.id)
      .maybeSingle();
    if (parentPack) {
      parents.push({ id: parentPack.id, scope: parentFolder.scope as PackScope });
    }
    nextFolderId = parentFolder.inherit_from_folder_id;
  }

  return parents;
}

/** Priority: show (0) < tour (1) < artist (2). Lower number = more specific. */
const SCOPE_PRIORITY: Record<PackScope, number> = {
  show: 0,
  tour: 1,
  artist: 2,
};

export async function resolvePack(
  supabase: SupabaseClient,
  pack: RiderPack,
): Promise<ResolvedPack> {
  const parents = await resolveParentPackIds(supabase, pack);
  const allPackIds = [pack.id, ...parents.map((p) => p.id)];

  const { data: rawSections, error } = await supabase
    .from('rider_sections')
    .select('*, pack:rider_packs!inner(id, scope)')
    .in('pack_id', allPackIds);
  if (error) throw error;

  // Sort so the most specific scope comes first, then pick first per key.
  const sorted = (rawSections ?? []).slice().sort((a, b) => {
    const ap = SCOPE_PRIORITY[a.pack.scope as PackScope] ?? 99;
    const bp = SCOPE_PRIORITY[b.pack.scope as PackScope] ?? 99;
    return ap - bp;
  });

  const byKey = new Map<string, ResolvedSection>();
  for (const row of sorted) {
    if (byKey.has(row.section_key)) continue;
    const { pack: srcPack, ...rest } = row as RiderSection & {
      pack: { id: string; scope: PackScope };
      section_type?: SectionType;
    };
    const st: SectionType = rest.section_type ?? 'fields';
    byKey.set(row.section_key, {
      ...rest,
      section_type: st,
      inherited_from: srcPack.id === pack.id ? null : srcPack.scope,
      source_pack_id: srcPack.id,
    });
  }

  let sections = Array.from(byKey.values()).sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  const channelIds = sections.filter((s) => s.section_type === 'channel_list').map((s) => s.id);
  if (channelIds.length > 0) {
    const [{ data: subRows, error: e1 }, { data: chRows, error: e2 }] = await Promise.all([
      supabase.from('sub_snakes').select('*').in('section_id', channelIds).order('position'),
      supabase
        .from('channel_list_rows')
        .select('*')
        .in('section_id', channelIds)
        .order('row_index', { ascending: true }),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const { data: ioRows } = await supabase
      .from('section_stage_io')
      .select('*')
      .in('section_id', channelIds)
      .order('position');

    const subBy = new Map<string, SubSnake[]>();
    for (const r of subRows ?? []) {
      const s = r as SubSnake;
      const list = subBy.get(s.section_id) ?? [];
      list.push(s);
      subBy.set(s.section_id, list);
    }
    const ioBy = new Map<string, SectionStageIO[]>();
    for (const r of ioRows ?? []) {
      const s = r as SectionStageIO;
      const list = ioBy.get(s.section_id) ?? [];
      list.push(s);
      ioBy.set(s.section_id, list);
    }
    const rowBy = new Map<string, ChannelListRow[]>();
    for (const r of chRows ?? []) {
      const row = r as ChannelListRow;
      const list = rowBy.get(row.section_id) ?? [];
      list.push(row);
      rowBy.set(row.section_id, list);
    }
    sections = sections.map((s) =>
      s.section_type === 'channel_list'
        ? {
            ...s,
            subSnakes: subBy.get(s.id) ?? [],
            stageIOs: ioBy.get(s.id) ?? [],
            rows: rowBy.get(s.id) ?? [],
          }
        : s,
    );
  }

  return { pack, sections };
}
