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
import { IncomeSettlementSwitch } from '@/components/budget/IncomeSettlementSwitch';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { SettlementWalkClient } from '@/components/settlement/SettlementWalkClient';
import { loadTourSettlementWalks } from '@/lib/settlement/loadWalk';

export const dynamic = 'force-dynamic';

export default async function BudgetSettlementPage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, currency, workspace_id')
    .eq('id', tourId)
    .single();

  if (error || !tour) notFound();

  const currency = (tour.currency as string | null) ?? 'GBP';
  const workspaceId = tour.workspace_id as string | null;

  // M1-B — the Walk surface (itemized deductions/expenses/payments → Balance due,
  // catch-up queue). Falls back gracefully if the workspace can't be resolved.
  const shows = workspaceId
    ? await loadTourSettlementWalks(supabase, tourId, workspaceId, currency)
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-12 pt-6">
      <PageHeader
        title="Income & settlements"
        subtitle="Settle each show on the night: deductions and expenses down to the balance due, then log the payment and mark it final."
        actions={<IncomeSettlementSwitch tourId={tourId} active="settlements" />}
        className="mb-4"
      />
      <SettlementWalkClient tourId={tourId} currency={currency} shows={shows} />
    </div>
  );
}
