/* ============================================================
   LOWPASS — Tour roles: server-side resolution + data access (D1-3)

   The enforcement helpers that sit between the tour_roles table (mig 245) and
   the slice contract (slices.ts). Every surface that renders a role-scoped view
   resolves the viewer's role HERE (server-only), never from a client flag:

     - resolveViewerTourRole  → the authenticated viewer's effective role on a
       tour. Workspace admin/manager = full operator (tm); a readonly member is
       scoped to their tour_roles row, fail-closed to crew.
     - listTourRoles / assignTourRole / removeTourRole → the CRUD the roles panel
       + the D1-4 token minting build on.

   Admin/manager gating lives in the API route; these helpers assume the caller
   already passed the workspace guard.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isTourRole, type TourRole } from '@/lib/roles/slices';

export interface TourRoleRow {
  id: string;
  tour_id: string;
  person_id: string;
  user_id: string | null;
  role: TourRole;
  person_name: string | null;
}

/**
 * The viewer's effective role on `tourId`. Admin/manager → tm (full operator);
 * a readonly member → their tour_roles slice, fail-closed to crew if unassigned.
 * `membershipRole` is `getActiveMembership(...).role`.
 */
export async function resolveViewerTourRole(
  supabase: SupabaseClient,
  membershipRole: string,
  tourId: string,
  userId: string,
): Promise<TourRole> {
  if (membershipRole === 'admin' || membershipRole === 'manager') return 'tm';
  const { data } = await supabase
    .from('tour_roles')
    .select('role')
    .eq('tour_id', tourId)
    .eq('user_id', userId)
    .maybeSingle();
  return isTourRole(data?.role) ? data.role : 'crew';
}

/** All role assignments for a tour, with the person's display name. */
export async function listTourRoles(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<TourRoleRow[]> {
  const { data } = await supabase
    .from('tour_roles')
    .select('id, tour_id, person_id, user_id, role, persons(full_name, preferred_name)')
    .eq('tour_id', tourId)
    .eq('workspace_id', workspaceId);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const p = (Array.isArray(r.persons) ? r.persons[0] : r.persons) as
      | { full_name?: string | null; preferred_name?: string | null }
      | null;
    return {
      id: r.id as string,
      tour_id: r.tour_id as string,
      person_id: r.person_id as string,
      user_id: (r.user_id as string | null) ?? null,
      role: (isTourRole(r.role) ? r.role : 'crew') as TourRole,
      person_name: (p?.preferred_name ?? p?.full_name ?? null) as string | null,
    };
  });
}

/** Assign (or re-assign) a person's role on a tour. UNIQUE(tour_id, person_id)
 *  → upsert on that pair so re-assigning just updates the role. */
export async function assignTourRole(
  supabase: SupabaseClient,
  args: { tourId: string; workspaceId: string; personId: string; role: TourRole; createdBy: string | null },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('tour_roles')
    .upsert(
      {
        tour_id: args.tourId,
        workspace_id: args.workspaceId,
        person_id: args.personId,
        role: args.role,
        created_by: args.createdBy,
      },
      { onConflict: 'tour_id,person_id' },
    );
  return { error: error?.message ?? null };
}

/** Remove a role assignment (by row id, workspace-scoped). */
export async function removeTourRole(
  supabase: SupabaseClient,
  args: { roleId: string; workspaceId: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('tour_roles')
    .delete()
    .eq('id', args.roleId)
    .eq('workspace_id', args.workspaceId);
  return { error: error?.message ?? null };
}
