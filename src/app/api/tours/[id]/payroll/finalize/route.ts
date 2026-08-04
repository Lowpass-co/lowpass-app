/* ============================================
   LOWPASS — Payroll finalize / unlock (M1-C)

   POST   set tours.payroll_finalized_at = now()  (admin or manager)
   DELETE clear it — unlock                        (admin only, per the spec)

   When set, every payroll write path rejects server-side (see
   src/lib/payroll/finalize.ts). Workspace-scoped via the caller's membership.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';

async function guard(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  tourId: string,
  needAdmin: boolean,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) return { error: 'No workspace', status: 403 as const };
  const role = membership.role;
  const ok = needAdmin ? role === 'admin' : role === 'admin' || role === 'manager';
  if (!ok) return { error: needAdmin ? 'Only an admin can unlock payroll' : 'Not permitted', status: 403 as const };
  // Confirm the tour is in the caller's workspace.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', membership.workspace_id)
    .maybeSingle();
  if (!tour) return { error: 'Tour not found', status: 404 as const };
  return { workspaceId: membership.workspace_id };
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const g = await guard(supabase, tourId, false);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const now = new Date().toISOString();
  const { error } = await supabase.from('tours').update({ payroll_finalized_at: now }).eq('id', tourId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payroll_finalized_at: now });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const g = await guard(supabase, tourId, true); // unlock is admin-only
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const { error } = await supabase.from('tours').update({ payroll_finalized_at: null }).eq('id', tourId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Unlock is a deliberate reversal of a lock — the cleared timestamp is the audit
  // trail. (A formal audit-log table is a future add.)
  return NextResponse.json({ payroll_finalized_at: null });
}
