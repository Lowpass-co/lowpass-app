/* ============================================
   LOWPASS — Day View Page

   Vertical timeline of routing dates with advance + budget per day.
   ============================================ */

import { notFound } from 'next/navigation';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { DayViewTimeline } from '@/components/day-view/DayViewTimeline';
import type { Tour } from '@/types';
import type { RoutingDate } from '@/types';

export default async function DayViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error: tourError } = await supabase
    .from('tours')
    .select('*, artist:artists(*)')
    .eq('id', tourId)
    .single();

  if (tourError || !tour) {
    notFound();
  }

  const { data: routingDates, error: routingError } = await supabase
    .from('routing')
    .select('*, venue:venues(*)')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });

  if (routingError) {
    notFound();
  }

  const routing = (routingDates ?? []) as RoutingDate[];

  return listAppPageShell(
    <div className="mx-auto max-w-5xl space-y-4 pb-12">
      <DayViewTimeline tour={tour as Tour} routingDates={routing} />
    </div>
  );
}
