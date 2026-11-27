/* ============================================
   /api/rider-templates/[id] — rename (PATCH { name }) or delete a saved
   rider template. Library write: admin / manager / Tour manager
   (requireWrite { library: true }; the database agrees — 301's 'ref' rules).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { readJson } from '@/server/advance/routeGuard';
import { isUuid } from '@/lib/riders/blocks';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase, { library: true });
  if ('error' in auth) return auth.error;
  const body = await readJson<{ name?: unknown }>(request);
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!name) return NextResponse.json({ error: 'Give it a name' }, { status: 400 });
  const { data, error } = await supabase
    .from('rider_templates')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', auth.workspaceId)
    .select('id');
  if (error) return NextResponse.json({ error: 'Couldn’t rename it' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase, { library: true });
  if ('error' in auth) return auth.error;
  const { data, error } = await supabase.from('rider_templates').delete().eq('id', id).eq('workspace_id', auth.workspaceId).select('id');
  if (error) return NextResponse.json({ error: 'Couldn’t delete it' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
