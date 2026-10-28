/* ============================================
   LOWPASS — Tour Advance Management API

   GET: All advance data for a tour (routing dates + instances + form configs)
        — read by /m/today and the routing editor.

   POST was removed in the Advance rebuild (Oct 2026): it wrote per-show configs
   from tours.default_advance_template_id, around the workspace template model
   (day type → template, src/server/advance/templates.ts), and had no live
   caller. A day's advance now starts on its first answer (ensureAdvance).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const SHOW_DAY_TYPES = ['show', 'festival'];

export type AdvanceSection = {
  template_id: string;
  label: string;
  fields: { id: string; label: string; type: string; [key: string]: unknown }[];
  order: number;
};

export type AdvanceDateItem = {
  routing_id: string;
  date: string;
  day_type: string;
  city: string;
  venue_name: string | null;
  address?: string | null;
  advance: {
    instance_id: string;
    status: string;
    section_statuses: Record<string, { status: string; assigned_to?: string }>;
    form_config_id: string;
    sections: AdvanceSection[];
    last_updated_at?: string | null;
  } | null;
};

async function ensureAuth() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  return { supabase, user };
}

async function ensureTourAccess(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, tourId: string) {
  const { data: tour, error } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .single();
  if (error || !tour) return null;
  return tour;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await ensureAuth();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: tourId } = await params;
  const tour = await ensureTourAccess(supabase, tourId);
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const all = searchParams.get('all') === 'true';

  const { data: routingRows, error: routingError } = await supabase
    .from('routing')
    .select('id, date, day_type, city, venue_name, address')
    .eq('tour_id', tourId)
    .order('date');

  if (routingError) {
    return NextResponse.json({ error: routingError.message }, { status: 500 });
  }

  const routing = all
    ? routingRows ?? []
    : (routingRows ?? []).filter((r) => {
        const types = (r.day_type ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
        return SHOW_DAY_TYPES.some((t) => types.includes(t));
      });

  if (routing.length === 0) {
    return NextResponse.json({ dates: [] });
  }

  const routingIds = routing.map((r) => r.id);

  const { data: instances, error: instancesError } = await supabase
    .from('advance_instances')
    .select('id, routing_id, form_config_id, status, section_statuses, last_updated_at')
    .in('routing_id', routingIds);

  if (instancesError) {
    return NextResponse.json({ error: instancesError.message }, { status: 500 });
  }

  const configIds = [...new Set((instances ?? []).map((i) => i.form_config_id))];
  const { data: configs, error: configsError } = await supabase
    .from('advance_form_configs')
    .select('id, sections')
    .in('id', configIds);

  if (configsError) {
    return NextResponse.json({ error: configsError.message }, { status: 500 });
  }

  const configById = new Map((configs ?? []).map((c) => [c.id, c]));

  const instanceByRoutingId = new Map((instances ?? []).map((i) => [i.routing_id, i]));

  const dates: AdvanceDateItem[] = routing.map((r) => {
    const instance = instanceByRoutingId.get(r.id) ?? null;
    const config = instance ? configById.get(instance.form_config_id) : null;
    const sections = (config?.sections as AdvanceSection[] | null) ?? [];

    return {
      routing_id: r.id,
      date: r.date,
      day_type: r.day_type ?? '',
      city: r.city ?? '',
      venue_name: r.venue_name ?? null,
      address: (r as { address?: string | null }).address ?? null,
      advance: instance
        ? {
            instance_id: instance.id,
            status: instance.status ?? 'not_started',
            section_statuses: (instance.section_statuses as Record<string, { status: string; assigned_to?: string }>) ?? {},
            form_config_id: instance.form_config_id,
            sections,
            last_updated_at: (instance as { last_updated_at?: string | null }).last_updated_at ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({ dates });
}
