/* ============================================
   LOWPASS — Tour Advance Management API

   GET: All advance data for a tour (routing dates + instances + form configs)
   POST: Create or update advance form config + instance for a routing date
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

export async function POST(
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

  let body: { routing_id?: string; sections: AdvanceSection[]; is_template?: boolean; template_label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Save as reusable layout template (no routing_id)
  if (body.is_template === true) {
    const template_label = typeof body.template_label === 'string' ? body.template_label.trim() : '';
    const sections = Array.isArray(body.sections) ? body.sections : [];
    if (!template_label) {
      return NextResponse.json({ error: 'template_label is required when is_template is true' }, { status: 400 });
    }
    const normalizedSections = sections.map((s) => ({
      template_id: s.template_id ?? '',
      label: s.label ?? '',
      fields: Array.isArray(s.fields) ? s.fields : [],
      order: typeof s.order === 'number' ? s.order : 0,
    }));
    const { data: inserted, error: insertErr } = await supabase
      .from('advance_form_configs')
      .insert({
        tour_id: tourId,
        routing_id: null,
        // template_label is the SSOT for a template's user-facing name; every
        // reader resolves `template_label ?? name`. The `name` column keeps its
        // 'Default Advance' default here rather than duplicating the label
        // (Salvage #3 — single write).
        template_label,
        is_template: true,
        is_default: false,
        sections: normalizedSections,
        created_by_id: user.id,
      })
      .select('id, template_label, sections')
      .single();
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    return NextResponse.json({
      template: {
        id: inserted.id,
        name: inserted.template_label,
        sections: inserted.sections ?? [],
      },
    });
  }

  const { routing_id, sections: bodySections } = body;
  if (!routing_id || !Array.isArray(bodySections)) {
    return NextResponse.json({ error: 'routing_id and sections (array) are required' }, { status: 400 });
  }

  // Verify routing belongs to this tour
  const { data: routingRow, error: routingErr } = await supabase
    .from('routing')
    .select('id')
    .eq('id', routing_id)
    .eq('tour_id', tourId)
    .single();

  if (routingErr || !routingRow) {
    return NextResponse.json({ error: 'Routing date not found' }, { status: 404 });
  }

  // Find or create advance_form_config for this routing_id
  const { data: existingConfig } = await supabase
    .from('advance_form_configs')
    .select('id, sections')
    .eq('tour_id', tourId)
    .eq('routing_id', routing_id)
    .maybeSingle();

  let sectionsToUse = bodySections;
  if (!existingConfig && bodySections.length === 0) {
    const { data: tourWithDefault } = await supabase
      .from('tours')
      .select('default_advance_template_id')
      .eq('id', tourId)
      .single();
    const defaultId = (tourWithDefault as { default_advance_template_id?: string } | null)?.default_advance_template_id;
    if (defaultId) {
      const { data: templateConfig } = await supabase
        .from('advance_form_configs')
        .select('sections')
        .eq('id', defaultId)
        .eq('is_template', true)
        .single();
      if (templateConfig?.sections && Array.isArray(templateConfig.sections)) {
        sectionsToUse = templateConfig.sections as AdvanceSection[];
      }
    }
  }

  let normalizedSections = sectionsToUse.map((s) => ({
    template_id: s.template_id ?? '',
    label: s.label ?? '',
    fields: Array.isArray(s.fields) ? s.fields : [],
    order: typeof s.order === 'number' ? s.order : 0,
  }));

  const hasKeyContacts = normalizedSections.some((s) => s.label === 'Key Contacts');
  if (!hasKeyContacts) {
    const { data: keyContactsTemplate } = await supabase
      .from('advance_templates')
      .select('id')
      .eq('name', 'Key Contacts')
      .is('workspace_id', null)
      .limit(1)
      .maybeSingle();
    if (keyContactsTemplate?.id) {
      normalizedSections = [
        { template_id: keyContactsTemplate.id, label: 'Key Contacts', fields: [], order: 0 },
        ...normalizedSections.map((s, i) => ({ ...s, order: i + 1 })),
      ];
    }
  }

  let formConfigId: string;

  if (existingConfig) {
    const { error: updateErr } = await supabase
      .from('advance_form_configs')
      .update({ sections: normalizedSections, updated_at: new Date().toISOString() })
      .eq('id', existingConfig.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    formConfigId = existingConfig.id;
  } else {
    const { data: insertedConfig, error: insertErr } = await supabase
      .from('advance_form_configs')
      .insert({
        tour_id: tourId,
        routing_id,
        name: 'Default Advance',
        is_default: false,
        sections: normalizedSections,
        created_by_id: user.id,
      })
      .select('id')
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    formConfigId = insertedConfig.id;
  }

  // Ensure advance_instance exists for this routing_id
  const { data: existingInstance } = await supabase
    .from('advance_instances')
    .select('id, status, form_config_id')
    .eq('routing_id', routing_id)
    .maybeSingle();

  let instanceId: string;
  let instanceStatus: string;

  if (existingInstance) {
    if (existingInstance.form_config_id !== formConfigId) {
      const { error: updErr } = await supabase
        .from('advance_instances')
        .update({ form_config_id: formConfigId })
        .eq('id', existingInstance.id);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
    }
    instanceId = existingInstance.id;
    instanceStatus = existingInstance.status ?? 'not_started';
  } else {
    const { data: newInstance, error: insErr } = await supabase
      .from('advance_instances')
      .insert({
        routing_id,
        form_config_id: formConfigId,
        status: 'not_started',
      })
      .select('id, status')
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    instanceId = newInstance.id;
    instanceStatus = newInstance.status ?? 'not_started';
  }

  const configRow = await supabase
    .from('advance_form_configs')
    .select('id, sections, name, routing_id, created_at, updated_at')
    .eq('id', formConfigId)
    .single();

  return NextResponse.json({
    form_config: configRow.data ?? { id: formConfigId, sections: normalizedSections },
    instance: { id: instanceId, routing_id, form_config_id: formConfigId, status: instanceStatus },
  });
}
