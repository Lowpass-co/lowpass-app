/* ============================================
   LOWPASS — Copy Advance Between Dates

   POST: Copy advance form config and/or instance data from one date to others
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
    .select('id')
    .eq('id', tourId)
    .single();
  return tour ?? null;
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

  let body: {
    source_routing_id: string;
    target_routing_ids: string[];
    copy_data: boolean;
    copy_sections: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { source_routing_id, target_routing_ids, copy_data, copy_sections } = body;
  if (!source_routing_id || !Array.isArray(target_routing_ids)) {
    return NextResponse.json({ error: 'source_routing_id and target_routing_ids (array) are required' }, { status: 400 });
  }
  if (!copy_data && !copy_sections) {
    return NextResponse.json({ error: 'At least one of copy_data or copy_sections must be true' }, { status: 400 });
  }

  const targetIds = [...new Set(target_routing_ids)].filter((id) => id !== source_routing_id);
  if (targetIds.length === 0) {
    return NextResponse.json({ copied: 0 });
  }

  const { data: sourceRouting, error: srcErr } = await supabase
    .from('routing')
    .select('id')
    .eq('id', source_routing_id)
    .eq('tour_id', tourId)
    .single();

  if (srcErr || !sourceRouting) {
    return NextResponse.json({ error: 'Source routing date not found' }, { status: 404 });
  }

  const { data: targetRoutings } = await supabase
    .from('routing')
    .select('id')
    .eq('tour_id', tourId)
    .in('id', targetIds);

  const validTargetIds = (targetRoutings ?? []).map((r) => r.id);

  let sourceConfig: { id: string; sections: unknown } | null = null;
  let sourceInstance: { form_config_id: string; data: unknown; section_statuses: unknown; status: string } | null = null;

  if (copy_sections) {
    const { data: config } = await supabase
      .from('advance_form_configs')
      .select('id, sections')
      .eq('tour_id', tourId)
      .eq('routing_id', source_routing_id)
      .maybeSingle();
    sourceConfig = config ?? null;
  }

  if (copy_data) {
    const { data: inst } = await supabase
      .from('advance_instances')
      .select('form_config_id, data, section_statuses, status')
      .eq('routing_id', source_routing_id)
      .maybeSingle();
    sourceInstance = inst ?? null;
  }

  let copied = 0;

  for (const targetRoutingId of validTargetIds) {
    let formConfigId: string | null = null;

    if (copy_sections && sourceConfig) {
      const { data: existingTargetConfig } = await supabase
        .from('advance_form_configs')
        .select('id')
        .eq('tour_id', tourId)
        .eq('routing_id', targetRoutingId)
        .maybeSingle();

      if (existingTargetConfig) {
        const { error: updErr } = await supabase
          .from('advance_form_configs')
          .update({ sections: sourceConfig.sections, updated_at: new Date().toISOString() })
          .eq('id', existingTargetConfig.id);
        if (updErr) continue;
        formConfigId = existingTargetConfig.id;
      } else {
        const { data: newConfig, error: insErr } = await supabase
          .from('advance_form_configs')
          .insert({
            tour_id: tourId,
            routing_id: targetRoutingId,
            name: 'Default Advance',
            is_default: false,
            sections: sourceConfig.sections,
            created_by_id: user.id,
          })
          .select('id')
          .single();
        if (insErr) continue;
        formConfigId = newConfig.id;
      }
    }

    if (copy_data) {
      const { data: existingTargetConfig } = await supabase
        .from('advance_form_configs')
        .select('id')
        .eq('tour_id', tourId)
        .eq('routing_id', targetRoutingId)
        .maybeSingle();

      const targetFormConfigId = formConfigId ?? existingTargetConfig?.id;
      if (!targetFormConfigId) {
        const { data: newCfg } = await supabase
          .from('advance_form_configs')
          .insert({
            tour_id: tourId,
            routing_id: targetRoutingId,
            name: 'Default Advance',
            is_default: false,
            sections: sourceConfig?.sections ?? [],
            created_by_id: user.id,
          })
          .select('id')
          .single();
        if (!newCfg) continue;
        formConfigId = newCfg.id;
      }

      const cfgId = formConfigId ?? existingTargetConfig?.id;
      if (!cfgId) continue;

      const payload = sourceInstance
        ? {
            form_config_id: cfgId,
            data: sourceInstance.data ?? {},
            section_statuses: sourceInstance.section_statuses ?? {},
            status: sourceInstance.status ?? 'not_started',
            last_updated_by_id: user.id,
            last_updated_at: new Date().toISOString(),
          }
        : {
            form_config_id: cfgId,
            data: {},
            section_statuses: {},
            status: 'not_started' as const,
            last_updated_by_id: user.id,
            last_updated_at: new Date().toISOString(),
          };

      const { data: existingInstance } = await supabase
        .from('advance_instances')
        .select('id')
        .eq('routing_id', targetRoutingId)
        .maybeSingle();

      if (existingInstance) {
        const { error: updErr } = await supabase
          .from('advance_instances')
          .update(payload)
          .eq('id', existingInstance.id);
        if (!updErr) copied++;
      } else {
        const { error: insErr } = await supabase
          .from('advance_instances')
          .insert({
            routing_id: targetRoutingId,
            form_config_id: cfgId,
            data: payload.data,
            section_statuses: payload.section_statuses,
            status: payload.status,
            last_updated_by_id: user.id,
          });
        if (!insErr) copied++;
      }
    } else if (copy_sections && formConfigId) {
      const { data: existingInstance } = await supabase
        .from('advance_instances')
        .select('id')
        .eq('routing_id', targetRoutingId)
        .maybeSingle();

      if (existingInstance) {
        const { error: updErr } = await supabase
          .from('advance_instances')
          .update({ form_config_id: formConfigId })
          .eq('id', existingInstance.id);
        if (!updErr) copied++;
      } else {
        const { error: insErr } = await supabase
          .from('advance_instances')
          .insert({
            routing_id: targetRoutingId,
            form_config_id: formConfigId,
            status: 'not_started',
          });
        if (!insErr) copied++;
      }
    }
  }

  return NextResponse.json({ copied });
}
