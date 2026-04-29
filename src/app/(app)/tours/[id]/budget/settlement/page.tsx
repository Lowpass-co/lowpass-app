/* ============================================
   LOWPASS — Settlement page (Phase C budget redesign)

   Adam-confirmed disposition: settlement gets its own route. The
   existing legacy SettlementTab carries the close-out flow already;
   we mount it here at /tours/[id]/budget/settlement so the surface
   stays reachable while the rest of the legacy tab nav retires.

   When PR #3 (nav redesign) merges, drop <TourBreadcrumbServer
   tourId={id} /> as the first child of the wrapper div per the
   per-page mount convention.
   ============================================ */

import { notFound } from 'next/navigation';
import { topBarOnlyAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { SettlementTab } from '@/_legacy/budget/SettlementTab';

export default async function TourBudgetSettlementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, currency')
    .eq('id', tourId)
    .single();

  if (error || !tour) notFound();

  const currency = (tour.currency as string | null) ?? 'GBP';

  return topBarOnlyAppPageShell(
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-12 pt-6">
      {/* TODO(post-PR#3): mount <TourBreadcrumbServer tourId={tourId} />
         here when the nav-redesign branch merges. */}
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            style={{
              color: 'var(--lp-text)',
              fontSize: 'var(--lp-text-2xl)',
              fontWeight: 'var(--lp-weight-semibold)',
            }}
          >
            Settlement
          </h1>
          <p
            className="mt-0.5 text-sm"
            style={{ color: 'var(--lp-text-secondary)' }}
          >
            Close-out flow: per-show day-of vs reconciled guarantees, overage, merch, deductions.
          </p>
        </div>
      </header>
      <SettlementTab tourId={tourId} currency={currency} />
    </div>,
  );
}
