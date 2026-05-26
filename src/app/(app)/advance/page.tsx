/* ============================================
   LOWPASS — /advance → /artists (IA Cleanup §I1.1)

   Workspace-level /advance was a shell-v1 placeholder
   surfacing cross-tour advance. Unreachable from current
   nav. Live advance surface is /advance/[tourId]/[routingId]
   per tour. Workspace URL becomes a redirect.
   ============================================ */

import { redirect } from 'next/navigation';

export default function AdvanceWorkspacePage(): never {
  redirect('/artists');
}
