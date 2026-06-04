/* ============================================
   LOWPASS — AI usage limits (§AI-5)

   PATCH /api/ai-usage/limits
     Upserts the caller's workspace ai_usage_limits row (monthly
     budget + default per-user soft/hard caps, all micro-USD).

   Auth: RLS-enforcing server client. The ai_usage_limits
   insert/update policies require is_workspace_admin(), so a
   non-admin write fails RLS → we surface that as 403. Workspace
   is resolved from the caller's profile (never trusted from the
   body).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface PatchBody {
  monthlyBudgetUsdMicros?: unknown;
  perUserSoftCapUsdMicros?: unknown;
  perUserHardCapUsdMicros?: unknown;
}

function asMicros(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .maybeSingle();
  const workspaceId = (profile as { workspace_id?: string | null } | null)
    ?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const monthly = asMicros(body.monthlyBudgetUsdMicros);
  const soft = asMicros(body.perUserSoftCapUsdMicros);
  const hard = asMicros(body.perUserHardCapUsdMicros);
  if (monthly === null || soft === null || hard === null) {
    return NextResponse.json(
      { error: 'All amounts must be numbers ≥ 0.' },
      { status: 400 },
    );
  }
  if (hard < soft) {
    return NextResponse.json(
      { error: 'Per-user hard cap must be ≥ soft cap.' },
      { status: 400 },
    );
  }

  // Upsert: insert if no row yet, else update. RLS gates both to
  // workspace admins (a non-admin write trips the policy → error).
  const { error } = await supabase
    .from('ai_usage_limits')
    .upsert(
      {
        workspace_id: workspaceId,
        monthly_budget_usd_micros: monthly,
        per_user_soft_cap_usd_micros: soft,
        per_user_hard_cap_usd_micros: hard,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id' },
    );

  if (error) {
    // RLS denial surfaces as an error here for non-admins.
    const denied = /row-level security|permission denied|policy/i.test(
      error.message,
    );
    return NextResponse.json(
      { error: denied ? 'Only workspace admins can change AI limits.' : error.message },
      { status: denied ? 403 : 500 },
    );
  }

  return NextResponse.json({
    monthlyBudgetUsdMicros: monthly,
    perUserSoftCapUsdMicros: soft,
    perUserHardCapUsdMicros: hard,
  });
}
