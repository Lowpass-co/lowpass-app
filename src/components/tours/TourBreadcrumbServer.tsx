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

/**
 * Mount this at the TOP of every page under `src/app/(app)/tours/[id]/**`.
 *
 * Why per-page and not in `tours/[id]/layout.tsx`:
 * `PageShell` creates a `<main overflow:auto>` scroll container. A
 * sticky element mounted in the layout sits OUTSIDE that scroll
 * context and fights the TopBar's stacking — either rendering behind
 * it or pinning at the wrong y. Mounted per-page (inside main),
 * sticky `top:0` works as intended and the strip flushes against
 * the TopBar's bottom edge.
 *
 * If you're adding a new tour-internal page and forget to mount
 * this, the user loses the [Back to tour] escape hatch and the
 * `← Artist › Tour › Page` orientation strip. Don't.
 *
 * See the Phase D commit (e347a5f) for the original rollout and
 * `docs/handover/CC_NAV_ARTIST_TOUR_WORK.md` for product context.
 */
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
