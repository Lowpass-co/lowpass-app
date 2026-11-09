/* ============================================
   /budget/[tourId]/settlement — now part of Income & settlements
   (Nov 2026, Adam — "Option B": one page, the deal beside the night).
   Old links (the tour Overview's "Settle", bookmarks, the /tours redirect)
   land on the same show there.
   ============================================ */

import { redirect } from 'next/navigation';

export default async function BudgetSettlementPage({
  params,
  searchParams,
}: {
  params: Promise<{ tourId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { tourId } = await params;
  const { show } = await searchParams;
  redirect(`/budget/${tourId}?tab=income${show ? `&show=${encodeURIComponent(show)}` : ''}`);
}
