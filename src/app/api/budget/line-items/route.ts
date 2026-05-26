/* ============================================
   LOWPASS — Budget Line Items API

   GET: List line items for a tour (?tour_id=uuid, ?category= optional).
   POST: Create line item (order_index = max in category + 1).
   PATCH: Update line item (id + fields in body).
   DELETE: Delete line item (id in body).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tour_id');
  const category = searchParams.get('category');
  if (!tourId) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  let query = supabase
    .from('budget_line_items')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tourId)
    .order('section')
    .order('sort_order', { ascending: true })
    .order('category')
    .order('order_index');

  if (category) {
    query = query.eq('category', category);
  }

  const needsGearSync = !category || category === 'prod_equipment';
  if (needsGearSync) {
    const { data: tourGearRows } = await supabase
      .from('tour_gear')
      .select(`
        id,
        quantity,
        tour_ownership,
        tour_hire_cost_amount,
        gear:gear_id(id, name, ownership, hire_cost_amount)
      `)
      .eq('workspace_id', profile.workspace_id)
      .eq('tour_id', tourId);

    const desired = new Map<string, { label: string; qty: number; total: number; tourGearId: string; gearId: string }>();
    for (const row of tourGearRows ?? []) {
      const gearRef = Array.isArray((row as { gear?: unknown }).gear)
        ? ((row as { gear?: Array<{ id?: string; name?: string; ownership?: string; hire_cost_amount?: number | null }> }).gear ?? [])[0]
        : (row as { gear?: { id?: string; name?: string; ownership?: string; hire_cost_amount?: number | null } | null }).gear;
      if (!gearRef?.id) continue;
      const ownership = (row as { tour_ownership?: string | null }).tour_ownership ?? gearRef.ownership ?? 'owned';
      if (ownership !== 'hired_to_client') continue;
      const qty = Math.max(1, Number((row as { quantity?: number | null }).quantity ?? 1));
      const unit = Number((row as { tour_hire_cost_amount?: number | null }).tour_hire_cost_amount ?? gearRef.hire_cost_amount ?? 0);
      desired.set(gearRef.id, {
        label: String(gearRef.name ?? 'Gear hire'),
        qty,
        total: unit * qty,
        tourGearId: String((row as { id: string }).id),
        gearId: gearRef.id,
      });
    }

    const { data: existingDerived } = await supabase
      .from('budget_line_items')
      .select('id, gear_id')
      .eq('workspace_id', profile.workspace_id)
      .eq('tour_id', tourId)
      .eq('category', 'prod_equipment')
      .eq('source_entity_type', 'gear');

    for (const row of existingDerived ?? []) {
      const gearId = (row as { gear_id?: string | null }).gear_id ?? null;
      if (!gearId || desired.has(gearId)) continue;
      await supabase
        .from('budget_line_items')
        .delete()
        .eq('id', (row as { id: string }).id)
        .eq('workspace_id', profile.workspace_id);
    }

    for (const [gearId, d] of desired.entries()) {
      const existing = (existingDerived ?? []).find((x) => (x as { gear_id?: string | null }).gear_id === gearId);
      if (existing) {
        await supabase
          .from('budget_line_items')
          .update({
            label: d.label,
            quantity: d.qty,
            proposed_cost: d.total,
            actual_cost: d.total,
            gear_id: d.gearId,
            tour_gear_id: d.tourGearId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', (existing as { id: string }).id)
          .eq('workspace_id', profile.workspace_id);
      } else {
        const { data: maxOrder } = await supabase
          .from('budget_line_items')
          .select('order_index')
          .eq('workspace_id', profile.workspace_id)
          .eq('tour_id', tourId)
          .eq('category', 'prod_equipment')
          .order('order_index', { ascending: false })
          .limit(1)
          .maybeSingle();
        await supabase
          .from('budget_line_items')
          .insert({
            workspace_id: profile.workspace_id,
            tour_id: tourId,
            category: 'prod_equipment',
            label: d.label,
            quantity: d.qty,
            proposed_cost: d.total,
            actual_cost: d.total,
            source_entity_type: 'gear',
            source_entity_id: d.gearId,
            gear_id: d.gearId,
            tour_gear_id: d.tourGearId,
            order_index: Number(maxOrder?.order_index ?? 0) + 1,
            section: 'hire',
            sort_order: Number(maxOrder?.order_index ?? 0) + 1,
          });
      }
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ line_items: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: {
    tour_id: string;
    category: string;
    label: string;
    quantity?: number;
    proposed_cost?: number;
    actual_cost?: number;
    currency?: string | null;
    routing_id?: string | null;
    notes?: string | null;
    section?: string | null;
    sort_order?: number;
    /** Phase 3 §D — pre_prod / rehearsals / show_days / wrap, or null. */
    phase_tag?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tour_id, category, label } = body;
  if (!tour_id || !category?.trim() || !label?.trim()) {
    return NextResponse.json(
      { error: 'tour_id, category, and label are required' },
      { status: 400 }
    );
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tour_id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from('budget_line_items')
    .select('order_index')
    .eq('tour_id', tour_id)
    .eq('workspace_id', profile.workspace_id)
    .eq('category', category.trim())
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const orderIndex = (existing?.order_index ?? 0) + 1;
  const sortOrder =
    body.sort_order != null && Number.isFinite(Number(body.sort_order))
      ? Math.max(0, Math.floor(Number(body.sort_order)))
      : orderIndex;
  const sectionVal =
    body.section?.trim().length &&
    /^[a-z_]+$/.test(body.section.trim().toLowerCase()) &&
    ['income', 'expenses', 'hotels', 'travel', 'hire', 'payroll', 'per_diems', 'other'].includes(
      body.section.trim().toLowerCase()
    )
      ? body.section.trim().toLowerCase()
      : null;

  // Phase 3 §D — phase_tag, optional, validated against migration 064 enum.
  const PHASE_TAG_VALUES = ['pre_prod', 'rehearsals', 'show_days', 'wrap'];
  let phaseTag: string | null = null;
  if (body.phase_tag != null) {
    if (!PHASE_TAG_VALUES.includes(body.phase_tag)) {
      return NextResponse.json(
        {
          error:
            'phase_tag must be one of: pre_prod, rehearsals, show_days, wrap (or null)',
        },
        { status: 400 },
      );
    }
    phaseTag = body.phase_tag;
  }

  const { data: created, error } = await supabase
    .from('budget_line_items')
    .insert({
      tour_id,
      workspace_id: profile.workspace_id,
      category: category.trim(),
      label: label.trim(),
      quantity: Number(body.quantity) || 1,
      proposed_cost: Number(body.proposed_cost) || 0,
      actual_cost: Number(body.actual_cost) || 0,
      currency: body.currency ?? null,
      routing_id: body.routing_id ?? null,
      notes: body.notes ?? null,
      order_index: orderIndex,
      section: sectionVal,
      sort_order: sortOrder,
      phase_tag: phaseTag,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(created);
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const STATUS_VALUES = ['draft', 'quoted', 'approved', 'paid', 'disputed'];
  // Phase 3 §D — phase_tag enum mirrors migration 064's CHECK constraint.
  const PHASE_TAG_VALUES = ['pre_prod', 'rehearsals', 'show_days', 'wrap'];

  let body: {
    id: string;
    category?: string;
    label?: string;
    quantity?: number;
    proposed_cost?: number;
    actual_cost?: number;
    /** Phase B §B0 — explicit override flag (migration 105).
     *  Set true when the slide-over / grid Actual edit drifts
     *  from the transactions sum; cleared by Sync. */
    actual_cost_override?: boolean;
    currency?: string | null;
    routing_id?: string | null;
    notes?: string | null;
    order_index?: number;
    status?: string;
    /** Phase 3 §D — pre_prod / rehearsals / show_days / wrap, or null. */
    phase_tag?: string | null;
    tags?: string[];
    linked_item_ids?: string[];
    flight_id?: string | null;
    hotel_id?: string | null;
    room_id?: string | null;
    gear_id?: string | null;
    tour_gear_id?: string | null;
    section?: string | null;
    sort_order?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, ...updates } = body;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { data: existingRow } = await supabase
    .from('budget_line_items')
    .select('id, flight_id, hotel_id, room_id, gear_id, tour_gear_id')
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();
  if (!existingRow) {
    return NextResponse.json({ error: 'Line item not found' }, { status: 404 });
  }

  const updatesDerivedFields =
    updates.label !== undefined ||
    updates.proposed_cost !== undefined ||
    updates.actual_cost !== undefined ||
    updates.currency !== undefined;
  if (existingRow.flight_id && updatesDerivedFields) {
    return NextResponse.json(
      { error: `This row is derived from flight ${existingRow.flight_id}; edit the flight instead` },
      { status: 409 }
    );
  }
  if ((existingRow.hotel_id || existingRow.room_id) && updatesDerivedFields) {
    return NextResponse.json(
      { error: 'This row is derived from rooming; edit the linked room/hotel instead' },
      { status: 409 }
    );
  }
  if ((existingRow.gear_id || existingRow.tour_gear_id) && updatesDerivedFields) {
    return NextResponse.json(
      { error: 'This row is derived from gear hire; edit the linked gear instead' },
      { status: 409 }
    );
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.label !== undefined) payload.label = updates.label;
  if (updates.quantity !== undefined) payload.quantity = updates.quantity;
  if (updates.proposed_cost !== undefined) payload.proposed_cost = updates.proposed_cost;
  if (updates.actual_cost !== undefined) payload.actual_cost = updates.actual_cost;
  /* §B0 — explicit override flag. Independent of actual_cost
     (caller can set either or both in the same PATCH; the
     slide-over commits both atomically when "Sync to txns sum"
     fires). The flag is not part of updatesDerivedFields above
     because override semantics are user-intent, not amount
     editing — derived rows are still allowed to toggle it. */
  if (updates.actual_cost_override !== undefined) {
    payload.actual_cost_override = Boolean(updates.actual_cost_override);
  }
  if (updates.currency !== undefined) payload.currency = updates.currency;
  if (updates.routing_id !== undefined) payload.routing_id = updates.routing_id;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.order_index !== undefined) payload.order_index = updates.order_index;
  if (updates.status !== undefined) {
    if (!STATUS_VALUES.includes(updates.status)) {
      return NextResponse.json({ error: 'status must be one of: draft, quoted, approved, paid, disputed' }, { status: 400 });
    }
    payload.status = updates.status;
  }
  // Phase 3 §D — phase_tag null = unscoped; valid values per migration 064.
  if (updates.phase_tag !== undefined) {
    if (
      updates.phase_tag !== null &&
      !PHASE_TAG_VALUES.includes(updates.phase_tag)
    ) {
      return NextResponse.json(
        {
          error:
            'phase_tag must be one of: pre_prod, rehearsals, show_days, wrap (or null)',
        },
        { status: 400 },
      );
    }
    payload.phase_tag = updates.phase_tag;
  }
  if (updates.tags !== undefined) payload.tags = Array.isArray(updates.tags) ? updates.tags : [];
  if (updates.linked_item_ids !== undefined) payload.linked_item_ids = Array.isArray(updates.linked_item_ids) ? updates.linked_item_ids : [];
  if (updates.flight_id !== undefined) payload.flight_id = updates.flight_id;
  if (updates.hotel_id !== undefined) payload.hotel_id = updates.hotel_id;
  if (updates.room_id !== undefined) payload.room_id = updates.room_id;
  if (updates.gear_id !== undefined) payload.gear_id = updates.gear_id;
  if (updates.tour_gear_id !== undefined) payload.tour_gear_id = updates.tour_gear_id;

  const SECTION_WHITE = ['income', 'expenses', 'hotels', 'travel', 'hire', 'payroll', 'per_diems', 'other'];
  if (updates.section !== undefined && updates.section !== null) {
    const s = String(updates.section).trim().toLowerCase();
    if (!SECTION_WHITE.includes(s)) {
      return NextResponse.json({ error: 'invalid section bucket' }, { status: 400 });
    }
    payload.section = s;
  } else if (updates.section === null) {
    payload.section = null;
  }
  if (updates.sort_order !== undefined && Number.isFinite(Number(updates.sort_order))) {
    payload.sort_order = Math.max(0, Math.floor(Number(updates.sort_order)));
  }

  const { data, error } = await supabase
    .from('budget_line_items')
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data as {
    source_entity_type?: string | null;
    source_entity_id?: string | null;
  };
  if (
    updates.label !== undefined &&
    ((row.source_entity_type === 'hotel_booking' && row.source_entity_id) || updates.hotel_id)
  ) {
    const name = String(updates.label).trim();
    await supabase
      .from('hotels')
      .update({
        name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', updates.hotel_id ?? row.source_entity_id)
      .eq('workspace_id', profile.workspace_id);
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: { id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('budget_line_items')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
