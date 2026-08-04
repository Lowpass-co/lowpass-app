/* ============================================
   LOWPASS — POST /api/import/workbook/apply  (X1-B)

   Commits a reviewed import batch. Body: { batchId, accept: string[] } — the
   pending-line ids the TM accepted. ACCEPTED rows write through the SAME UI path
   (POST /api/budget/line-items, forwarding the caller's session) — no parallel
   insert. Everything else is marked rejected. Mirrors the intake accept pattern.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface PendingValue { section: string; label: string; vendor: string | null; proposed_cost: number; actual_cost: number; currency: string }

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as { batchId?: string; accept?: string[] };
    const { batchId } = body;
    const acceptIds = new Set(body.accept ?? []);
    if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });

    const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
    if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
    const workspaceId = profile.workspace_id as string;

    const { data: batch } = await supabase.from('import_batches')
      .select('id, tour_id, workspace_id, status').eq('id', batchId).eq('workspace_id', workspaceId).maybeSingle();
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    if (batch.status === 'applied') return NextResponse.json({ error: 'Batch already applied' }, { status: 409 });

    const { data: lines } = await supabase.from('import_pending_lines')
      .select('id, target, value, status').eq('batch_id', batchId).eq('workspace_id', workspaceId);

    // The same write path the UI uses — internal call to POST /api/budget/line-items,
    // forwarding the caller's session cookie.
    const origin = new URL(request.url).origin;
    const cookie = request.headers.get('cookie') ?? '';
    const now = new Date().toISOString();
    let written = 0;
    const errors: string[] = [];

    for (const line of (lines ?? []) as Array<{ id: string; target: string; value: PendingValue; status: string }>) {
      const accepted = acceptIds.has(line.id);
      if (!accepted) {
        await supabase.from('import_pending_lines').update({ status: 'rejected', reviewed_at: now, reviewed_by: user.id }).eq('id', line.id);
        continue;
      }
      if (line.target !== 'budget_line') {
        errors.push(`Line ${line.id}: only budget lines can be imported in v1`);
        continue;
      }
      const v = line.value;
      const res = await fetch(`${origin}/api/budget/line-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({
          tour_id: batch.tour_id,
          category: v.section || 'Imported',
          label: v.label,
          proposed_cost: v.proposed_cost,
          actual_cost: v.actual_cost,
          currency: v.currency,
          section: v.section,
        }),
      });
      if (res.ok) {
        written++;
        await supabase.from('import_pending_lines').update({ status: 'accepted', reviewed_at: now, reviewed_by: user.id }).eq('id', line.id);
      } else {
        const j = await res.json().catch(() => ({}));
        errors.push(`Line ${line.id}: ${typeof j.error === 'string' ? j.error : 'write failed'}`);
      }
    }

    await supabase.from('import_batches').update({ status: 'applied' }).eq('id', batchId);
    return NextResponse.json({ written, rejected: (lines?.length ?? 0) - written, errors });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Import apply failed', detail }, { status: 500 });
  }
}
