/* ============================================
   LOWPASS — /admin (Sprint 9 §10)

   Redirects to /admin/users — the canonical landing tab.
   The layout's site-admin gate runs first and returns the 403
   panel for non-site-admins.
   ============================================ */

import { redirect } from 'next/navigation';

export default function AdminIndexPage() {
  redirect('/admin/users');
}
