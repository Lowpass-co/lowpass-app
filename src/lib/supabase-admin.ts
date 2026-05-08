/* ============================================
   LOWPASS — Site admin server helpers (Sprint 9 §10)

   Wrappers used by /api/admin/* routes:
     - requireSiteAdmin(supabase) — returns the calling user
       only if profiles.is_site_admin = TRUE; throws otherwise.
       Use this at the top of every admin route.
     - createServiceSupabaseAdminClient() — service-role client
       for actual auth.users / storage admin operations.
       Bypasses RLS. Caller MUST have already verified site
       admin status; this helper does NOT re-check.

   Auth admin operations require service_role key; never expose
   this client to client-side code or to non-site-admin callers.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from '@/lib/supabase-server';

export class NotSiteAdminError extends Error {
  status = 403 as const;
  constructor() {
    super('Forbidden — site admin only');
    this.name = 'NotSiteAdminError';
  }
}

export class UnauthenticatedError extends Error {
  status = 401 as const;
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthenticatedError';
  }
}

/**
 * Verify the caller is authenticated AND has site admin
 * status. Returns the user record on success; throws on
 * failure. Every /api/admin/* route should call this before
 * doing anything else.
 */
export async function requireSiteAdmin(
  supabase: SupabaseClient,
): Promise<{ id: string; email: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthenticatedError();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_site_admin')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = (profile as { is_site_admin?: boolean | null } | null)
    ?.is_site_admin === true;

  if (!isAdmin) throw new NotSiteAdminError();
  return { id: user.id, email: user.email ?? null };
}

/**
 * Service-role Supabase client. Bypasses RLS; required for
 * auth admin operations (delete user, send recovery, suspend).
 * Caller MUST have verified site admin status before calling
 * this — there is no internal gate.
 */
export function createServiceSupabaseAdminClient() {
  return createServiceSupabaseClient();
}

/** Map a thrown admin error to an HTTP status + message. */
export function adminErrorResponse(err: unknown): {
  status: number;
  message: string;
} {
  if (err instanceof NotSiteAdminError) return { status: 403, message: err.message };
  if (err instanceof UnauthenticatedError) return { status: 401, message: err.message };
  if (err instanceof Error) return { status: 500, message: err.message };
  return { status: 500, message: 'Internal error' };
}
