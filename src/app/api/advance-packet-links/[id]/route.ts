/* ============================================
   LOWPASS — Single packet-link admin
   PATCH  /api/advance-packet-links/[id]
            body: { password: string | null }
   DELETE /api/advance-packet-links/[id]              (revoke)

   Auth: workspace member, scoped by RLS on advance_packet_links.
   Revoking is a soft delete (sets revoked_at); DELETE on the
   underlying row is admin-only per the migration policy and
   would orphan view-count history. The public reader checks
   revoked_at IS NULL before serving the packet.

   PATCH body shape:
     { password: "..." }     → set/replace the password
     { password: null }      → clear the password
     anything else           → 400

   Cleanly reuses §SAFE's auth helper; password hashing reuses
   the rider-pack web-link helpers (generic functions; named
   for their first use site but pure crypto).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { hashPassword } from '@/lib/rider-packs/web-links';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;

  let body: { password?: unknown };
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  /* Strict shape: password must be present and either string
     or null. Avoids accidental "I forgot the field" clears. */
  if (!('password' in body)) {
    return NextResponse.json(
      { error: 'password field required (string to set, null to clear)' },
      { status: 400 },
    );
  }
  const raw = body.password;
  if (raw !== null && typeof raw !== 'string') {
    return NextResponse.json({ error: 'password must be string or null' }, { status: 400 });
  }

  const password_hash = raw && raw.length > 0 ? await hashPassword(raw) : null;

  const { error } = await supabase
    .from('advance_packet_links')
    .update({ password_hash })
    .eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, has_password: !!password_hash });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;

  /* Soft revoke. The public reader bails on revoked_at not
     null. Keeps the row for audit / view-count history. */
  const { error } = await supabase
    .from('advance_packet_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
