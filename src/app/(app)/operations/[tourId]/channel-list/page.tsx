/* ============================================
   LOWPASS — Operations · Channel List (Phase 4 unblock)

   /operations/[tourId]/channel-list — the live channel-list sheet for the
   tour. Ports /tours/[id]/channel-list (resolves the channel_list section
   off a tour rider pack), rendering inner content only (ProductShell +
   TourHeader come from /operations/[tourId]/layout.tsx).
   ============================================ */

import { notFound } from 'next/navigation';
import { ChannelListTourEditor } from '@/components/channel-list/ChannelListTourEditor';
import { ChannelListEmptyState } from '@/components/channel-list/ChannelListEmptyState';
import { NewChannelListButton } from '@/components/channel-list/NewChannelListButton';
import { ExportButton } from '@/components/export/ExportButton';
import { PageTitle } from '@/components/ui/PageHeader';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { formatResolveError, resolvePack } from '@/lib/rider-packs/resolve';
import type { RiderPack, ResolvedSection } from '@/lib/rider-packs/types';
import { resolveShowDocuments } from '@/lib/rider-packs/attachments';

export const dynamic = 'force-dynamic';

export default async function OperationsTourChannelListPage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, name, currency, artist_id')
    .eq('id', tourId)
    .single();

  if (error || !tour) notFound();

  const { data: packs } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('tour_id', tour.id)
    .order('updated_at', { ascending: false });

  let resolvedSection: ResolvedSection | null = null;
  let resolvedPackId: string | null = null;
  // #17 — keep the full pack so the tour tab can mount the editable editor.
  let resolvedPack: RiderPack | null = null;
  let resolveError: string | null = null;

  /* Decouple phase A (2026-08-05) — ATTACHMENT-FIRST. If a channel-list
     document is attached to this tour, it IS the tour's channel list: its own
     pack, its own sections, no rider inheritance, so the inherited lock can
     never engage. The scan below survives only as the legacy fallback for
     tours with nothing attached yet. */
  const attached = await resolveShowDocuments(supabase, tour.id, null);
  const attachedDoc = attached.channel_list;
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
          resolvedSection = sec;
          resolvedPackId = docPack.id as string;
          resolvedPack = docPack as RiderPack;
        }
      } catch (e) {
        resolveError = formatResolveError(e);
      }
    }
  }

  for (const pack of resolvedSection ? [] : packs ?? []) {
    try {
      const resolved = await resolvePack(supabase, pack as RiderPack);
      const sec = resolved.sections.find((s) => s.section_type === 'channel_list');
      if (sec) {
        resolvedSection = sec;
        resolvedPackId = pack.id as string;
        resolvedPack = pack as RiderPack;
        break;
      }
    } catch (e) {
      resolveError = formatResolveError(e);
    }
  }


  return (
    <div className="flex w-full flex-1 flex-col space-y-4 px-4 pb-16 pt-6 print:pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          {/* F2 — canonical condensed-caps page title (matches Payroll etc.),
              not the old hand-rolled sentence-case <h1>. */}
          <PageTitle style={{ fontSize: 22 }}>{`${tour.name ?? tourId} — Channel list`}</PageTitle>
        </div>
        {resolvedSection ? (
          <div className="flex flex-wrap items-start justify-end gap-3">
            {/* Adam 2026-08-07 — compact "fresh list" affordance lives here too,
                so replacing the list never requires a trip to Riders. */}
            {tour.artist_id ? (
              <NewChannelListButton
                tourId={tour.id}
                artistId={tour.artist_id}
                tourName={tour.name ?? 'Tour'}
                variant="compact"
              />
            ) : null}
            <ExportButton surface="channel-list" tourId={tour.id} title="Export the channel / input list (PDF or Excel)" />
          </div>
        ) : null}
      </header>

      {resolveError && !resolvedSection ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Rider pack resolve issue: {resolveError}
        </p>
      ) : null}

      {resolvedPackId && resolvedSection && resolvedPack ? (
        /* #17 — editable in place: mount the rider channel-list editor (canonical
           grid + dropdowns + StageBoxDialog patch grid) on the tour tab. An
           inherited (artist-scope) list stays gated with the editor's own
           "Override to edit here" prompt → the rider editor (tested fork). */
        <ChannelListTourEditor
          pack={resolvedPack}
          section={resolvedSection}
          packId={resolvedPackId}
          tourId={tour.id}
          /* B1 — resolvedPackId equals the attached doc only when the
             attachment path produced the section; a legacy-scan hit leaves
             attachedDoc for a DIFFERENT pack (or null), and Detach must not
             offer to remove an attachment this surface is not showing. */
          tourAttachmentId={
            attachedDoc && attachedDoc.document_pack_id === resolvedPackId
              ? attachedDoc.attachment_id
              : null
          }
          /* B2 — stage-plot packs on this tour + the one (if any) currently
             linked to this channel list, so the tab can link/unlink one. */
          stagePlotCandidates={(packs ?? [])
            .filter((p) => (p as { kind?: string }).kind === 'stage_plot')
            .map((p) => ({ id: p.id as string, title: ((p as { title?: string }).title as string) ?? 'Untitled' }))}
          linkedStagePlotId={
            ((packs ?? []).find(
              (p) => (p as { kind?: string }).kind === 'stage_plot' && (p as { linked_rider_pack_id?: string | null }).linked_rider_pack_id === resolvedPackId,
            )?.id as string | undefined) ?? null
          }
        />
      ) : (
        !resolveError && (
          /* Adam 2026-08-07 — standalone create path: the empty state builds a
             channel_list document pack + section and attaches it tour-wide.
             No rider pack needed anymore. */
          <ChannelListEmptyState
            tourId={tour.id}
            artistId={tour.artist_id ?? null}
            tourName={tour.name ?? 'Tour'}
          />
        )
      )}
    </div>
  );
}
