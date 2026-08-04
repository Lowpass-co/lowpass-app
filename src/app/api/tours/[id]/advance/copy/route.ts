/* ============================================
   LOWPASS — Copy Advance Between Dates

   POST: Copy advance form config and/or instance data from one date to others
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
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
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
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
  if (validTargetIds.length === 0) {
    return NextResponse.json({ copied: 0 });
  }

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

  // ---- Batched fan-out (Salvage #2) ----
  // Previously this looped per target doing ~4 awaited round-trips each
  // (config SELECT, instance SELECT, then a write) — O(4N) queries for an
  // N-date copy. A 10-show tour = ~40 sequential round-trips. Now every read
  // is a single bulk SELECT keyed by routing_id, and every write is one bulk
  // UPSERT (advance_instances has UNIQUE(routing_id); advance_form_configs is
  // unique per (tour_id, routing_id)). Total: 2 prefetch SELECTs + at most 2
  // config writes + 1 instance UPSERT, independent of N.
  const nowIso = new Date().toISOString();

  // (1) Prefetch every target's existing config in one query.
  const { data: existingConfigs } = await supabase
    .from('advance_form_configs')
    .select('id, routing_id')
    .eq('tour_id', tourId)
    .in('routing_id', validTargetIds);
  const configByRouting = new Map<string, string>();
  const preExistingConfigIds: string[] = [];
  for (const c of existingConfigs ?? []) {
    configByRouting.set(c.routing_id, c.id);
    preExistingConfigIds.push(c.id);
  }

  // (2) Create configs for targets that lack one — a single bulk insert. Both
  // copy_sections and copy_data need a form_config_id for every target; new
  // rows carry the source sections when copying sections, else an empty set.
  const needConfig = validTargetIds.filter((rid) => !configByRouting.has(rid));
  if (needConfig.length > 0) {
    const sectionsForNew = (copy_sections ? sourceConfig?.sections : null) ?? [];
    const { data: inserted, error: insErr } = await supabase
      .from('advance_form_configs')
      .insert(
        needConfig.map((rid) => ({
          tour_id: tourId,
          routing_id: rid,
          name: 'Default Advance',
          is_default: false,
          sections: sectionsForNew,
          created_by_id: user.id,
        })),
      )
      .select('id, routing_id');
    if (insErr) {
      return NextResponse.json({ error: `Failed to create target configs: ${insErr.message}` }, { status: 500 });
    }
    for (const c of inserted ?? []) configByRouting.set(c.routing_id, c.id);
  }

  // (3) When copying sections onto configs that already existed, overwrite
  // their sections in one bulk update. Newly-created configs (step 2) already
  // carry the source sections, so they're excluded here.
  if (copy_sections && sourceConfig && preExistingConfigIds.length > 0) {
    const { error: updErr } = await supabase
      .from('advance_form_configs')
      .update({ sections: sourceConfig.sections, updated_at: nowIso })
      .in('id', preExistingConfigIds);
    if (updErr) {
      return NextResponse.json({ error: `Failed to update target sections: ${updErr.message}` }, { status: 500 });
    }
  }

  // (4) Prefetch every target's existing instance in one query (drives both
  // fill_blanks merge and status preservation).
  const instanceByRouting = new Map<string, { id: string; data: unknown; section_statuses: unknown; status: string }>();
  {
    const { data: existingInstances } = await supabase
      .from('advance_instances')
      .select('id, routing_id, data, section_statuses, status')
      .in('routing_id', validTargetIds);
    for (const inst of existingInstances ?? []) {
      instanceByRouting.set(inst.routing_id, {
        id: inst.id,
        data: inst.data,
        section_statuses: inst.section_statuses,
        status: inst.status,
      });
    }
  }

  // (5) Build all instance rows in-memory, then one bulk UPSERT on routing_id.
  let copied = 0;

  if (copy_data) {
    const sourceData = (sourceInstance?.data ?? {}) as Record<string, Record<string, unknown>>;
    const sourceStatuses = (sourceInstance?.section_statuses ?? {}) as Record<string, unknown>;
    const rows: Array<Record<string, unknown>> = [];
    for (const rid of validTargetIds) {
      const cfgId = configByRouting.get(rid);
      if (!cfgId) continue;
      const existing = instanceByRouting.get(rid);
      const existingData = (existing?.data ?? {}) as Record<string, Record<string, unknown>>;
      const existingStatuses = (existing?.section_statuses ?? {}) as Record<string, unknown>;

      // Merge strategy. fill_blanks: destination wins per-field, source fills
      // only blanks. replace (default): source wins wholesale.
      const mergedData = mergeMode === 'fill_blanks' ? mergeFillBlanks(sourceData, existingData) : sourceData;
      const mergedStatuses = mergeMode === 'fill_blanks' ? existingStatuses : sourceStatuses;
      const mergedStatus =
        mergeMode === 'fill_blanks'
          ? (existing?.status ?? sourceInstance?.status ?? 'not_started')
          : (sourceInstance?.status ?? 'not_started');

      rows.push({
        routing_id: rid,
        form_config_id: cfgId,
        data: mergedData,
        section_statuses: mergedStatuses,
        status: mergedStatus,
        last_updated_by_id: user.id,
        last_updated_at: nowIso,
      });
    }
    if (rows.length > 0) {
      const { error: upErr } = await supabase
        .from('advance_instances')
        .upsert(rows, { onConflict: 'routing_id' });
      if (upErr) {
        return NextResponse.json({ error: `Failed to copy advance data: ${upErr.message}` }, { status: 500 });
      }
      copied = rows.length;
    }
  } else if (copy_sections) {
    // Sections-only: point each target instance at its (new/updated) config,
    // preserving any existing status; create a not_started instance where none
    // exists. data / section_statuses are left untouched on existing rows.
    const rows: Array<Record<string, unknown>> = [];
    for (const rid of validTargetIds) {
      const cfgId = configByRouting.get(rid);
      if (!cfgId) continue;
      const existing = instanceByRouting.get(rid);
      rows.push({
        routing_id: rid,
        form_config_id: cfgId,
        status: existing?.status ?? 'not_started',
      });
    }
    if (rows.length > 0) {
      const { error: upErr } = await supabase
        .from('advance_instances')
        .upsert(rows, { onConflict: 'routing_id' });
      if (upErr) {
        return NextResponse.json({ error: `Failed to link advance sections: ${upErr.message}` }, { status: 500 });
      }
      copied = rows.length;
    }
  }

  return NextResponse.json({ copied });
}
