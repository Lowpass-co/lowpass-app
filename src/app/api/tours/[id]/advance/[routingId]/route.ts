/* ============================================
   LOWPASS — Single Show Advance API

   GET: Full advance data for this routing date (routing, tour, instance + config + data)
   PATCH: Save advance form data, section_statuses, and/or overall status
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function ensureAuth() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  return { supabase, user };
}

async function ensureTourAccess(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, tourId: string) {
  const { data: tour } = await supabase
    .from('tours')
    .select('id, currency, default_advance_template_id')
    .eq('id', tourId)
    .single();
  return tour ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; routingId: string }> }
) {
  const { supabase, user } = await ensureAuth();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: tourId, routingId } = await params;
  const tour = await ensureTourAccess(supabase, tourId);
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { data: routing, error: routingErr } = await supabase
    .from('routing')
    .select('id, date, venue_name, city, day_type')
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .single();

  if (routingErr || !routing) {
    return NextResponse.json({ error: 'Routing date not found' }, { status: 404 });
  }

  const { data: instance } = await supabase
    .from('advance_instances')
    .select('id, status, section_statuses, data, form_config_id, flags')
    .eq('routing_id', routingId)
    .maybeSingle();

  type AdvanceFlagItem = {
    id: string;
    section_id: string;
    type: 'issue' | 'question' | 'blocker';
    message: string;
    created_by: string;
    created_at: string;
    resolved: boolean;
    resolved_by?: string;
    resolved_at?: string;
  };

  let advance: {
    instance_id: string;
    status: string;
    section_statuses: Record<string, { status: string; assigned_to?: string }>;
    data: Record<string, Record<string, unknown>>;
    sections: { template_id: string; label: string; fields: unknown[]; order: number }[];
    flags: AdvanceFlagItem[];
  } | null = null;

  if (instance) {
    const { data: config } = await supabase
      .from('advance_form_configs')
      .select('sections')
      .eq('id', instance.form_config_id)
      .single();

    advance = {
      instance_id: instance.id,
      status: instance.status ?? 'not_started',
      section_statuses: (instance.section_statuses as Record<string, { status: string; assigned_to?: string }>) ?? {},
      data: (instance.data as Record<string, Record<string, unknown>>) ?? {},
      sections: (config?.sections as { template_id: string; label: string; fields: unknown[]; order: number }[]) ?? [],
      flags: (instance.flags as AdvanceFlagItem[]) ?? [],
    };
  }

  return NextResponse.json({
    routing: {
      id: routing.id,
      date: routing.date,
      venue_name: routing.venue_name,
      city: routing.city,
      day_type: routing.day_type,
    },
    tour: {
      currency: (tour as { currency?: string }).currency ?? 'GBP',
      default_advance_template_id: (tour as { default_advance_template_id?: string }).default_advance_template_id ?? null,
    },
    advance,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; routingId: string }> }
) {
  const { supabase, user } = await ensureAuth();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: tourId, routingId } = await params;
  const tour = await ensureTourAccess(supabase, tourId);
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  // Verify routing belongs to this tour
  const { data: routingRow, error: routingErr } = await supabase
    .from('routing')
    .select('id')
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .single();

  if (routingErr || !routingRow) {
    return NextResponse.json({ error: 'Routing date not found' }, { status: 404 });
  }

  let body: {
    data?: Record<string, unknown>;
    section_statuses?: Record<string, { status: string; assigned_to?: string }>;
    status?: string;
    flags?: Array<{
      id: string;
      section_id: string;
      type: 'issue' | 'question' | 'blocker';
      message: string;
      created_by: string;
      created_at: string;
      resolved: boolean;
      resolved_by?: string;
      resolved_at?: string;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: instance, error: fetchErr } = await supabase
    .from('advance_instances')
    .select('id')
    .eq('routing_id', routingId)
    .single();

  if (fetchErr || !instance) {
    return NextResponse.json({ error: 'Advance instance not found for this date' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    last_updated_by_id: user.id,
    last_updated_at: new Date().toISOString(),
  };

  if (body.data !== undefined) updates.data = body.data;
  if (body.section_statuses !== undefined) updates.section_statuses = body.section_statuses;
  if (body.status !== undefined) updates.status = body.status;
  if (body.flags !== undefined) updates.flags = body.flags;

  const { data: updated, error: updateErr } = await supabase
    .from('advance_instances')
    .update(updates)
    .eq('id', instance.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
