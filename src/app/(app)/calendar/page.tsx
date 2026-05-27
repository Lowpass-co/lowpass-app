/* ============================================
   LOWPASS — /calendar → /artists (IA Cleanup §I1.1)

   The workspace-level /calendar surface duplicated
   /operations/[tourId]/day. The two-tier IA puts calendar
   data inside tour context, so the workspace URL becomes
   a redirect to the workspace dashboard.

   Stale bookmarks land on /artists. Picking an artist +
   tour gets you to the live day view.
   ============================================ */

import { redirect } from 'next/navigation';

export default function CalendarPage(): never {
  redirect('/artists');
}
