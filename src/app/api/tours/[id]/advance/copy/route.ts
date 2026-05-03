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

/** Treat null / undefined / "" / empty array / empty object as "blank" so
 *  the user's mental model matches: a field with no entered value is fillable
 *  regardless of the JSONB null vs absent-key distinction. */
function isBlankValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/** Merge source into destination per-section / per-field, keeping any value
 *  the destination already has. Used when the user picks "Fill blanks only"
 *  on the copy-conflict prompt. */
function mergeFillBlanks(
  source: Record<string, Record<string, unknown>>,
  destination: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = { ...destination };
  for (const [sectionId, sectionData] of Object.entries(source)) {
    if (!sectionData || typeof sectionData !== 'object' || Array.isArray(sectionData)) {
      continue;
    }
    const destSection = (out[sectionId] ?? {}) as Record<string, unknown>;
    out[sectionId] = { ...destSection };
    for (const [fieldId, val] of Object.entries(sectionData)) {
      if (isBlankValue(out[sectionId][fieldId])) {
        out[sectionId][fieldId] = val;
      }
    }
  }
  return out;
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
    /** Merge strategy when destination already has field values:
     *  - 'replace'     — destination data + section_statuses overwritten by source.
     *  - 'fill_blanks' — destination keeps its existing field values; source fills
     *    only the fields that are null / undefined / empty-string / empty-array.
     *    section_statuses are LEFT UNCHANGED in fill_blanks mode (workflow state
     *    on the destination shouldn't be clobbered by a partial-merge import).
     *  Default is 'replace' — matches pre-G.6 behaviour for callers that don't
     *  pass a mode (server-script consumers, older clients). */
    merge_mode?: 'replace' | 'fill_blanks';
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { source_routing_id, target_routing_ids, copy_data, copy_sections } = body;
  const mergeMode: 'replace' | 'fill_blanks' = body.merge_mode === 'fill_blanks' ? 'fill_blanks' : 'replace';
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

      const { data: existingInstance } = await supabase
        .from('advance_instances')
        .select('id, data, section_statuses, status')
        .eq('routing_id', targetRoutingId)
        .maybeSingle();

      const sourceData = (sourceInstance?.data ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      const sourceStatuses = (sourceInstance?.section_statuses ?? {}) as Record<
        string,
        unknown
      >;
      const existingData =
        ((existingInstance?.data ?? {}) as Record<string, Record<string, unknown>>);
      const existingStatuses =
        ((existingInstance?.section_statuses ?? {}) as Record<string, unknown>);

      // Merge strategy. fill_blanks: destination wins per-field, source fills
      // only blanks. replace (default): source wins wholesale.
      const mergedData =
        mergeMode === 'fill_blanks'
          ? mergeFillBlanks(sourceData, existingData)
          : sourceData;
      const mergedStatuses =
        mergeMode === 'fill_blanks' ? existingStatuses : sourceStatuses;
      const mergedStatus =
        mergeMode === 'fill_blanks'
          ? (existingInstance?.status ?? sourceInstance?.status ?? 'not_started')
          : (sourceInstance?.status ?? 'not_started');

      const payload = {
        form_config_id: cfgId,
        data: mergedData,
        section_statuses: mergedStatuses,
        status: mergedStatus,
        last_updated_by_id: user.id,
        last_updated_at: new Date().toISOString(),
      };

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
