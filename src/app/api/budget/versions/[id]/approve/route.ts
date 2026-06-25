/* POST /api/budget/versions/[id]/approve — lock + become Current. Atomic +
   approver-gated in the RPC (supersedes the prior approved in one txn; the
   partial unique index rejects a concurrent double-approve). */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { rpcErrorStatus } from '../../_rpc-status';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabase.rpc('approve_budget_version', { p_version_id: id });
  if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: rpcErrorStatus(error.code) });
  return NextResponse.json(data);
}
