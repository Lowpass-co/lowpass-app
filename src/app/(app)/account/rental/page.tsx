/* ============================================
   LOWPASS — /account/rental → /equipment redirect
   (IA Cleanup §I4.2)

   Phase 1 §D's "per-user rental" decision was reversed by
   Sprint 12 §1 (migration 095 — rental_inventory +
   rental_jobs scoped back to workspace). The canonical
   rental surface is /equipment, now a workspace dashboard
   tab via §I3. /account/rental survives only as a
   permanent redirect so stale bookmarks land cleanly.

   The avatar-dropdown entry that linked here is removed in
   the same §I4 commit.
   ============================================ */

import { redirect } from 'next/navigation';

export default function AccountRentalPage(): never {
  redirect('/equipment');
}
