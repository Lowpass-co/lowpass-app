/* ============================================
   LOWPASS — Workspaces / invite / [id] / resend (Sprint 9 §3)

   POST /api/workspaces/invite/[id]/resend
     Invalidates the previous invite link and creates a fresh
     row with a new token + 14-day expiry. Copies role / tags /
     grants from the original. Returns the new invite URL.

     Per Adam's mockup spec: "[Resend] inline label says 'This
     will invalidate the previous invite link' — no modal."
     This route is the server-side commit of that intent.
   ============================================ */

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: inviteId } = await params;
  if (!inviteId) {
    return NextResponse.json({ error: 'invite id required' }, { status: 400 });
  }

  // Load the original invite. RLS gates this to admins of the
  // owning workspace.
  const { data: existing } = await supabase
    .from('workspace_invites')
    .select(
      'id, workspace_id, invited_email, invited_role, initial_tags, initial_grants, accepted_at',
    )
    .eq('id', inviteId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }
  const e = existing as {
    id: string;
    workspace_id: string;
    invited_email: string;
    invited_role: 'admin' | 'manager' | 'readonly';
    initial_tags: string[] | null;
    initial_grants: unknown;
    accepted_at: string | null;
  };

  if (e.accepted_at) {
    return NextResponse.json(
      { error: 'Invite already accepted; cannot resend' },
      { status: 409 },
    );
  }

  // Delete the old row, then insert the new one. Done in
  // sequence (no transaction) — the delete is the irreversible
  // half so we do it first; if the insert fails, the user
  // re-issues from scratch via the Invite slide-over.
  const { error: delErr } = await supabase
    .from('workspace_invites')
    .delete()
    .eq('id', inviteId);
  if (delErr) {
    const status = delErr.code === '42501' ? 403 : 500;
    return NextResponse.json({ error: delErr.message }, { status });
  }

  const token = generateToken();
  const { data: inserted, error: insErr } = await supabase
    .from('workspace_invites')
    .insert({
      workspace_id: e.workspace_id,
      invited_email: e.invited_email,
      invited_role: e.invited_role,
      initial_tags: e.initial_tags ?? [],
      initial_grants: e.initial_grants ?? [],
      token,
      invited_by_user_id: user.id,
    })
    .select('id, expires_at')
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await supabase.from('audit_log').insert({
    workspace_id: e.workspace_id,
    actor_user_id: user.id,
    action: 'updated',
    entity_type: 'workspace_invite',
    entity_id: inserted.id,
    field_changes: {
      resent: true,
      replaced_invite_id: inviteId,
      invited_email: e.invited_email,
    },
  });

  const url = new URL(request.url);
  const inviteUrl = `${url.origin}/invite/accept?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    invite: {
      id: inserted.id,
      url: inviteUrl,
      expires_at: inserted.expires_at,
    },
  });
}
