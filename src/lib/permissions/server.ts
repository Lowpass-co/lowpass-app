/* ============================================
   LOWPASS — the caller's workspace membership (server)

   Who you are in the active workspace: role, owner flag. WHAT a Member may
   see or change on a tour is tour access (src/lib/permissions/tourAccess.ts,
   the `my_tour_access` RPC — the same rows the database rules read). The
   Sprint 9 page grants (`permission_grants` + tags) no longer gate anything
   (Nov 2026: one system); `tags` stays on the type, always empty.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkspaceRole } from '@/lib/permissions/types';

/** Active workspace membership for the current user. Null if no
 *  active workspace OR the user has no membership for it. */
export interface ActiveMembership {
  workspace_id: string;
  member_id: string;
  role: WorkspaceRole;
  is_workspace_owner: boolean;
  tags: string[];
}

/**
 * Resolve the caller's active workspace membership. Returns null if:
 *   - User isn't authenticated.
 *   - Profile has no active workspace_id.
 *   - User isn't a member of that workspace (drift case — the SQL
 *     helper get_my_workspace_id already returns NULL here).
 */
export async function getActiveMembership(
  // Loosely typed to avoid pulling in the generated Database typings
  // here; the supabase client we hand in is the server-component one.
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveMembership | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .maybeSingle();

  const workspaceId =
    (profile as { workspace_id?: string | null } | null)?.workspace_id ?? null;
  if (!workspaceId) return null;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('id, role, is_workspace_owner')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!membership) return null;
  const m = membership as {
    id: string;
    role: WorkspaceRole;
    is_workspace_owner: boolean;
  };

  return {
    workspace_id: workspaceId,
    member_id: m.id,
    role: m.role,
    is_workspace_owner: m.is_workspace_owner,
    tags: [],
  };
}

