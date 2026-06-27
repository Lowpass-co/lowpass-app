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

export type VersionStatus = 'draft' | 'approved' | 'superseded' | 'rolled_back';

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

/** The working head version for a tour (latest draft/approved), or null if the
 *  tour has no versions yet (pre-backfill / brand-new tour). Excludes the
 *  historical states — `superseded` AND `rolled_back` (B2) — so a rolled-back
 *  higher-numbered version is never mistaken for the head. */
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
    .not('status', 'in', '(superseded,rolled_back)')
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
  /** #28 — per-output manual override flags (proposed; default false). */
  overage_is_override: boolean;
  merch_is_override: boolean;
  vip_is_override: boolean;
  /** Phase 2 — the show's native currency (NULL = tour currency). */
  currency: string | null;
  // Phase 3 — projection inputs (proposed; nullable, %s stored 0–100).
  capacity: number | null;
  est_sell_thru: number | null;
  face_value: number | null;
  deal_type: string | null;
  deal_pct: number | null;
  deal_threshold: number | null;
  deal_pct_above: number | null;
  dollars_per_head: number | null;
  merch_fee_pct: number | null;
  vip_tickets: number | null;
  vip_price: number | null;
}

const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

export async function getProposedIncomeMap(
  supabase: SupabaseClient,
  versionId: string,
): Promise<Map<string, ProposedIncome>> {
  const m = new Map<string, ProposedIncome>();
  const { data } = await supabase
    .from('budget_version_income')
    .select('routing_id, pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income, vip_income, overage_is_override, merch_is_override, vip_is_override, currency, capacity, est_sell_thru, face_value, deal_type, deal_pct, deal_threshold, deal_pct_above, dollars_per_head, merch_fee_pct, vip_tickets, vip_price')
    .eq('version_id', versionId);
  for (const r of data ?? []) {
    const v = r as Record<string, unknown>;
    m.set(v.routing_id as string, {
      pre_tax_guarantee: Number(v.pre_tax_guarantee) || 0,
      withholding_pct: Number(v.withholding_pct) || 0,
      pre_tax_overage: Number(v.pre_tax_overage) || 0,
      merch_income: Number(v.merch_income) || 0,
      vip_income: Number(v.vip_income) || 0,
      overage_is_override: !!v.overage_is_override,
      merch_is_override: !!v.merch_is_override,
      vip_is_override: !!v.vip_is_override,
      currency: (v.currency as string | null) ?? null,
      capacity: numOrNull(v.capacity),
      est_sell_thru: numOrNull(v.est_sell_thru),
      face_value: numOrNull(v.face_value),
      deal_type: (v.deal_type as string | null) ?? null,
      deal_pct: numOrNull(v.deal_pct),
      deal_threshold: numOrNull(v.deal_threshold),
      deal_pct_above: numOrNull(v.deal_pct_above),
      dollars_per_head: numOrNull(v.dollars_per_head),
      merch_fee_pct: numOrNull(v.merch_fee_pct),
      vip_tickets: numOrNull(v.vip_tickets),
      vip_price: numOrNull(v.vip_price),
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
