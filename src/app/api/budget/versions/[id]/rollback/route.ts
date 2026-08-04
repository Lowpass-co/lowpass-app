/* POST /api/budget/versions/[id]/rollback — make this (older, non-draft) version
   Current again. Atomic + approver-gated in the RPC (budget_version_rollback):
   demotes the former Current + everything newer (incl. the draft head) to
   rolled_back, then promotes the target — the one-approved partial unique index
   never sees two approved. (Versioning STATE/NAV B2.) */
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
  const { data, error } = await supabase.rpc('budget_version_rollback', { p_version_id: id });
  if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: rpcErrorStatus(error.code) });
  return NextResponse.json(data);
}
