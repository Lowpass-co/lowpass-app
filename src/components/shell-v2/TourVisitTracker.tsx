/* ============================================
   LOWPASS — Sprint 8.2 §6 — <TourVisitTracker>

   Tiny client island that fires a fire-and-forget POST to
   /api/tours/[id]/touch on mount. Mounted from each per-product
   layout (operations, budget, advance) so the user's actual
   visit pattern is recorded and the Pick Up Where You Left Off
   card surfaces what they really worked on last.

   Behaviour:
     - One POST per layout mount. The layout instance survives
       sub-route navigation within the same product (e.g. budget
       summary → settlement) thanks to Sprint 8.1 §2's hoist,
       so no double-touch on tab switches.
     - tourId changes (e.g. /budget/[A] → /budget/[B] in the
       same product layout) re-fire via the [tourId] dep array.
     - Errors silently dropped. The tracker is best-effort and
       must never block the user.

   Renders nothing.
   ============================================ */

'use client';

import { useEffect } from 'react';

export function TourVisitTracker({ tourId }: { tourId: string }) {
  useEffect(() => {
    if (!tourId) return;
    const controller = new AbortController();
    fetch(`/api/tours/${tourId}/touch`, {
      method: 'POST',
      signal: controller.signal,
      // No body, no Content-Type header needed.
      keepalive: true,
    }).catch(() => {
      // Best-effort. AbortError on unmount is expected and silent.
    });
    return () => controller.abort();
  }, [tourId]);
  return null;
}
