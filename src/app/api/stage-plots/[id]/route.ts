/* ============================================
   LOWPASS — Stage Plots API: load / save / delete (§SP0 wiring)

   GET    /api/stage-plots/[id] → { plot, items, riderPackId }
   PUT    /api/stage-plots/[id]   body: { plot, items } (whole-doc)
   DELETE /api/stage-plots/[id]   (deletes the rider_pack → cascade)
   RLS scopes everything to the caller's workspace. Migration 109.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { loadStagePlot, loadPlotChannels, saveStagePlot } from '@/lib/stage-plot/server';
import type { EditorItem, EditorPlot } from '@/lib/stage-plot/editor-types';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const data = await loadStagePlot(supabase, id);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const channels = await loadPlotChannels(supabase, data.riderPackId);
  return NextResponse.json({ ...data, channels });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => null);
  const plot = (body as { plot?: EditorPlot } | null)?.plot;
  const items = (body as { items?: EditorItem[] } | null)?.items ?? [];
  if (!plot?.widthFt) return NextResponse.json({ error: 'Invalid plot' }, { status: 400 });
  await saveStagePlot(supabase, id, auth.workspaceId, plot, items);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const { data: plotRow } = await supabase.from('stage_plots').select('rider_pack_id').eq('id', id).single();
  if (plotRow?.rider_pack_id) {
    // Deleting the rider_pack cascades to stage_plots + items.
    await supabase.from('rider_packs').delete().eq('id', plotRow.rider_pack_id);
  }
  return NextResponse.json({ ok: true });
}
