/* ============================================
   LOWPASS — Site-admin helpers (server)

   Backend utilities for checking the `profiles.is_site_admin` flag
   added in migration 036. Site admins are the only users who can
   triage bug reports at /bugs; everyone else can still FILE bugs.

   Promote a user:
     UPDATE profiles SET is_site_admin = true WHERE email = 'x@x.com';
   ============================================ */

import { getRequestUser, getRequestProfile } from '@/lib/server/requestContext';

/** Return { user, isAdmin }. `user` is null if the request is unauthenticated.
 *
 *  Perf pass 1 (2026-08-04) — reads the per-request cache instead of running
 *  its own auth round-trip + profile SELECT: pages that call this alongside
 *  the shell now share one verification and one profile read. Signature and
 *  expiry are still verified (getUser inside the cache), and the
 *  is_site_admin gate is the same profiles column as before. */
export async function getUserAndAdminStatus(): Promise<{
  user: { id: string } | null;
  isAdmin: boolean;
}> {
  const user = await getRequestUser();
  if (!user) return { user: null, isAdmin: false };
  const profile = await getRequestProfile();
  return { user: { id: user.id }, isAdmin: !!profile?.is_site_admin };
}

/** Convenience: resolve to true only when the caller is authed AND an admin. */
export async function requireSiteAdmin(): Promise<boolean> {
  const { isAdmin } = await getUserAndAdminStatus();
  return isAdmin;
}
