/* ============================================
   LOWPASS — Tour Summary P&L Page

   Fetches tour + artist, renders SummaryView (client) which loads
   summary API, personnel, payroll for salary/commission tables.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { SummaryView } from '@/components/summary/SummaryView';

export default async function TourSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error } = await supabase
    .from('tours')
    .select(`
      id,
      name,
      currency,
      updated_at,
      artist:artists(id, name)
    `)
    .eq('id', tourId)
    .single();

  if (error || !tour) notFound();

  const artistName = (tour.artist as { name?: string } | null)?.name ?? '—';
  const tourName = tour.name ?? '—';
  const currency = tour.currency ?? 'GBP';

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-12">
      <SummaryView
        tourId={tour.id}
        artistName={artistName}
        tourName={tourName}
        currency={currency}
        updatedAt={tour.updated_at ?? null}
      />
    </div>
  );
}
