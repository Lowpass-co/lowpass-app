/* ============================================
   LOWPASS — Site-admin helpers (server)

   Backend utilities for checking the `profiles.is_site_admin` flag
   added in migration 036. Site admins are the only users who can
   triage bug reports at /bugs; everyone else can still FILE bugs.

   Promote a user:
     UPDATE profiles SET is_site_admin = true WHERE email = 'x@x.com';
   ============================================ */

import { createServerSupabaseClient } from '@/lib/supabase-server';

/** Return { user, isAdmin }. `user` is null if the request is unauthenticated. */
export async function getUserAndAdminStatus(): Promise<{
  user: { id: string } | null;
  isAdmin: boolean;
}> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, isAdmin: false };

  const { data } = await supabase
    .from('profiles')
    .select('is_site_admin')
    .eq('id', user.id)
    .maybeSingle();

  return { user: { id: user.id }, isAdmin: !!data?.is_site_admin };
}

/** Convenience: resolve to true only when the caller is authed AND an admin. */
export async function requireSiteAdmin(): Promise<boolean> {
  const { isAdmin } = await getUserAndAdminStatus();
  return isAdmin;
}
