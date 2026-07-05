/* ============================================
   LOWPASS — Artist Edit Page

   Pre-Phase-1 this lived at /artists/[id]. Phase 1 promotes that
   route to the artist Home (overview), so the edit form moves here.
   Inbound links from ArtistsList + ArtistPageHeader were updated.

   Nav & entry fixpack item 4 — moved off shell-v1 (listAppPageShell)
   to <ProductShell active="home">. The <ArtistEditSlideOver> (mounted
   from ArtistHero) covers the artist-detail edit, but this page uniquely
   hosts <ArtistBudgetSummaryDynamic>, so it's kept as a page (wrapped in
   product chrome) rather than retired.
   ============================================ */

import { notFound } from 'next/navigation';
import { ProductShell } from '@/components/shell-v2';
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
    <ProductShell
      active="home"
      artistId={a.id}
      productName="Home"
      homeHref={`/artists/${a.id}`}
    >
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
    </ProductShell>
  );
}
