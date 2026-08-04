/* ============================================
   LOWPASS — /api/containers  (S1 Stage C1)

   Containers = case | cart | box | bag | other, optionally inside a space
   (nullable space_id). Workspace-scoped (RLS mig 246). GET list, POST create.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const KINDS = ['case', 'cart', 'box', 'bag', 'other'];

async function ws(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return { error: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  return { workspaceId: profile.workspace_id as string };
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const g = await ws(supabase);
  if ('error' in g) return g.error;
  const { data, error } = await supabase
    .from('containers')
    .select('*')
    .eq('workspace_id', g.workspaceId)
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ containers: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const g = await ws(supabase);
  if ('error' in g) return g.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const kind = KINDS.includes(String(body.kind)) ? String(body.kind) : 'case';

  const { data, error } = await supabase
    .from('containers')
    .insert({
      workspace_id: g.workspaceId,
      space_id: body.space_id ?? null,
      name,
      kind,
      dimensions_cm: body.dimensions_cm ?? {},
      weight_empty_kg: body.weight_empty_kg ?? null,
      notes: body.notes ?? null,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
