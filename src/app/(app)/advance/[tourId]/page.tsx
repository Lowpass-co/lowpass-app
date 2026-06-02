/* ============================================
   LOWPASS — Advance · Tour overview (Visual redesign §B)

   /advance/[tourId] — renders the per-tour advance overview body.

   Sprint 8.1 §2 — ProductShell + TourHeader hoisted to
   /advance/[tourId]/layout.tsx; layout owns artist + tour fetch
   and stats. This page renders only the show list + AdvanceOverview.

   <AdvanceOverview> still owns the show list, filter chips, ⋯ menu,
   layout-template apply, copy-from flow — none of that moves.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PageHeader } from '@/components/ui/PageHeader';
import { AdvanceOverview } from '@/components/advance/AdvanceOverview';

export default async function AdvanceTourOverviewPage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, name')
    .eq('id', tourId)
    .maybeSingle();

  if (tourErr || !tour) {
    notFound();
  }

  const t = tour as { id: string; name: string | null };

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 px-6 py-6">
      <PageHeader
        eyebrow={`Advance · ${t.name ?? 'Tour'}`}
        title="Shows"
        subtitle="Per-show advance forms across this tour. Click a row to open the advance for that day."
      />

      <AdvanceOverview tourId={t.id} />
    </div>
  );
}
