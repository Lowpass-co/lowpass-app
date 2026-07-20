/* ============================================
   LOWPASS — Assets surface loader (S1 Stage C2)

   Server-side read of the unified Spaces → Containers → Items model for the
   one Assets dashboard. Weight/value rollups are computed HERE at read time
   (no denormalised totals). "Unassigned" = items with no space AND no
   container — their dashboard bucket.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AssetSpace {
  id: string;
  name: string;
  kind: string;
  monthly_cost_amount: number | null;
  cost_currency: string | null;
}
export interface AssetContainer {
  id: string;
  name: string;
  kind: string;
  space_id: string | null;
  weight_empty_kg: number | null;
}
export interface AssetItem {
  id: string;
  name: string;
  category: string | null;
  ownership: string;
  status: string | null;
  weight_kg: number | null;
  value_amount: number | null;
  value_currency: string | null;
  space_id: string | null;
  container_id: string | null;
  hire_cost_amount: number | null;
  hire_cost_currency: string | null;
}
export interface AssetsData {
  spaces: AssetSpace[];
  containers: AssetContainer[];
  items: AssetItem[];
  kpis: {
    spaceCount: number;
    containerCount: number;
    itemCount: number;
    totalWeightKg: number;
    unassignedCount: number;
  };
}

export async function loadAssets(supabase: SupabaseClient, workspaceId: string): Promise<AssetsData> {
  const [{ data: spaces }, { data: containers }, { data: items }] = await Promise.all([
    supabase.from('spaces').select('id, name, kind, monthly_cost_amount, cost_currency').eq('workspace_id', workspaceId).order('name'),
    supabase.from('containers').select('id, name, kind, space_id, weight_empty_kg').eq('workspace_id', workspaceId).order('name'),
    supabase
      .from('gear')
      .select('id, name, category, ownership, status, weight_kg, value_amount, value_currency, space_id, container_id, hire_cost_amount, hire_cost_currency')
      .eq('workspace_id', workspaceId)
      .order('name'),
  ]);

  const itemRows = (items ?? []) as AssetItem[];
  const totalWeightKg = itemRows.reduce((n, i) => n + (Number(i.weight_kg) || 0), 0);
  const unassignedCount = itemRows.filter((i) => !i.space_id && !i.container_id).length;

  return {
    spaces: (spaces ?? []) as AssetSpace[],
    containers: (containers ?? []) as AssetContainer[],
    items: itemRows,
    kpis: {
      spaceCount: (spaces ?? []).length,
      containerCount: (containers ?? []).length,
      itemCount: itemRows.length,
      totalWeightKg,
      unassignedCount,
    },
  };
}
