/* ============================================
   LOWPASS — /rider-packs → /artists (IA Cleanup §I1.1)

   Workspace-level /rider-packs was the legacy listing of
   every rider pack in the workspace. The two-tier IA
   surfaces riders inside tour context
   (/operations/[tourId]/riders) and the artist library
   (/artists/[id]/(library)/riders), so the workspace URL
   becomes a redirect.

   /rider-packs/[id] still resolves — that's the individual
   pack editor, separately mounted.
   ============================================ */

import { redirect } from 'next/navigation';

export default function RiderPacksPage(): never {
  redirect('/artists');
}
