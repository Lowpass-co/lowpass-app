/* ============================================
   LOWPASS — Tour Rooming Page

   Master grid + per-hotel sheets.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RoomingView } from '@/components/rooming/RoomingView';

export default async function TourRoomingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error: tourError } = await supabase
    .from('tours')
    .select('id, name, currency, workspace_id')
    .eq('id', tourId)
    .single();

  if (tourError || !tour) notFound();

  const [routingRes, hotelsRes, ratesRes] = await Promise.all([
    supabase.from('routing').select('*').eq('tour_id', tourId).order('date', { ascending: true }),
    supabase
      .from('hotel_bookings')
      .select('*, hotel_room_assignments(*)')
      .eq('tour_id', tourId)
      .eq('workspace_id', tour.workspace_id)
      .order('check_in_date', { ascending: true, nullsFirst: true }),
    supabase.from('personnel_rates').select('*').eq('tour_id', tourId).order('order_index'),
  ]);

  const routingDates = routingRes.data ?? [];
  const hotelsRaw = hotelsRes.data ?? [];
  const personnelRates = ratesRes.data ?? [];

  const hotels = hotelsRaw.map((h: { hotel_room_assignments?: unknown[] }) => ({
    ...h,
    room_assignments: h.hotel_room_assignments ?? [],
  }));

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-12">
      <RoomingView
        tourId={tour.id}
        tourName={tour.name}
        currency={tour.currency}
        routingDates={routingDates ?? []}
        hotels={hotels}
        personnelRates={personnelRates ?? []}
      />
    </div>
  );
}
