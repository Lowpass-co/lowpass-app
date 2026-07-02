/* ============================================
   LOWPASS — Operations · Channel List (Phase 4 unblock)

   /operations/[tourId]/channel-list — the live channel-list sheet for the
   tour. Ports /tours/[id]/channel-list (resolves the channel_list section
   off a tour rider pack), rendering inner content only (ProductShell +
   TourHeader come from /operations/[tourId]/layout.tsx).
   ============================================ */

import { notFound } from 'next/navigation';
import { ChannelListTourEditor } from '@/components/channel-list/ChannelListTourEditor';
import { ExportButton } from '@/components/export/ExportButton';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { formatResolveError, resolvePack } from '@/lib/rider-packs/resolve';
import type { RiderPack, ResolvedSection } from '@/lib/rider-packs/types';

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
    .select('id, name, currency')
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

  for (const pack of packs ?? []) {
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
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col space-y-4 px-4 pb-16 pt-6 print:max-w-none print:pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-lp-text">Channel list</h1>
          <p className="mt-0.5 text-sm text-lp-text-secondary">{tour.name ?? tourId}</p>
        </div>
        {resolvedSection ? <ExportButton surface="channel-list" tourId={tour.id} title="Export the channel / input list (PDF or Excel)" /> : null}
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
        />
      ) : (
        !resolveError && (
          <p className="rounded-xl border border-dashed border-lp-border bg-lp-surface/60 px-4 py-8 text-center text-sm text-lp-text-secondary">
            No channel list section found on a tour rider pack yet.{' '}
            <a className="text-lp-orange hover:underline" href={`/operations/${tour.id}/riders`}>
              Open rider packs →
            </a>
          </p>
        )
      )}
    </div>
  );
}
