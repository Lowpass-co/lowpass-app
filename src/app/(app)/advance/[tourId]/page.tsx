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
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <p
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            Advance · {t.name ?? 'Tour'}
          </p>
          <h1 className="lp-h1 mt-1">Shows</h1>
          <p
            className="mt-1"
            style={{
              fontSize: '14px',
              color: 'var(--lp-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            Per-show advance forms across this tour. Click a row to
            open the advance for that day.
          </p>
        </div>
      </header>

      <AdvanceOverview tourId={t.id} />
    </div>
  );
}
