import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { topBarOnlyAppPageShell } from '@/components/shell/app-page-shells';
import { TourBudgetRebuildClient } from '@/components/budget/TourBudgetRebuildClient';
import { MobileBudgetBanner } from '@/components/mobile/MobileBudgetBanner';
import { TourBreadcrumbServer } from '@/components/tours/TourBreadcrumbServer';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: tour } = await supabase.from('tours').select('name').eq('id', id).single();
  return { title: tour?.name ? `${tour.name} — Budget` : 'Budget' };
}

export default async function TourBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, workspace_id, currency')
    .eq('id', id)
    .single();

  if (tourErr || !tour) {
    notFound();
  }

  const workspaceId = tour.workspace_id as string;

  const { data: lineRows } = await supabase
    .from('budget_line_items')
    .select('*')
    .eq('tour_id', id)
    .eq('workspace_id', workspaceId)
    .order('section')
    .order('sort_order', { ascending: true })
    .order('category')
    .order('order_index', { ascending: true });

  // TODO(UX14): once budget section list is treated as a rail, replace
  // topBarOnlyAppPageShell with spreadsheetAppPageShell + a section variant.
  return topBarOnlyAppPageShell(
    <div className="flex min-h-0 flex-1 flex-col pb-24">
      <TourBreadcrumbServer tourId={id} />
      <MobileBudgetBanner />
      <TourBudgetRebuildClient
        initialLines={lineRows ?? []}
        tourDefaultCurrency={(tour.currency as string | null) ?? 'GBP'}
        tourId={id}
      />
    </div>
  );
}
