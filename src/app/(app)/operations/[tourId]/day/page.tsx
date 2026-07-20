/* ============================================
   LOWPASS — Operations · Day View (Phase 4 unblock)

   /operations/[tourId]/day — live day-of-show timeline. Ports
   /tours/[id]/day, inner content only (ProductShell + TourHeader come
   from /operations/[tourId]/layout.tsx).
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { DayViewTimeline } from '@/components/day-view/DayViewTimeline';
import { TourRolesPanel } from '@/components/day/TourRolesPanel';
import type { Tour, RoutingDate } from '@/types';

export const dynamic = 'force-dynamic';

export default async function OperationsTourDayViewPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = user ? await getActiveMembership(supabase, user.id) : null;
  const canManageRoles = membership?.role === 'admin' || membership?.role === 'manager';

  const { data: tour, error: tourError } = await supabase
    .from('tours')
    .select('*, artist:artists(*)')
    .eq('id', tourId)
    .single();

  if (tourError || !tour) notFound();

  const { data: routingDates, error: routingError } = await supabase
    .from('routing')
    .select('*, venue:venues(*)')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });

  if (routingError) notFound();

  const routing = (routingDates ?? []) as RoutingDate[];

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 pt-6 pb-12">
      {canManageRoles ? <TourRolesPanel tourId={tourId} /> : null}
      <DayViewTimeline tour={tour as Tour} routingDates={routing} />
    </div>
  );
}
