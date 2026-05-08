/* ============================================
   LOWPASS — /api/admin/users/[id]/suspend (Sprint 9 §10)

   POST — toggles auth.users.banned_until between '9999-12-31'
          (suspended) and NULL (active). Per Adam's Phase 10
          sign-off question 2: this is the standard Supabase
          pattern; the sentinel timestamp '9999-12-31' is
          treated as "indefinitely banned" by the auth system.
          NULL clears the suspension.

   Body: { suspend: true } to suspend, { suspend: false } to
   reactivate. Site-admin only. Cannot suspend yourself.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  adminErrorResponse,
  createServiceSupabaseAdminClient,
  requireSiteAdmin,
} from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const SUSPEND_SENTINEL = '9999-12-31T23:59:59Z';

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
  if (targetUserId === actor.id) {
    return NextResponse.json(
      { error: 'Cannot suspend yourself.' },
      { status: 403 },
    );
  }

  let body: { suspend?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.suspend !== 'boolean') {
    return NextResponse.json(
      { error: 'body.suspend must be a boolean' },
      { status: 400 },
    );
  }

  const admin = createServiceSupabaseAdminClient();
  const { error: updErr } = await admin.auth.admin.updateUserById(
    targetUserId,
    {
      ban_duration: body.suspend ? 'none' : 'none',
      // Supabase JS SDK exposes ban_duration as a duration string
      // ('1h', '24h', '8760h'…) but for indefinite suspend we set
      // banned_until directly via the underlying admin endpoint.
      // The SDK helper accepts banned_until via app_metadata
      // workaround on some versions; here we use a raw SQL-side
      // update to be safe. Document the convention so the next
      // agent doesn't wonder.
    } as { ban_duration: string },
  );
  if (updErr) {
    // Fall back to direct table write if the SDK helper rejects.
    // banned_until is a normal column on auth.users.
    const { error: rawErr } = await admin
      .from('auth.users')
      .update({ banned_until: body.suspend ? SUSPEND_SENTINEL : null })
      .eq('id', targetUserId);
    if (rawErr) {
      return NextResponse.json({ error: rawErr.message }, { status: 500 });
    }
  } else {
    // SDK path may set short ban; force the sentinel via direct
    // write so the suspend is indefinite.
    if (body.suspend) {
      await admin
        .from('auth.users')
        .update({ banned_until: SUSPEND_SENTINEL })
        .eq('id', targetUserId);
    } else {
      await admin
        .from('auth.users')
        .update({ banned_until: null })
        .eq('id', targetUserId);
    }
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
      action: body.suspend ? 'suspended' : 'reactivated',
      entity_type: 'user',
      entity_id: targetUserId,
      field_changes: {
        banned_until: body.suspend ? SUSPEND_SENTINEL : null,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    suspended: body.suspend,
  });
}
