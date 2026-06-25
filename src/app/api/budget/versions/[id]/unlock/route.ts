/* POST /api/budget/versions/[id]/unlock — approved → draft (same number),
   editable again. Approver-gated in the RPC. */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { rpcErrorStatus } from '../../_rpc-status';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabase.rpc('unlock_budget_version', { p_version_id: id });
  if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: rpcErrorStatus(error.code) });
  return NextResponse.json(data);
}
