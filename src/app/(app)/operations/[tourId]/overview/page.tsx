/* ============================================
   LOWPASS — tour Overview (Nov 2026, Adam) — where every tour opens.
   Reads only. See src/lib/tour/overview.ts for what it shows and why.
   ============================================ */

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadTourOverview } from '@/server/tour/overview';
import { TourOverview } from '@/components/tour-overview/TourOverview';
import { getRequestViewerAccess } from '@/lib/server/requestContext';
import { viewerCan } from '@/lib/permissions/tourAccess';

export const dynamic = 'force-dynamic';

export default async function TourOverviewPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/operations/${tourId}/overview`);

  const { data: tour } = await supabase.from('tours').select('id, workspace_id').eq('id', tourId).maybeSingle();
  if (!tour) notFound();
  // The same access the rail uses (my_tour_access): parts the viewer can't
  // open are neither read nor shown.
  const access = await getRequestViewerAccess(tourId);
  const data = await loadTourOverview(supabase, tourId, (tour as { workspace_id: string }).workspace_id, {
    advance: viewerCan(access, 'advance'),
    budget: viewerCan(access, 'budget'),
    receipts: viewerCan(access, 'receipts'),
    production: viewerCan(access, 'production'),
  });
  if (!data) notFound();
  return <TourOverview facts={data.facts} />;
}
