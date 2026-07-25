/* ============================================
   LOWPASS — <TourVisitTracker> (Sprint 8.2 §6; hardened in the F-3 fixpack)

   Tiny client island that records "you visited this tour" so the workspace
   landing's Pick Up Where You Left Off card reflects real usage. Renders nothing.

   WHY THIS WAS REWRITTEN (the cold-load 503):
   Cowork's cold trace of /operations/[id]/routing showed this POST in the request
   chain, 503-ing on a cold lambda. The ROUTE was never at fault — it already
   swallows errors and always returns 204. The problem was WHEN and HOW we asked:

     - It fired immediately on mount, so a best-effort liveness ping raced the
       page's own data for scarce cold-start capacity. A 503 there is the platform
       declining a second concurrent invocation, not our handler failing.
     - It used fetch(), so that failure surfaced as a console error on an otherwise
       healthy page, and the request stayed attached to the document through the
       most latency-sensitive moment of the load.

   Two changes, both serving "a fire-and-forget write must never block or error a
   page load":

     1. DEFERRED to idle. requestIdleCallback with a 2s timeout so it still fires
        on a busy page, plus a setTimeout fallback where rIC is missing (Safari).
        The critical path finishes first; "last visited" landing a beat later is
        completely acceptable for what it feeds.

     2. sendBeacon FIRST. navigator.sendBeacon is genuinely fire-and-forget: the
        browser owns the request out-of-band, it survives navigation away, and —
        the point here — a failure cannot reject into our code or log a network
        error. fetch(keepalive) stays as the fallback, still silently caught.

   Same-origin sendBeacon sends cookies, so auth and RLS still scope the UPDATE.
   The route reads no body.

   Behaviour preserved: one ping per layout mount (the layout survives sub-route
   navigation within a product), re-fires when tourId changes, errors silent.
   ============================================ */

'use client';

import { useEffect } from 'react';

/** Fire the ping. Beacon when available; silent fetch otherwise. */
export function pingTourVisit(tourId: string): void {
  const url = `/api/tours/${tourId}/touch`;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // Empty blob — the route reads no body. Beacon failures are swallowed by the
      // browser and cannot surface as a console error.
      navigator.sendBeacon(url, new Blob([], { type: 'text/plain' }));
      return;
    }
  } catch {
    // Some browsers throw under strict CSP / beacon quota. Fall through to fetch.
  }
  void fetch(url, { method: 'POST', keepalive: true }).catch(() => {
    // Best-effort by definition.
  });
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function TourVisitTracker({ tourId }: { tourId: string }) {
  useEffect(() => {
    if (!tourId) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) pingTourVisit(tourId);
    };

    // Wait for idle so the ping never competes with the page's own payload on a
    // cold lambda.
    const w = window as IdleWindow;
    if (typeof w.requestIdleCallback === 'function') {
      const handle = w.requestIdleCallback(run, { timeout: 2000 });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(handle);
      };
    }

    const t = setTimeout(run, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [tourId]);

  return null;
}
