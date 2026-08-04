/* ============================================
   LOWPASS — Previously Played · Import API (Phase 2 §C)

   POST /api/advance/previously-played/import
     Body: {
       targetRoutingId: string,
       sourceRoutingId: string,
       sectionIds: string[]      // section keys inside advance.data
     }

   Behaviour:
     - RLS-checks both routings via the workspace's normal advance
       policies (the SELECT/UPDATE on advance_instances will fail if
       the user can't see them).
     - Loads source advance.data and target advance.data.
     - For each requested section_id, copies source.data[section_id]
       into target.data[section_id] WITHOUT overwriting non-empty
       existing fields. Per Adam's spec: "Import is additive (doesn't
       overwrite existing fields)".
     - Persists the merged target.data + bumps last_updated_*.

   Returns { imported: number, skipped: number, sections: string[] }.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type AdvanceRow = {
  id: string;
  routing_id: string;
  data: Record<string, unknown>;
};

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length > 0;
  return true;
}

/** Merge source section into target section without overwriting any
 *  field that's already filled on the target. Source-only keys land
 *  as new entries; conflict keys keep the target's value. */
function mergeSection(
  targetSection: Record<string, unknown> | undefined,
  sourceSection: Record<string, unknown>,
): { merged: Record<string, unknown>; addedKeys: string[] } {
  const result: Record<string, unknown> = { ...(targetSection ?? {}) };
  const addedKeys: string[] = [];
  for (const [key, sourceVal] of Object.entries(sourceSection)) {
    if (!isFilled(result[key])) {
      result[key] = sourceVal;
      addedKeys.push(key);
    }
  }
  return { merged: result, addedKeys };
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    targetRoutingId: string;
    sourceRoutingId: string;
    sectionIds: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { targetRoutingId, sourceRoutingId, sectionIds } = body;
  if (
    !targetRoutingId ||
    !sourceRoutingId ||
    !Array.isArray(sectionIds) ||
    sectionIds.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          'targetRoutingId, sourceRoutingId, and a non-empty sectionIds array are required',
      },
      { status: 400 },
    );
  }
  if (targetRoutingId === sourceRoutingId) {
    return NextResponse.json(
      { error: 'target and source must differ' },
      { status: 400 },
    );
  }

  // Load both advance instances. RLS will silently filter out anything
  // the user can't see; we treat missing as 404.
  const { data: rows, error: loadErr } = await supabase
    .from('advance_instances')
    .select('id, routing_id, data')
    .in('routing_id', [targetRoutingId, sourceRoutingId]);
  if (loadErr) {
    return NextResponse.json(
      { error: 'Failed to load advance instances' },
      { status: 500 },
    );
  }
  const advances = (rows ?? []) as AdvanceRow[];
  const target = advances.find((a) => a.routing_id === targetRoutingId);
  const source = advances.find((a) => a.routing_id === sourceRoutingId);
  if (!target) {
    return NextResponse.json(
      { error: 'Target advance not found (or no access)' },
      { status: 404 },
    );
  }
  if (!source) {
    return NextResponse.json(
      { error: 'Source advance not found (or no access)' },
      { status: 404 },
    );
  }

  const targetData = (target.data ?? {}) as Record<string, unknown>;
  const sourceData = (source.data ?? {}) as Record<string, unknown>;

  const updatedData: Record<string, unknown> = { ...targetData };
  const importedSections: string[] = [];
  let importedFieldCount = 0;
  let skippedSectionCount = 0;
  for (const sectionId of sectionIds) {
    const src = sourceData[sectionId];
    if (!src || typeof src !== 'object' || Array.isArray(src)) {
      skippedSectionCount += 1;
      continue;
    }
    const targetSection = targetData[sectionId];
    const targetSectionObj =
      targetSection && typeof targetSection === 'object' && !Array.isArray(targetSection)
        ? (targetSection as Record<string, unknown>)
        : undefined;
    const { merged, addedKeys } = mergeSection(
      targetSectionObj,
      src as Record<string, unknown>,
    );
    if (addedKeys.length === 0) {
      skippedSectionCount += 1;
      continue;
    }
    updatedData[sectionId] = merged;
    importedSections.push(sectionId);
    importedFieldCount += addedKeys.length;
  }

  if (importedSections.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: skippedSectionCount,
      sections: [],
      fields: 0,
    });
  }

  const { error: updateErr } = await supabase
    .from('advance_instances')
    .update({
      data: updatedData,
      last_updated_by_id: user.id,
      last_updated_at: new Date().toISOString(),
    })
    .eq('id', target.id);
  if (updateErr) {
    return NextResponse.json(
      { error: 'Failed to save merged advance' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    imported: importedSections.length,
    skipped: skippedSectionCount,
    sections: importedSections,
    fields: importedFieldCount,
  });
}
