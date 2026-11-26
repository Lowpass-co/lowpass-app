/* ============================================
   /api/workspaces/members/[id]/access — a Member's tour access (Nov 2026)
     GET → { role, rows: [{ tour_id|null, area, level }] }
     PUT { rows } → { rows }   replaces the member's rows (admin only)
   [id] is the workspace_members id. The database is the gate: tour_access
   RLS lets only workspace admins write, its trigger refuses tours from
   another workspace (292). This route adds the role check up front so a
   manager gets a clear 403, not an RLS error.
   ============================================ */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace, requireWrite } from '@/lib/auth/workspace-check';
import { parseAccessRows } from '@/lib/permissions/accessRows';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

async function loadMember(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, id: string, workspaceId: string) {
  const { data } = await supabase
    .from('workspace_members')
    .select('id, role, workspace_id')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return data as { id: string; role: string; workspace_id: string } | null;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const member = await loadMember(supabase, id, auth.workspaceId);
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  const { data, error } = await supabase
    .from('tour_access')
    .select('tour_id, area, level')
    .eq('member_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ role: member.role, rows: data ?? [] });
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase, { adminOnly: true });
  if ('error' in auth) return auth.error;
  const member = await loadMember(supabase, id, auth.workspaceId);
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  // Members and Tour managers (298) are scoped by these rows; a Tour
  // manager's areas are ignored by the database — every area is edit.
  if (member.role !== 'readonly' && member.role !== 'tour_manager') {
    return NextResponse.json({ error: 'Admins and managers already see every tour' }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { rows?: unknown } | null;
  const rows = parseAccessRows(body?.rows);
  if (typeof rows === 'string') return NextResponse.json({ error: rows }, { status: 400 });

  /* Replace = delete then insert. Not one transaction across two calls, so on
     an insert failure put the old rows back rather than leave them with none. */
  const { data: before } = await supabase.from('tour_access').select('tour_id, area, level').eq('member_id', id);
  const { error: delErr } = await supabase.from('tour_access').delete().eq('member_id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 403 });
  if (rows.length) {
    const { error: insErr } = await supabase.from('tour_access').insert(
      rows.map((r) => ({ ...r, member_id: id, workspace_id: auth.workspaceId, granted_by: auth.user.id })),
    );
    if (insErr) {
      if (before?.length) {
        await supabase.from('tour_access').insert(
          (before as { tour_id: string | null; area: string; level: string }[]).map((r) => ({ ...r, member_id: id, workspace_id: auth.workspaceId })),
        );
      }
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
  }
  await supabase.from('audit_log').insert({
    workspace_id: auth.workspaceId,
    actor_user_id: auth.user.id,
    action: 'updated',
    entity_type: 'tour_access',
    entity_id: id,
    field_changes: { rows },
  });
  return NextResponse.json({ rows });
}
