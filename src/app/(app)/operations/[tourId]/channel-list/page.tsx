/* ============================================
   LOWPASS — Operations · Channel List

   /operations/[tourId]/channel-list — the real tour channel-list
   sheet (was a Phase-4 placeholder). Resolves the tour's rider pack,
   finds its channel_list section, and renders <ChannelListTourSheet>.
   Chrome (ProductShell + sub-nav) comes from
   operations/[tourId]/layout.tsx, so this returns body content only.

   Links across to the paired Stage Plot surface — the channel list
   and stage plot are the FOH/audio pair for a tour.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ChannelListTourSheet } from '@/components/channel-list/ChannelListTourSheet';
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

  const { data: tour } = await supabase.from('tours').select('id, name, currency').eq('id', tourId).maybeSingle();
  if (!tour) notFound();

  const { data: packs } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('tour_id', tour.id)
    .order('updated_at', { ascending: false });

  let resolvedSection: ResolvedSection | null = null;
  let resolvedPackId: string | null = null;
  let resolveError: string | null = null;

  for (const pack of packs ?? []) {
    try {
      const resolved = await resolvePack(supabase, pack as RiderPack);
      const sec = resolved.sections.find((s) => s.section_type === 'channel_list');
      if (sec) {
        resolvedSection = sec;
        resolvedPackId = pack.id as string;
        break;
      }
    } catch (e) {
      resolveError = formatResolveError(e);
    }
  }

  const tourCurrency = (tour.currency as string | null) ?? 'GBP';

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col space-y-4 px-4 pb-16 pt-6 print:max-w-none print:pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-lp-text">Channel list</h1>
          <p className="mt-0.5 text-sm text-lp-text-secondary">{tour.name ?? tourId}</p>
        </div>
        <a
          href={`/operations/${tourId}/stage-plot`}
          className="rounded-lg border border-lp-border bg-lp-surface px-3 py-1.5 text-sm font-medium text-lp-text-secondary hover:text-lp-text"
        >
          Open stage plot →
        </a>
      </header>

      {resolveError && !resolvedSection ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Rider pack resolve issue: {resolveError}
        </p>
      ) : null}

      {resolvedPackId && resolvedSection ? (
        <ChannelListTourSheet packId={resolvedPackId} section={resolvedSection} tourDefaultCurrency={tourCurrency} tourId={tour.id} />
      ) : (
        !resolveError && (
          <p className="rounded-xl border border-dashed border-lp-border bg-lp-surface/60 px-4 py-8 text-center text-sm text-lp-text-secondary">
            No channel list section found on a tour rider pack yet.{' '}
            <a className="text-lp-orange hover:underline" href={`/operations/${tourId}/riders`}>
              Open riders →
            </a>
          </p>
        )
      )}
    </div>
  );
}
