/* ============================================
   LOWPASS — /api/containers/[id]  (S1 Stage C1)  PATCH / DELETE
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

async function ws(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return { error: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  return { workspaceId: profile.workspace_id as string };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const g = await ws(supabase);
  if ('error' in g) return g.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const k of ['name', 'kind', 'space_id', 'dimensions_cm', 'weight_empty_kg', 'notes']) {
    if (body[k] !== undefined) payload[k] = body[k];
  }
  if (Object.keys(payload).length === 0) return NextResponse.json({ ok: true });
  payload.updated_at = new Date().toISOString();
  const { error } = await supabase.from('containers').update(payload).eq('id', id).eq('workspace_id', g.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const g = await ws(supabase);
  if ('error' in g) return g.error;
  // Items in the container fall back to Unassigned (FK ON DELETE SET NULL).
  const { error } = await supabase.from('containers').delete().eq('id', id).eq('workspace_id', g.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
