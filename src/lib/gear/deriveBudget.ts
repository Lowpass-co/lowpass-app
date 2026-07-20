/* ============================================
   LOWPASS — Gear → derived budget line (the ONE derivation path)

   Extracted verbatim from api/gear/[id]/route.ts so both the gear PATCH and the
   S1 "move to tour" flow drive the SAME derivation — no second money path
   (S1 Stage D rule). A tour_gear assignment whose effective ownership is
   `hired_to_client` derives/updates a `prod_equipment` budget_line_items row
   keyed on (tour_id, gear_id); anything else deletes the derived row.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function syncDerivedBudgetRowForTour(
  supabase: SupabaseClient,
  workspaceId: string,
  gearId: string,
  tourId: string,
): Promise<void> {
  const { data: gearRow } = await supabase
    .from('gear')
    .select('id, name, ownership, hire_cost_amount')
    .eq('id', gearId)
    .single();
  const { data: tg } = await supabase
    .from('tour_gear')
    .select('id, quantity, tour_ownership, tour_hire_cost_amount')
    .eq('tour_id', tourId)
    .eq('gear_id', gearId)
    .maybeSingle();
  const effectiveOwnership = (tg?.tour_ownership ?? gearRow?.ownership ?? 'owned') as string;
  const unitCost = Number(tg?.tour_hire_cost_amount ?? gearRow?.hire_cost_amount ?? 0);
  const qty = Math.max(1, Number(tg?.quantity ?? 1));
  const total = unitCost * qty;

  const { data: existingLine } = await supabase
    .from('budget_line_items')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('tour_id', tourId)
    .eq('category', 'prod_equipment')
    .eq('gear_id', gearId)
    .maybeSingle();

  if (effectiveOwnership === 'hired_to_client') {
    if (existingLine?.id) {
      await supabase
        .from('budget_line_items')
        .update({
          label: String(gearRow?.name ?? 'Gear hire'),
          proposed_cost: total,
          actual_cost: total,
          quantity: qty,
          gear_id: gearId,
          tour_gear_id: tg?.id ?? null,
          source_entity_type: 'gear',
          source_entity_id: gearId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLine.id);
    } else {
      await supabase
        .from('budget_line_items')
        .insert({
          workspace_id: workspaceId,
          tour_id: tourId,
          category: 'prod_equipment',
          label: String(gearRow?.name ?? 'Gear hire'),
          quantity: qty,
          proposed_cost: total,
          actual_cost: total,
          source_entity_type: 'gear',
          source_entity_id: gearId,
          gear_id: gearId,
          tour_gear_id: tg?.id ?? null,
        });
    }
  } else if (existingLine?.id) {
    await supabase
      .from('budget_line_items')
      .delete()
      .eq('id', existingLine.id)
      .eq('workspace_id', workspaceId);
  }
}
