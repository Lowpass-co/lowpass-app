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
