/* ============================================
   LOWPASS — /artists/[id]/files (Sprint 12 §7, stub)

   No standalone artist-files model yet. Files currently live
   as rider_assets (uploaded inside rider packs) and per-tour
   storage. This page exists so the artist library URL space
   is complete; folder/group modelling lands once Adam's
   workflow is nailed.
   ============================================ */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FolderOpen } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ArtistFilesPage({ params }: PageProps) {
  const { id: artistId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artistData } = await supabase
    .from('artists')
    .select('id, name')
    .eq('id', artistId)
    .maybeSingle();
  const artist = artistData as { id: string; name: string } | null;
  if (!artist) notFound();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--lp-space-4)',
        padding: 'var(--lp-space-6)',
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      <header>
        <p
          style={{
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text-tertiary)',
            marginBottom: 'var(--lp-space-1)',
          }}
        >
          {artist.name} · Files
        </p>
        <h1
          className="lp-h2"
          style={{
            margin: 0,
            fontSize: 'var(--lp-text-2xl)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: 'var(--lp-text)',
          }}
        >
          {artist.name} — Files
        </h1>
      </header>

      <div
        style={{
          padding: 'var(--lp-space-6)',
          textAlign: 'center',
          border: '1px dashed var(--lp-border)',
          borderRadius: 'var(--lp-radius-lg)',
          background: 'var(--lp-panel)',
        }}
      >
        <FolderOpen
          size={28}
          style={{
            marginInline: 'auto',
            marginBottom: 'var(--lp-space-2)',
            color: 'var(--lp-text-tertiary)',
          }}
        />
        <p
          style={{
            margin: 0,
            marginBottom: 'var(--lp-space-2)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          A standalone artist-files surface lands once the workflow is nailed.
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          For now, files live alongside each rider pack (uploaded inside the
          rider editor) and per tour.
        </p>
        <Link
          href={`/artists/${artistId}`}
          style={{
            display: 'inline-block',
            marginTop: 'var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--color-lp-orange)',
            textDecoration: 'none',
          }}
        >
          ← Back to {artist.name}
        </Link>
      </div>
    </div>
  );
}
