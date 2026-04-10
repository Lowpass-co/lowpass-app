/* ============================================
   LOWPASS — Budget Personnel Rates API

   GET: List personnel_rates for a tour (?tour_id=uuid).
        TM-only: commission + commission_note visible if role has budget.approve.
   POST: Create personnel rate (commission fields only if budget.approve).
   PATCH: Update personnel rate (same permission for commission).
   DELETE: Delete personnel rate.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isMissingRosterPersonnelIdColumn } from '@/lib/personnel-schema-fallback';
import { PERMISSIONS } from '@/types';

const PERSON_TYPE_ORDER: Record<string, number> = {
  principal: 1,
  band: 2,
  crew: 3,
};

async function canApproveBudget(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role_id')
    .eq('id', userId)
    .single();
  if (!profile?.role_id) return false;
  const { data: role } = await supabase
    .from('roles')
    .select('is_god, permissions')
    .eq('id', profile.role_id)
    .single();
  if (!role) return false;
  if (role.is_god) return true;
  const perms = role.permissions as Record<string, boolean> | null;
  return !!perms?.[PERMISSIONS.BUDGET_APPROVE];
}

function stripCommission<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  delete out.commission;
  delete out.commission_note;
  return out as T;
}

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

  const { data: rows, error } = await supabase
    .from('personnel_rates')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tourId)
    .order('order_index');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const canApprove = await canApproveBudget(supabase, user.id);
  const list = (rows ?? []).map((r) =>
    canApprove ? r : stripCommission(r as Record<string, unknown>)
  );
  list.sort((a, b) => {
    const orderA = PERSON_TYPE_ORDER[(a as { person_type?: string }).person_type ?? ''] ?? 4;
    const orderB = PERSON_TYPE_ORDER[(b as { person_type?: string }).person_type ?? ''] ?? 4;
    if (orderA !== orderB) return orderA - orderB;
    return ((a as { order_index?: number }).order_index ?? 0) - ((b as { order_index?: number }).order_index ?? 0);
  });

  return NextResponse.json({ personnel_rates: list });
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

  const canApprove = await canApproveBudget(supabase, user.id);

  let body: {
    tour_id: string;
    person_name?: string;
    roster_personnel_id?: string | null;
    role?: string | null;
    person_type?: string;
    rate_type?: string;
    show_rate?: number;
    off_rate?: number;
    rehearsal_rate?: number;
    per_diem?: number;
    advance_fee?: number;
    commission?: number;
    commission_note?: string | null;
    base_rate_note?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tour_id } = body;
  if (!tour_id) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  let person_name = body.person_name?.trim() ?? '';
  let roster_personnel_id: string | null = body.roster_personnel_id ?? null;
  let rosterLinkSupported = true;

  if (roster_personnel_id) {
    const { data: roster } = await supabase
      .from('personnel')
      .select('id, name, role, standard_rates')
      .eq('id', roster_personnel_id)
      .eq('workspace_id', profile.workspace_id)
      .single();

    if (!roster) {
      return NextResponse.json({ error: 'Roster person not found' }, { status: 404 });
    }

    const dupRes = await supabase
      .from('personnel_rates')
      .select('id')
      .eq('tour_id', tour_id)
      .eq('workspace_id', profile.workspace_id)
      .eq('roster_personnel_id', roster_personnel_id)
      .maybeSingle();

    if (dupRes.error && isMissingRosterPersonnelIdColumn(dupRes.error)) {
      rosterLinkSupported = false;
    } else if (dupRes.error) {
      return NextResponse.json({ error: dupRes.error.message }, { status: 500 });
    } else if (dupRes.data) {
      return NextResponse.json({ error: 'This person is already on the tour' }, { status: 409 });
    }

    const sr = (roster.standard_rates ?? {}) as Record<string, number | string | undefined>;
    if (!person_name) person_name = roster.name;
    body.role = body.role ?? roster.role ?? null;
    if (body.show_rate === undefined) body.show_rate = Number(sr.show_day_rate) || 0;
    if (body.off_rate === undefined) body.off_rate = Number(sr.off_day_rate) || 0;
    if (body.rehearsal_rate === undefined) body.rehearsal_rate = Number(sr.travel_day_rate) || 0;
    if (body.per_diem === undefined) body.per_diem = Number(sr.per_diem_rate) || 0;
  }

  if (!person_name) {
    return NextResponse.json(
      { error: 'person_name is required (or provide roster_personnel_id)' },
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
    .from('personnel_rates')
    .select('order_index')
    .eq('tour_id', tour_id)
    .eq('workspace_id', profile.workspace_id)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const orderIndex = (existing?.order_index ?? 0) + 1;

  const payload: Record<string, unknown> = {
    tour_id,
    workspace_id: profile.workspace_id,
    person_name: person_name.trim(),
    role: body.role ?? null,
    person_type: body.person_type ?? 'crew',
    rate_type: body.rate_type ?? 'day_rate',
    show_rate: Number(body.show_rate) || 0,
    off_rate: Number(body.off_rate) || 0,
    rehearsal_rate: Number(body.rehearsal_rate) || 0,
    per_diem: Number(body.per_diem) || 0,
    advance_fee: Number(body.advance_fee) || 0,
    commission: 0,
    commission_note: null,
    base_rate_note: body.base_rate_note ?? null,
    order_index: orderIndex,
    updated_at: new Date().toISOString(),
  };
  if (roster_personnel_id && rosterLinkSupported) payload.roster_personnel_id = roster_personnel_id;

  if (canApprove && body.commission !== undefined) payload.commission = Number(body.commission) || 0;
  if (canApprove && body.commission_note !== undefined) payload.commission_note = body.commission_note ?? null;

  let createdRes = await supabase.from('personnel_rates').insert(payload).select().single();

  if (createdRes.error && isMissingRosterPersonnelIdColumn(createdRes.error) && payload.roster_personnel_id) {
    const retryPayload = { ...payload };
    delete retryPayload.roster_personnel_id;
    createdRes = await supabase.from('personnel_rates').insert(retryPayload).select().single();
  }

  const { data: created, error } = createdRes;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(canApprove ? created : stripCommission(created as Record<string, unknown>));
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

  const canApprove = await canApproveBudget(supabase, user.id);

  let body: {
    id: string;
    person_name?: string;
    role?: string | null;
    person_type?: string;
    rate_type?: string;
    show_rate?: number;
    off_rate?: number;
    rehearsal_rate?: number;
    per_diem?: number;
    advance_fee?: number;
    commission?: number;
    commission_note?: string | null;
    base_rate_note?: string | null;
    order_index?: number;
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

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.person_name !== undefined) payload.person_name = updates.person_name;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.person_type !== undefined) payload.person_type = updates.person_type;
  if (updates.rate_type !== undefined) payload.rate_type = updates.rate_type;
  if (updates.show_rate !== undefined) payload.show_rate = updates.show_rate;
  if (updates.off_rate !== undefined) payload.off_rate = updates.off_rate;
  if (updates.rehearsal_rate !== undefined) payload.rehearsal_rate = updates.rehearsal_rate;
  if (updates.per_diem !== undefined) payload.per_diem = updates.per_diem;
  if (updates.advance_fee !== undefined) payload.advance_fee = updates.advance_fee;
  if (canApprove && updates.commission !== undefined) payload.commission = updates.commission;
  if (canApprove && updates.commission_note !== undefined) payload.commission_note = updates.commission_note;
  if (updates.base_rate_note !== undefined) payload.base_rate_note = updates.base_rate_note;
  if (updates.order_index !== undefined) payload.order_index = updates.order_index;

  const { data, error } = await supabase
    .from('personnel_rates')
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(canApprove ? data : stripCommission(data as Record<string, unknown>));
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
    .from('personnel_rates')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
