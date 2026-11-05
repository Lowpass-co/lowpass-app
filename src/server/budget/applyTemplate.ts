/* ============================================
   LOWPASS — Apply a budget template to a tour (the one place)

   Clones a template's sections → budget_sections and its lines →
   budget_line_items (proposed = actual = 0, section set, category 'misc',
   phase tag from the template). Used by POST /api/budget/templates/apply and
   by tour creation (startTourFromTemplates).

   Additive and re-runnable: a section is matched by name (find-or-create), a
   line is only added when its (section, label) isn't already there. Nothing
   that exists is overwritten, so applying twice, or applying a second
   template, only adds what's missing.

   The caller has already checked the tour belongs to `workspaceId`.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Lines need a non-null category (legacy column); sections drive grouping. */
const DEFAULT_CATEGORY = 'misc';
const PHASE_TAG_VALUES = ['pre_prod', 'rehearsals', 'show_days', 'wrap'];

export class TemplateNotFound extends Error {}

export async function applyBudgetTemplate(
  client: SupabaseClient,
  args: { tourId: string; workspaceId: string; templateId: string },
): Promise<{ sections: number; lines_added: number }> {
  const { tourId, workspaceId, templateId } = args;

  // A system preset OR one of this workspace's own.
  const { data: template } = await client
    .from('budget_templates')
    .select('id')
    .eq('id', templateId)
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .maybeSingle();
  if (!template) throw new TemplateNotFound('Template not found');

  const [tplSectionsRes, tplLinesRes, existingSectionsRes] = await Promise.all([
    client.from('budget_template_sections').select('*').eq('template_id', templateId).order('sort_order', { ascending: true }),
    client.from('budget_template_lines').select('*').eq('template_id', templateId).order('sort_order', { ascending: true }),
    client.from('budget_sections').select('id, name, sort_order').eq('tour_id', tourId).eq('workspace_id', workspaceId),
  ]);
  for (const r of [tplSectionsRes, tplLinesRes, existingSectionsRes]) {
    if (r.error) throw new Error(r.error.message);
  }
  const tplSections = (tplSectionsRes.data ?? []) as Array<{ id: string; name: string }>;
  const tplLines = (tplLinesRes.data ?? []) as Array<{ template_section_id: string; label: string; default_phase_tag: string | null; sort_order: number | null }>;
  const existingSections = (existingSectionsRes.data ?? []) as Array<{ id: string; name: string; sort_order: number | null }>;

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
      const { data: created, error } = await client
        .from('budget_sections')
        .insert({ tour_id: tourId, workspace_id: workspaceId, name: ts.name, sort_order: maxSort })
        .select('id')
        .single();
      if (error || !created) throw new Error(error?.message ?? 'Failed to create section');
      sectionId = String((created as { id: string }).id);
      sectionByName.set(key, sectionId);
    }
    tplSectionToBudgetSection.set(ts.id, sectionId);
  }

  // Existing lines — skip duplicates by (section_id, label).
  const { data: existingLines, error: lErr } = await client
    .from('budget_line_items')
    .select('section_id, label')
    .eq('tour_id', tourId)
    .eq('workspace_id', workspaceId);
  if (lErr) throw new Error(lErr.message);
  const existingLineKeys = new Set(
    ((existingLines ?? []) as Array<{ section_id: string | null; label: string | null }>).map(
      (l) => `${l.section_id ?? ''}::${String(l.label).toLowerCase()}`,
    ),
  );

  const rows: Record<string, unknown>[] = [];
  let orderIndex = 0;
  for (const tl of tplLines) {
    const sectionId = tplSectionToBudgetSection.get(tl.template_section_id);
    if (!sectionId) continue;
    const key = `${sectionId}::${String(tl.label).toLowerCase()}`;
    if (existingLineKeys.has(key)) continue;
    existingLineKeys.add(key);
    const phaseTag = tl.default_phase_tag && PHASE_TAG_VALUES.includes(tl.default_phase_tag) ? tl.default_phase_tag : null;
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

  let linesAdded = 0;
  if (rows.length > 0) {
    const { data: inserted, error } = await client.from('budget_line_items').insert(rows).select('id');
    if (error) throw new Error(error.message);
    linesAdded = inserted?.length ?? 0;
  }
  return { sections: tplSectionToBudgetSection.size, lines_added: linesAdded };
}
