/* ============================================
   LOWPASS — loadSettlementWalk (M1-B) — the ONE settlement read path

   Reads a show's settlement row + itemized deductions / expenses / payments and
   computes the Walk via computeWalk (the harness-proven SSOT). Consumed by the
   Walk panel AND the settlement PDF, so both render byte-identical money.

   Effective deductions = the itemized rows when any exist, else a single synthetic
   line carrying the legacy settlement.*_deductions value (reconciled preferred over
   day-of) — so a settlement that hasn't been itemized yet still walks correctly and
   matches the legacy net.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeWalk, type Walk } from './walk';

export interface SettlementDeduction {
  id: string;
  kind: string;
  label: string | null;
  amount: number;
  currency: string | null;
}
export interface SettlementExpense {
  id: string;
  label: string | null;
  amount: number;
  currency: string | null;
}
export interface SettlementPayment {
  id: string;
  method: string;
  amount: number;
  currency: string | null;
  paid_on: string | null;
  note: string | null;
}

export interface SettlementWalkData {
  settlementId: string | null;
  routingId: string;
  currency: string;
  guarantee: number;
  overage: number;
  merch: number;
  depositReceived: number;
  fullAndFinal: boolean;
  /** True when the deductions below are the legacy single value (not itemized yet). */
  deductionsAreLegacy: boolean;
  deductions: SettlementDeduction[];
  expenses: SettlementExpense[];
  payments: SettlementPayment[];
  walk: Walk;
}

const num = (v: unknown): number => (Number(v) || 0);

export async function loadSettlementWalk(
  supabase: SupabaseClient,
  routingId: string,
  workspaceId: string,
  tourCurrency: string,
): Promise<SettlementWalkData> {
  const ccy = (tourCurrency || 'GBP').trim().toUpperCase();

  const { data: settlement } = await supabase
    .from('settlement')
    .select(
      'id, routing_id, day_of_guarantee, reconciled_guarantee, day_of_overage, reconciled_overage, day_of_merch, reconciled_merch, day_of_deductions, reconciled_deductions, deposit_received, full_and_final',
    )
    .eq('routing_id', routingId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const settlementId = (settlement?.id as string | undefined) ?? null;

  let deductions: SettlementDeduction[] = [];
  let expenses: SettlementExpense[] = [];
  let payments: SettlementPayment[] = [];
  if (settlementId) {
    const [{ data: d }, { data: e }, { data: p }] = await Promise.all([
      supabase.from('settlement_deductions').select('*').eq('settlement_id', settlementId).order('created_at'),
      supabase.from('settlement_expenses').select('*').eq('settlement_id', settlementId).order('created_at'),
      supabase.from('settlement_payments').select('*').eq('settlement_id', settlementId).order('created_at'),
    ]);
    deductions = ((d ?? []) as SettlementDeduction[]).map((r) => ({ ...r, amount: num(r.amount) }));
    expenses = ((e ?? []) as SettlementExpense[]).map((r) => ({ ...r, amount: num(r.amount) }));
    payments = ((p ?? []) as SettlementPayment[]).map((r) => ({ ...r, amount: num(r.amount) }));
  }

  const guarantee = num(settlement?.reconciled_guarantee ?? settlement?.day_of_guarantee);
  const overage = num(settlement?.reconciled_overage ?? settlement?.day_of_overage);
  const merch = num(settlement?.reconciled_merch ?? settlement?.day_of_merch);
  const depositReceived = num(settlement?.deposit_received);
  const fullAndFinal = Boolean(settlement?.full_and_final);

  // Fall back to the legacy single deductions value when nothing is itemized yet.
  const legacyDeductions = num(settlement?.reconciled_deductions ?? settlement?.day_of_deductions);
  const deductionsAreLegacy = deductions.length === 0 && legacyDeductions !== 0;
  const walkDeductions = deductions.length > 0 ? deductions : deductionsAreLegacy ? [{ amount: legacyDeductions }] : [];

  const walk = computeWalk({
    guarantee,
    deductions: walkDeductions,
    expenses,
    overage,
    merch,
    depositReceived,
    payments,
  });

  return {
    settlementId,
    routingId,
    currency: ccy,
    guarantee,
    overage,
    merch,
    depositReceived,
    fullAndFinal,
    deductionsAreLegacy,
    deductions,
    expenses,
    payments,
    walk,
  };
}

/** Σ of itemized deductions — the value the Walk panel pushes into
 *  settlement.reconciled_deductions so the existing income cascade carries it. */
export function sumDeductions(deductions: { amount: number }[]): number {
  return deductions.reduce((n, d) => n + (Number(d.amount) || 0), 0);
}
