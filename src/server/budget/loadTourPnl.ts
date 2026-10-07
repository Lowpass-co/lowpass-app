/* ============================================
   LOWPASS — the tour P&L, server side (ONE formula for every screen)

   Every server surface that shows a tour's money — the summary API, the
   artist roll-up, the dashboard snapshot, the AI alerts — now calls this,
   which feeds exactly the inputs the Budget page's own Summary uses into the
   same pure `computeBudgetPnl`. There is no second formula.

   What the old /api/budget/summary got wrong (all fixed by deletion):
     - income was read for EVERY tour in the workspace (no tour filter);
     - 0% insurance read as 3% and 0% contingency as 2% (`|| 0.03`);
     - commission percentages were not normalised (15 meant 1500%);
     - nothing was converted to the tour currency;
     - categories outside hotels / transport_ / prod_ were dropped.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeBudgetPnl, type BudgetPnl, type CommissionInput, type IncomeInput } from '@/lib/budget/computeBudgetPnl';
import { convertToTour, type FxRateMap } from '@/lib/budget/fxRates';
import { isIncomeRow } from '@/lib/budget/income-rows';
import { PAYROLL_PER_DIEM_SOURCE, PAYROLL_SALARY_SOURCE } from '@/lib/budget/derivedPayrollTotals';
import { getEffectiveActual } from '@/lib/budget/transactions';
import { reconcileDerivedBudgetLines, type ReconcileResult } from '@/server/budget/reconcileDerivedLines';
import { getProposedLineMap } from '@/server/budget/versions';
import type { BudgetLineItem } from '@/types';

export interface TourPnlBundle {
  tourCurrency: string;
  pnl: BudgetPnl;
  lines: BudgetLineItem[];
  income: IncomeInput[];
  fxRates: FxRateMap;
  /** Currencies in use with no rate — converted 1:1 and flagged. */
  fxMissing: string[];
  /** Base expenses split the way the summary sheet shows them (tour ccy). */
  breakdown: Record<'salaries' | 'perDiem' | 'hotels' | 'flights' | 'transport' | 'production', { projected: number; actual: number }>;
  reconcile: ReconcileResult | null;
  routingDays: Array<{ id: string; date: string | null; day_type: string | null }>;
}

class PnlReadError extends Error {}

function must<T>(what: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new PnlReadError(`${what}: ${res.error.message}`);
  return (res.data ?? ([] as unknown)) as T;
}

/**
 * Load + compute a tour's P&L. Throws on a failed read (callers return 500)
 * rather than computing a confident figure from half the data.
 */
export async function loadTourPnl(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
  opts: { reconcile?: boolean } = {},
): Promise<TourPnlBundle> {
  const reconcile = opts.reconcile === false ? null : await reconcileDerivedBudgetLines(supabase, tourId, workspaceId);

  const [tourRes, routingRes, linesRes, settingsRes, commRes, fxRes, versionsRes] = await Promise.all([
    supabase.from('tours').select('currency').eq('id', tourId).eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('routing').select('id, date, day_type').eq('tour_id', tourId),
    supabase.from('budget_line_items').select('*').eq('tour_id', tourId).eq('workspace_id', workspaceId),
    supabase.from('budget_settings').select('*').eq('tour_id', tourId).eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('budget_commissions').select('id, label, percentage, basis').eq('tour_id', tourId).eq('workspace_id', workspaceId),
    supabase.from('budget_fx_rates').select('currency, rate_to_tour_currency').eq('tour_id', tourId).eq('workspace_id', workspaceId),
    supabase.from('budget_versions').select('id, status, version_number').eq('tour_id', tourId).eq('workspace_id', workspaceId),
  ]);

  const tour = must('tour', tourRes) as { currency?: string | null } | null;
  const tourCurrency = String(tour?.currency ?? 'GBP').toUpperCase();
  const routingDays = must('routing', routingRes) as TourPnlBundle['routingDays'];
  const lines = must('line items', linesRes) as BudgetLineItem[];
  const settings = must('settings', settingsRes) as Record<string, unknown> | null;
  const commissions = must('commissions', commRes) as CommissionInput[];
  const fxRates: FxRateMap = {};
  for (const r of must('fx rates', fxRes) as Array<{ currency?: string; rate_to_tour_currency?: number }>) {
    const c = String(r.currency ?? '').toUpperCase();
    const rate = Number(r.rate_to_tour_currency);
    if (c && Number.isFinite(rate) && rate > 0) fxRates[c] = rate;
  }

  // Income keys per show (routing row) — same rows the Budget page's Summary reads.
  const routingIds = routingDays.map((r) => r.id).filter(Boolean);
  const income = routingIds.length
    ? (must('income', await supabase.from('budget_income').select('*').eq('workspace_id', workspaceId).in('routing_id', routingIds)) as IncomeInput[])
    : [];

  // Proposed = the version the Budget page shows by default: the approved
  // baseline when there is one, else the working head.
  const versions = must('versions', versionsRes) as Array<{ id: string; status: string; version_number: number }>;
  const viewed =
    versions.find((v) => v.status === 'approved') ??
    [...versions].filter((v) => v.status !== 'superseded' && v.status !== 'rolled_back').sort((a, b) => b.version_number - a.version_number)[0];
  if (viewed) {
    const proposed = await getProposedLineMap(supabase, viewed.id);
    for (const l of lines) {
      const p = proposed.get(l.id);
      if (p !== undefined) (l as { proposed_cost: number }).proposed_cost = p;
    }
  }

  const pnl = computeBudgetPnl({ lines, income, commissions, settings, tourCurrency, fxRates });

  const used = new Set<string>();
  for (const l of lines) if (l.currency) used.add(l.currency.toUpperCase());
  for (const i of income) if (i.currency) used.add(i.currency.toUpperCase());
  const fxMissing = [...used].filter((c) => c !== tourCurrency && fxRates[c] == null).sort();

  const breakdown: TourPnlBundle['breakdown'] = {
    salaries: { projected: 0, actual: 0 },
    perDiem: { projected: 0, actual: 0 },
    hotels: { projected: 0, actual: 0 },
    flights: { projected: 0, actual: 0 },
    transport: { projected: 0, actual: 0 },
    production: { projected: 0, actual: 0 },
  };
  for (const l of lines) {
    if (isIncomeRow(l)) continue;
    const ccy = (l.currency || tourCurrency).toUpperCase();
    const lr = Number(l.locked_fx_rate) > 0 ? Number(l.locked_fx_rate) : null;
    const p = convertToTour(Number(l.proposed_cost) || 0, ccy, tourCurrency, fxRates);
    const a = convertToTour(getEffectiveActual(l), ccy, tourCurrency, fxRates, lr);
    const src = (l as { source_entity_type?: string | null }).source_entity_type;
    const cat = String(l.category ?? '');
    const bucket =
      src === PAYROLL_SALARY_SOURCE ? 'salaries'
      : src === PAYROLL_PER_DIEM_SOURCE ? 'perDiem'
      : cat === 'hotels' ? 'hotels'
      : cat === 'flights' || src === 'flight' ? 'flights'
      : cat.startsWith('transport') ? 'transport'
      : 'production';
    breakdown[bucket].projected += p;
    breakdown[bucket].actual += a;
  }

  return { tourCurrency, pnl, lines, income, fxRates, fxMissing, breakdown, reconcile, routingDays };
}
