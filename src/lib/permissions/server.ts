/* ============================================
   LOWPASS — Permissions server-side helpers (Sprint 9 §5)

   TypeScript port of the SQL helpers in migration 079. Used by
   server components (page.tsx files) to gate page rendering
   without an extra RPC roundtrip per request. Mirrors
   public.can_access exactly:

     admin/manager → always allowed
     readonly      → requires permission_grants row matching
                     subject_type='user'+subject_id=auth.uid OR
                     subject_type='tag'+subject_id IN user's tags
     write implies read

   The SQL helper still gates RLS at the DB layer; this is the
   page-level gate that decides whether to render the surface
   vs render a 403 panel. Defense in depth: even if the page
   forgets to gate, the strict-gated tables' RLS already
   filters everything out.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ResourcePermission,
  ResourceType,
} from '@/lib/permissions/resources';
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
 *
 * Reads workspace_member_tags too so canAccess() can do tag-mediated
 * grant lookups without another query.
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

  // Tags via member_id. workspace_member_tags has admin-only
  // RLS, so a non-admin caller can't SELECT directly. We use
  // the SECURITY DEFINER RPC public.get_my_tags_in_active_workspace
  // (added in migration 082) to bypass and return the caller's
  // tags. If the RPC isn't deployed yet (Phase 5 will work
  // without it because routing has no tag-mediated grants),
  // tags stays empty and tag-grant evaluation gracefully
  // degrades — the page-level gate may 403 a user whose only
  // access is via tag-mediated grant, but the SQL RLS still
  // serves them correctly.
  //
  // Skip the RPC for admin/manager — they pass canAccess()
  // unconditionally via role, never need tag lookup.
  let tags: string[] = [];
  if (m.role === 'readonly') {
    const { data: tagsData, error } = await supabase.rpc(
      'get_my_tags_in_active_workspace',
    );
    if (!error && Array.isArray(tagsData)) {
      tags = tagsData as string[];
    }
  }

  return {
    workspace_id: workspaceId,
    member_id: m.id,
    role: m.role,
    is_workspace_owner: m.is_workspace_owner,
    tags,
  };
}

/**
 * Mirror of public.can_access(resource_type, resource_id, permission).
 * Pre-fetches all of the caller's user-direct + tag-mediated grants
 * once via grant fetcher, then checks locally against the catalog.
 *
 * Use canAccessBatch() for surfaces (e.g. OperationsSubNav) that
 * test many resource_ids per render — single query, in-memory checks.
 */
export function canAccess(
  membership: ActiveMembership | null,
  grants: GrantRow[],
  resource_type: ResourceType,
  resource_id: string,
  permission: ResourcePermission,
): boolean {
  if (!membership) return false;
  if (membership.role === 'admin' || membership.role === 'manager') return true;

  // Readonly: walk the pre-fetched grants. Write implicitly
  // satisfies read.
  for (const g of grants) {
    if (g.resource_type !== resource_type) continue;
    if (g.resource_id !== resource_id) continue;
    if (g.permission !== permission && !(permission === 'read' && g.permission === 'write')) {
      continue;
    }
    if (g.subject_type === 'user') {
      // Pre-filter at the query level ensures subject_id matches
      // user_id; trust here.
      return true;
    }
    if (g.subject_type === 'tag') {
      if (membership.tags.includes(g.subject_id)) return true;
    }
  }
  return false;
}

/** A row from permission_grants relevant to the caller. */
export interface GrantRow {
  resource_type: ResourceType;
  resource_id: string;
  permission: ResourcePermission;
  subject_type: 'user' | 'tag';
  subject_id: string;
}

/**
 * Fetch all permission_grants relevant to the caller in their
 * active workspace: rows where (subject_type='user' AND
 * subject_id=user_id) OR (subject_type='tag' AND subject_id IN
 * user's tags). One query per page render; canAccess() checks
 * many resource_ids against this set.
 *
 * Admin/manager get an empty array — canAccess short-circuits
 * on role and never reads the array for them.
 */
export async function fetchActiveGrants(
  supabase: SupabaseClient,
  membership: ActiveMembership | null,
  userId: string,
): Promise<GrantRow[]> {
  if (!membership) return [];
  if (membership.role !== 'readonly') return [];

  const subjectFilters = [`and(subject_type.eq.user,subject_id.eq.${userId})`];
  if (membership.tags.length > 0) {
    const inList = membership.tags
      .map((t) => `"${t.replace(/"/g, '')}"`)
      .join(',');
    subjectFilters.push(`and(subject_type.eq.tag,subject_id.in.(${inList}))`);
  }

  const { data, error } = await supabase
    .from('permission_grants')
    .select('resource_type, resource_id, permission, subject_type, subject_id')
    .eq('workspace_id', membership.workspace_id)
    .or(subjectFilters.join(','));

  if (error || !data) return [];
  return data as GrantRow[];
}
