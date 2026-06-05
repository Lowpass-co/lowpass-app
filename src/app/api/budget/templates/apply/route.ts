/* ============================================
   LOWPASS — Apply budget template (Budget redesign Phase B)

   POST { tourId, templateId }

   Clones a template's sections → budget_sections and its lines →
   budget_line_items (proposed=0, actual=0, section_id set, category
   defaulted to 'misc', phase_tag from the template's default).

   Idempotent-ish: a section is matched by name (find-or-create), and a
   line is only inserted when no line with the same (section, label)
   already exists. Existing lines are never overwritten — so re-applying
   a template, or applying a second template, only ADDS what's missing.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/** Lines need a non-null category (legacy column). Sections drive the
 *  new grouping, so a neutral default is fine. */
const DEFAULT_CATEGORY = 'misc';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }
  const workspaceId = profile.workspace_id as string;

  let body: { tourId?: string; templateId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { tourId, templateId } = body;
  if (!tourId || !templateId) {
    return NextResponse.json(
      { error: 'tourId and templateId are required' },
      { status: 400 },
    );
  }

  // Tour must belong to this workspace.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  // Template must be a system preset OR owned by this workspace.
  const { data: template } = await supabase
    .from('budget_templates')
    .select('id')
    .eq('id', templateId)
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const [tplSectionsRes, tplLinesRes, existingSectionsRes] = await Promise.all([
    supabase
      .from('budget_template_sections')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('budget_template_lines')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('budget_sections')
      .select('id, name, sort_order')
      .eq('tour_id', tourId)
      .eq('workspace_id', workspaceId),
  ]);

  const tplSections = tplSectionsRes.data ?? [];
  const tplLines = tplLinesRes.data ?? [];
  const existingSections = existingSectionsRes.data ?? [];

  const sectionByName = new Map<string, string>(); // lower(name) -> section_id
  let maxSort = -1;
  for (const s of existingSections) {
    sectionByName.set(String(s.name).toLowerCase(), s.id);
    maxSort = Math.max(maxSort, Number(s.sort_order ?? 0));
  }

  // Find-or-create each template section as a budget_section.
  const tplSectionToBudgetSection = new Map<string, string>();
  for (const ts of tplSections) {
    const key = String(ts.name).toLowerCase();
    let sectionId = sectionByName.get(key);
    if (!sectionId) {
      maxSort += 1;
      const { data: newSection, error: secErr } = await supabase
        .from('budget_sections')
        .insert({
          tour_id: tourId,
          workspace_id: workspaceId,
          name: ts.name,
          sort_order: maxSort,
        })
        .select('id')
        .single();
      if (secErr || !newSection) {
        return NextResponse.json(
          { error: secErr?.message ?? 'Failed to create section' },
          { status: 500 },
        );
      }
      sectionId = String(newSection.id);
      sectionByName.set(key, sectionId);
    }
    // sectionId is always defined here (set in both branches); the guard
    // satisfies the type-checker without a non-null assertion.
    if (sectionId) tplSectionToBudgetSection.set(ts.id, sectionId);
  }

  // Existing lines for the tour — used to skip duplicates by (section_id, label).
  const { data: existingLines } = await supabase
    .from('budget_line_items')
    .select('section_id, label')
    .eq('tour_id', tourId)
    .eq('workspace_id', workspaceId);
  const existingLineKeys = new Set(
    (existingLines ?? []).map(
      (l) => `${l.section_id ?? ''}::${String(l.label).toLowerCase()}`,
    ),
  );

  // Build the insert batch — only lines that don't already exist.
  const PHASE_TAG_VALUES = ['pre_prod', 'rehearsals', 'show_days', 'wrap'];
  const rows: Record<string, unknown>[] = [];
  let orderIndex = 0;
  for (const tl of tplLines) {
    const sectionId = tplSectionToBudgetSection.get(tl.template_section_id);
    if (!sectionId) continue;
    const key = `${sectionId}::${String(tl.label).toLowerCase()}`;
    if (existingLineKeys.has(key)) continue;
    existingLineKeys.add(key);
    const phaseTag =
      tl.default_phase_tag && PHASE_TAG_VALUES.includes(tl.default_phase_tag)
        ? tl.default_phase_tag
        : null;
    rows.push({
      tour_id: tourId,
      workspace_id: workspaceId,
      category: DEFAULT_CATEGORY,
      label: tl.label,
      quantity: 1,
      proposed_cost: 0,
      actual_cost: 0,
      section_id: sectionId,
      phase_tag: phaseTag,
      order_index: ++orderIndex,
      sort_order: tl.sort_order ?? orderIndex,
    });
  }

  let insertedCount = 0;
  if (rows.length > 0) {
    const { data: inserted, error: insErr } = await supabase
      .from('budget_line_items')
      .insert(rows)
      .select('id');
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    insertedCount = inserted?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    sections: tplSectionToBudgetSection.size,
    lines_added: insertedCount,
  });
}
