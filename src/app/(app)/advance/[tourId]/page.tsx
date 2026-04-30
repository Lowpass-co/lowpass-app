/* ============================================
   LOWPASS — Advance · Tour overview (Phase 2 §A migration)

   /advance/[tourId] — replaces /tours/[id]/advance. Wraps the
   existing UX22-phase-1 <AdvanceOverview> in the new <ProductShell>
   instead of the legacy docDaysAppPageShell. The tour breadcrumb
   from the prior page is gone — <ProductHeader> now carries
   artist · tour context.

   Phase 1 placeholder retired here.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ProductShell } from '@/components/shell-v2';
import { AdvanceOverview } from '@/components/advance/AdvanceOverview';

export default async function AdvanceTourOverviewPage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, name, artist_id')
    .eq('id', tourId)
    .maybeSingle();

  if (error || !tour) {
    notFound();
  }

  const t = tour as { id: string; name: string | null; artist_id: string | null };

  return (
    <ProductShell
      active="advance"
      artistId={t.artist_id}
      tourId={t.id}
      productName="Advance"
    >
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
    </ProductShell>
  );
}
