/* ============================================
   GET /api/rider-templates — the workspace's saved rider templates (+ the
   built-in starters), for "Start from…". Any member reads (reference table).
   Saving one is POST /api/tours/[id]/riders { action: 'template' }.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { STARTERS } from '@/lib/riders/starters';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const { data } = await supabase
    .from('rider_templates')
    .select('id, name, kind, artist_id, updated_at')
    .eq('workspace_id', auth.workspaceId)
    .order('name', { ascending: true });
  return NextResponse.json({
    starters: STARTERS.map((s) => ({ id: s.id, name: s.name, kind: s.kind, blurb: s.blurb })),
    templates: (data ?? []).map((t) => ({ id: t.id, name: t.name, kind: t.kind, artistId: t.artist_id, updatedAt: t.updated_at })),
  });
}
