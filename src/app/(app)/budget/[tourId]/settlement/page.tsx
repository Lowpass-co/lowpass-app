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
import { PageHeader } from '@/components/ui/PageHeader';
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
      <PageHeader
        eyebrow="Budget · settlement"
        title="Settlement"
        subtitle="Close-out flow: per-show day-of vs reconciled guarantees, overage, merch, deductions."
        className="mb-4"
      />
      <SettlementTab tourId={tourId} currency={currency} />
    </div>
  );
}
