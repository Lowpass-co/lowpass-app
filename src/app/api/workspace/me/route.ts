import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/** Current user flags for client gating (workspace admin, etc.). */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ isWorkspaceAdmin: false }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('is_workspace_admin');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ isWorkspaceAdmin: !!data });
}
