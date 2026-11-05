/* ============================================
   LOWPASS — Start a new tour from templates (Nov 2026)

   What the new-tour window's "Budget & advance" step writes, in one place:
     1. the budget template (applyBudgetTemplate) — skipped for Custom;
     2. the tour's percentages (budget_settings) — blank is 0%;
     3. the commission rows (Management, Agency, Legal, Merch) — only when the
        tour has none yet, so a second call never doubles them;
     4. the advance starters it asked for, installed into the workspace, and
        the tour's own day-type → template choice.

   The caller has checked the tour belongs to `workspaceId` and that the user
   may write. Each step is additive and re-runnable.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { applyBudgetTemplate } from '@/server/budget/applyTemplate';
import { installStarter } from '@/server/advance/starters';
import { moneyToWrites, tourDayStarters, type StartFromInput } from '@/lib/templates/tourTemplates';

export class StartFromInputError extends Error {}

export interface StartFromResult {
  budget: { sections: number; lines_added: number } | null;
  commissionsAdded: number;
  advance: Record<string, string>;
  /** Catalog sections a starter wanted but this workspace doesn't have. */
  missingSections: string[];
}

export async function startTourFromTemplates(
  client: SupabaseClient,
  args: { tourId: string; workspaceId: string; input: StartFromInput },
): Promise<StartFromResult> {
  const { tourId, workspaceId, input } = args;
  const money = moneyToWrites(input.money ?? {});
  if (!money.ok) throw new StartFromInputError(money.error);

  // 1. Budget template.
  const budget = input.budgetTemplateId
    ? await applyBudgetTemplate(client, { tourId, workspaceId, templateId: input.budgetTemplateId })
    : null;

  // 2. Percentages.
  const { error: sErr } = await client
    .from('budget_settings')
    .upsert(
      { tour_id: tourId, workspace_id: workspaceId, ...money.writes.settings, updated_at: new Date().toISOString() },
      { onConflict: 'tour_id' },
    );
  if (sErr) throw new Error(`budget settings: ${sErr.message}`);

  // 3. Commission rows — only on a tour that has none.
  let commissionsAdded = 0;
  const { data: held, error: hErr } = await client
    .from('budget_commissions')
    .select('id')
    .eq('tour_id', tourId)
    .eq('workspace_id', workspaceId)
    .limit(1);
  if (hErr) throw new Error(`commissions: ${hErr.message}`);
  if (!held || held.length === 0) {
    const rows = money.writes.commissions.map((c, i) => ({
      tour_id: tourId,
      workspace_id: workspaceId,
      label: c.label,
      percentage: c.percentage,
      basis: c.basis,
      basis_components: c.basis_components,
      basis_pre_tax: c.basis_pre_tax,
      order_index: i,
    }));
    const { data: ins, error } = await client.from('budget_commissions').insert(rows).select('id');
    if (error) throw new Error(`commissions: ${error.message}`);
    commissionsAdded = ins?.length ?? 0;
  }

  // 4. Advance — install the starters asked for, then the tour's choice.
  const wanted = tourDayStarters(input);
  const advance: Record<string, string> = {};
  const missing = new Set<string>();
  const installed = new Map<string, string>();
  for (const [dayType, key] of Object.entries(wanted)) {
    let id = installed.get(key);
    if (!id) {
      const res = await installStarter(client, workspaceId, key);
      id = res.id;
      installed.set(key, id);
      res.missing.forEach((m) => missing.add(m));
    }
    const { error } = await client
      .from('tour_advance_day_templates')
      .upsert(
        { tour_id: tourId, workspace_id: workspaceId, day_type: dayType, layout_template_id: id, updated_at: new Date().toISOString() },
        { onConflict: 'tour_id,day_type' },
      );
    if (error) throw new Error(`tour advance templates: ${error.message}`);
    advance[dayType] = id;
  }

  return { budget, commissionsAdded, advance, missingSections: [...missing] };
}
