/* ============================================
   LOWPASS — Routing Page

   Dedicated page for the routing editor.
   Formerly the main tour page — now tour overview
   is the dashboard and routing has its own route.
   ============================================ */

import { notFound } from 'next/navigation';
import { docDaysAppPageShell } from '@/components/shell/app-page-shells';
import { getDocDaysLeftRail } from '@/lib/shell/rails/docDaysForTour';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RoutingEditor } from '@/components/routing/RoutingEditor';
import { RoutingPageShell } from '@/components/routing/RoutingPageShell';
import { RoutingRightRail } from '@/components/routing/RoutingRightRail';
import { TourBreadcrumbServer } from '@/components/tours/TourBreadcrumbServer';

export default async function RoutingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, name, start_date, end_date, custom_day_types')
    .eq('id', id)
    .single();

  if (error || !tour) {
    notFound();
  }

  const subtitle = formatSubtitle(tour.name, tour.start_date, tour.end_date);

  const dayRail = await getDocDaysLeftRail(id);

  return docDaysAppPageShell(
    <>
      <TourBreadcrumbServer tourId={id} />
      <RoutingPageShell
        title="Routing"
        subtitle={subtitle}
        rightRail={<RoutingRightRail tourId={id} />}
      >
        <RoutingEditor
          tourId={id}
          startDate={tour.start_date ?? ''}
          endDate={tour.end_date ?? ''}
          initialCustomDayTypes={tour.custom_day_types ?? []}
        />
      </RoutingPageShell>
    </>,
    dayRail
  );
}

function formatSubtitle(
  name: string | null,
  startDate: string | null,
  endDate: string | null,
): string {
  const parts: string[] = [];
  if (name) parts.push(name);
  if (startDate && endDate) {
    parts.push(`${startDate} → ${endDate}`);
  } else if (startDate) {
    parts.push(startDate);
  }
  return parts.join(' · ');
}
