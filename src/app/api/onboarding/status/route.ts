/* ============================================
   GET /api/onboarding/status — Getting started (Nov 2026)

   Read-only facts for the welcome + "Get set up" checklist: which steps exist
   in the caller's workspace, the caller's role, and the latest artist/tour so
   the checklist's links go somewhere real. Writes nothing.
   READ CHECK: authenticated session + active workspace membership; every
   query is scoped to that workspace (loadOnboardingStatus).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { loadOnboardingStatus } from '@/server/onboarding/status';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  try {
    const status = await loadOnboardingStatus(supabase, {
      workspaceId: membership.workspace_id,
      userId: user.id,
      role: membership.role,
    });
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load' }, { status: 500 });
  }
}
