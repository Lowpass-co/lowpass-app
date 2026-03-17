/* ============================================
   LOWPASS — Spreadsheet View Page

   Category-based budget grids with inline editing.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { SpreadsheetView } from '@/components/spreadsheet-view/SpreadsheetView';
import type { Tour } from '@/types';

const VALID_TABS = [
  'income',
  'hotels',
  'flights',
  'transport',
  'production',
  'receipts',
  'commissions',
] as const;
export type SheetTab = (typeof VALID_TABS)[number];

export default async function SheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id: tourId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = VALID_TABS.includes(tabParam as SheetTab)
    ? (tabParam as SheetTab)
    : 'income';

  const supabase = await createServerSupabaseClient();
  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, name, currency')
    .eq('id', tourId)
    .single();

  if (error || !tour) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-12">
      <SpreadsheetView tourId={tour.id} tourName={tour.name} currency={tour.currency} defaultTab={tab} />
    </div>
  );
}
