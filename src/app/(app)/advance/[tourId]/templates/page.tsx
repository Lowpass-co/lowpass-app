/* ============================================
   LOWPASS — Advance · templates (Oct 2026 rebuild)

   /advance/[tourId]/templates — the workspace's advance templates (shared
   across tours; reached from a tour so the chrome keeps your place) and
   which template each day type gets.
   ============================================ */

import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { loadTemplateSet } from '@/server/advance/templates';
import { TemplatesPage } from '@/components/advance/TemplatesPage';

export const dynamic = 'force-dynamic';

export default async function AdvanceTemplatesRoute({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) notFound();
  const client = supabase as unknown as SupabaseClient;
  const set = await loadTemplateSet(client, auth.workspaceId);
  const ids = set.templates.map((t) => t.id);
  const { data: uses } = ids.length
    ? await client.from('advance_form_configs').select('layout_template_id, routing_id').in('layout_template_id', ids)
    : { data: [] };
  const count: Record<string, number> = {};
  for (const u of (uses ?? []) as { layout_template_id: string; routing_id: string | null }[]) {
    if (u.routing_id) count[u.layout_template_id] = (count[u.layout_template_id] ?? 0) + 1;
  }
  return (
    <TemplatesPage
      tourId={tourId}
      initial={{ templates: set.templates.map((t) => ({ id: t.id, name: t.name, sections: t.sections, days: count[t.id] ?? 0 })), mapping: set.mapping }}
    />
  );
}
