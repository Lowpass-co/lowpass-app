'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const ArtistBudgetSummary = dynamic(
  () => import('./ArtistBudgetSummary').then((m) => ({ default: m.ArtistBudgetSummary })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-6 text-sm text-lp-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading budget summary…
      </div>
    ),
  }
);

export function ArtistBudgetSummaryDynamic({
  artistId,
  artistName,
}: {
  artistId: string;
  artistName?: string | null;
}) {
  return <ArtistBudgetSummary artistId={artistId} artistName={artistName ?? undefined} />;
}
