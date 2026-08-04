/* ============================================
   LOWPASS — Budget · workspace-level router (S-3b)

   Budget is tour-scoped. This tourless landing is a clean selection
   funnel (never the legacy 8-tab surface in src/_legacy/budget/, which
   is unreachable post-Phase-3):

   - `?tour_id=X` present            → server-side redirect to /budget/X
   - context has a selected tour     → WorkspaceTourRedirect hard-replaces
                                        to /budget/{tourId}
   - no tour anywhere                → "Select a tour to open Budget" prompt

   S-3b — chrome is <ShellV3Mount landing>: the workspace rail stays fully
   visible and the top bar renders its tour chrome GREYED — disabled mode
   pill, live artist/tour picker — until a tour is picked. Adam's call,
   2026-08-04.
   ============================================ */

import { redirect } from 'next/navigation';
import { ShellV3Mount } from '@/components/shell-v3/ShellV3Mount';
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
    <ShellV3Mount pathname="/budget" landing>
      <WorkspaceTourRedirect base="/budget" />
      <SelectTourPrompt product="Budget" />
    </ShellV3Mount>
  );
}
