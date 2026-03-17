'use client';

import { useCallback, useEffect, useState } from 'react';
import { GridTable } from './GridTable';
import { InlineEditCell } from './InlineEditCell';
import type { BudgetCommission } from '@/types';
import type { CommissionBasis } from '@/types';

const BASIS_OPTIONS: { value: CommissionBasis; label: string }[] = [
  { value: 'gross', label: 'Gross' },
  { value: 'net', label: 'Net' },
  { value: 'gross_merch', label: 'Merch Gross' },
  { value: 'net_merch', label: 'Net Merch' },
  { value: 'gross_minus_tax', label: 'Gross Minus Tax' },
];

const COLS = [
  { key: 'label', label: 'Label', width: '140px' },
  { key: 'percentage', label: 'Percentage', width: '100px', align: 'right' as const },
  { key: 'basis', label: 'Basis', width: '140px' },
  { key: 'proposed_amount', label: 'Proposed Amount', width: '120px', align: 'right' as const },
  { key: 'actual_amount', label: 'Actual Amount', width: '120px', align: 'right' as const },
  { key: 'notes', label: 'Notes', width: '180px' },
];

export function CommissionsGrid({ tourId, currency }: { tourId: string; currency: string }) {
  const [commissions, setCommissions] = useState<BudgetCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/budget/commissions?tour_id=${tourId}`);
      if (!res.ok) throw new Error('Failed to load commissions');
      const json = await res.json();
      setCommissions(json.commissions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveCommission = useCallback(async (id: string, field: string, value: string | number) => {
    const body: Record<string, unknown> = { id };
    if (field === 'percentage') body.percentage = typeof value === 'number' ? value : parseFloat(String(value));
    else body[field] = value === '' ? null : value;
    const res = await fetch('/api/budget/commissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Save failed');
    const updated = await res.json();
    setCommissions((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }, []);

  const addCommission = useCallback(async () => {
    const res = await fetch('/api/budget/commissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tour_id: tourId,
        label: 'New commission',
        percentage: 0,
        basis: 'gross',
      }),
    });
    if (!res.ok) throw new Error('Create failed');
    const created = await res.json();
    setCommissions((prev) => [...prev, created]);
  }, [tourId]);

  if (loading) return <div className="text-sm text-lp-text-secondary py-4">Loading…</div>;
  if (error) return <div className="text-sm text-lp-error py-4">{error}</div>;

  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });

  return (
    <div className="space-y-4">
      <GridTable columns={COLS}>
        {commissions.map((c) => (
          <tr key={c.id} className="even:bg-lp-surface/30">
            <td className="px-2 py-0">
              <InlineEditCell
                value={c.label}
                type="text"
                onSave={async (v) => saveCommission(c.id, 'label', String(v))}
              />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell
                value={c.percentage}
                type="percentage"
                onSave={async (v) => saveCommission(c.id, 'percentage', v)}
                align="right"
              />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell
                value={c.basis}
                type="select"
                options={BASIS_OPTIONS}
                onSave={async (v) => saveCommission(c.id, 'basis', String(v))}
              />
            </td>
            <td className="px-2 py-1 text-sm text-lp-text-secondary text-right font-[tabular-nums]">
              —
            </td>
            <td className="px-2 py-1 text-sm text-lp-text-secondary text-right font-[tabular-nums]">
              —
            </td>
            <td className="px-2 py-0">
              <InlineEditCell
                value={c.notes}
                type="text"
                onSave={async (v) => saveCommission(c.id, 'notes', String(v))}
              />
            </td>
          </tr>
        ))}
      </GridTable>
      <button
        type="button"
        onClick={addCommission}
        className="text-lp-orange text-sm font-semibold hover:underline"
      >
        + Add Commission
      </button>
    </div>
  );
}
