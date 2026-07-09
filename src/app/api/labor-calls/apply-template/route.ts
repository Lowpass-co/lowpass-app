/* ============================================
   LOWPASS — Labor calls · apply-template (P6)

   POST { tour_id, routing_id, template_id } → copy the template's rows onto the
   day, ADDITIVE + never-clobber (existing calls untouched, duplicates skipped —
   the shared merge rule in lib/labor-calls/merge.ts). Returns the created calls.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { applyRowsToDay } from '@/lib/labor-calls/server';
import type { LaborCallRow } from '@/lib/labor-calls/types';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  const workspaceId = profile.workspace_id as string;

  let body: { tour_id?: string | null; routing_id?: string; template_id?: string; rows?: LaborCallRow[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.routing_id) return NextResponse.json({ error: 'routing_id is required' }, { status: 400 });

  // Rows come from a saved template (looked up here, workspace-scoped) or, for
  // the intake-accept path, are passed directly by the caller.
  let rows: LaborCallRow[] = Array.isArray(body.rows) ? body.rows : [];
  if (body.template_id) {
    const { data: tpl } = await supabase
      .from('labor_call_templates')
      .select('rows')
      .eq('id', body.template_id)
      .eq('workspace_id', workspaceId)
      .maybeSingle<{ rows: LaborCallRow[] }>();
    if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    rows = Array.isArray(tpl.rows) ? tpl.rows : [];
  }

  const created = await applyRowsToDay(
    supabase,
    { workspaceId, tourId: body.tour_id ?? null, routingId: body.routing_id },
    rows,
  );
  return NextResponse.json({ created, count: created.length }, { status: 201 });
}
