/* ============================================
   LOWPASS — POST /api/gear/move  (S1 Stage C1)

   Bulk-move selected gear items. The "populate a locker then move it to the
   tour" flow. Body: { ids: string[], space_id?, container_id?, tour_id? }.

   - space_id / container_id (may be null to clear) → set placement on every id.
   - tour_id → assign each id to the tour (upsert tour_gear) and run the SAME
     derived-budget sync (no second money path). Placement + tour can be combined.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { syncDerivedBudgetRowForTour } from '@/lib/gear/deriveBudget';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  const workspaceId = profile.workspace_id as string;

  const body = (await request.json().catch(() => ({}))) as {
    ids?: string[];
    space_id?: string | null;
    container_id?: string | null;
    tour_id?: string;
    quantity?: number;
  };
  const ids = (body.ids ?? []).filter((v) => typeof v === 'string');
  if (ids.length === 0) return NextResponse.json({ error: 'ids is required' }, { status: 400 });

  // Placement (space/container). Either being present in the body means "set it"
  // (null clears). Confine to the caller's workspace.
  const placement: Record<string, unknown> = {};
  if ('space_id' in body) placement.space_id = body.space_id ?? null;
  if ('container_id' in body) placement.container_id = body.container_id ?? null;
  if (Object.keys(placement).length > 0) {
    placement.updated_at = new Date().toISOString();
    const { error } = await supabase.from('gear').update(placement).in('id', ids).eq('workspace_id', workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Tour assignment → tour_gear upsert + the ONE derived-budget sync.
  if (body.tour_id) {
    const qty = Math.max(1, Number(body.quantity ?? 1));
    for (const gearId of ids) {
      await supabase
        .from('tour_gear')
        .upsert({ workspace_id: workspaceId, tour_id: body.tour_id, gear_id: gearId, quantity: qty }, { onConflict: 'tour_id,gear_id' });
      await syncDerivedBudgetRowForTour(supabase, workspaceId, gearId, body.tour_id);
    }
  }

  return NextResponse.json({ ok: true, moved: ids.length });
}
