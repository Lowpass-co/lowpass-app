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
  StageBox,
  ChannelListRow,
  SectionType,
} from './types';

/** Supabase/PostgREST errors are often plain objects, not `Error` — avoids generic "resolve failed" in the UI. */
export function formatResolveError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m.length > 0) return m;
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

/** True when PostgREST has not been exposed to a relation yet (migration not applied, or API schema reload needed). */
function isSchemaCacheMissingTable(err: unknown, tableName: string): boolean {
  const msg = formatResolveError(err);
  return (
    (msg.includes('Could not find the table') || msg.includes('schema cache')) &&
    msg.includes(tableName)
  );
}

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

  // Two queries avoid PostgREST embed ambiguity (multiple pack↔section paths) and match `!inner` RLS.
  const { data: rawSections, error: secErr } = await supabase
    .from('rider_sections')
    .select('*')
    .in('pack_id', allPackIds);
  if (secErr) throw new Error(formatResolveError(secErr));

  const { data: scopeRows, error: packErr } = await supabase
    .from('rider_packs')
    .select('id, scope')
    .in('id', allPackIds);
  if (packErr) throw new Error(formatResolveError(packErr));

  const scopeByPackId = new Map<string, PackScope>();
  for (const r of scopeRows ?? []) {
    scopeByPackId.set(r.id, r.scope as PackScope);
  }

  // Sort so the most specific scope comes first, then pick first per key.
  const sorted = (rawSections ?? []).slice().sort((a, b) => {
    const ap = SCOPE_PRIORITY[scopeByPackId.get(a.pack_id) as PackScope] ?? 99;
    const bp = SCOPE_PRIORITY[scopeByPackId.get(b.pack_id) as PackScope] ?? 99;
    return ap - bp;
  });

  const byKey = new Map<string, ResolvedSection>();
  for (const row of sorted) {
    if (byKey.has(row.section_key)) continue;
    const srcScope = scopeByPackId.get(row.pack_id);
    if (srcScope === undefined) continue;
    const rest = row as RiderSection & { section_type?: SectionType };
    const st: SectionType = rest.section_type ?? 'fields';
    byKey.set(row.section_key, {
      ...rest,
      section_type: st,
      inherited_from: row.pack_id === pack.id ? null : srcScope,
      source_pack_id: row.pack_id,
    });
  }

  let sections = Array.from(byKey.values()).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
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
    if (e1) throw new Error(formatResolveError(e1));
    if (e2) throw new Error(formatResolveError(e2));

    const { data: boxRows, error: e3 } = await supabase
      .from('stage_boxes')
      .select('*')
      .in('section_id', channelIds)
      .order('position');
    // DB without migration 046 has no public.stage_boxes — still load; stage boxes are empty until migrated.
    let boxRowsForMap: NonNullable<typeof boxRows> = boxRows ?? [];
    if (e3) {
      if (isSchemaCacheMissingTable(e3, 'stage_boxes')) {
        boxRowsForMap = [];
      } else {
        throw new Error(formatResolveError(e3));
      }
    }

    const subBy = new Map<string, SubSnake[]>();
    for (const r of subRows ?? []) {
      const s = r as SubSnake;
      const list = subBy.get(s.section_id) ?? [];
      list.push(s);
      subBy.set(s.section_id, list);
    }
    const boxBy = new Map<string, StageBox[]>();
    for (const r of boxRowsForMap) {
      const s = r as StageBox;
      const list = boxBy.get(s.section_id) ?? [];
      list.push(s);
      boxBy.set(s.section_id, list);
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
            stageBoxes: boxBy.get(s.id) ?? [],
            rows: rowBy.get(s.id) ?? [],
          }
        : s,
    );
  }

  return { pack, sections };
}
