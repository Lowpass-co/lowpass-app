/* ============================================
   LOWPASS — /rooming → /artists (IA Cleanup §I1.1)

   Workspace-level /rooming was the pre-Product-Split landing
   for cross-tour rooming entry. The two-tier IA scopes
   rooming inside tour context (/operations/[tourId]/rooming
   is the canonical surface). Workspace URL becomes a
   redirect.
   ============================================ */

import { redirect } from 'next/navigation';

export default function RoomingPage(): never {
  redirect('/artists');
}
