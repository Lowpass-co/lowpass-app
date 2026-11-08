/* ============================================
   LOWPASS — tour Overview (Nov 2026, Adam) — where every tour opens.
   Reads only. See src/lib/tour/overview.ts for what it shows and why.
   ============================================ */

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadTourOverview } from '@/server/tour/overview';
import { TourOverview } from '@/components/tour-overview/TourOverview';
import { getRequestVisibleResources } from '@/lib/server/requestContext';

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
  // The rail's own access list: null = everything (admin / manager).
  const visible = await getRequestVisibleResources();
  const can = (id: string) => visible === null || visible.includes(id);
  const data = await loadTourOverview(supabase, tourId, (tour as { workspace_id: string }).workspace_id, {
    advance: can('advance'),
    budget: can('budget.line_items'),
    receipts: can('budget.receipts'),
    crew: can('operations.personnel'),
    production: can('operations.riders'),
  });
  if (!data) notFound();
  return <TourOverview facts={data.facts} />;
}
