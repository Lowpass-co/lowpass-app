/* ============================================
   LOWPASS — Tour Breadcrumb (server wrapper)

   Async server component that resolves the breadcrumb context
   (artist + tour identity) from a tourId, then renders the
   client TourBreadcrumb. Each tour-internal page drops this in
   at the top of its main content:

       <TourBreadcrumbServer tourId={tourId} />

   Fetches happen server-side so the breadcrumb appears with no
   client-side flash. Returns null when the tour can't be
   resolved — the parent page will 404 anyway.
   ============================================ */

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getTourBreadcrumbContext } from '@/server/tours/getTourBreadcrumbContext';
import { TourBreadcrumb } from '@/components/tours/TourBreadcrumb';

export async function TourBreadcrumbServer({ tourId }: { tourId: string }) {
  const supabase = await createServerSupabaseClient();
  const ctx = await getTourBreadcrumbContext(supabase, tourId);
  if (!ctx) return null;
  return (
    <TourBreadcrumb
      artistId={ctx.artistId}
      artistName={ctx.artistName}
      tourId={ctx.tourId}
      tourName={ctx.tourName}
    />
  );
}
