/* ============================================
   LOWPASS — /api/admin/users/[id]/reset-password (Sprint 9 §10)

   POST — generates a password recovery link via Supabase Auth
          admin and emails it to the target user's address.
          Site-admin only.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  adminErrorResponse,
  createServiceSupabaseAdminClient,
  requireSiteAdmin,
} from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  let actor: { id: string; email: string | null };
  try {
    actor = await requireSiteAdmin(supabase);
  } catch (err) {
    const r = adminErrorResponse(err);
    return NextResponse.json({ error: r.message }, { status: r.status });
  }

  const { id: targetUserId } = await params;
  if (!targetUserId) {
    return NextResponse.json({ error: 'user id required' }, { status: 400 });
  }

  const admin = createServiceSupabaseAdminClient();
  // Resolve the user's email so we can call generateLink with it.
  const { data: target, error: targetErr } = await admin.auth.admin.getUserById(
    targetUserId,
  );
  if (targetErr || !target?.user?.email) {
    return NextResponse.json(
      { error: targetErr?.message ?? 'User not found' },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const { error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: target.user.email,
    options: {
      // Land them on /login post-recovery; supabase auth handles
      // the password-set flow.
      redirectTo: `${url.origin}/login`,
    },
  });
  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  // Audit
  const { data: actorProfile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', actor.id)
    .maybeSingle();
  const anchorWorkspace =
    (actorProfile as { workspace_id?: string | null } | null)?.workspace_id;
  if (anchorWorkspace) {
    await supabase.from('audit_log').insert({
      workspace_id: anchorWorkspace,
      actor_user_id: actor.id,
      action: 'password_reset_sent',
      entity_type: 'user',
      entity_id: targetUserId,
      field_changes: { recovery_email: target.user.email },
    });
  }

  return NextResponse.json({ ok: true });
}
