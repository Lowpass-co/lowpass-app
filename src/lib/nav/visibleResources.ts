/* ============================================
   LOWPASS — which rail items this caller may SEE (P-1)

   The rail replaced <OperationsGroupSubNav>, which filtered its eight links by
   canAccess(). Nothing carried that across, so from S-2a a readonly member saw
   every item — Payroll included — where they previously saw a shorter menu.

   WHAT THIS DOES AND DOESN'T FIX. Six of those eight pages never gated
   themselves; only personnel and routing do. So those URLs were always
   reachable by typing them, and this module closes DISCOVERABILITY, not access.
   Access is a separate audit and this must not be mistaken for it.

   Resolved on the server and handed down as a plain string[], for the same
   reason everything else in this shell is: a function cannot cross an RSC
   boundary, and the client has no business deciding what it may see anyway.

   COST. getActiveMembership reads profiles + workspace_members; grants are ONE
   more query and only for readonly — canAccess short-circuits on role for
   admin/manager, and fetchActiveGrants returns [] without querying. So the
   common case adds a single round-trip, and the caller can hand in a profile it
   already fetched to make it none.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { canAccess, fetchActiveGrants, getActiveMembership } from '@/lib/permissions/server';
import { RESOURCE_CATALOG } from '@/lib/permissions/resources';
import { allRailResources } from './ia';

/** resource id → its catalogue type. `advance` is a PRODUCT, the rest are pages. */
const TYPE_BY_ID = new Map(RESOURCE_CATALOG.map((r) => [r.id, r.type]));

/**
 * The resource ids this user may read, for every rail in the app.
 *
 * Returns `null` when there is no user or no membership — meaning "don't
 * filter". A signed-out or workspace-less caller isn't looking at a rail
 * anyway, and returning an empty allow-list there would render an empty nav
 * instead of the sign-in the page is about to do.
 */
export async function resolveVisibleResources(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<string[] | null> {
  if (!userId) return null;
  try {
    const membership = await getActiveMembership(supabase, userId);
    if (!membership) return null;

    /* Admin and manager pass canAccess unconditionally, so skip the grants
       query entirely and hand back the whole set. Same answer, one less
       round-trip on the path most requests take. */
    if (membership.role !== 'readonly') return allRailResources();

    const grants = await fetchActiveGrants(supabase, membership, userId);
    return allRailResources().filter((id) =>
      canAccess(membership, grants, TYPE_BY_ID.get(id) ?? 'page', id, 'read'),
    );
  } catch {
    /* A nav that vanishes because a permissions query failed is worse than a
       nav that shows too much: the user can't work, and nothing tells them why.
       Fail open, and let the pages and RLS do the enforcing they already do. */
    return null;
  }
}
