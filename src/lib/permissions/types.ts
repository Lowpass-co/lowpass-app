/* ============================================
   LOWPASS — Permissions UI types (Sprint 9 §3)

   Shared types for the members-management surface. The API
   route shapes match these one-to-one.
   ============================================ */

import type { GrantInput, ResourcePermission, ResourceType } from './resources';

/** 'tour_manager' (migration 298): only their tours, everything on them, plus
 *  workspace templates. Between Member ('readonly') and Manager. */
export type WorkspaceRole = 'admin' | 'manager' | 'tour_manager' | 'readonly';

export interface Member {
  member_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: WorkspaceRole;
  is_workspace_owner: boolean;
  joined_at: string;
  last_sign_in_at: string | null;
  tags: string[];
  grants: GrantInput[];
}

export interface PendingInvite {
  id: string;
  invited_email: string;
  invited_role: WorkspaceRole;
  initial_tags: string[];
  initial_grants: GrantInput[];
  invited_by_user_id: string | null;
  invited_by_name: string | null;
  expires_at: string;
  created_at: string;
}

export interface WorkspaceMembersPayload {
  workspace_id: string;
  members: Member[];
  invites: PendingInvite[];
  /** Each Member's tour access rows, by workspace_members id (Nov 2026). */
  access?: Record<string, Array<{ tour_id: string | null; area: string; level: string }>>;
}

export interface WorkspaceListItem {
  id: string;
  name: string;
  role: WorkspaceRole;
  is_workspace_owner: boolean;
  member_count: number;
  is_active: boolean;
}

export type { GrantInput, ResourcePermission, ResourceType };
