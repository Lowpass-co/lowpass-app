/* ============================================
   LOWPASS — Single Show Advance API

   GET: Full advance data for this routing date (routing, tour, instance + config + data)
        — read by the mobile show reader.

   Writes were removed in the Advance rebuild (Oct 2026): answers go through
   …/answers (advance_merge_answers), the layout through …/sections. The old
   PATCH read-modify-wrote the whole answers JSON and had no caller left.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { distanceMiles } from '@/lib/utils';
import { resolveAdvanceVenue, type AdvanceVenueSection } from '@/lib/advance/venue';
import type { RoutingVenueSource } from '@/lib/venues/resolveVenue';

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
    .select('id, date, venue_name, city, country, day_type, address, venue_website, venue_phone, venue_capacity, latitude, longitude, canonical_venue_id, venue_frozen_at, canonical:canonical_venues(id, name, address, city, country, capacity)')
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

    // Pre-fill Venue Info section from routing, then the LINKED canonical venue as a
    // fallback (Direction A — world-readable venue FACTS flowing INTO this private,
    // workspace-scoped advance; never advance data leaving the workspace). NON-
    // DESTRUCTIVE: `current.X ??` only fills BLANK fields — a user entry is never
    // overwritten, so this is safe on any advance (there is no separate "locked"
    // advance concept; the fill respects whatever's already there).
    const venueInfoSection = advance.sections.find((sec) =>
      (sec.fields as { id?: string }[]).some((f) => f.id === 'venue_name')
    );
    if (venueInfoSection && routing) {
      const tid = venueInfoSection.template_id;
      const current = advance.data[tid] ?? {};
      const r = routing as { venue_name?: string | null; address?: string | null; venue_website?: string | null; venue_phone?: string | null; venue_capacity?: number | null; canonical_venue_id?: string | null };

      // Only load the canonical venue when a fact is still missing after routing —
      // avoids a query when routing already covers everything.
      let canon: { name?: string | null; address?: string | null; capacity?: number | null } | null = null;
      const needsFill =
        (current.venue_name ?? r.venue_name) == null ||
        (current.venue_address ?? r.address) == null ||
        (current.venue_capacity ?? r.venue_capacity) == null;
      if (r.canonical_venue_id && needsFill) {
        const { data: cv } = await supabase
          .from('canonical_venues')
          .select('name, address, capacity')
          .eq('id', r.canonical_venue_id)
          .maybeSingle();
        canon = (cv as { name?: string | null; address?: string | null; capacity?: number | null } | null) ?? null;
      }

      advance.data = {
        ...advance.data,
        [tid]: {
          ...current,
          venue_name: current.venue_name ?? r.venue_name ?? canon?.name ?? undefined,
          venue_address: current.venue_address ?? r.address ?? canon?.address ?? undefined,
          venue_website: current.venue_website ?? r.venue_website ?? undefined,
          venue_capacity: current.venue_capacity ?? r.venue_capacity ?? canon?.capacity ?? undefined,
        },
      };
    }

    // Pre-fill Hotel section from canonical hotels for this routing date (if form is empty)
    const hotelSection = advance.sections.find((sec) =>
      sec.label.toLowerCase().includes('hotel') ||
      (sec.fields as { id?: string }[]).some((f) =>
        ['hotel_name', 'hotel_address', 'hotel_phone', 'confirmation_number', 'check_in', 'check_out'].includes(
          String(f.id ?? '')
        )
      )
    );
    if (hotelSection && routing?.date) {
      const tid = hotelSection.template_id;
      const current = advance.data[tid] ?? {};
      const dateMs = new Date(`${routing.date}T12:00:00`).getTime();
      const { data: hotelRows } = await supabase
        .from('hotels')
        .select('name, address, phone, confirmation_number, check_in_at, check_out_at')
        .eq('tour_id', tourId)
        .order('check_in_at', { ascending: true, nullsFirst: true })
        .limit(20);
      const hotel =
        (hotelRows ?? []).find((row) => {
          const start = (row as { check_in_at?: string | null }).check_in_at;
          const end = (row as { check_out_at?: string | null }).check_out_at;
          const startOk = !start || new Date(start).getTime() <= dateMs;
          const endOk = !end || new Date(end).getTime() >= dateMs;
          return startOk && endOk;
        }) ??
        (hotelRows ?? [])[0] ??
        null;
      if (hotel) {
        const h = hotel as {
          name?: string | null;
          address?: string | null;
          phone?: string | null;
          confirmation_number?: string | null;
          check_in_at?: string | null;
          check_out_at?: string | null;
        };
        advance.data = {
          ...advance.data,
          [tid]: {
            ...current,
            hotel_name: current.hotel_name ?? h.name ?? undefined,
            hotel_address: current.hotel_address ?? h.address ?? undefined,
            hotel_phone: current.hotel_phone ?? h.phone ?? undefined,
            confirmation_number: current.confirmation_number ?? h.confirmation_number ?? undefined,
            check_in: current.check_in ?? h.check_in_at?.slice(0, 10) ?? undefined,
            check_out: current.check_out ?? h.check_out_at?.slice(0, 10) ?? undefined,
          },
        };
      }
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

  // Q1 — venue block: the advance's OWN edited Venue Info value wins per-field,
  // else resolveVenue(canonical). resolveVenue is the only reader of the gated
  // routing.venue_* columns (guardrail intact); we pass the ORIGINAL persisted
  // instance.data so a blank prefill never masks the canonical fallback.
  const rv = resolveAdvanceVenue(
    routing as RoutingVenueSource,
    (advance?.sections as AdvanceVenueSection[] | undefined) ?? undefined,
    (instance?.data as Record<string, Record<string, unknown>> | undefined) ?? null,
  );
  const routingPayload = {
    id: routing.id,
    date: routing.date,
    venue_name: rv.name,
    city: rv.city ?? routing.city,
    day_type: routing.day_type,
    address: rv.address,
    venue_website: rv.website,
    venue_phone: rv.phone,
    venue_capacity: rv.capacity,
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
