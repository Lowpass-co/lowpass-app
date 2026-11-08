/* GET /api/file-links/targets?tourId=… → { targets: [{ type, id, label, sub }] }
   What a tour's files can be linked to: its shows, the venues they're at, its
   crew. READ CHECK: session + membership; the tour must be in that workspace. */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { LinkError, linkTargets } from '@/server/files/entityLinks';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const m = await getActiveMembership(supabase, user.id);
  if (!m) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  const tourId = new URL(request.url).searchParams.get('tourId');
  if (!tourId) return NextResponse.json({ error: 'tourId is required' }, { status: 400 });
  try {
    return NextResponse.json({ targets: await linkTargets(supabase, { workspaceId: m.workspace_id, tourId }) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof LinkError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
