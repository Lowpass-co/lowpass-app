/* ============================================
   LOWPASS — Single Show Advance API

   GET: Full advance data for this routing date (routing, tour, instance + config + data)
   PATCH: Save advance form data, section_statuses, and/or overall status
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { distanceMiles } from '@/lib/utils';

async function ensureAuth() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  return { supabase, user };
}

async function ensureTourAccess(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, tourId: string) {
  const { data: tour } = await supabase
    .from('tours')
    .select('id, currency, default_advance_template_id, principal_count, band_count, crew_count, artist_id')
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
    .select('id, status, section_statuses, data, form_config_id, flags, last_updated_at, last_updated_by_id')
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
    sections: { template_id: string; label: string; fields: unknown[]; order: number; tm_only?: boolean }[];
    flags: AdvanceFlagItem[];
    last_updated_at?: string | null;
    last_updated_by_id?: string | null;
    last_updated_by_name?: string | null;
  } | null = null;

  if (instance) {
    const { data: config } = await supabase
      .from('advance_form_configs')
      .select('sections')
      .eq('id', instance.form_config_id)
      .single();

    const inst = instance as { last_updated_by_id?: string | null };
    let last_updated_by_name: string | null = null;
    if (inst.last_updated_by_id) {
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', inst.last_updated_by_id).single();
      last_updated_by_name = (profile as { name?: string | null })?.name ?? null;
    }

    advance = {
      instance_id: instance.id,
      status: instance.status ?? 'not_started',
      section_statuses: (instance.section_statuses as Record<string, { status: string; assigned_to?: string }>) ?? {},
      data: (instance.data as Record<string, Record<string, unknown>>) ?? {},
      sections: (config?.sections as { template_id: string; label: string; fields: unknown[]; order: number }[]) ?? [],
      flags: (instance.flags as AdvanceFlagItem[]) ?? [],
      last_updated_at: (instance as { last_updated_at?: string | null }).last_updated_at ?? null,
      last_updated_by_id: inst.last_updated_by_id ?? null,
      last_updated_by_name,
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

    // Pre-fill Transport drive_distance from previous routing leg (if not already set)
    const transportSection = advance.sections.find((sec) =>
      (sec.fields as { id?: string }[]).some((f) => f.id === 'drive_distance')
    );
    if (transportSection && routing) {
      const tid = transportSection.template_id;
      const current = advance.data[tid] ?? {};
      const existingDrive = current.drive_distance;
      const existingSource = current.drive_distance_source;
      if (existingDrive === undefined || existingDrive === null || existingDrive === '') {
        const r = routing as { date?: string; latitude?: number | null; longitude?: number | null };
        const lat = r.latitude ?? null;
        const lng = r.longitude ?? null;
        if (lat != null && lng != null) {
          const { data: prevRow } = await supabase
            .from('routing')
            .select('date, latitude, longitude')
            .eq('tour_id', tourId)
            .lt('date', r.date ?? '')
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();
          const prev = prevRow as { latitude?: number | null; longitude?: number | null } | null;
          if (prev?.latitude != null && prev?.longitude != null) {
            const miles = Math.round(distanceMiles(prev.latitude, prev.longitude, lat, lng));
            const hours = miles / 50;
            const hoursStr = hours >= 1 ? `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m` : `${Math.round(hours * 60)}m`;
            const driveLabel = `${miles} mi / ${hoursStr}`;
            advance.data = {
              ...advance.data,
              [tid]: {
                ...current,
                drive_distance: driveLabel,
                drive_distance_source: 'routing',
              },
            };
          }
        }
      }
    }

    // Enrich sections with tm_only from advance_templates (for Deal Info etc.)
    const templateIds = [...new Set(advance.sections.map((s) => s.template_id).filter(Boolean))];
    if (templateIds.length > 0) {
      const { data: tmRows } = await supabase
        .from('advance_templates')
        .select('id, tm_only')
        .in('id', templateIds);
      const tmOnlyByTemplate = new Map<string, boolean>();
      (tmRows ?? []).forEach((r: { id: string; tm_only?: boolean }) => {
        tmOnlyByTemplate.set(r.id, r.tm_only === true);
      });
      advance.sections = advance.sections.map((sec) => ({
        ...sec,
        tm_only: tmOnlyByTemplate.get(sec.template_id) ?? false,
      }));
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

  let artist_name: string | null = null;
  const artistId = (tour as { artist_id?: string })?.artist_id;
  if (artistId) {
    const { data: artist } = await supabase.from('artists').select('name').eq('id', artistId).single();
    artist_name = (artist as { name?: string })?.name ?? null;
  }

  return NextResponse.json({
    routing: routingPayload,
    tour: {
      currency: (tour as { currency?: string }).currency ?? 'GBP',
      default_advance_template_id: (tour as { default_advance_template_id?: string }).default_advance_template_id ?? null,
      principal_count: (tour as { principal_count?: number }).principal_count ?? 0,
      band_count: (tour as { band_count?: number }).band_count ?? 0,
      crew_count: (tour as { crew_count?: number }).crew_count ?? 0,
      artist_name,
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

  const out = updated as { last_updated_by_id?: string | null; last_updated_at?: string | null };
  let last_updated_by_name: string | null = null;
  if (out.last_updated_by_id) {
    const { data: profile } = await supabase.from('profiles').select('name').eq('id', out.last_updated_by_id).single();
    last_updated_by_name = (profile as { name?: string | null })?.name ?? null;
  }
  return NextResponse.json({ ...out, last_updated_by_name });
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

  // Validate the routing row belongs to this tour. We do NOT delete it.
  const { data: routingRow, error: routingErr } = await supabase
    .from('routing')
    .select('id')
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .single();

  if (routingErr || !routingRow) {
    return NextResponse.json({ error: 'Routing date not found' }, { status: 404 });
  }

  // Delete ONLY the advance_instances row for this routing.
  // advance_comments cascades via ON DELETE CASCADE.
  // The routing row itself stays intact — the show remains on the tour.
  const { data: deletedInstance, error: deleteInstanceErr } = await supabase
    .from('advance_instances')
    .delete()
    .eq('routing_id', routingId)
    .select('id');

  if (deleteInstanceErr) {
    return NextResponse.json({ error: deleteInstanceErr.message }, { status: 500 });
  }

  if (!deletedInstance?.length) {
    // No advance was ever created for this show — nothing to clear.
    return NextResponse.json(
      { error: 'No advance exists for this show yet' },
      { status: 404 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
