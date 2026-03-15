/* ============================================
   LOWPASS — Advance Templates Reorder

   POST: Set sort_order for workspace templates (library drag-to-reorder)
   Body: { order: string[] } — template ids in desired order
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function getWorkspaceId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  return profile?.workspace_id ?? null;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { order?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const order = Array.isArray(body.order) ? body.order.filter((id): id is string => typeof id === 'string') : [];
  if (order.length === 0) {
    return NextResponse.json({ ok: true });
  }

  // Update each template's sort_order (only workspace-owned)
  for (let i = 0; i < order.length; i++) {
    const { error } = await supabase
      .from('advance_templates')
      .update({ sort_order: i })
      .eq('id', order[i])
      .eq('workspace_id', workspaceId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
