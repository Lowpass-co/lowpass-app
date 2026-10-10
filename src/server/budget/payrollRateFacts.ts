/* ============================================
   LOWPASS — the read-only rate columns on the budget sheet (Oct 2026)

   Adam's budget template shows, on every salary and per-diem row:
     SHOW RATE · OFF RATE · # SHOW DAY · # OFF DAY · PROJECTED · ACTUAL
   The budget sheet does the same, READ-ONLY: rates are changed on Payroll.

   Built from exactly the inputs the salary lines are computed from
   (reconcileDerivedLines → desiredPayroll): the rate context, the painted
   payroll days, and routing for unpainted days. So the columns explain the
   number beside them; they never disagree with it.

   Keyed by personnel_rates.id — the source_entity_id of the derived salary
   ('payroll') and per-diem ('payroll_per_diem') lines.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { countDayStatuses, type DayCounts } from '@/lib/payroll/fees';
import { effectiveStatuses } from '@/lib/payroll/effectiveDayType';
import { loadTourRateContext, rateAmountsFor, type TourRateContext } from '@/lib/payroll/loadRateLines';
import { DEFAULT_RATE_TYPE_IDS } from '@/lib/payroll/rateLines';
import { logServerError } from '@/lib/log/serverError';

export interface PayrollRateFact {
  showRate: number;
  offRate: number;
  perDiem: number;
  showDays: number;
  /** Every worked day that isn't a show (off, travel, rehearsal, promo) —
   *  the template's "# OFF DAY". A day-rate person is paid the same on all of
   *  them, so rate × (show + off days) is their pay. */
  offDays: number;
}

/** One person's rate facts. A "Flat day" (day-rate) person is paid the same
 *  every day, so — like the template — both rate columns show that rate. */
export function rateFactFor(ctx: TourRateContext, personnelRateId: string, counts: DayCounts): PayrollRateFact {
  const a = rateAmountsFor(ctx, personnelRateId);
  const rows = ctx.linesByRateId.get(personnelRateId) ?? [];
  const day = rows.find((r) => r.rate_type_id === DEFAULT_RATE_TYPE_IDS.dayRate);
  const dayRate = day ? Number(day.amount) || 0 : null;
  return {
    showRate: dayRate ?? a.showRate,
    offRate: dayRate ?? a.offRate,
    perDiem: a.perDiem,
    showDays: counts.show,
    offDays: Math.max(0, (counts.active ?? 0) - counts.show),
  };
}

/** personnel_rates.id → its facts. Empty on any read failure (display only —
 *  the sheet simply shows blank rate cells; the money is unaffected). */
export async function loadPayrollRateFacts(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<Record<string, PayrollRateFact>> {
  try {
    const [cardsRes, entriesRes, routingRes, ctx] = await Promise.all([
      supabase
        .from('personnel_rates')
        .select('id')
        .eq('tour_id', tourId)
        .eq('workspace_id', workspaceId)
        .not('tour_personnel_id', 'is', null),
      supabase.from('payroll_entries').select('personnel_id, day_statuses').eq('tour_id', tourId).eq('workspace_id', workspaceId),
      supabase.from('routing').select('date, day_type').eq('tour_id', tourId),
      loadTourRateContext(supabase, tourId, workspaceId),
    ]);
    if (cardsRes.error || entriesRes.error || routingRes.error) {
      logServerError('loadPayrollRateFacts', cardsRes.error ?? entriesRes.error ?? routingRes.error, { tourId });
      return {};
    }
    const painted = new Map<string, Record<string, string>>();
    for (const e of (entriesRes.data ?? []) as Array<{ personnel_id: string; day_statuses: Record<string, string> | null }>) {
      painted.set(e.personnel_id, { ...(painted.get(e.personnel_id) ?? {}), ...(e.day_statuses ?? {}) });
    }
    const routing = (routingRes.data ?? []) as Array<{ date: string; day_type?: string | null }>;
    const out: Record<string, PayrollRateFact> = {};
    for (const c of (cardsRes.data ?? []) as Array<{ id: string }>) {
      const counts = countDayStatuses(effectiveStatuses(routing, painted.get(c.id)));
      out[c.id] = rateFactFor(ctx, c.id, counts);
    }
    return out;
  } catch (err) {
    logServerError('loadPayrollRateFacts', err, { tourId });
    return {};
  }
}
