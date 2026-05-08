/* ============================================
   LOWPASS — Workspaces / invite (Sprint 9 §3)

   POST /api/workspaces/invite
     Body: { email, role, tags?, grants? }. Admin creates a
     workspace_invites row with a random token. Returns the
     invite link the admin can share manually.

     Email sending is intentionally NOT wired in Sprint 9 v1
     (per "Out of scope §10: Email/SMS notification
     infrastructure — Sprint 10"). The admin sees a "Copy
     invite link" affordance after submission. Sprint 10
     wires Supabase Auth admin invite + redirect.
   ============================================ */

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { validateGrant, type GrantInput } from '@/lib/permissions/resources';

export const dynamic = 'force-dynamic';

type Role = 'admin' | 'manager' | 'readonly';

function isRole(v: unknown): v is Role {
  return v === 'admin' || v === 'manager' || v === 'readonly';
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function generateToken(): string {
  // 32 random bytes -> 43-char base64url. URL-safe + sufficient entropy.
  return randomBytes(32).toString('base64url');
}

function getOrigin(request: Request): string {
  // Prefer X-Forwarded-Host / Host headers; fall back to request URL origin.
  const url = new URL(request.url);
  return url.origin;
}

export async function POST(request: Request) {
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

  let body: {
    email?: unknown;
    role?: unknown;
    tags?: unknown;
    grants?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
  const email = rawEmail.toLowerCase();
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'valid email required' }, { status: 400 });
  }
  if (!isRole(body.role)) {
    return NextResponse.json(
      { error: 'role must be admin|manager|readonly' },
      { status: 400 },
    );
  }
  if (
    body.tags != null &&
    (!Array.isArray(body.tags) ||
      !body.tags.every((t) => typeof t === 'string' && t.length > 0))
  ) {
    return NextResponse.json({ error: 'tags must be string[]' }, { status: 400 });
  }
  if (body.grants != null && !Array.isArray(body.grants)) {
    return NextResponse.json({ error: 'grants must be an array' }, { status: 400 });
  }
  const grantInputs = (body.grants ?? []) as unknown[];
  for (const g of grantInputs) {
    const err = validateGrant(g);
    if (err) {
      return NextResponse.json({ error: `Invalid grant: ${err}` }, { status: 400 });
    }
  }

  const tags = Array.from(
    new Set(((body.tags ?? []) as string[]).map((t) => t.trim()).filter(Boolean)),
  );
  const grants = (grantInputs as GrantInput[]).map((g) => ({
    resource_type: g.resource_type,
    resource_id: g.resource_id,
    permission: g.permission,
  }));

  const token = generateToken();

  // workspace_invites RLS is admin-only; the INSERT itself is
  // gated by admin role. If the caller isn't an admin of this
  // workspace, the insert fails with a 42501 / row-violates-RLS
  // error which we surface as 403.
  const { data: inserted, error: insErr } = await supabase
    .from('workspace_invites')
    .insert({
      workspace_id: workspaceId,
      invited_email: email,
      invited_role: body.role,
      initial_tags: tags,
      initial_grants: grants,
      token,
      invited_by_user_id: user.id,
    })
    .select('id, expires_at')
    .single();

  if (insErr) {
    const status = insErr.code === '42501' ? 403 : 500;
    return NextResponse.json({ error: insErr.message }, { status });
  }

  // Audit
  await supabase.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_user_id: user.id,
    action: 'created',
    entity_type: 'workspace_invite',
    entity_id: inserted.id,
    field_changes: { invited_email: email, invited_role: body.role },
  });

  const inviteUrl = `${getOrigin(request)}/invite/accept?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    invite: {
      id: inserted.id,
      url: inviteUrl,
      expires_at: inserted.expires_at,
    },
  });
}
