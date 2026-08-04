/* ============================================
   LOWPASS — Bug reports bulk update (admin)

   POST  body: { ids: string[], status: string }
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getUserAndAdminStatus } from '@/lib/site-admin';

export const runtime = 'nodejs';

const MAX_IDS = 500;

const ALLOWED_STATUS = new Set([
  'open',
  'in_progress',
  'pending_testing',
  'resolved',
  'wont_fix',
  'duplicate',
]);

export async function POST(request: Request) {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { ids?: unknown; status?: unknown }
    | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ids = body.ids;
  const status = body.status;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `At most ${MAX_IDS} reports per request` },
      { status: 400 },
    );
  }
  if (typeof status !== 'string' || !ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  for (const id of ids) {
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'Each id must be a non-empty string' }, { status: 400 });
    }
  }

  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const resolvedAt =
    status === 'resolved' || status === 'wont_fix' ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from('bug_reports')
    .update({ status, resolved_at: resolvedAt })
    .in('id', ids)
    .select('id, status, resolved_at, updated_at');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    updated: data ?? [],
    count: (data ?? []).length,
  });
}
