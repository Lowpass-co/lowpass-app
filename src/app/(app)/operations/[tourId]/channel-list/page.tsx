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
import { resolveTourChannelList } from '@/lib/rider-packs/resolveChannelList';

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

  /* ONE resolver, shared with the export (src/lib/rider-packs/resolveChannelList.ts).
     Attachment-first with the legacy scan as fallback — the logic used to live
     inline here, and the export's private copy of it drifted, so the PDF showed
     a different list from this page. Both call the same function now. */
  const resolved = await resolveTourChannelList(supabase, tour.id);
  const packs = resolved.packs;
  const resolvedSection = resolved.section;
  const resolvedPackId = resolved.packId;
  // #17 — keep the full pack so the tour tab can mount the editable editor.
  const resolvedPack = resolved.pack;
  const resolveError = resolved.error;
  const attachedDoc = resolved.attachedDoc;


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
          stagePlotCandidates={packs
            .filter((p) => (p as { kind?: string }).kind === 'stage_plot')
            .map((p) => ({ id: p.id as string, title: ((p as { title?: string }).title as string) ?? 'Untitled' }))}
          linkedStagePlotId={
            (packs.find(
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
