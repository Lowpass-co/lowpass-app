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
  /** Deal & box office grain (migration 262) — all null on a legacy
   *  flat-guarantee settlement, which keeps today's walk bit-identical. */
  dealType: string | null;
  dealPct: number | null;
  bonusThreshold: number | null;
  bonusPct: number | null;
  ticketPrice: number | null;
  ticketCapacity: number | null;
  comps: number | null;
  /** reconciled_tickets_sold ?? day_of_tickets_sold. */
  ticketsSold: number | null;
  /** reconciled_gross ?? day_of_gross. */
  grossBO: number | null;
  /** Contracted guarantee (budget_income.pre_tax_guarantee) — 0 when unset.
   *  Powers the catch-up batch's "settle at the contracted number". */
  contractedGuarantee: number;
  /** True when the deductions below are the legacy single value (not itemized yet). */
  deductionsAreLegacy: boolean;
  deductions: SettlementDeduction[];
  expenses: SettlementExpense[];
  payments: SettlementPayment[];
  walk: Walk;
}

const num = (v: unknown): number => (Number(v) || 0);
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v) || 0);

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
      'id, routing_id, day_of_guarantee, reconciled_guarantee, day_of_overage, reconciled_overage, day_of_merch, reconciled_merch, day_of_deductions, reconciled_deductions, deposit_received, full_and_final, deal_type, deal_pct, bonus_threshold, bonus_pct, ticket_price, ticket_capacity, comps, reconciled_tickets_sold, day_of_tickets_sold, reconciled_gross, day_of_gross',
    )
    .eq('routing_id', routingId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  // Contracted guarantee (budget_income) — the catch-up settle-at-contract number.
  const { data: incomeRow } = await supabase
    .from('budget_income')
    .select('routing_id, pre_tax_guarantee')
    .eq('routing_id', routingId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const contractedGuarantee = num(incomeRow?.pre_tax_guarantee);

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
  const dealType = (settlement?.deal_type as string | null) ?? null;
  const dealPct = numOrNull(settlement?.deal_pct);
  const bonusThreshold = numOrNull(settlement?.bonus_threshold);
  const bonusPct = numOrNull(settlement?.bonus_pct);
  const ticketPrice = numOrNull(settlement?.ticket_price);
  const ticketCapacity = numOrNull(settlement?.ticket_capacity);
  const comps = numOrNull(settlement?.comps);
  const ticketsSold = numOrNull(settlement?.reconciled_tickets_sold ?? settlement?.day_of_tickets_sold);
  const grossBO = numOrNull(settlement?.reconciled_gross ?? settlement?.day_of_gross);

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
    dealType,
    dealPct,
    bonusThreshold,
    bonusPct,
    ticketPrice,
    ticketCapacity,
    comps,
    ticketsSold,
    grossBO,
    contractedGuarantee,
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

export interface ShowWalk extends SettlementWalkData {
  date: string | null;
  city: string | null;
  venue_name: string | null;
  day_type: string | null;
}

/** Batch-load every show's Walk for the tour in a fixed number of queries (not one
 *  per show). Powers the settlement surface's show list + per-show Walk, and the
 *  catch-up queue. */
export async function loadTourSettlementWalks(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
  tourCurrency: string,
): Promise<ShowWalk[]> {
  const ccy = (tourCurrency || 'GBP').trim().toUpperCase();

  const { data: routingRows } = await supabase
    .from('routing')
    .select('id, date, city, venue_name, day_type')
    .eq('tour_id', tourId)
    .in('day_type', ['show', 'festival'])
    .order('date', { ascending: true });
  const shows = (routingRows ?? []) as Array<{
    id: string;
    date: string | null;
    city: string | null;
    venue_name: string | null;
    day_type: string | null;
  }>;
  if (shows.length === 0) return [];
  const routingIds = shows.map((s) => s.id);

  const { data: settlementRows } = await supabase
    .from('settlement')
    .select(
      'id, routing_id, day_of_guarantee, reconciled_guarantee, day_of_overage, reconciled_overage, day_of_merch, reconciled_merch, day_of_deductions, reconciled_deductions, deposit_received, full_and_final, deal_type, deal_pct, bonus_threshold, bonus_pct, ticket_price, ticket_capacity, comps, reconciled_tickets_sold, day_of_tickets_sold, reconciled_gross, day_of_gross',
    )
    .eq('workspace_id', workspaceId)
    .in('routing_id', routingIds);
  const settlements = (settlementRows ?? []) as Array<Record<string, unknown>>;
  const settlementByRouting = new Map(settlements.map((s) => [s.routing_id as string, s]));
  const settlementIds = settlements.map((s) => s.id as string);

  const linesByType = async (table: string) => {
    if (settlementIds.length === 0) return new Map<string, Array<Record<string, unknown>>>();
    const { data } = await supabase.from(table).select('*').in('settlement_id', settlementIds).order('created_at');
    const m = new Map<string, Array<Record<string, unknown>>>();
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const sid = r.settlement_id as string;
      (m.get(sid) ?? m.set(sid, []).get(sid)!).push(r);
    }
    return m;
  };
  const [dedByS, expByS, payByS] = await Promise.all([
    linesByType('settlement_deductions'),
    linesByType('settlement_expenses'),
    linesByType('settlement_payments'),
  ]);

  // Contracted guarantees (budget_income) — one query for the tour, mapped per
  // show. Powers the catch-up batch's "settle at the contracted number".
  const { data: incomeRows } = await supabase
    .from('budget_income')
    .select('routing_id, pre_tax_guarantee')
    .eq('workspace_id', workspaceId)
    .in('routing_id', routingIds);
  const contractedByRouting = new Map(
    ((incomeRows ?? []) as Array<{ routing_id: string; pre_tax_guarantee: number | null }>).map((r) => [
      r.routing_id,
      num(r.pre_tax_guarantee),
    ]),
  );

  return shows.map((show) => {
    const s = settlementByRouting.get(show.id);
    const sid = (s?.id as string | undefined) ?? null;
    const deductions = ((sid ? dedByS.get(sid) : []) ?? []).map((r) => ({
      id: r.id as string, kind: r.kind as string, label: (r.label as string) ?? null, amount: num(r.amount), currency: (r.currency as string) ?? null,
    }));
    const expenses = ((sid ? expByS.get(sid) : []) ?? []).map((r) => ({
      id: r.id as string, label: (r.label as string) ?? null, amount: num(r.amount), currency: (r.currency as string) ?? null,
    }));
    const payments = ((sid ? payByS.get(sid) : []) ?? []).map((r) => ({
      id: r.id as string, method: r.method as string, amount: num(r.amount), currency: (r.currency as string) ?? null, paid_on: (r.paid_on as string) ?? null, note: (r.note as string) ?? null,
    }));

    const guarantee = num(s?.reconciled_guarantee ?? s?.day_of_guarantee);
    const overage = num(s?.reconciled_overage ?? s?.day_of_overage);
    const merch = num(s?.reconciled_merch ?? s?.day_of_merch);
    const depositReceived = num(s?.deposit_received);
    const fullAndFinal = Boolean(s?.full_and_final);
    const dealType = (s?.deal_type as string | null) ?? null;
    const dealPct = numOrNull(s?.deal_pct);
    const bonusThreshold = numOrNull(s?.bonus_threshold);
    const bonusPct = numOrNull(s?.bonus_pct);
    const ticketPrice = numOrNull(s?.ticket_price);
    const ticketCapacity = numOrNull(s?.ticket_capacity);
    const comps = numOrNull(s?.comps);
    const ticketsSold = numOrNull(s?.reconciled_tickets_sold ?? s?.day_of_tickets_sold);
    const grossBO = numOrNull(s?.reconciled_gross ?? s?.day_of_gross);
    const contractedGuarantee = contractedByRouting.get(show.id) ?? 0;
    const legacyDeductions = num(s?.reconciled_deductions ?? s?.day_of_deductions);
    const deductionsAreLegacy = deductions.length === 0 && legacyDeductions !== 0;
    const walkDeductions = deductions.length > 0 ? deductions : deductionsAreLegacy ? [{ amount: legacyDeductions }] : [];

    const walk = computeWalk({ guarantee, deductions: walkDeductions, expenses, overage, merch, depositReceived, payments });

    return {
      settlementId: sid,
      routingId: show.id,
      date: show.date,
      city: show.city,
      venue_name: show.venue_name,
      day_type: show.day_type,
      currency: ccy,
      guarantee, overage, merch, depositReceived, fullAndFinal,
      dealType, dealPct, bonusThreshold, bonusPct, ticketPrice, ticketCapacity, comps,
      ticketsSold, grossBO, contractedGuarantee,
      deductionsAreLegacy, deductions, expenses, payments, walk,
    };
  });
}
