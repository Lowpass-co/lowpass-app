/* ============================================================
   LOWPASS — GET /api/stage-plot/icons (§SP10 custom library)

   Lists the workspace's custom / AI-generated stage-plot icons as
   IconDescriptors the editor can register + render. viewBox is
   reconstructed from the stored footprint (the generator authors in
   units of ft × 100), so a body authored 0 0 (w·100) (d·100) renders
   to scale. Requires migration 109.
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const KNOWN_CATS = new Set(['musicians', 'mics', 'drums', 'strings', 'keys', 'amps', 'monitors', 'signal', 'infrastructure', 'lighting', 'stands', 'utility']);

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { data, error } = await supabase
    .from('stage_plot_custom_items')
    .select('id, label, category, svg_content, default_width_ft, default_depth_ft')
    .eq('workspace_id', profile.workspace_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ items: [] });

  const items = (data ?? []).map((r) => {
    const w = Number(r.default_width_ft) || 1;
    const d = Number(r.default_depth_ft) || 1;
    return {
      name: `custom_${r.id}`,
      category: KNOWN_CATS.has(r.category) ? r.category : 'utility',
      label: r.label,
      footprint: { width_ft: w, depth_ft: d },
      viewBox: `0 0 ${Math.round(w * 100)} ${Math.round(d * 100)}`,
      body: r.svg_content,
    };
  });

  return NextResponse.json({ items });
}
