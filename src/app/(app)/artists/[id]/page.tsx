/* ============================================
   LOWPASS — Artist Detail / Edit Page

   View and edit artist (name, Spotify, logo).
   Includes annual budget summary.
   ============================================ */

import { notFound } from 'next/navigation';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ArtistEditForm } from '@/components/artists/ArtistEditForm';
import { ArtistPageHeader } from '@/components/artists/ArtistPageHeader';
import { ArtistBudgetSummaryDynamic } from '@/components/budget/ArtistBudgetSummaryDynamic';
import type { Artist } from '@/types';

export default async function ArtistPage({
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

  return listAppPageShell(
    <div className="mx-auto max-w-4xl space-y-6">
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
  );
}
