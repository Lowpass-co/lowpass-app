/* ============================================
   GET /api/tours/[id]/riders/logo — the artist's logo for the rider editor's
   preview (Nov 2026): the exact image the PDF prints (`loadRiderLogo`), or
   404 → the preview sets the artist's name, as the PDF does. Production VIEW
   on the tour, like the rest of the riders routes.
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { tourGate } from '@/server/advance/routeGuard';
import { getViewerAccess, viewerAllows } from '@/lib/permissions/tourAccess';
import { loadRiderLogo, logoResponse } from '@/server/riders/logo';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  if (!viewerAllows(await getViewerAccess(supabase as unknown as SupabaseClient, auth.user.id, tourId), 'production', 'view')) {
    return NextResponse.json({ error: 'You can’t see this tour’s riders.' }, { status: 403 });
  }
  return logoResponse(await loadRiderLogo(createServiceSupabaseClient() as unknown as SupabaseClient, tourId), 'private, max-age=300');
}
