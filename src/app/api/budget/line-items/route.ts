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
    .order('category')
    .order('order_index');

  if (category) {
    query = query.eq('category', category);
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

  let body: {
    id: string;
    category?: string;
    label?: string;
    quantity?: number;
    proposed_cost?: number;
    actual_cost?: number;
    currency?: string | null;
    routing_id?: string | null;
    notes?: string | null;
    order_index?: number;
    status?: string;
    tags?: string[];
    linked_item_ids?: string[];
    flight_id?: string | null;
    hotel_id?: string | null;
    room_id?: string | null;
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
    .select('id, flight_id, hotel_id, room_id')
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

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.label !== undefined) payload.label = updates.label;
  if (updates.quantity !== undefined) payload.quantity = updates.quantity;
  if (updates.proposed_cost !== undefined) payload.proposed_cost = updates.proposed_cost;
  if (updates.actual_cost !== undefined) payload.actual_cost = updates.actual_cost;
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
  if (updates.tags !== undefined) payload.tags = Array.isArray(updates.tags) ? updates.tags : [];
  if (updates.linked_item_ids !== undefined) payload.linked_item_ids = Array.isArray(updates.linked_item_ids) ? updates.linked_item_ids : [];
  if (updates.flight_id !== undefined) payload.flight_id = updates.flight_id;
  if (updates.hotel_id !== undefined) payload.hotel_id = updates.hotel_id;
  if (updates.room_id !== undefined) payload.room_id = updates.room_id;

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
