/* ============================================
   LOWPASS — Workspace Members API

   GET: List profiles in the current user's workspace.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  const workspaceId = profile?.workspace_id ?? null;
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }
  const { data: members, error } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .eq('workspace_id', workspaceId)
    .order('name');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ members: members ?? [] });
}
