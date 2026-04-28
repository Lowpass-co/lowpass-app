/* ============================================
   LOWPASS — Tour Summary (Overview)

   Server: parallel fetches + pure aggregations; client: dashboard cards.
   ============================================ */

import { notFound } from 'next/navigation';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { TourOverviewClient } from '@/components/tour-overview/TourOverviewClient';
import {
  computeBudgetData,
  computeAdvanceData,
  computeSettlementData,
  computePayrollData,
  type TourOverviewData,
} from '@/components/tour-overview/overview-utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: tour } = await supabase.from('tours').select('name').eq('id', id).single();
  return {
    title: tour?.name ? `${tour.name} — Tour Summary` : 'Tour Summary',
  };
}

export default async function TourOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error: tourError } = await supabase
    .from('tours')
    .select(
      `
      *,
      artist:artists(*)
    `
    )
    .eq('id', id)
    .single();

  if (tourError || !tour) {
    notFound();
  }

  const workspaceId = tour.workspace_id as string;

  const [{ data: routingRows }, { data: lineItems }, { data: personnelRates }, { data: payrollRows }] =
    await Promise.all([
      supabase
        .from('routing')
        .select('id, date, venue_name, day_type, city')
        .eq('tour_id', id)
        .order('date', { ascending: true }),
      supabase
        .from('budget_line_items')
        .select('proposed_cost, actual_cost')
        .eq('tour_id', id)
        .eq('workspace_id', workspaceId),
      supabase
        .from('personnel_rates')
        .select('person_type, show_rate, off_rate, per_diem')
        .eq('tour_id', id),
      supabase
        .from('payroll_entries')
        .select('week_start, total_fee, total_per_diem')
        .eq('tour_id', id),
    ]);

  const routing = routingRows ?? [];
  const routingIds = routing.map((r) => r.id);

  const empty = Promise.resolve({ data: [] as Record<string, unknown>[] });

  const [incomeRes, instancesRes, settlementRes] = await Promise.all([
    routingIds.length
      ? supabase
          .from('budget_income')
          .select('*')
          .in('routing_id', routingIds)
          .eq('workspace_id', workspaceId)
      : empty,
    routingIds.length
      ? supabase.from('advance_instances').select('routing_id, status, flags').in('routing_id', routingIds)
      : empty,
    routingIds.length
      ? supabase
          .from('settlement')
          .select('routing_id, status, reconciled_guarantee, reconciled_overage')
          .in('routing_id', routingIds)
          .eq('workspace_id', workspaceId)
      : empty,
  ]);

  const income = (incomeRes.data ?? []) as Parameters<typeof computeBudgetData>[0];
  const lineItemsTyped = (lineItems ?? []) as Parameters<typeof computeBudgetData>[1];
  const instances = (instancesRes.data ?? []) as Parameters<typeof computeAdvanceData>[0];
  const settlements = (settlementRes.data ?? []) as Parameters<typeof computeSettlementData>[0];
  const ratesForPayroll = (personnelRates ?? []) as Parameters<typeof computePayrollData>[1];
  const payrollEntries = (payrollRows ?? []) as Parameters<typeof computePayrollData>[0];

  const showCount = routing.filter((r) => r.day_type === 'show' || r.day_type === 'festival').length;

  const today = new Date();
  const start = tour.start_date ? new Date(`${tour.start_date}T12:00:00`) : null;
  const end = tour.end_date ? new Date(`${tour.end_date}T12:00:00`) : null;
  const daysUntilStart =
    start && start.getTime() > today.getTime()
      ? Math.ceil((start.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      : null;
  const daysRemaining =
    end && end.getTime() >= today.getTime()
      ? Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      : null;
  const inProgress =
    start && end
      ? today.getTime() >= start.getTime() && today.getTime() <= end.getTime()
      : false;

  const overview: TourOverviewData = {
    heroData: { showCount, daysUntilStart, daysRemaining, inProgress },
    budgetData: computeBudgetData(income, lineItemsTyped),
    advanceData: computeAdvanceData(instances, routing),
    settlementData: computeSettlementData(settlements, routing, today),
    payrollData: computePayrollData(payrollEntries, ratesForPayroll, routing),
  };

  const artistName = (tour.artist as { name?: string } | null)?.name ?? '—';
  const currency = (tour.currency as string) || 'GBP';

  return listAppPageShell(
    <TourOverviewClient
      tourId={id}
      artistName={artistName}
      tourName={tour.name as string}
      startDate={(tour.start_date as string) ?? ''}
      endDate={(tour.end_date as string) ?? ''}
      status={(tour.status as string) ?? 'planning'}
      currency={currency}
      overview={overview}
    />
  );
}
