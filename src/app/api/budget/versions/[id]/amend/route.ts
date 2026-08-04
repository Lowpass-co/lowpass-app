/* POST /api/budget/versions/[id]/amend — clone the latest approved into a new
   draft v(n+1); prior approved → superseded. Approver-gated + atomic in the RPC.
   The [id] in the path is informational; the RPC resolves the tour's approved
   version (one-approved invariant), so we pass the version's tour_id. */
import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { rpcErrorStatus } from '../../_rpc-status';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: ver } = await supabase.from('budget_versions').select('tour_id').eq('id', id).maybeSingle();
  if (!ver) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  const { data, error } = await supabase.rpc('amend_budget_version', { p_tour_id: ver.tour_id });
  if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: rpcErrorStatus(error.code) });
  return NextResponse.json(data, { status: 201 });
}
