/* ============================================
   LOWPASS — workspace roles, on screen (Nov 2026 — migration 298)

   ONE list, ONE set of labels. Order = most to least.
     Admin        — god tier: everything, members, settings, deleting.
     Manager      — every tour, every area; not members / workspace settings.
     Tour manager — only the tours they're given, everything on them (dates,
                    details, crew, their People), plus the workspace's templates.
     Read-only    — only the tours + areas set under Tour access, view or edit.
   ============================================ */

import type { WorkspaceRole } from './types';

export const ROLES: readonly WorkspaceRole[] = ['admin', 'manager', 'tour_manager', 'readonly'];

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  tour_manager: 'Tour manager',
  readonly: 'Read-only',
};

export const ROLE_HINT: Record<WorkspaceRole, string> = {
  admin: 'Everything, including members.',
  manager: 'Every tour, every area — not members or billing.',
  tour_manager: 'Only the tours below, everything on them (dates, crew, their People), plus templates.',
  readonly: 'Only the tours and areas set below.',
};

/** Scoped by tour_access rows (the Tour access editor applies). */
export function isTourScoped(role: WorkspaceRole): boolean {
  return role === 'readonly' || role === 'tour_manager';
}
