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

   · `auth.getClaims()` over `auth.getUser()` — getUser sends a request to the
     Auth server EVERY call; getClaims verifies the JWT locally against the
     project's cached JWKS when the project uses asymmetric signing keys, and
     falls back to the network path (same cost as before, never worse) when it
     can't. Signature and expiry ARE verified either way — this is not "trust
     the cookie". RLS at Postgres remains the real enforcement regardless.

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
 * Fast path: getClaims — local JWT verification (asymmetric keys), no Auth
 * server round-trip. Fallback: getUser — the network path, which also
 * refreshes an expired session (getClaims rejects expired tokens, so expiry
 * lands in the fallback and refresh still happens exactly as before).
 */
export const getRequestUser = cache(async (): Promise<RequestUser | null> => {
  const supabase = await getRequestSupabase();
  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!error && claims?.sub) {
      return { id: claims.sub, email: (claims.email as string | undefined) ?? '' };
    }
  } catch {
    /* verification unavailable — take the network path */
  }
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
 *  read. One SELECT per request no matter how many callers. */
export const getRequestProfile = cache(async (): Promise<RequestProfile | null> => {
  const user = await getRequestUser();
  if (!user) return null;
  const supabase = await getRequestSupabase();
  const { data } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, is_site_admin, workspace_id')
    .eq('id', user.id)
    .maybeSingle();
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
  const { data } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', profile.workspace_id)
    .maybeSingle<{ name: string | null }>();
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
