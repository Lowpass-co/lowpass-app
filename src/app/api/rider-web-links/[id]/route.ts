/* ============================================
   LOWPASS — Rider web-link revoke

   DELETE /api/rider-web-links/[id]
          Soft-revokes the link (sets revoked_at).
          Never hard-deletes so audit history is preserved.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { data, error } = await supabase
    .from('rider_web_links')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: 'revoked by user',
    })
    .eq('id', id)
    .is('revoked_at', null)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
