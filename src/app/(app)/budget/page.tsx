/* ============================================
   LOWPASS — Budget · workspace-level router

   Budget is tour-scoped. This tourless landing is a clean selection
   funnel (never the legacy 8-tab surface in src/_legacy/budget/, which
   is unreachable post-Phase-3):

   - `?tour_id=X` present            → server-side redirect to /budget/X
   - context has a selected tour     → WorkspaceTourRedirect hard-replaces
                                        to /budget/{tourId}
   - no tour anywhere                → "Select a tour to open Budget" prompt

   Nav & entry fixpack item 4 — moved off shell-v1 (listAppPageShell) to
   <ProductShell active="budget">, matching the /operations + /advance
   landings so all three product funnels share chrome.
   ============================================ */

import { redirect } from 'next/navigation';
import { ProductShell } from '@/components/shell-v2';
import { WorkspaceTourRedirect } from '@/components/shell-v2/WorkspaceTourRedirect';
import { SelectTourPrompt } from '@/components/shell-v2/SelectTourPrompt';

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ tour_id?: string }>;
}) {
  const params = await searchParams;
  const tourId = params.tour_id;

  // Server-side redirect for explicit query-param links / bookmarks.
  if (tourId && tourId.trim()) {
    redirect(`/budget/${tourId.trim()}`);
  }

  return (
    <ProductShell active="budget" artistId={null} productName="Budget">
      <WorkspaceTourRedirect base="/budget" />
      <SelectTourPrompt product="Budget" />
    </ProductShell>
  );
}
