/* ============================================
   LOWPASS — /api/admin/audit (Sprint 9 §10)

   GET — paginated cross-workspace audit log read. Site-admin
         only. Offset pagination v1; switch to keyset on
         (created_at, id) when audit_log exceeds ~10K rows
         (Sprint 12+).

   Query params:
     ?workspace_id=<uuid>    (optional filter)
     ?action=<string>        (optional filter)
     ?since=<iso>            (default: 7 days ago)
     ?limit=<int>            (capped at 200)
     ?offset=<int>
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { adminErrorResponse, requireSiteAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

interface AuditRow {
  id: string;
  workspace_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  field_changes: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
  workspace_name: string | null;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  try {
    await requireSiteAdmin(supabase);
  } catch (err) {
    const r = adminErrorResponse(err);
    return NextResponse.json({ error: r.message }, { status: r.status });
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get('workspace_id');
  const action = searchParams.get('action');
  const since =
    searchParams.get('since') ??
    new Date(Date.now() - 7 * 86400000).toISOString();
  const limit = Math.min(
    Math.max(Number(searchParams.get('limit') ?? 50) || 50, 1),
    200,
  );
  const offset = Math.max(Number(searchParams.get('offset') ?? 0) || 0, 0);

  // Site admin → bypass workspace_id RLS via service-role
  // wouldn't be needed because audit_log RLS for admins of the
  // SAME workspace returns those rows; but cross-workspace
  // requires elevated read. Easiest: site admins are admin of
  // EVERY workspace's audit_log policy NO — they aren't. We use
  // the service-role client for the raw read and trust the
  // requireSiteAdmin gate.
  // (Switching to a SECURITY DEFINER RPC would be cleaner; the
  // route-level service-role read is acceptable v1.)
  const { createServiceSupabaseClient } = await import('@/lib/supabase-server');
  const admin = createServiceSupabaseClient();

  let q = admin
    .from('audit_log')
    .select('id, workspace_id, actor_user_id, action, entity_type, entity_id, field_changes, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  if (action) q = q.eq('action', action);

  const { data: rows, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Hydrate actor + workspace names. Small N per page.
  const auditRows = (rows ?? []) as Array<{
    id: string;
    workspace_id: string;
    actor_user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    field_changes: Record<string, unknown> | null;
    created_at: string;
  }>;

  const actorIds = Array.from(
    new Set(
      auditRows
        .map((r) => r.actor_user_id)
        .filter((v): v is string => !!v),
    ),
  );
  const workspaceIds = Array.from(new Set(auditRows.map((r) => r.workspace_id)));

  const [profilesRes, workspacesRes] = await Promise.all([
    actorIds.length > 0
      ? admin.from('profiles').select('id, name').in('id', actorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
    workspaceIds.length > 0
      ? admin.from('workspaces').select('id, name').in('id', workspaceIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);

  const actorNameById = new Map(
    ((profilesRes.data ?? []) as Array<{ id: string; name: string | null }>).map(
      (p) => [p.id, p.name],
    ),
  );
  const workspaceNameById = new Map(
    ((workspacesRes.data ?? []) as Array<{ id: string; name: string }>).map(
      (w) => [w.id, w.name],
    ),
  );

  const out: AuditRow[] = auditRows.map((r) => ({
    ...r,
    actor_name: r.actor_user_id ? actorNameById.get(r.actor_user_id) ?? null : null,
    workspace_name: workspaceNameById.get(r.workspace_id) ?? null,
  }));

  return NextResponse.json({ entries: out });
}
