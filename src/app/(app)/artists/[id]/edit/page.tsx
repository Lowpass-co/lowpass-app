/* ============================================
   LOWPASS — Artist Edit Page

   Pre-Phase-1 this lived at /artists/[id]. Phase 1 promotes that
   route to the artist Home (overview), so the edit form moves here.
   Inbound links from ArtistsList + ArtistPageHeader were updated.

   S-3a — the per-page <ProductShell> is gone; chrome comes from
   /artists/[id]/layout.tsx like every other artist surface. This page had to
   carry its own because it sits outside the (home) and (library) route groups,
   which is exactly the drift the shared layout removes. The
   <ArtistEditSlideOver> (mounted from ArtistHero) covers artist-detail edits,
   but this page uniquely hosts <ArtistBudgetSummaryDynamic>, so it stays.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ArtistEditForm } from '@/components/artists/ArtistEditForm';
import { ArtistPageHeader } from '@/components/artists/ArtistPageHeader';
import { ArtistBudgetSummaryDynamic } from '@/components/budget/ArtistBudgetSummaryDynamic';
import type { Artist } from '@/types';

export default async function ArtistEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: artist, error } = await supabase
    .from('artists')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !artist) {
    notFound();
  }

  const a = artist as Artist;

  return (
    <>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <ArtistPageHeader artistId={a.id} artistName={a.name ?? 'Artist'} />

        {/* Annual Budget Summary */}
        <ArtistBudgetSummaryDynamic artistId={a.id} artistName={a.name} />

        {/* Artist details / edit */}
        <div>
          <p className="text-sm text-lp-text-secondary mb-4">
            Update artist details, Spotify link, and logo.
          </p>
          <ArtistEditForm artist={a} />
        </div>
      </div>
    </>
  );
}
