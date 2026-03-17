/* ============================================
   LOWPASS — Tour-Wide Costs Page

   Fetches line items (filter routing_id null), settings, commissions.
   Renders TourWideCosts client component.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { TourWideCosts } from '@/components/tour-wide/TourWideCosts';

export default async function TourWidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error: tourError } = await supabase
    .from('tours')
    .select('id, name, currency, artist_id, workspace_id')
    .eq('id', tourId)
    .single();

  if (tourError || !tour) notFound();

  const [lineItemsRes, settingsRes, commissionsRes, routingRes, personnelRes] = await Promise.all([
    supabase
      .from('budget_line_items')
      .select('*')
      .eq('tour_id', tourId)
      .order('category')
      .order('order_index'),
    supabase
      .from('budget_settings')
      .select('*')
      .eq('tour_id', tourId)
      .maybeSingle(),
    supabase
      .from('budget_commissions')
      .select('*')
      .eq('tour_id', tourId)
      .order('order_index'),
    supabase.from('routing').select('day_type').eq('tour_id', tourId),
    supabase.from('personnel_rates').select('id').eq('tour_id', tourId),
  ]);

  const allLineItems = lineItemsRes.data ?? [];
  const tourWideItems = allLineItems.filter((i: { routing_id: string | null }) => i.routing_id == null);
  const settings = settingsRes.data ?? null;
  const commissions = commissionsRes.data ?? [];
  const routingRows = routingRes.data ?? [];
  const showCount = routingRows.filter((r: { day_type: string }) => r.day_type === 'show' || r.day_type === 'festival').length;
  const crewCount = (personnelRes.data ?? []).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-12">
      <TourWideCosts
        tourId={tour.id}
        currency={tour.currency ?? 'GBP'}
        artistId={(tour as { artist_id?: string }).artist_id ?? ''}
        workspaceId={(tour as { workspace_id?: string }).workspace_id ?? ''}
        showCount={showCount}
        crewCount={crewCount}
        initialLineItems={tourWideItems}
        initialSettings={settings}
        initialCommissions={commissions}
      />
    </div>
  );
}
