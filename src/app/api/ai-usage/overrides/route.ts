/* ============================================
   LOWPASS — AI usage per-user overrides (§AI-5)

   PUT    /api/ai-usage/overrides   { userId, softCapUsdMicros|null,
                                      hardCapUsdMicros|null }
     Upserts a per-user cap override for the caller's workspace.

   DELETE /api/ai-usage/overrides?userId=…
     Removes the override row (user falls back to workspace default).

   Auth: RLS-enforcing server client. The ai_usage_user_overrides
   write policy requires is_workspace_admin(); a non-admin write
   trips RLS → surfaced as 403. Workspace is resolved from the
   caller's profile and the target user is validated as a member
   of that workspace before any write.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface PutBody {
  userId?: unknown;
  softCapUsdMicros?: unknown;
  hardCapUsdMicros?: unknown;
}

/** null passes through (cleared cap); numbers must be finite ≥ 0. */
function asMicrosOrNull(v: unknown): number | null | undefined {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined; // invalid sentinel
  return Math.round(n);
}

async function resolveWorkspace(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .maybeSingle();
  return (
    (profile as { workspace_id?: string | null } | null)?.workspace_id ?? null
  );
}

async function isWorkspaceMember(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  workspaceId: string,
  targetUserId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId)
    .maybeSingle();
  return !!data;
}

function rlsError(message: string): boolean {
  return /row-level security|permission denied|policy/i.test(message);
}

export async function PUT(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await resolveWorkspace(supabase, user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
  }

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const targetUserId = typeof body.userId === 'string' ? body.userId : null;
  if (!targetUserId) {
    return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
  }

  const soft = asMicrosOrNull(body.softCapUsdMicros);
  const hard = asMicrosOrNull(body.hardCapUsdMicros);
  if (soft === undefined || hard === undefined) {
    return NextResponse.json(
      { error: 'Caps must be numbers ≥ 0 or null.' },
      { status: 400 },
    );
  }
  if (soft !== null && hard !== null && hard < soft) {
    return NextResponse.json(
      { error: 'Hard cap must be ≥ soft cap.' },
      { status: 400 },
    );
  }

  if (!(await isWorkspaceMember(supabase, workspaceId, targetUserId))) {
    return NextResponse.json(
      { error: 'Target user is not a member of this workspace.' },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from('ai_usage_user_overrides')
    .upsert(
      {
        workspace_id: workspaceId,
        user_id: targetUserId,
        soft_cap_usd_micros: soft,
        hard_cap_usd_micros: hard,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,user_id' },
    );

  if (error) {
    const denied = rlsError(error.message);
    return NextResponse.json(
      {
        error: denied
          ? 'Only workspace admins can change AI overrides.'
          : error.message,
      },
      { status: denied ? 403 : 500 },
    );
  }

  return NextResponse.json({
    userId: targetUserId,
    softCapUsdMicros: soft,
    hardCapUsdMicros: hard,
  });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await resolveWorkspace(supabase, user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
  }

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get('userId');
  if (!targetUserId) {
    return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('ai_usage_user_overrides')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId);

  if (error) {
    const denied = rlsError(error.message);
    return NextResponse.json(
      {
        error: denied
          ? 'Only workspace admins can change AI overrides.'
          : error.message,
      },
      { status: denied ? 403 : 500 },
    );
  }

  return NextResponse.json({ userId: targetUserId, removed: true });
}
