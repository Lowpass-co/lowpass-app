/* ============================================
   LOWPASS — Budget versions collection (Phase 1 B1)

   GET  /api/budget/versions?tour_id=  → list versions (for the selector).
   POST /api/budget/versions { tour_id } → scaffold v1 (draft) from the tour's
        current line-items/income IF the tour has no version yet (tours created
        after migration 212's backfill). Idempotent — returns the existing head
        if one exists. Approver gating applies to approve/unlock/amend, NOT to
        creating the first draft.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function workspaceFor(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' as const, status: 401 };
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return { error: 'No workspace' as const, status: 403 };
  return { workspaceId: profile.workspace_id as string };
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const ws = await workspaceFor(supabase);
  if ('error' in ws) return NextResponse.json({ error: ws.error }, { status: ws.status });

  const tourId = new URL(request.url).searchParams.get('tour_id');
  if (!tourId) return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('budget_versions')
    .select('id, tour_id, version_number, status, parent_version_id, note, approved_by, approved_at, created_at')
    .eq('tour_id', tourId)
    .eq('workspace_id', ws.workspaceId)
    .order('version_number', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ versions: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const ws = await workspaceFor(supabase);
  if ('error' in ws) return NextResponse.json({ error: ws.error }, { status: ws.status });

  let body: { tour_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const tourId = body.tour_id;
  if (!tourId) return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });

  // workspace-scope the tour
  const { data: tour } = await supabase.from('tours').select('id').eq('id', tourId).eq('workspace_id', ws.workspaceId).maybeSingle();
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

  // already has a head version? return it (idempotent).
  const { data: existing } = await supabase
    .from('budget_versions').select('*')
    .eq('tour_id', tourId).eq('workspace_id', ws.workspaceId)
    .neq('status', 'superseded')
    .order('version_number', { ascending: false }).limit(1).maybeSingle();
  if (existing) return NextResponse.json(existing);

  // create v1 draft + snapshot current proposed (mirrors migration 212 backfill, one tour).
  const { data: v, error: vErr } = await supabase
    .from('budget_versions')
    .insert({ tour_id: tourId, workspace_id: ws.workspaceId, version_number: 1, status: 'draft', note: 'Scaffolded v1' })
    .select().single();
  if (vErr || !v) return NextResponse.json({ error: vErr?.message ?? 'create failed' }, { status: 500 });

  const [{ data: sections }, { data: lines }, { data: routing }] = await Promise.all([
    supabase.from('budget_sections').select('id, name, sort_order, workspace_id').eq('tour_id', tourId),
    supabase.from('budget_line_items').select('id, section_id, label, category, proposed_cost, quantity, currency, order_index, workspace_id').eq('tour_id', tourId),
    supabase.from('routing').select('id').eq('tour_id', tourId),
  ]);

  if (sections?.length) {
    await supabase.from('budget_version_sections').insert(
      sections.map((s) => ({ version_id: v.id, section_id: s.id, workspace_id: s.workspace_id, name: s.name, sort_order: s.sort_order })),
    );
  }
  if (lines?.length) {
    await supabase.from('budget_version_lines').insert(
      lines.map((l) => ({ version_id: v.id, line_item_id: l.id, workspace_id: l.workspace_id, section_id: l.section_id, label: l.label, category: l.category, proposed_cost: l.proposed_cost, quantity: l.quantity, currency: l.currency, order_index: l.order_index })),
    );
  }
  const routingIds = (routing ?? []).map((r) => r.id);
  if (routingIds.length) {
    const { data: income } = await supabase
      .from('budget_income')
      .select('routing_id, workspace_id, pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income, vip_income')
      .in('routing_id', routingIds);
    if (income?.length) {
      await supabase.from('budget_version_income').insert(
        income.map((i) => ({ version_id: v.id, routing_id: i.routing_id, workspace_id: i.workspace_id, pre_tax_guarantee: i.pre_tax_guarantee, withholding_pct: i.withholding_pct, pre_tax_overage: i.pre_tax_overage, merch_income: i.merch_income, vip_income: i.vip_income })),
      );
    }
  }
  return NextResponse.json(v, { status: 201 });
}
