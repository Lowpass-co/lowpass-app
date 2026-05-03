/* ============================================
   LOWPASS — Budget · workspace-level router
   ============================================

   Post-merge fix-up — this page used to render the legacy 8-tab
   budget surface (BudgetDetailShell + BUDGET_TABS from
   src/_legacy/budget/). Adam's smoke flagged it as still leaking
   through when the rail's Budget link didn't carry a tour id.

   It is now a router-only page:

   - `?tour_id=X` present  → server-side redirect to /budget/X
   - no tour_id, but context has a tour → BudgetTourRedirect
     hard-replaces the URL to /budget/{contextTour}
   - no tour_id and no context tour → minimal "select a tour" prompt
     with a link to the artist picker; never renders BudgetDetailShell

   The legacy 8-tab surface lives in src/_legacy/budget/ and is
   unreachable from anywhere in the app post-Phase-3 + this commit.

   The ProductRail itself now appends `/{selectedTourId}` to the
   Budget link when a tour is selected (see shell-v2/ProductRail),
   so this page should rarely be reached at all.
   ============================================ */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { BudgetTourRedirect } from '@/components/budget/BudgetTourRedirect';

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

  return listAppPageShell(
    <>
      {/* Client-side hard-replace when localStorage has a selected
          tour. <Suspense> wraps it because BudgetTourRedirect uses
          useSearchParams which Next 16 wants suspended. */}
      <Suspense fallback={null}>
        <BudgetTourRedirect />
      </Suspense>
      <div className="-mx-6 -my-6 flex h-[calc(100vh-4rem)] items-center justify-center p-8">
        <div
          className="max-w-md rounded-xl border p-6 text-center"
          style={{
            borderColor: 'var(--lp-border-strong)',
            background: 'var(--lp-surface)',
          }}
        >
          <h1 className="lp-h2">Select a tour to open Budget</h1>
          <p
            className="mt-2"
            style={{
              fontSize: '14px',
              color: 'var(--lp-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            Pick an artist + tour from the Home page (the Budget link
            in the left rail jumps to that tour&apos;s budget once one
            is selected).
          </p>
          <Link
            href="/artists"
            className="btn-transition mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5"
            style={{
              fontSize: '13px',
              fontWeight: 500,
              background: 'var(--color-lp-orange)',
              color: 'var(--lp-text-inverse, #fff)',
            }}
          >
            Go to artists →
          </Link>
        </div>
      </div>
    </>,
  );
}
