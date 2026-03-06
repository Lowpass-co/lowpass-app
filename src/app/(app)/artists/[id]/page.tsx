/* ============================================
   LOWPASS — Artist Detail / Edit Page

   View and edit artist (name, Spotify, logo).
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ArtistEditForm } from '@/components/artists/ArtistEditForm';
import { ArtistPageHeader } from '@/components/artists/ArtistPageHeader';
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ArtistPageHeader artistId={a.id} artistName={a.name ?? 'Artist'} />
      <div>
        <p className="text-sm text-lp-text-secondary">
          Update artist details, Spotify link, and logo.
        </p>
      </div>
      <ArtistEditForm artist={a} />
    </div>
  );
}
