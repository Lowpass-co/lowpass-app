/* ============================================
   LOWPASS — Rider/Pack section resolver

   Given a pack, return its sections merged with parent-scope
   sections so the UI can show "inherited from tour" / etc.

   Resolution order: show > tour > artist. First match per
   section_key wins. Sort the final list by sort_order from
   whichever scope authored it.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PackScope,
  RiderPack,
  RiderSection,
  ResolvedSection,
  ResolvedPack,
} from './types';

/** Find the chain of parent pack IDs for a given pack. */
async function resolveParentPackIds(
  supabase: SupabaseClient,
  pack: RiderPack,
): Promise<Array<{ id: string; scope: PackScope }>> {
  const parents: Array<{ id: string; scope: PackScope }> = [];

  if (pack.scope === 'show' && pack.tour_id) {
    const { data: tourPack } = await supabase
      .from('rider_packs')
      .select('id, scope')
      .eq('scope', 'tour')
      .eq('artist_id', pack.artist_id)
      .eq('tour_id', pack.tour_id)
      .maybeSingle();
    if (tourPack) parents.push({ id: tourPack.id, scope: 'tour' });
  }

  if (pack.scope === 'show' || pack.scope === 'tour') {
    const { data: artistPack } = await supabase
      .from('rider_packs')
      .select('id, scope')
      .eq('scope', 'artist')
      .eq('artist_id', pack.artist_id)
      .maybeSingle();
    if (artistPack) parents.push({ id: artistPack.id, scope: 'artist' });
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
    };
    byKey.set(row.section_key, {
      ...rest,
      inherited_from: srcPack.id === pack.id ? null : srcPack.scope,
      source_pack_id: srcPack.id,
    });
  }

  const sections = Array.from(byKey.values()).sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return { pack, sections };
}
