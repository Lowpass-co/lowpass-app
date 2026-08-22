/* ============================================
   LOWPASS — the ONE tour channel-list resolver

   Why this file exists: the channel-list PAGE and the channel-list EXPORT
   used to resolve a pack independently. The page was attachment-first (the
   decouple-phase-A rule); the export just scanned `rider_packs` for the
   first pack carrying a `channel_list` section, under a comment claiming it
   "mirrors the page". It did not. On any tour with an attached document the
   two surfaces showed DIFFERENT lists — the editor showed the attached pack,
   the PDF showed a stale legacy one (Charlotte Sands · Satellite USA
   Headline, 2026-08-22: editor 32 in / 6 out, PDF 31 in / 2 out).

   Copying the page's logic into the export would only reset the drift clock.
   So resolution lives here, once, and both entry points call it.

   PRECEDENCE (the page's behaviour is the reference — do not reorder):
     1. the tour's ATTACHED channel_list document → resolve THAT pack
     2. legacy fallback → first of the tour's rider packs (newest updated_at
        first) that carries a channel_list section

   A pack that fails to resolve never kills the caller: the error is captured
   and the scan continues, exactly as the page did.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatResolveError, resolvePack } from './resolve';
import { resolveShowDocuments, type AttachedDocument } from './attachments';
import type { RiderPack, ResolvedSection } from './types';

export interface ResolvedTourChannelList {
  /** The resolved channel_list section, or null when the tour has none. */
  section: ResolvedSection | null;
  /** The pack the section came from (the row, for callers that mount an editor). */
  pack: RiderPack | null;
  packId: string | null;
  /** Which path produced `section`. null when nothing resolved. */
  source: 'attachment' | 'legacy' | null;
  /** The tour's attached channel_list document, if any — independent of
   *  whether it is what `section` came from (a broken attachment falls
   *  through to the legacy scan, and callers must not offer to detach a
   *  document they are not showing). */
  attachedDoc: AttachedDocument | null;
  /** Last resolve failure, formatted. Only meaningful when `section` is null. */
  error: string | null;
  /** Every rider pack on the tour (newest first) — already fetched here, so
   *  callers that need the sibling packs don't re-query. */
  packs: RiderPack[];
}

export async function resolveTourChannelList(
  supabase: SupabaseClient,
  tourId: string,
): Promise<ResolvedTourChannelList> {
  const [packsRes, attached] = await Promise.all([
    supabase.from('rider_packs').select('*').eq('tour_id', tourId).order('updated_at', { ascending: false }),
    resolveShowDocuments(supabase, tourId, null),
  ]);
  const packs = (packsRes.data ?? []) as RiderPack[];
  const attachedDoc = attached.channel_list ?? null;

  let section: ResolvedSection | null = null;
  let pack: RiderPack | null = null;
  let source: 'attachment' | 'legacy' | null = null;
  let error: string | null = null;

  /* 1 — ATTACHMENT-FIRST (decouple phase A, 2026-08-05). If a channel-list
     document is attached to this tour, it IS the tour's channel list: its own
     pack, its own sections, no rider inheritance, so the inherited lock can
     never engage. */
  if (attachedDoc) {
    const { data: docPack } = await supabase
      .from('rider_packs')
      .select('*')
      .eq('id', attachedDoc.document_pack_id)
      .maybeSingle();
    if (docPack) {
      try {
        const resolved = await resolvePack(supabase, docPack as RiderPack);
        const sec = resolved.sections.find((s) => s.section_type === 'channel_list');
        if (sec) {
          section = sec;
          pack = docPack as RiderPack;
          source = 'attachment';
        }
      } catch (e) {
        error = formatResolveError(e);
      }
    }
  }

  /* 2 — legacy fallback, for tours with nothing attached yet. */
  if (!section) {
    for (const p of packs) {
      try {
        const resolved = await resolvePack(supabase, p);
        const sec = resolved.sections.find((s) => s.section_type === 'channel_list');
        if (sec) {
          section = sec;
          pack = p;
          source = 'legacy';
          break;
        }
      } catch (e) {
        error = formatResolveError(e);
      }
    }
  }

  return { section, pack, packId: pack?.id ?? null, source, attachedDoc, error, packs };
}
