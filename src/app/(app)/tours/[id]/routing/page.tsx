/* ============================================
   LOWPASS — Routing Page

   Dedicated page for the routing editor.
   Formerly the main tour page — now tour overview
   is the dashboard and routing has its own route.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RoutingEditor } from '@/components/routing/RoutingEditor';

export default async function RoutingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, start_date, end_date, custom_day_types')
    .eq('id', id)
    .single();

  if (error || !tour) {
    notFound();
  }

  return (
    <RoutingEditor
      tourId={id}
      startDate={tour.start_date ?? ''}
      endDate={tour.end_date ?? ''}
      initialCustomDayTypes={tour.custom_day_types ?? []}
    />
  );
}
