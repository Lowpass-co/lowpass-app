/* ============================================
   LOWPASS — Operations · Stage Plot

   /operations/[tourId]/stage-plot — tour-scoped stage plots.
   Mirrors the artist-library stage-plots page (rider_packs of
   kind='stage_plot' → stage_plots id), but scoped to the tour
   (scope='tour', tour_id). Chrome (ProductShell + sub-nav) is the
   operations/[tourId]/layout.tsx. Requires migration 109.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { OperationsStagePlotClient } from '@/components/stage-plot/OperationsStagePlotClient';
import type { StagePlotListRow } from '@/components/stage-plot/StagePlotLibraryList';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ tourId: string }>;
}

export default async function OperationsStagePlotPage({ params }: PageProps) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour } = await supabase.from('tours').select('id, artist_id').eq('id', tourId).maybeSingle();
  if (!tour) notFound();
  const artistId = (tour as { artist_id: string | null }).artist_id;

  const { data: packData } = await supabase
    .from('rider_packs')
    .select('id, title, updated_at')
    .eq('tour_id', tourId)
    .eq('kind', 'stage_plot')
    .order('updated_at', { ascending: false });
  const packs = (packData ?? []) as { id: string; title: string | null; updated_at: string }[];

  let rows: StagePlotListRow[] = [];
  if (packs.length) {
    const { data: plotData } = await supabase
      .from('stage_plots')
      .select('id, rider_pack_id')
      .in('rider_pack_id', packs.map((p) => p.id));
    const byPack = new Map((plotData as { id: string; rider_pack_id: string }[] | null ?? []).map((p) => [p.rider_pack_id, p.id]));
    rows = packs
      .filter((p) => byPack.has(p.id))
      .map((p) => ({ stagePlotId: byPack.get(p.id)!, title: p.title ?? 'Untitled stage plot', updatedAt: p.updated_at }));
  }

  return <OperationsStagePlotClient tourId={tourId} artistId={artistId} rows={rows} />;
}
