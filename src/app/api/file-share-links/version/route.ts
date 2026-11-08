/* ============================================
   GET /api/file-share-links/version?eventId=… → { url }

   The owner downloads the version a share link replaced (kept in storage,
   recorded on the new_version event). READ CHECK: session + membership; the
   event must be in the caller's workspace; the signed URL comes from the
   caller's own session client, so storage RLS applies too.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { previousVersionUrl, supabaseShareStorage } from '@/server/files/shareLinks';
import { NO_STORE, shareErrorResponse } from '@/server/files/shareResponse';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const m = await getActiveMembership(supabase, user.id);
  if (!m) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  const eventId = new URL(request.url).searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
  try {
    const url = await previousVersionUrl(supabase, supabaseShareStorage(supabase), { workspaceId: m.workspace_id, eventId });
    return NextResponse.json({ url }, { headers: NO_STORE });
  } catch (e) {
    return shareErrorResponse(e);
  }
}
