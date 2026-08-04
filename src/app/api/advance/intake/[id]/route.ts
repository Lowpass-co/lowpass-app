/* ============================================
   LOWPASS — Advance intake link · revoke (T3)

   PATCH /api/advance/intake/[id]   { action: 'revoke' }
     → marks the link revoked so the public form stops accepting
       submissions. Workspace scoping is enforced by RLS (the update
       only matches rows in the caller's workspace).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let body: { action?: unknown } = {};
  try {
    body = (await request.json()) as { action?: unknown };
  } catch {
    /* empty body falls through to the 400 below */
  }
  if (body.action !== 'revoke') {
    return NextResponse.json(
      { error: "Unsupported action — expected { action: 'revoke' }" },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;

  const { data, error } = await supabase
    .from('advance_intake_links')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, status, revoked_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }
  return NextResponse.json({ link: data });
}
