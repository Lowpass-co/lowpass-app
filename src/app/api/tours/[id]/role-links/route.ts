/* ============================================
   LOWPASS — /api/tours/[id]/role-links  (D1-4)

   Per-person tokenized Day links (tour_role_links, mig 245). Admin/manager only.
   Minting reuses the advance-intake token grammar (randomBytes(24).base64url);
   the public /m/day/[token] route resolves it service-role.

     GET    → { links }   (active/revoked links with person + role)
     POST   { roleId }    → mint a fresh token (revokes prior active links for the role)
     DELETE { linkId }    → revoke
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { mintDayLinkToken } from '@/lib/roles/token';

export const dynamic = 'force-dynamic';

async function guard(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, tourId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const membership = await getActiveMembership(supabase, user.id);
  if (!membership?.workspace_id) return { error: 'No workspace', status: 403 as const };
  if (membership.role !== 'admin' && membership.role !== 'manager') return { error: 'Not permitted', status: 403 as const };
  const { data: tour } = await supabase
    .from('tours').select('id').eq('id', tourId).eq('workspace_id', membership.workspace_id).maybeSingle();
  if (!tour) return { error: 'Tour not found', status: 404 as const };
  return { workspaceId: membership.workspace_id as string, userId: user.id };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const g = await guard(supabase, tourId);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const { data } = await supabase
    .from('tour_role_links')
    .select('id, tour_role_id, token, status, expires_at, revoked_at, last_viewed_at, tour_roles(role, persons(full_name, preferred_name))')
    .eq('tour_id', tourId)
    .eq('workspace_id', g.workspaceId)
    .order('created_at', { ascending: false });
  const links = ((data ?? []) as Array<Record<string, unknown>>).map((l) => {
    const tr = (Array.isArray(l.tour_roles) ? l.tour_roles[0] : l.tour_roles) as { role?: string; persons?: unknown } | null;
    const p = (Array.isArray(tr?.persons) ? tr?.persons[0] : tr?.persons) as { full_name?: string | null; preferred_name?: string | null } | null;
    return {
      id: l.id as string,
      roleId: l.tour_role_id as string,
      token: l.token as string,
      status: l.status as string,
      lastViewedAt: (l.last_viewed_at as string | null) ?? null,
      role: (tr?.role as string | null) ?? null,
      personName: (p?.preferred_name ?? p?.full_name ?? null) as string | null,
    };
  });
  return NextResponse.json({ links });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const g = await guard(supabase, tourId);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = (await request.json().catch(() => ({}))) as { roleId?: string };
  if (!body.roleId) return NextResponse.json({ error: 'roleId is required' }, { status: 400 });

  // Confirm the role belongs to this tour/workspace.
  const { data: role } = await supabase
    .from('tour_roles').select('id').eq('id', body.roleId).eq('tour_id', tourId).eq('workspace_id', g.workspaceId).maybeSingle();
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

  // Reissue: revoke any prior active link for this role, then mint a fresh one.
  await supabase
    .from('tour_role_links')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('tour_role_id', body.roleId)
    .eq('status', 'pending');

  const token = mintDayLinkToken();
  const { error } = await supabase.from('tour_role_links').insert({
    workspace_id: g.workspaceId,
    tour_id: tourId,
    tour_role_id: body.roleId,
    token,
    status: 'pending',
    created_by: g.userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token, path: `/m/day/${token}` });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const g = await guard(supabase, tourId);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = (await request.json().catch(() => ({}))) as { linkId?: string };
  if (!body.linkId) return NextResponse.json({ error: 'linkId is required' }, { status: 400 });
  const { error } = await supabase
    .from('tour_role_links')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', body.linkId)
    .eq('workspace_id', g.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
