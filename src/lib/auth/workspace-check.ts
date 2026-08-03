/* ============================================
   LOWPASS — Workspace auth helpers (Sprint 12 §SAFE)

   Centralises the "authenticated workspace member" gate
   that every AI endpoint needs before billing the API key.
   Pre-§SAFE this logic was inlined in three Budget AI routes
   and missing entirely from the Receipt OCR + Deal Memo
   Extract routes — those two were RLS-bypassable.

   Two helpers, both return NextResponse on failure so call
   sites read as:

     const auth = await requireUserAndWorkspace(supabase);
     if ('error' in auth) return auth.error;
     const { user, workspaceId } = auth;

   Pattern matches Sprint 9's `getUserAndAdminStatus` shape
   so anyone porting other endpoints later has precedent.
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canAccess,
  fetchActiveGrants,
  getActiveMembership,
  type ActiveMembership,
  type GrantRow,
} from '@/lib/permissions/server';

export type WorkspaceAuth = {
  user: { id: string };
  workspaceId: string;
};

/** Resolve the current user + their workspace_id from the
 *  authenticated Supabase server client. Returns `{ error }`
 *  when the user is unauthenticated or has no workspace
 *  membership — the caller should return the embedded
 *  response unchanged. */
export async function requireUserAndWorkspace(
  supabase: SupabaseClient,
): Promise<WorkspaceAuth | { error: NextResponse }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return { error: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  }
  return { user: { id: user.id }, workspaceId: profile.workspace_id };
}

/* ============================================
   requireWrite — THE AUTHORIZATION GATE (P0)

   `requireUserAndWorkspace` above is authentication + tenancy. It is NOT
   authorization, and its own docstring says so. The role check was meant to
   live in RLS, but RLS only encodes role on the 9 tables migration 079
   strict-gated; everything added since is workspace-only at both layers. That
   is how a readonly member created an artist and it persisted.

   This is the missing layer. Call it from every mutating handler:

     const auth = await requireWrite(supabase);            // admin/manager
     const auth = await requireWrite(supabase, { resource: 'budget.line_items' });
     const auth = await requireWrite(supabase, { adminOnly: true });
     if ('error' in auth) return auth.error;

   WHY canAccess AND NOT A NEW PREDICATE: it already means exactly this —
   admin/manager short-circuit true, readonly needs an explicit grant, and
   `write` is checked strictly (a read grant does not satisfy it, though write
   satisfies read). Inventing a second role model is what produced the
   can_access / is_workspace_admin split the spec calls incoherent. One model.

   NO RESOURCE = ADMIN/MANAGER ONLY. Most tables have no catalogue entry, and
   the safe reading of "no declared resource" for a WRITE is that only the two
   privileged roles may do it — the opposite of the read-side default in the nav
   rail, deliberately. A nav that shows too much is a nuisance; a write that
   lets too much through is this bug.
   ============================================ */

export type WriteAuth = WorkspaceAuth & {
  membership: ActiveMembership;
  grants: GrantRow[];
};

export async function requireWrite(
  supabase: SupabaseClient,
  opts: { resource?: string; adminOnly?: boolean } = {},
): Promise<WriteAuth | { error: NextResponse }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) {
    return { error: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  }

  const forbidden = NextResponse.json(
    { error: 'Forbidden — your role cannot make this change.' },
    { status: 403 },
  );

  if (opts.adminOnly) {
    if (membership.role !== 'admin') return { error: forbidden };
    return { user: { id: user.id }, workspaceId: membership.workspace_id, membership, grants: [] };
  }

  /* Admin/manager pass on role, so the grants query only runs for readonly —
     fetchActiveGrants returns [] for the others without touching the table. */
  const grants = await fetchActiveGrants(supabase, membership, user.id);

  const allowed = opts.resource
    ? canAccess(membership, grants, 'page', opts.resource, 'write')
    : membership.role === 'admin' || membership.role === 'manager';

  if (!allowed) return { error: forbidden };

  return { user: { id: user.id }, workspaceId: membership.workspace_id, membership, grants };
}

/** Confirm `tourId` belongs to `workspaceId`. Returns null on
 *  success; returns a NextResponse to return otherwise.
 *  Closes the RLS-bypass hole on the OCR + Deal Memo Extract
 *  endpoints — caller-supplied tour ids must round-trip through
 *  this check before the AI fires. */
export async function requireTourInWorkspace(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<NextResponse | null> {
  if (!tourId) {
    return NextResponse.json({ error: 'tour_id required' }, { status: 400 });
  }
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found in workspace' }, { status: 403 });
  }
  return null;
}
