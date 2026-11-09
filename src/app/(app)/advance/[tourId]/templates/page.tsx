/* ============================================
   LOWPASS — /advance/[tourId]/templates → /templates (Nov 2026)

   Advance templates belong to the workspace, not a tour, so the page now
   lives in the workspace menu (Templates). The links on the Advance board
   and show pages still come here; this sends them on, remembering the tour
   so the page can offer "← Advance" back to it.
   ============================================ */

import { redirect } from 'next/navigation';

export default async function AdvanceTemplatesRedirect({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  redirect(`/templates?from=${encodeURIComponent(tourId)}`);
}
