/* ============================================
   LOWPASS — /api/show-links (rider decouple phase B4)

   POST { routing_id, password? } → { id, token, url, reused }

   Mint-or-reuse: ONE live show link per routing. If a non-revoked
   link already exists for the routing it is returned (reused: true) —
   "Copy show link" must be idempotent, not a link mill; a password on
   a reuse call is ignored (revoke first to change it, same rule the
   packet links follow via Regenerate).

   DELETE ?id= → revoke (sets revoked_at; the row stays for history).

   Auth: requireWrite + the routing must be in the caller's workspace
   (resolved through its tour — routing has no workspace_id column).
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { generateToken, hashPassword } from '@/lib/rider-packs/web-links';

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  const workspaceId = (profile as { workspace_id?: string | null } | null)?.workspace_id ?? null;
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: { routing_id?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { routing_id?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const routingId = typeof body.routing_id === 'string' ? body.routing_id : null;
  if (!routingId) return NextResponse.json({ error: 'routing_id required' }, { status: 400 });
  const password = typeof body.password === 'string' && body.password.length > 0 ? body.password : null;

  /* The routing's tour, workspace-checked. RLS already scopes the read;
     the explicit check turns "not yours" into a 404 rather than a
     confusing insert failure. */
  const { data: routing } = await supabase
    .from('routing')
    .select('id, tour_id, tours!inner(workspace_id)')
    .eq('id', routingId)
    .maybeSingle<{ id: string; tour_id: string; tours: { workspace_id: string } }>();
  if (!routing || routing.tours.workspace_id !== workspaceId) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from('show_links')
    .select('id, token')
    .eq('routing_id', routingId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; token: string }>();
  if (existing) {
    return NextResponse.json({
      id: existing.id,
      token: existing.token,
      url: `/s/${encodeURIComponent(existing.token)}`,
      reused: true,
    });
  }

  const token = generateToken();
  const password_hash = password ? await hashPassword(password) : null;
  const { data: inserted, error } = await supabase
    .from('show_links')
    .insert({
      workspace_id: workspaceId,
      tour_id: routing.tour_id,
      routing_id: routingId,
      token,
      password_hash,
      created_by: user.id,
    })
    .select('id, token')
    .single<{ id: string; token: string }>();
  if (error || !inserted) {
    /* Pre-migration-257 the table is absent — say so instead of a bare 500. */
    const msg = error?.message ?? 'Could not create show link';
    const status = msg.includes('show_links') ? 503 : 500;
    return NextResponse.json(
      { error: status === 503 ? 'Show links need migration 257 pasted first' : msg },
      { status },
    );
  }

  return NextResponse.json({
    id: inserted.id,
    token: inserted.token,
    url: `/s/${encodeURIComponent(inserted.token)}`,
    reused: false,
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await supabase
    .from('show_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
