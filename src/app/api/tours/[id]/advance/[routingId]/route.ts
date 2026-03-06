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
    .select('id, date, venue_name, city, day_type, address, venue_website, venue_phone, venue_capacity, latitude, longitude')
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

    // Pre-fill Venue Info section from routing (venue_name, address, venue_website, venue_capacity)
    const venueInfoSection = advance.sections.find((sec) =>
      (sec.fields as { id?: string }[]).some((f) => f.id === 'venue_name')
    );
    if (venueInfoSection && routing) {
      const tid = venueInfoSection.template_id;
      const current = advance.data[tid] ?? {};
      const r = routing as { venue_name?: string | null; address?: string | null; venue_website?: string | null; venue_phone?: string | null; venue_capacity?: number | null };
      advance.data = {
        ...advance.data,
        [tid]: {
          ...current,
          venue_name: current.venue_name ?? r.venue_name ?? undefined,
          venue_address: current.venue_address ?? r.address ?? undefined,
          venue_website: current.venue_website ?? r.venue_website ?? undefined,
          venue_capacity: current.venue_capacity ?? r.venue_capacity ?? undefined,
        },
      };
    }
  }

  const routingPayload = {
    id: routing.id,
    date: routing.date,
    venue_name: routing.venue_name,
    city: routing.city,
    day_type: routing.day_type,
    address: (routing as { address?: string }).address,
    venue_website: (routing as { venue_website?: string }).venue_website,
    venue_phone: (routing as { venue_phone?: string }).venue_phone,
    venue_capacity: (routing as { venue_capacity?: number | null }).venue_capacity,
    latitude: (routing as { latitude?: number | null }).latitude,
    longitude: (routing as { longitude?: number | null }).longitude,
  };

  return NextResponse.json({
    routing: routingPayload,
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

  // Parse request body first (was incorrectly placed after usage — critical fix)
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

  // If updating data.contacts, upsert each into workspace contact book
  if (body.data?.contacts && Array.isArray(body.data.contacts)) {
    const { data: tourRow } = await supabase
      .from('tours')
      .select('workspace_id')
      .eq('id', tourId)
      .single();
    const workspaceId = (tourRow as { workspace_id?: string } | null)?.workspace_id;
    if (workspaceId) {
      const contacts = body.data.contacts as Array<{
        id?: string;
        first_name?: string;
        last_name?: string;
        phone?: string;
        email?: string;
        role?: string;
        venue_name?: string;
        notes?: string;
      }>;
      const updatedContacts: Array<Record<string, unknown>> = [];
      for (const c of contacts) {
        const first_name = (c.first_name ?? '').toString().trim();
        if (!first_name) continue;
        const row = {
          workspace_id: workspaceId,
          first_name,
          last_name: (c.last_name ?? '').toString().trim(),
          phone: c.phone ?? null,
          email: c.email ?? null,
          role: (c.role ?? '').toString().trim(),
          venue_name: c.venue_name ?? null,
          notes: c.notes ?? null,
        };
        if (c.id) {
          const { data: updated } = await supabase
            .from('contacts')
            .update({ ...row, updated_at: new Date().toISOString() })
            .eq('id', c.id)
            .eq('workspace_id', workspaceId)
            .select('id')
            .single();
          if (updated) {
            updatedContacts.push({ ...c, id: updated.id });
          } else {
            const { data: inserted } = await supabase
              .from('contacts')
              .insert(row)
              .select('id')
              .single();
            updatedContacts.push({ ...c, id: inserted?.id ?? crypto.randomUUID() });
          }
        } else {
          const { data: inserted } = await supabase
            .from('contacts')
            .insert(row)
            .select('id')
            .single();
          updatedContacts.push({ ...c, id: inserted?.id ?? crypto.randomUUID() });
        }
      }
      body.data = { ...body.data, contacts: updatedContacts };
    }
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

export async function DELETE(
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

  const { data: routingRow, error: routingErr } = await supabase
    .from('routing')
    .select('id')
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .single();

  if (routingErr || !routingRow) {
    return NextResponse.json({ error: 'Routing date not found' }, { status: 404 });
  }

  const { data: instance, error: fetchErr } = await supabase
    .from('advance_instances')
    .select('id, form_config_id')
    .eq('routing_id', routingId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (instance) {
    const { error: deleteInstanceErr } = await supabase
      .from('advance_instances')
      .delete()
      .eq('id', instance.id);

    if (deleteInstanceErr) {
      return NextResponse.json({ error: deleteInstanceErr.message }, { status: 500 });
    }

    const configId = (instance as { form_config_id?: string }).form_config_id;
    if (configId) {
      const { count } = await supabase
        .from('advance_instances')
        .select('*', { count: 'exact', head: true })
        .eq('form_config_id', configId);
      if (count != null && count === 0) {
        await supabase.from('advance_form_configs').delete().eq('id', configId);
      }
    }
  }

  return new NextResponse(null, { status: 204 });
}
