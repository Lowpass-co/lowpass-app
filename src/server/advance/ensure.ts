/* ============================================
   ensureAdvance — make sure a show has its form config + instance.

   Called by every advance WRITE (an answer, a customisation, a venue request,
   an info pack), never by a page load: opening a show writes nothing. A new
   day starts from the template its day type gets (advance_day_type_templates),
   remembered on the config so later template changes can reach it.

   Concurrency: advance_instances.routing_id is UNIQUE, so two first-writes at
   once can't make two instances; the loser re-reads the winner's.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdvSection } from '@/lib/advance/board';
import { loadTemplateSet, templateForDay } from './templates';

export interface EnsuredAdvance {
  instanceId: string;
  formConfigId: string;
  workspaceId: string;
}

export class AdvanceNotFound extends Error {}

export async function ensureAdvance(
  client: SupabaseClient,
  tourId: string,
  routingId: string,
  userId: string,
): Promise<EnsuredAdvance> {
  const [{ data: routing }, { data: tour }] = await Promise.all([
    client.from('routing').select('id, day_type').eq('id', routingId).eq('tour_id', tourId).maybeSingle<{ id: string; day_type: string | null }>(),
    client.from('tours').select('id, workspace_id').eq('id', tourId).maybeSingle<{ id: string; workspace_id: string }>(),
  ]);
  if (!routing || !tour) throw new AdvanceNotFound('Show not found');

  const { data: inst } = await client
    .from('advance_instances')
    .select('id, form_config_id')
    .eq('routing_id', routingId)
    .maybeSingle<{ id: string; form_config_id: string | null }>();
  if (inst?.form_config_id) return { instanceId: inst.id, formConfigId: inst.form_config_id, workspaceId: tour.workspace_id };

  // Reuse a config already made for this day (an earlier half-finished ensure).
  const { data: existingCfg } = await client
    .from('advance_form_configs')
    .select('id')
    .eq('tour_id', tourId)
    .eq('routing_id', routingId)
    .limit(1)
    .maybeSingle<{ id: string }>();

  let formConfigId = existingCfg?.id ?? null;
  if (!formConfigId) {
    const set = await loadTemplateSet(client, tour.workspace_id);
    const tpl = templateForDay(set, routing.day_type);
    const sections: AdvSection[] = (tpl?.sections ?? []).map((s, i) => ({ ...s, order: i }));
    const { data: cfg, error } = await client
      .from('advance_form_configs')
      .insert({
        tour_id: tourId,
        routing_id: routingId,
        name: 'Default Advance',
        is_default: false,
        sections,
        layout_template_id: tpl?.id ?? null,
        customised: false,
        created_by_id: userId,
      })
      .select('id')
      .single<{ id: string }>();
    if (error || !cfg) throw new Error(`advance config: ${error?.message ?? 'not created'}`);
    formConfigId = cfg.id;
  }

  if (inst) {
    const { error } = await client.from('advance_instances').update({ form_config_id: formConfigId }).eq('id', inst.id);
    if (error) throw new Error(`advance instance: ${error.message}`);
    return { instanceId: inst.id, formConfigId, workspaceId: tour.workspace_id };
  }

  const { data: created, error: insErr } = await client
    .from('advance_instances')
    .insert({ routing_id: routingId, form_config_id: formConfigId, status: 'in_progress' })
    .select('id')
    .single<{ id: string }>();
  if (created) return { instanceId: created.id, formConfigId, workspaceId: tour.workspace_id };

  // Lost the race on UNIQUE(routing_id): use the winner's.
  const { data: winner } = await client
    .from('advance_instances')
    .select('id, form_config_id')
    .eq('routing_id', routingId)
    .maybeSingle<{ id: string; form_config_id: string | null }>();
  if (!winner) throw new Error(`advance instance: ${insErr?.message ?? 'not created'}`);
  return { instanceId: winner.id, formConfigId: winner.form_config_id ?? formConfigId, workspaceId: tour.workspace_id };
}
