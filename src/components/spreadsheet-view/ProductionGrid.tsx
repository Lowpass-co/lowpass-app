'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { InlineEditCell } from './InlineEditCell';
import { SpreadsheetCurrencyAmount } from './SpreadsheetCurrencyAmount';
import { useDetailPanel } from '@/contexts/DetailPanelContext';
import type { BudgetLineItem } from '@/types';

const PROD_CATEGORIES: { key: string; label: string }[] = [
  { key: 'prod_audio', label: 'AUDIO + BACKLINE' },
  { key: 'prod_programming', label: 'PROGRAMMING + SETUP' },
  { key: 'prod_lighting', label: 'LIGHTING' },
  { key: 'prod_set_wardrobe', label: 'SET + WARDROBE' },
  { key: 'prod_freight', label: 'FREIGHT + BAGGAGE' },
  { key: 'prod_misc', label: 'MISC PRODUCTION' },
];

export function ProductionGrid({ tourId, currency }: { tourId: string; currency: string }) {
  const { openLineItem } = useDetailPanel();
  const [lineItems, setLineItems] = useState<BudgetLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/budget/line-items?tour_id=${tourId}`);
      if (!res.ok) throw new Error('Failed to load line items');
      const json = await res.json();
      const all = json.line_items ?? [];
      setLineItems(all.filter((i: BudgetLineItem) => i.category.startsWith('prod_')));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveItem = useCallback(async (id: string, field: string, value: string | number) => {
    const res = await fetch('/api/budget/line-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: value }),
    });
    if (!res.ok) throw new Error('Save failed');
    const updated = await res.json();
    setLineItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
  }, []);

  const addItem = useCallback(
    async (category: string) => {
      const res = await fetch('/api/budget/line-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          category,
          label: 'New item',
          quantity: 1,
          proposed_cost: 0,
        }),
      });
      if (!res.ok) throw new Error('Create failed');
      const created = await res.json();
      setLineItems((prev) => [...prev, created]);
    },
    [tourId]
  );

  if (loading) return <div className="text-sm text-lp-text-secondary py-4">Loading…</div>;
  if (error) return <div className="text-sm text-lp-error py-4">{error}</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {PROD_CATEGORIES.map(({ key: cat, label }) => {
        const items = lineItems.filter((i) => i.category === cat);
        const totalProposed = items.reduce((s, i) => s + (i.proposed_cost || 0) * (i.quantity || 1), 0);
        const totalActual = items.reduce((s, i) => s + (i.actual_cost || 0) * (i.quantity || 1), 0);
        return (
          <div
            key={cat}
            className="lp-budget overflow-hidden rounded-md border border-lp-border bg-lp-surface shadow-[inset_0_0_0_1px_var(--lp-border)]"
          >
            <div className="border-b border-lp-border/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-lp-text-secondary">
              {label}
            </div>
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead>
                <tr className="border-b-2 border-lp-border bg-lp-bg-tertiary text-xs font-semibold uppercase tracking-wide lp-table-header-text dark:bg-lp-bg-secondary">
                  <th className="border-r border-lp-border px-3 py-2.5 text-left last:border-r-0">Item</th>
                  <th className="border-r border-lp-border px-3 py-2.5 text-right last:border-r-0">#</th>
                  <th className="border-r border-lp-border px-3 py-2.5 text-right last:border-r-0">P</th>
                  <th className="px-3 py-2.5 text-right">A</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr
                    key={i.id}
                    className="border-b border-lp-border odd:bg-lp-bg-secondary/35 even:bg-transparent dark:odd:bg-white/[0.04]"
                  >
                    <td className="border-r border-lp-border px-3 py-2.5 align-middle last:border-r-0">
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openLineItem(i.id)}
                          className="p-0.5 text-lp-text-secondary hover:text-lp-orange shrink-0"
                          aria-label="Open detail"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openLineItem(i.id)}
                          className="text-lp-text text-left hover:underline truncate min-w-0"
                        >
                          {i.label}
                        </button>
                      </span>
                    </td>
                    <td className="border-r border-lp-border px-3 py-2.5 text-right align-middle last:border-r-0">
                      <InlineEditCell
                        value={i.quantity}
                        type="number"
                        onSave={async (v) => saveItem(i.id, 'quantity', typeof v === 'number' ? v : parseFloat(String(v)))}
                        align="right"
                      />
                    </td>
                    <td className="border-r border-lp-border px-3 py-2.5 align-middle last:border-r-0">
                      <InlineEditCell
                        value={i.proposed_cost}
                        type="currency"
                        currency={currency}
                        onSave={async (v) => saveItem(i.id, 'proposed_cost', v)}
                        align="right"
                      />
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <InlineEditCell
                        value={i.actual_cost}
                        type="currency"
                        currency={currency}
                        onSave={async (v) => saveItem(i.id, 'actual_cost', v)}
                        align="right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-lp-border font-semibold text-lp-text">
                  <td className="px-3 py-2.5">TOTAL</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5">
                    <SpreadsheetCurrencyAmount amount={totalProposed} currency={currency} />
                  </td>
                  <td className="px-3 py-2.5">
                    <SpreadsheetCurrencyAmount amount={totalActual} currency={currency} />
                  </td>
                </tr>
              </tfoot>
            </table>
            <div className="border-t border-lp-border/50 px-3 py-2.5">
              <button
                type="button"
                onClick={() => addItem(cat)}
                className="text-sm font-semibold text-lp-orange hover:underline"
              >
                + Add
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
