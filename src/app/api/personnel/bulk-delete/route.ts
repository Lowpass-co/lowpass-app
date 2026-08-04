/* ============================================
   LOWPASS — Delete multiple workspace personnel rows

   POST JSON { ids: string[] } — workspace scoped.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = body.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: 'ids[] is required' }, { status: 400 });
  }

  const ids = raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) return NextResponse.json({ error: 'No valid ids' }, { status: 400 });

  const workspaceId = profile.workspace_id;

  // Resolve IDs that exist in this workspace (avoids trusting DELETE … RETURNING under RLS).
  const { data: targets, error: selErr } = await supabase
    .from('personnel')
    .select('id')
    .in('id', ids)
    .eq('workspace_id', workspaceId);

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

  const targetIds = (targets ?? []).map((r) => r.id as string);
  if (targetIds.length === 0) {
    return NextResponse.json({ error: 'No matching roster rows in your workspace' }, { status: 404 });
  }

  const { error: delErr } = await supabase
    .from('personnel')
    .delete()
    .in('id', targetIds)
    .eq('workspace_id', workspaceId);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { data: leftover, error: verifyErr } = await supabase
    .from('personnel')
    .select('id')
    .in('id', targetIds)
    .eq('workspace_id', workspaceId);

  if (verifyErr) return NextResponse.json({ error: verifyErr.message }, { status: 500 });
  if ((leftover ?? []).length > 0) {
    return NextResponse.json(
      { error: 'Some roster rows could not be deleted. Check permissions or linked tour data.' },
      { status: 409 }
    );
  }

  revalidatePath('/personnel');
  return NextResponse.json({ deleted: targetIds.length, deleted_ids: targetIds });
}
