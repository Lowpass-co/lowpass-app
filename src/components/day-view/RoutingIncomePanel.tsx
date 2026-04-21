'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { DayAdvancePanel } from '@/components/day-view/DayAdvancePanel';
import { dayTypeLabel } from '@/lib/dayType';

type RoutingRow = {
  id: string;
  date: string;
  day_type: string;
  venue?: { name?: string | null; city?: string | null; country?: string | null } | null;
  venue_name?: string | null;
  city?: string | null;
  country?: string | null;
};

type IncomeRow = {
  routing_id: string;
  pre_tax_guarantee: number;
  withholding_pct: number;
  post_tax_guarantee: number;
  pre_tax_overage: number;
  post_tax_overage: number;
  merch_income: number;
  vip_income: number;
  actual_guarantee: number | null;
  actual_overage: number | null;
  actual_merch: number | null;
  actual_vip: number | null;
};

type LineItemRow = {
  id: string;
  routing_id: string | null;
  category: string;
  label: string;
  proposed_cost: number;
  actual_cost: number;
  status?: string | null;
};

const SHOW_DAY_TYPES = new Set(['show', 'festival']);
const n = (x: number | null | undefined) => (x == null ? 0 : Number(x) || 0);

function monthAbbrev(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
}

function dayNum(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit' });
}

function dayDotClass(dayTypeRaw: string): string {
  const t = (dayTypeRaw ?? '').split(',')[0]?.trim() || 'off';
  if (t === 'show' || t === 'festival') return 'bg-emerald-500';
  if (t === 'travel') return 'bg-blue-500';
  return 'bg-lp-text-tertiary';
}

function categoryGroup(cat: string): string {
  if (cat === 'flights') return 'Flights';
  if (cat === 'hotels') return 'Hotels';
  if (cat.startsWith('transport_')) return 'Transport';
  if (cat.startsWith('prod_')) return 'Production';
  return 'Other';
}

function statusChip(status?: string | null): { label: string; className: string } {
  const s = (status ?? 'draft').toLowerCase();
  if (s === 'approved') return { label: 'Approved', className: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5' };
  if (s === 'paid') return { label: 'Paid', className: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5' };
  if (s === 'quoted') return { label: 'Quoted', className: 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5' };
  if (s === 'disputed') return { label: 'Disputed', className: 'border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5' };
  return { label: 'Draft', className: 'border-lp-border text-lp-text-tertiary bg-lp-surface/40' };
}

/**
 * Income formula — Reading B (confirmed by Adam 2026-04-21).
 *
 *   proposed = post_tax_guarantee + post_tax_overage + merch_income + vip_income - withholding_deduction
 *   actual   = actual_guarantee   + actual_overage   + actual_merch  + actual_vip  - withholding_deduction
 *
 * Withholding applies to both proposed and actual (same row).
 * Do not change this without an explicit product decision — it drives every
 * per-day total on the routing page.
 */
export function RoutingIncomePanel({
  tourId,
  selectedRoutingId,
  onRoutingIdChange,
  currency = 'GBP',
  showDayStrip = true,
}: {
  tourId: string;
  selectedRoutingId: string | null;
  onRoutingIdChange: (id: string) => void;
  currency?: string;
  showDayStrip?: boolean;
}) {
  const [routing, setRouting] = useState<RoutingRow[]>([]);
  const [income, setIncome] = useState<IncomeRow[]>([]);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedCurrency, setResolvedCurrency] = useState(currency);

  const fmt = useMemo(
    () => new Intl.NumberFormat('en-GB', { style: 'currency', currency: resolvedCurrency }),
    [resolvedCurrency]
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [routingRes, incomeRes, liRes, tourRes] = await Promise.all([
        fetch(`/api/tours/${encodeURIComponent(tourId)}/routing`),
        fetch(`/api/budget/income?tour_id=${encodeURIComponent(tourId)}`),
        fetch(`/api/budget/line-items?tour_id=${encodeURIComponent(tourId)}`),
        fetch(`/api/tours/${encodeURIComponent(tourId)}`),
      ]);

      const routingJson = routingRes.ok ? await routingRes.json() : [];
      const routingRows: RoutingRow[] = (Array.isArray(routingJson) ? routingJson : []) as RoutingRow[];
      setRouting(routingRows);

      const incomeJson = incomeRes.ok ? await incomeRes.json() : { income: [] };
      setIncome((incomeJson.income ?? []) as IncomeRow[]);

      const liJson = liRes.ok ? await liRes.json() : { line_items: [] };
      setLineItems((liJson.line_items ?? []) as LineItemRow[]);

      if (tourRes.ok) {
        const t = await tourRes.json().catch(() => null);
        const c = (t as { tour?: { currency?: string }; currency?: string } | null)?.tour?.currency ?? (t as { currency?: string } | null)?.currency;
        if (typeof c === 'string' && c.trim()) setResolvedCurrency(c.trim());
      }

      if (!selectedRoutingId && routingRows.length > 0) {
        onRoutingIdChange(routingRows[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [tourId, selectedRoutingId, onRoutingIdChange]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (currency) setResolvedCurrency(currency);
  }, [currency]);

  const selected = useMemo(
    () => routing.find((r) => r.id === selectedRoutingId) ?? null,
    [routing, selectedRoutingId]
  );

  const incomeRow = useMemo(
    () => income.find((r) => r.routing_id === selectedRoutingId) ?? null,
    [income, selectedRoutingId]
  );

  const dayLineItems = useMemo(
    () => lineItems.filter((i) => i.routing_id === selectedRoutingId),
    [lineItems, selectedRoutingId]
  );

  const incomeLines = useMemo(() => {
    if (!incomeRow) return [];
    const withholdingDeduction = Math.max(0, n(incomeRow.pre_tax_guarantee) - n(incomeRow.post_tax_guarantee));
    const proposedGuarantee = n(incomeRow.post_tax_guarantee);
    const proposedOverage = n(incomeRow.post_tax_overage);
    const proposedMerch = n(incomeRow.merch_income);
    const proposedVip = n(incomeRow.vip_income);
    const actualGuarantee = n(incomeRow.actual_guarantee);
    const actualOverage = n(incomeRow.actual_overage);
    const actualMerch = n(incomeRow.actual_merch);
    const actualVip = n(incomeRow.actual_vip);
    const lines = [
      { label: 'Guarantee', proposed: proposedGuarantee, actual: actualGuarantee },
      { label: 'Overage', proposed: proposedOverage, actual: actualOverage },
      { label: 'Merch', proposed: proposedMerch, actual: actualMerch },
      { label: 'VIP', proposed: proposedVip, actual: actualVip },
    ];
    if (withholdingDeduction > 0) {
      lines.push({ label: 'Withholding tax', proposed: -withholdingDeduction, actual: -withholdingDeduction });
    }
    return lines;
  }, [incomeRow]);

  const incomeTotals = useMemo(() => {
    const proposed = incomeLines.reduce((s, l) => s + l.proposed, 0);
    const actual = incomeLines.reduce((s, l) => s + l.actual, 0);
    return { proposed, actual };
  }, [incomeLines]);

  const expenseGroups = useMemo(() => {
    const map = new Map<string, LineItemRow[]>();
    for (const li of dayLineItems) {
      const g = categoryGroup(li.category);
      map.set(g, [...(map.get(g) ?? []), li]);
    }
    return Array.from(map.entries()).map(([group, items]) => ({
      group,
      items,
      proposed: items.reduce((s, i) => s + n(i.proposed_cost), 0),
      actual: items.reduce((s, i) => s + n(i.actual_cost), 0),
    }));
  }, [dayLineItems]);

  const expenseTotals = useMemo(() => {
    const proposed = expenseGroups.reduce((s, g) => s + g.proposed, 0);
    const actual = expenseGroups.reduce((s, g) => s + g.actual, 0);
    return { proposed, actual };
  }, [expenseGroups]);

  const dayPL = useMemo(() => {
    const proposed = incomeTotals.proposed - expenseTotals.proposed;
    const actual = incomeTotals.actual - expenseTotals.actual;
    return { proposed, actual };
  }, [incomeTotals, expenseTotals]);

  if (loading) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-4 text-sm text-lp-text-secondary">
        Loading...
      </div>
    );
  }

  if (routing.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-lp-text-tertiary text-sm gap-2 rounded-xl border border-lp-border bg-lp-surface/50">
        No routing dates. Add routing above to see income and expenses.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showDayStrip && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {routing.map((r) => {
            const isActive = r.id === selectedRoutingId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onRoutingIdChange(r.id)}
                className={cn(
                  'rounded-lg px-3 py-2 text-xs font-medium cursor-pointer border',
                  isActive
                    ? 'bg-lp-orange text-white border-lp-orange'
                    : 'bg-lp-surface border-lp-border text-lp-text-secondary hover:bg-lp-surface-hover'
                )}
              >
                <div className="text-[10px] font-semibold uppercase tracking-widest opacity-90">
                  {monthAbbrev(r.date)}
                </div>
                <div className="text-base font-bold tabular-nums leading-tight">{dayNum(r.date)}</div>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span className={cn('h-1.5 w-1.5 rounded-full', dayDotClass(r.day_type))} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest">{dayTypeLabel(r.day_type)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
              Advance
            </div>
            {SHOW_DAY_TYPES.has((selected.day_type ?? '').split(',')[0]?.trim()) ? (
              <DayAdvancePanel tourId={tourId} routingId={selected.id} />
            ) : (
              <div className="rounded-xl border border-lp-border bg-lp-surface/40 p-4 text-sm text-lp-text-tertiary">
                No show. Advance details are typically only required for show days.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
              Day financials
            </div>

            <div className="mb-6">
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                Income
              </div>
              <div className="sticky top-0 z-[1] bg-lp-surface grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] gap-2 text-[11px] font-semibold lp-table-header-text py-2">
                <div>Description</div>
                <div className="text-right">Prop</div>
                <div className="text-right">Act</div>
                <div className="text-right">Var</div>
              </div>
              {incomeLines.length === 0 ? (
                <div className="py-3 text-sm text-lp-text-tertiary">No income for this day.</div>
              ) : (
                <div className="space-y-1">
                  {incomeLines.map((l) => {
                    const variance = l.actual - l.proposed;
                    return (
                      <div key={l.label} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] gap-2 text-[13px] tabular-nums py-1">
                        <div className="text-lp-text">{l.label}</div>
                        <div className="text-right font-bold">{fmt.format(l.proposed)}</div>
                        <div className="text-right font-bold">{fmt.format(l.actual)}</div>
                        <div className={cn('text-right font-bold', variance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                          {fmt.format(variance)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-2 flex justify-end text-sm tabular-nums font-bold">
                <span className="text-lp-text-secondary mr-2">Total</span>
                <span>{fmt.format(incomeTotals.proposed)}</span>
              </div>
            </div>

            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                Expenses
              </div>
              <div className="sticky top-0 z-[1] bg-lp-surface grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] gap-2 text-[11px] font-semibold lp-table-header-text py-2">
                <div>Description</div>
                <div className="text-right">Prop</div>
                <div className="text-right">Act</div>
                <div className="text-right">Status</div>
              </div>
              {expenseGroups.length === 0 ? (
                <div className="py-3 text-sm text-lp-text-tertiary">No expenses for this day.</div>
              ) : (
                <div className="space-y-4">
                  {expenseGroups.map((g) => (
                    <div key={g.group}>
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                        {g.group}
                      </div>
                      <div className="space-y-1">
                        {g.items.map((i) => {
                          const chip = statusChip(i.status);
                          return (
                            <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] gap-2 text-[13px] tabular-nums py-1">
                              <div className="text-lp-text truncate">{i.label}</div>
                              <div className="text-right font-bold">{fmt.format(n(i.proposed_cost))}</div>
                              <div className="text-right font-bold">{fmt.format(n(i.actual_cost))}</div>
                              <div className="flex justify-end">
                                <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest', chip.className)}>
                                  {chip.label}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-lp-border pt-3 text-sm tabular-nums font-bold">
                <span className="text-lp-text-secondary">Day P/L</span>
                <span className={cn(dayPL.proposed >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                  {fmt.format(dayPL.proposed)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
