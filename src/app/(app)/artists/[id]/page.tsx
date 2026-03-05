/* ============================================
   LOWPASS — Artist Detail / Edit Page

   View and edit artist (name, Spotify, logo).
   ============================================ */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ArrowLeft } from 'lucide-react';
import { ArtistEditForm } from '@/components/artists/ArtistEditForm';
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Sticky nav so back link is always visible */}
      <div className="sticky top-0 z-10 -mx-6 flex items-center gap-4 border-b border-lp-border bg-lp-bg px-6 py-4">
        <Link
          href="/tours"
          className="flex items-center gap-1 text-sm font-medium text-lp-text-secondary hover:text-lp-text"
        >
          <ArrowLeft size={16} />
          Tours
        </Link>
        <h1 className="text-lg font-semibold text-lp-text">Artist</h1>
      </div>
      <div>
        <p className="text-sm text-lp-text-secondary">
          Update artist details, Spotify link, and logo.
        </p>
      </div>
      <ArtistEditForm artist={artist as Artist} />
    </div>
  );
}
