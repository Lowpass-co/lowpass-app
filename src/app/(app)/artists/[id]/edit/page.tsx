/* ============================================
   LOWPASS — Artist Edit Page

   Dedicated edit surface for artist details (name, Spotify, logo)
   plus the annual budget summary. Split out from /artists/[id]
   when that route became the Artist Hub (Phase B nav redesign);
   the hub now owns presentation, this page owns mutation.

   Reachable from the hub's "Settings" affordance.
   ============================================ */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ArtistEditForm } from '@/components/artists/ArtistEditForm';
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

  return listAppPageShell(
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <Link
          href={`/artists/${a.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium"
          style={{ color: 'var(--lp-text-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {a.name ?? 'artist'}
        </Link>
        <h1
          className="mt-2"
          style={{
            color: 'var(--lp-text)',
            fontSize: 'var(--lp-text-2xl)',
            fontWeight: 'var(--lp-weight-semibold)',
          }}
        >
          {a.name ?? 'Artist'} · Settings
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: 'var(--lp-text-secondary)' }}
        >
          Update artist details, Spotify link, and logo. Annual budget summary below.
        </p>
      </div>

      <ArtistBudgetSummaryDynamic artistId={a.id} artistName={a.name} />

      <ArtistEditForm artist={a} />
    </div>,
  );
}
