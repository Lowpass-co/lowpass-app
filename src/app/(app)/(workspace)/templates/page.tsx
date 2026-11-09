/* ============================================
   LOWPASS — /templates (Nov 2026 nav audit)

   The workspace's advance templates — shared by every tour — and which one
   each day type gets. In the workspace menu because that's what they are;
   before, the only way in was from inside a tour, so a new workspace with no
   tour couldn't reach them at all. ?from=<tourId> (set by the old tour URL)
   adds a "← Advance" link back to that tour.
   ============================================ */

import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { loadTemplatesPage } from '@/server/advance/templates';
import { TemplatesPage } from '@/components/advance/TemplatesPage';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WorkspaceTemplatesRoute({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) notFound();
  const initial = await loadTemplatesPage(supabase as unknown as SupabaseClient, auth.workspaceId);
  return <TemplatesPage tourId={from && UUID.test(from) ? from : null} initial={initial} />;
}
