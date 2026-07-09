/* ============================================
   LOWPASS — Operations · Labor (P6, tour-level Crew › Labor)

   Thin read + jump surface: labor calls across the tour's days. Editing lives on
   each advance day (the day is the editing home). Layout chrome (ProductShell +
   TourHeader) comes from /operations/[tourId]/layout.tsx. NOT payroll.
   ============================================ */

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { LaborTourView } from '@/components/operations/labor/LaborTourView';

export const dynamic = 'force-dynamic';

export default async function OperationsTourLaborPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/operations/${tourId}/labor`);

  const { data: tour } = await supabase.from('tours').select('id, name').eq('id', tourId).maybeSingle();
  if (!tour) notFound();

  const { data: routingRows } = await supabase
    .from('routing')
    .select('id, date, city, venue_name')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });

  const days = (routingRows ?? []).map((r) => ({
    id: r.id as string,
    date: (r.date as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    venue: (r.venue_name as string | null) ?? null,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="mx-auto w-full" style={{ flex: 1, minWidth: 0, padding: 'var(--lp-space-4)' }}>
        <header className="mb-3">
          <h1 style={{ margin: 0, fontSize: 'var(--lp-text-2xl)', fontWeight: 'var(--lp-weight-bold)', color: 'var(--lp-text)' }}>
            Labor
          </h1>
        </header>
        <LaborTourView tourId={tourId} days={days} />
      </div>
    </div>
  );
}
