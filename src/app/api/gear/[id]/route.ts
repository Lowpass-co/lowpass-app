import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabase
    .from('gear')
    .select(`
      *,
      tour_gear(*)
    `)
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

async function syncDerivedBudgetRowForTour(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  workspaceId: string,
  gearId: string,
  tourId: string
) {
  const { data: gearRow } = await supabase
    .from('gear')
    .select('id, name, ownership, hire_cost_amount')
    .eq('id', gearId)
    .single();
  const { data: tg } = await supabase
    .from('tour_gear')
    .select('id, quantity, tour_ownership, tour_hire_cost_amount')
    .eq('tour_id', tourId)
    .eq('gear_id', gearId)
    .maybeSingle();
  const effectiveOwnership = (tg?.tour_ownership ?? gearRow?.ownership ?? 'owned') as string;
  const unitCost = Number(tg?.tour_hire_cost_amount ?? gearRow?.hire_cost_amount ?? 0);
  const qty = Math.max(1, Number(tg?.quantity ?? 1));
  const total = unitCost * qty;

  const { data: existingLine } = await supabase
    .from('budget_line_items')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('tour_id', tourId)
    .eq('category', 'prod_equipment')
    .eq('gear_id', gearId)
    .maybeSingle();

  if (effectiveOwnership === 'hired_to_client') {
    if (existingLine?.id) {
      await supabase
        .from('budget_line_items')
        .update({
          label: String(gearRow?.name ?? 'Gear hire'),
          proposed_cost: total,
          actual_cost: total,
          quantity: qty,
          gear_id: gearId,
          tour_gear_id: tg?.id ?? null,
          source_entity_type: 'gear',
          source_entity_id: gearId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLine.id);
    } else {
      await supabase
        .from('budget_line_items')
        .insert({
          workspace_id: workspaceId,
          tour_id: tourId,
          category: 'prod_equipment',
          label: String(gearRow?.name ?? 'Gear hire'),
          quantity: qty,
          proposed_cost: total,
          actual_cost: total,
          source_entity_type: 'gear',
          source_entity_id: gearId,
          gear_id: gearId,
          tour_gear_id: tg?.id ?? null,
        });
    }
  } else if (existingLine?.id) {
    await supabase
      .from('budget_line_items')
      .delete()
      .eq('id', existingLine.id)
      .eq('workspace_id', workspaceId);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const payload: Record<string, unknown> = {};
  if (body.name !== undefined) payload.name = body.name;
  if (body.category !== undefined) payload.category = body.category;
  if (body.manufacturer !== undefined) payload.manufacturer = body.manufacturer;
  if (body.model !== undefined) payload.model = body.model;
  if (body.serial_number !== undefined) payload.serial_number = body.serial_number;
  if (body.ownership !== undefined) payload.ownership = body.ownership;
  if (body.owner_label !== undefined) payload.owner_label = body.owner_label;
  if (body.hire_cost_amount !== undefined) payload.hire_cost_amount = body.hire_cost_amount;
  if (body.hire_cost_currency !== undefined) payload.hire_cost_currency = body.hire_cost_currency;
  if (body.hire_cost_period !== undefined) payload.hire_cost_period = body.hire_cost_period;
  if (body.notes !== undefined) payload.notes = body.notes;
  if (body.image_url !== undefined) payload.image_url = body.image_url;

  if (Object.keys(payload).length > 0) {
    const { error: updateErr } = await supabase.from('gear').update(payload).eq('id', id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const tourGear = body.tour_gear as
    | Array<{
        id?: string;
        tour_id: string;
        tour_ownership?: string | null;
        tour_hire_cost_amount?: number | null;
        tour_hire_cost_currency?: string | null;
        tour_hire_cost_period?: string | null;
        starts_on?: string | null;
        ends_on?: string | null;
        quantity?: number;
        notes?: string | null;
      }>
    | undefined;
  if (tourGear && Array.isArray(tourGear)) {
    for (const tg of tourGear) {
      if (!tg.tour_id) continue;
      const upsertPayload = {
        workspace_id: profile.workspace_id,
        tour_id: tg.tour_id,
        gear_id: id,
        tour_ownership: tg.tour_ownership ?? null,
        tour_hire_cost_amount: tg.tour_hire_cost_amount ?? null,
        tour_hire_cost_currency: tg.tour_hire_cost_currency ?? null,
        tour_hire_cost_period: tg.tour_hire_cost_period ?? null,
        starts_on: tg.starts_on ?? null,
        ends_on: tg.ends_on ?? null,
        quantity: tg.quantity ?? 1,
        notes: tg.notes ?? null,
      };
      await supabase.from('tour_gear').upsert(upsertPayload, { onConflict: 'tour_id,gear_id' });
    }
  }

  const syncTourIds = Array.isArray(body.sync_tour_ids)
    ? (body.sync_tour_ids as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const syncTourId = typeof body.sync_tour_id === 'string' ? body.sync_tour_id : null;
  const targets = new Set<string>(syncTourIds);
  if (syncTourId) targets.add(syncTourId);

  if (targets.size > 0) {
    for (const tourId of targets) {
      await syncDerivedBudgetRowForTour(supabase, profile.workspace_id, id, tourId);
    }
  }

  const { data, error } = await supabase
    .from('gear')
    .select(`
      *,
      tour_gear(*)
    `)
    .eq('id', id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
