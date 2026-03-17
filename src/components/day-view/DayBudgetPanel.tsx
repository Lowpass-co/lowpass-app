'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useDetailPanel } from '@/contexts/DetailPanelContext';
import type { RoutingDate } from '@/types';
import type { BudgetLineItem } from '@/types';
import type { BudgetCategory } from '@/types';

interface DayBudgetPanelProps {
  tourId: string;
  routingId: string;
  routingDate: RoutingDate;
  currency: string;
  onIncomeChange: (value: number | null) => void;
  onExpensesChange: (value: number | null) => void;
}

const CATEGORY_ORDER: { key: string; label: string }[] = [
  { key: 'flights', label: 'FLIGHTS' },
  { key: 'hotels', label: 'HOTEL' },
  { key: 'transport', label: 'TRANSPORT' },
  { key: 'production', label: 'PRODUCTION' },
  { key: 'misc', label: 'MISC' },
  { key: 'per_diem', label: 'PER DIEM' },
];

function categoryGroup(cat: BudgetCategory): string {
  if (cat === 'flights') return 'flights';
  if (cat === 'hotels') return 'hotels';
  if (cat.startsWith('transport_')) return 'transport';
  if (cat.startsWith('prod_')) return 'production';
  return 'misc';
}

export function DayBudgetPanel({
  tourId,
  routingId,
  routingDate,
  currency,
  onIncomeChange,
  onExpensesChange,
}: DayBudgetPanelProps) {
  const [lineItems, setLineItems] = useState<BudgetLineItem[]>([]);
  const [income, setIncome] = useState<{
    post_tax_guarantee: number;
    post_tax_overage: number;
    merch_income: number;
    vip_income: number;
  } | null>(null);
  const [flightsTotal, setFlightsTotal] = useState(0);
  const [hotelsTotal, setHotelsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { openLineItem } = useDetailPanel();
  const dateStr = routingDate.date ?? '';

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [liRes, incRes, flRes, hoRes] = await Promise.all([
        fetch(`/api/budget/line-items?tour_id=${tourId}`),
        fetch(`/api/budget/income?tour_id=${tourId}`),
        fetch(`/api/budget/flights?tour_id=${tourId}`),
        fetch(`/api/budget/hotels?tour_id=${tourId}`),
      ]);

      const liJson = liRes.ok ? await liRes.json() : { line_items: [] };
      const items = (liJson.line_items ?? []).filter(
        (i: BudgetLineItem) => i.routing_id === routingId
      );
      setLineItems(items);

      if (incRes.ok) {
        const incJson = await incRes.json();
        const row = (incJson.income ?? []).find((r: { routing_id: string }) => r.routing_id === routingId);
        if (row) {
          setIncome({
            post_tax_guarantee: Number(row.post_tax_guarantee) || 0,
            post_tax_overage: Number(row.post_tax_overage) || 0,
            merch_income: Number(row.merch_income) || 0,
            vip_income: Number(row.vip_income) || 0,
          });
        } else {
          setIncome(null);
        }
      } else {
        setIncome(null);
      }

      let flightTotal = 0;
      if (flRes.ok) {
        const flJson = await flRes.json();
        const flights = flJson.flights ?? [];
        for (const f of flights) {
          if (f.departure_date === dateStr) {
            flightTotal += Number(f.actual_cost) || Number(f.proposed_cost) || 0;
          }
        }
      }
      setFlightsTotal(flightTotal);

      let hotelTotal = 0;
      if (hoRes.ok) {
        const hoJson = await hoRes.json();
        const hotels = hoJson.hotels ?? [];
        for (const h of hotels) {
          const assignments = h.room_assignments ?? h.hotel_room_assignments ?? [];
          for (const a of assignments) {
            const checkIn = a.check_in?.slice(0, 10);
            const checkOut = a.check_out?.slice(0, 10);
            if (checkIn && checkIn <= dateStr && (!checkOut || checkOut >= dateStr)) {
              hotelTotal += Number(a.rate_per_night) * Number(a.nights || 1);
            }
          }
        }
      }
      setHotelsTotal(hotelTotal);
    } finally {
      setLoading(false);
    }
  }, [tourId, routingId, dateStr]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const incomeTotal =
    income == null
      ? 0
      : income.post_tax_guarantee +
        income.post_tax_overage +
        income.merch_income +
        income.vip_income;

  const lineItemsTotal = lineItems.reduce(
    (sum, i) => sum + (Number(i.actual_cost) || Number(i.proposed_cost) || 0) * (i.quantity || 1),
    0
  );
  const dayExpenses = lineItemsTotal + flightsTotal + hotelsTotal;

  useEffect(() => {
    onIncomeChange(incomeTotal > 0 ? incomeTotal : null);
  }, [incomeTotal, onIncomeChange]);
  useEffect(() => {
    onExpensesChange(dayExpenses);
  }, [dayExpenses, onExpensesChange]);

  const grouped = CATEGORY_ORDER.map(({ key, label }) => {
    let items: BudgetLineItem[] = [];
    let subtotal = 0;
    if (key === 'flights') {
      subtotal = flightsTotal;
    } else if (key === 'hotels') {
      subtotal = hotelsTotal;
      items = lineItems.filter((i) => categoryGroup(i.category) === 'hotels');
      subtotal += items.reduce(
        (s, i) => s + (Number(i.actual_cost) || Number(i.proposed_cost) || 0) * (i.quantity || 1),
        0
      );
    } else if (key === 'transport') {
      items = lineItems.filter((i) => categoryGroup(i.category) === 'transport');
      subtotal = items.reduce(
        (s, i) => s + (Number(i.actual_cost) || Number(i.proposed_cost) || 0) * (i.quantity || 1),
        0
      );
    } else if (key === 'production') {
      items = lineItems.filter((i) => categoryGroup(i.category) === 'production');
      subtotal = items.reduce(
        (s, i) => s + (Number(i.actual_cost) || Number(i.proposed_cost) || 0) * (i.quantity || 1),
        0
      );
    } else if (key === 'misc') {
      items = lineItems.filter((i) => categoryGroup(i.category) === 'misc');
      subtotal = items.reduce(
        (s, i) => s + (Number(i.actual_cost) || Number(i.proposed_cost) || 0) * (i.quantity || 1),
        0
      );
    } else if (key === 'per_diem') {
      items = [];
      subtotal = 0;
    }
    return { key, label, items, subtotal };
  });

  const handleAdd = async (label: string, category: string, proposed_cost: number) => {
    const res = await fetch('/api/budget/line-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tour_id: tourId,
        routing_id: routingId,
        category: category as BudgetCategory,
        label: label.trim() || 'New item',
        quantity: 1,
        proposed_cost: proposed_cost || 0,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setLineItems((prev) => [...prev, created]);
      setAdding(false);
    }
  };

  const handlePatch = async (id: string, updates: { proposed_cost?: number; actual_cost?: number }) => {
    const res = await fetch('/api/budget/line-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    if (res.ok) {
      const updated = await res.json();
      setLineItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setEditingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this line item?')) return;
    const res = await fetch('/api/budget/line-items', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setLineItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (loading) {
    return (
      <div className="text-sm text-lp-text-secondary animate-pulse">Loading budget…</div>
    );
  }

  return (
    <div className="space-y-4">
      {income != null && incomeTotal > 0 && (
        <div className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary mb-2">
          Income: {formatCurrency(incomeTotal, currency)}
        </div>
      )}

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-lp-orange text-sm font-semibold hover:underline"
        >
          + Add line item
        </button>
      ) : (
        <AddLineItemForm
          onSave={handleAdd}
          onCancel={() => setAdding(false)}
          currency={currency}
        />
      )}

      {grouped.map(
        ({ key, label, items, subtotal }) =>
          (subtotal > 0 || items.length > 0) && (
            <div key={key}>
              <div className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary mb-2">
                {label}
                {subtotal > 0 && ` — ${formatCurrency(subtotal, currency)}`}
              </div>
              <div className="space-y-1">
                {key === 'flights' && flightsTotal > 0 && (
                  <div className="flex justify-between items-center py-1.5 text-sm">
                    <span className="text-lp-text-secondary">Flights (this day)</span>
                    <span className="font-medium text-lp-text">
                      {formatCurrency(flightsTotal, currency)}
                    </span>
                  </div>
                )}
                {key === 'hotels' && hotelsTotal > 0 && (
                  <div className="flex justify-between items-center py-1.5 text-sm">
                    <span className="text-lp-text-secondary">Hotel (this day)</span>
                    <span className="font-medium text-lp-text">
                      {formatCurrency(hotelsTotal, currency)}
                    </span>
                  </div>
                )}
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center py-1.5 text-sm group"
                  >
                    <span className="min-w-0 flex-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openLineItem(item.id)}
                        className="p-0.5 text-lp-text-secondary hover:text-lp-orange shrink-0"
                        aria-label="Open detail"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openLineItem(item.id)}
                        className="text-lp-text truncate text-left hover:underline"
                      >
                        {item.label}
                      </button>
                    </span>
                    <span className="shrink-0 flex items-center gap-1">
                      {editingId === item.id ? (
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={Number(item.actual_cost) || Number(item.proposed_cost) || 0}
                          autoFocus
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!Number.isNaN(v)) handlePatch(item.id, { proposed_cost: v });
                            setEditingId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="w-20 rounded border border-lp-border bg-lp-surface px-1 py-0.5 text-right text-sm"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingId(item.id)}
                            className="font-medium text-lp-text hover:bg-lp-orange/10 rounded px-1 -mx-1"
                          >
                            {formatCurrency(
                              Number(item.actual_cost) || Number(item.proposed_cost) || 0,
                              currency
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-lp-text-secondary hover:text-lp-error text-xs px-1"
                            aria-label="Delete"
                          >
                            ×
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
      )}

      <div className="pt-2 border-t border-lp-border/50 text-sm font-semibold text-lp-text">
        DAY TOTAL: {formatCurrency(dayExpenses, currency)}
      </div>
    </div>
  );
}

function AddLineItemForm({
  onSave,
  onCancel,
  currency,
}: {
  onSave: (label: string, category: string, proposed_cost: number) => void;
  onCancel: () => void;
  currency: string;
}) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<BudgetCategory>('prod_misc');
  const [cost, setCost] = useState('');

  const categories: BudgetCategory[] = [
    'prod_misc',
    'hotels',
    'flights',
    'transport_bus',
    'transport_taxis',
    'transport_fuel',
    'prod_audio',
    'prod_lighting',
    'prod_misc',
  ];

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-lp-border/50 bg-lp-surface/50 p-2">
      <input
        type="text"
        placeholder="Description"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="min-w-[120px] rounded border border-lp-border bg-lp-surface px-2 py-1 text-sm"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as BudgetCategory)}
        className="rounded border border-lp-border bg-lp-surface px-2 py-1 text-sm"
      >
        {categories.map((c) => (
          <option key={c} value={c}>
            {c.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
      <input
        type="number"
        step="0.01"
        placeholder="0"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        className="w-20 rounded border border-lp-border bg-lp-surface px-2 py-1 text-sm text-right"
      />
      <span className="text-sm text-lp-text-secondary">{currency}</span>
      <button
        type="button"
        onClick={() => onSave(label, category, parseFloat(cost) || 0)}
        className="text-lp-orange text-sm font-semibold hover:underline"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-lp-text-secondary hover:text-lp-text"
      >
        Cancel
      </button>
    </div>
  );
}
