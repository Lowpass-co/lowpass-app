/* ============================================
   LOWPASS — /artists/[id]/stage-plots (§SP0 IA)

   Artist-library stage plots. Sibling to riders / channel-lists;
   lists rider_packs of kind='stage_plot' mapped to their
   stage_plots id (the editor key). Requires migration 109.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { StagePlotLibraryList, type StagePlotListRow } from '@/components/stage-plot/StagePlotLibraryList';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ArtistStagePlotsPage({ params }: PageProps) {
  const { id: artistId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase.from('artists').select('id, name').eq('id', artistId).maybeSingle();
  if (!artist) notFound();

  const { data: packData } = await supabase
    .from('rider_packs')
    .select('id, title, updated_at')
    .eq('artist_id', artistId)
    .eq('scope', 'artist')
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

  return <StagePlotLibraryList artistId={artistId} rows={rows} />;
}
