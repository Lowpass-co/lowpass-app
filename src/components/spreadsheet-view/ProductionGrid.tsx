'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { InlineEditCell } from './InlineEditCell';
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

  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {PROD_CATEGORIES.map(({ key: cat, label }) => {
        const items = lineItems.filter((i) => i.category === cat);
        const totalProposed = items.reduce((s, i) => s + (i.proposed_cost || 0) * (i.quantity || 1), 0);
        const totalActual = items.reduce((s, i) => s + (i.actual_cost || 0) * (i.quantity || 1), 0);
        return (
          <div
            key={cat}
            className="rounded-lg border border-lp-border bg-lp-surface/30 overflow-hidden"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary px-3 py-2 border-b border-lp-border/50">
              {label}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-lp-text-secondary text-xs">
                  <th className="text-left px-2 py-1.5 font-semibold">Item</th>
                  <th className="text-right px-2 py-1.5 w-12 font-semibold">#</th>
                  <th className="text-right px-2 py-1.5 w-20 font-semibold">P</th>
                  <th className="text-right px-2 py-1.5 w-20 font-semibold">A</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="even:bg-lp-surface/30">
                    <td className="px-2 py-0">
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
                    <td className="px-2 py-0 text-right">
                      <InlineEditCell
                        value={i.quantity}
                        type="number"
                        onSave={async (v) => saveItem(i.id, 'quantity', typeof v === 'number' ? v : parseFloat(String(v)))}
                        align="right"
                      />
                    </td>
                    <td className="px-2 py-0">
                      <InlineEditCell
                        value={i.proposed_cost}
                        type="currency"
                        currency={currency}
                        onSave={async (v) => saveItem(i.id, 'proposed_cost', v)}
                        align="right"
                      />
                    </td>
                    <td className="px-2 py-0">
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
                  <td className="px-2 py-1.5">TOTAL</td>
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5 text-right font-[tabular-nums]">{formatter.format(totalProposed)}</td>
                  <td className="px-2 py-1.5 text-right font-[tabular-nums]">{formatter.format(totalActual)}</td>
                </tr>
              </tfoot>
            </table>
            <div className="px-2 py-1.5 border-t border-lp-border/50">
              <button
                type="button"
                onClick={() => addItem(cat)}
                className="text-lp-orange text-xs font-semibold hover:underline"
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
