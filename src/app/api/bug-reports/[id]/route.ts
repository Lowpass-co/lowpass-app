/* ============================================
   LOWPASS — Bug Reports API (item)

   PATCH: update status, severity, title, resolution_notes, assigned_to.
   DELETE: remove row + screenshot (reporter only; RLS enforces).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const ALLOWED_STATUS = new Set(['open', 'in_progress', 'resolved', 'wont_fix', 'duplicate']);
const ALLOWED_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.status === 'string' && ALLOWED_STATUS.has(body.status)) {
    patch.status = body.status;
    patch.resolved_at = (body.status === 'resolved' || body.status === 'wont_fix')
      ? new Date().toISOString()
      : null;
  }
  if (typeof body.severity === 'string' && ALLOWED_SEVERITIES.has(body.severity)) {
    patch.severity = body.severity;
  }
  if (typeof body.title === 'string') patch.title = body.title.slice(0, 200);
  if (typeof body.resolution_notes === 'string') patch.resolution_notes = body.resolution_notes.slice(0, 10_000);
  if (body.assigned_to === null || typeof body.assigned_to === 'string') {
    patch.assigned_to = body.assigned_to as string | null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('bug_reports')
    .update(patch)
    .eq('id', id)
    .select('id, status, severity, title, resolution_notes, assigned_to, resolved_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ report: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const { data: row } = await supabase
    .from('bug_reports')
    .select('screenshot_path')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('bug_reports').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (row?.screenshot_path) {
    await supabase.storage.from('bug-reports').remove([row.screenshot_path]);
  }
  return NextResponse.json({ ok: true });
}
