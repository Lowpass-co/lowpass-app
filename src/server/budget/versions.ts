/* ============================================
   LOWPASS — Budget versioning server helpers (Phase 1 B1)

   The CANONICAL identity (budget_line_items / budget_income) carries ACTUALS
   (one live layer). The PROPOSED value is read from the active version's
   snapshot (budget_version_lines / budget_version_income) — NEVER from the
   legacy budget_line_items.proposed_cost column (kept write-through one release
   as a fallback; not read).

   "Active version" = the working head: the latest version that is NOT
   superseded (a draft if one exists, else the single approved = Current).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logServerError } from '@/lib/log/serverError';

export type VersionStatus = 'draft' | 'approved' | 'superseded';

export interface BudgetVersion {
  id: string;
  tour_id: string;
  workspace_id: string;
  version_number: number;
  status: VersionStatus;
  parent_version_id: string | null;
  note: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

/** The working head version for a tour (latest non-superseded), or null if the
 *  tour has no versions yet (pre-backfill / brand-new tour). */
export async function resolveActiveVersion(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<BudgetVersion | null> {
  const { data, error } = await supabase
    .from('budget_versions')
    .select('*')
    .eq('tour_id', tourId)
    .eq('workspace_id', workspaceId)
    .neq('status', 'superseded')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError('resolveActiveVersion failed', error, { tourId });
    return null;
  }
  return (data as BudgetVersion) ?? null;
}

/** The single approved version for a tour ("Current"), or null. Variance baseline. */
export async function resolveApprovedVersion(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<BudgetVersion | null> {
  const { data } = await supabase
    .from('budget_versions')
    .select('*')
    .eq('tour_id', tourId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'approved')
    .maybeSingle();
  return (data as BudgetVersion) ?? null;
}

/** Proposed cost per line_item_id for a version (the canonical proposed read). */
export async function getProposedLineMap(
  supabase: SupabaseClient,
  versionId: string,
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  const { data } = await supabase
    .from('budget_version_lines')
    .select('line_item_id, proposed_cost, present')
    .eq('version_id', versionId);
  for (const r of data ?? []) {
    if ((r as { present?: boolean }).present === false) continue;
    m.set(r.line_item_id as string, Number(r.proposed_cost) || 0);
  }
  return m;
}

/** Proposed income columns per routing_id for a version. */
export interface ProposedIncome {
  pre_tax_guarantee: number;
  withholding_pct: number;
  pre_tax_overage: number;
  merch_income: number;
  vip_income: number;
  /** Phase 2 — the show's native currency (NULL = tour currency). */
  currency: string | null;
}

export async function getProposedIncomeMap(
  supabase: SupabaseClient,
  versionId: string,
): Promise<Map<string, ProposedIncome>> {
  const m = new Map<string, ProposedIncome>();
  const { data } = await supabase
    .from('budget_version_income')
    .select('routing_id, pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income, vip_income, currency')
    .eq('version_id', versionId);
  for (const r of data ?? []) {
    const v = r as Record<string, unknown>;
    m.set(v.routing_id as string, {
      pre_tax_guarantee: Number(v.pre_tax_guarantee) || 0,
      withholding_pct: Number(v.withholding_pct) || 0,
      pre_tax_overage: Number(v.pre_tax_overage) || 0,
      merch_income: Number(v.merch_income) || 0,
      vip_income: Number(v.vip_income) || 0,
      currency: (v.currency as string | null) ?? null,
    });
  }
  return m;
}

/* ---- write-side lock guard (used by line-items + income routes) ---- */

export interface LockState {
  version: BudgetVersion | null;
  /** true when the active version is approved → its PROPOSED is read-only. */
  locked: boolean;
}

/** Resolve the active version + whether its proposed is locked, for a tour. */
export async function resolveLockState(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<LockState> {
  const version = await resolveActiveVersion(supabase, tourId, workspaceId);
  return { version, locked: version?.status === 'approved' };
}

/** Mirror a committed proposed value into the active DRAFT version's snapshot
 *  (write-through; the snapshot is the canonical read source). No-op when the
 *  active version is locked (callers must reject the write first). */
export async function writeProposedToActiveDraft(
  supabase: SupabaseClient,
  params: { tourId: string; workspaceId: string; lineItemId: string; proposedCost: number },
): Promise<void> {
  const v = await resolveActiveVersion(supabase, params.tourId, params.workspaceId);
  if (!v || v.status !== 'draft') return;
  const { error } = await supabase
    .from('budget_version_lines')
    .upsert(
      { version_id: v.id, line_item_id: params.lineItemId, workspace_id: params.workspaceId, proposed_cost: params.proposedCost },
      { onConflict: 'version_id,line_item_id' },
    );
  if (error) logServerError('writeProposedToActiveDraft failed', error, { lineItemId: params.lineItemId });
}
