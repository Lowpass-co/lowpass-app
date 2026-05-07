/* ============================================
   LOWPASS — Budget · Settlement (Phase 3 §A migration)

   /budget/[tourId]/settlement — replaces /tours/[id]/budget/settlement.

   Sprint 8.1 §2 — ProductShell + TourHeader hoisted to
   /budget/[tourId]/layout.tsx. This page renders only the
   settlement body content.

   The settlement surface keeps its current substance — Phase 3
   §A is a migration commit only. A standalone settlement redesign
   is not in scope for this sprint.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { SettlementTab } from '@/_legacy/budget/SettlementTab';

export default async function BudgetSettlementPage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, currency')
    .eq('id', tourId)
    .single();

  if (error || !tour) notFound();

  const currency = (tour.currency as string | null) ?? 'GBP';

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-12 pt-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
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
            Budget · settlement
          </p>
          <h1 className="lp-h1 mt-1">Settlement</h1>
          <p
            className="mt-1"
            style={{
              fontSize: '14px',
              color: 'var(--lp-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            Close-out flow: per-show day-of vs reconciled guarantees,
            overage, merch, deductions.
          </p>
        </div>
      </header>
      <SettlementTab tourId={tourId} currency={currency} />
    </div>
  );
}
