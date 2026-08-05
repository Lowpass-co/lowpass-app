/* ============================================
   LOWPASS — per-request server context (perf pass 1, 2026-08-04)

   WHY THIS FILE EXISTS. In production every page render ran a SEQUENTIAL
   chain of network round-trips, and ran several of them TWICE: middleware
   verified the user against the Auth server, then the workspace layout did
   auth → profile → workspace name, then <ShellV3Mount> did auth AGAIN →
   artists → profile AGAIN → workspace AGAIN → permissions. On a Vercel
   lambda that is 6–10 serial round-trips to Supabase before the page's own
   queries even start — the "slow everywhere" Adam feels.

   Two mechanisms fix it:

   · React `cache()` — every helper here is memoised PER REQUEST. However many
     layouts, mounts and pages ask for the user, the profile, the workspace
     name or the visible resources, each is fetched at most once per render.

   (A second mechanism — getClaims local verification — shipped here once and
   was rolled back after the 2026-08-05 incident; see getRequestUser's note.)

   RULES: server-only (React cache + next/headers via the supabase client).
   Helpers return plain data. Add new per-request reads HERE, not inline in
   layouts — an inline read is invisible to the next caller and the
   duplication comes back.
   ============================================ */

import { cache } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolveVisibleResources } from '@/lib/nav/visibleResources';

/** THE request's Supabase client — one instance shared by every server
 *  component in the render. Sharing the instance is also what lets
 *  session-refresh logic run once instead of per-caller. */
export const getRequestSupabase = cache(async () => createServerSupabaseClient());

export interface RequestUser {
  id: string;
  email: string;
}

/**
 * The authenticated user, verified ONCE per request.
 *
 * INCIDENT 2026-08-05 (c9affb9 rollback) — this used getClaims() as a
 * local-verification fast path; production broke on Vercel with all-200s and
 * zero error logs (silent auth-state divergence on the deployed runtime —
 * unreproducible via `next start` or the test suite). getUser() is back and
 * getClaims must not return here without preview-deploy observation. The
 * cache() dedupe is the part of the perf win that survives: however many
 * layers ask, ONE auth round-trip per request instead of 3–5.
 */
export const getRequestUser = cache(async (): Promise<RequestUser | null> => {
  const supabase = await getRequestSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? '' } : null;
});

export interface RequestProfile {
  full_name: string | null;
  avatar_url: string | null;
  is_site_admin: boolean;
  workspace_id: string | null;
}

/** The caller's profile row — the four fields the chrome and the admin gates
 *  read. One SELECT per request no matter how many callers.
 *
 *  INCIDENT 2026-08-05 №2 (the /artists ⇄ /login reload loop) — this select
 *  originally asked for `full_name`, a column that exists on `persons` but NOT
 *  on `profiles` (the column is `name`, migration 001). PostgREST 400'd
 *  (42703) on EVERY request, `maybeSingle` returned { data: null, error }, the
 *  error was silently discarded, and the null cascaded: profile → workspace
 *  name → the (workspace) layout's redirect('/login') → middleware bounced the
 *  (perfectly authenticated) user back → infinite document-reload loop. The
 *  getClaims rollback (dcfa2e5) could not fix it because auth was never the
 *  broken link. Two defences now:
 *    · `full_name:name` aliases the REAL column into the shape callers read —
 *      see profilesSelectContract.test.tsx, which pins every profiles select
 *      in src/ to columns the migrations actually create.
 *    · query errors are LOGGED, never silently coerced to "no profile" — a
 *      42703 must show up in Vercel logs, not surface as a login redirect. */
export const getRequestProfile = cache(async (): Promise<RequestProfile | null> => {
  const user = await getRequestUser();
  if (!user) return null;
  const supabase = await getRequestSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name:name, avatar_url, is_site_admin, workspace_id')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    console.error('[requestContext] profiles select failed:', error.code, error.message);
  }
  const p = (data ?? null) as {
    full_name?: string | null;
    avatar_url?: string | null;
    is_site_admin?: boolean | null;
    workspace_id?: string | null;
  } | null;
  if (!p) return null;
  return {
    full_name: p.full_name ?? null,
    avatar_url: p.avatar_url ?? null,
    is_site_admin: !!p.is_site_admin,
    workspace_id: p.workspace_id ?? null,
  };
});

/** The caller's workspace display name. Chains through the cached profile, so
 *  inside a Promise.all it costs one query after the profile, not a chain of
 *  its own. Null = unauthenticated or no workspace (callers gate on that). */
export const getRequestWorkspaceName = cache(async (): Promise<string | null> => {
  const profile = await getRequestProfile();
  if (!profile?.workspace_id) return null;
  const supabase = await getRequestSupabase();
  const { data, error } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', profile.workspace_id)
    .maybeSingle<{ name: string | null }>();
  if (error) {
    console.error('[requestContext] workspaces select failed:', error.code, error.message);
  }
  return data?.name ?? null;
});

/** P-1 rail filter, once per request (membership + grants for readonly;
 *  role short-circuit for admin/manager — see resolveVisibleResources). */
export const getRequestVisibleResources = cache(async (): Promise<string[] | null> => {
  const user = await getRequestUser();
  if (!user) return null;
  const supabase = await getRequestSupabase();
  return resolveVisibleResources(supabase, user.id);
});
