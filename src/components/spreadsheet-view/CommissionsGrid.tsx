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

type OverheadSettings = {
  insurance_pct: number;
  contingency_pct: number;
  accountancy_pct: number;
};

type OverheadAmounts = Record<'Accountancy' | 'Insurance' | 'Contingency', { proposed: number; actual: number }>;

export function CommissionsGrid({ tourId }: { tourId: string; currency?: string }) {
  const [commissions, setCommissions] = useState<BudgetCommission[]>([]);
  const [overheadSettings, setOverheadSettings] = useState<OverheadSettings>({
    insurance_pct: 0.03,
    contingency_pct: 0.02,
    accountancy_pct: 0,
  });
  const [overheadAmounts, setOverheadAmounts] = useState<OverheadAmounts>({
    Accountancy: { proposed: 0, actual: 0 },
    Insurance: { proposed: 0, actual: 0 },
    Contingency: { proposed: 0, actual: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingOverheads, setSavingOverheads] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [commissionsRes, settingsRes, summaryRes] = await Promise.all([
        fetch(`/api/budget/commissions?tour_id=${tourId}`),
        fetch(`/api/budget/settings?tour_id=${tourId}`),
        fetch(`/api/budget/summary?tour_id=${tourId}`),
      ]);
      if (!commissionsRes.ok) throw new Error('Failed to load commissions');
      const commissionsJson = await commissionsRes.json();
      setCommissions(commissionsJson.commissions ?? []);

      if (settingsRes.ok) {
        const settingsJson = await settingsRes.json();
        setOverheadSettings({
          insurance_pct: Number(settingsJson?.insurance_pct ?? 0.03),
          contingency_pct: Number(settingsJson?.contingency_pct ?? 0.02),
          accountancy_pct: Number(settingsJson?.accountancy_pct ?? 0),
        });
      }

      if (summaryRes.ok) {
        const summaryJson = await summaryRes.json();
        const sections = Array.isArray(summaryJson?.sections) ? summaryJson.sections : [];
        const overheadSection = sections.find((s: { title?: string }) => (s?.title ?? '').toUpperCase() === 'OVERHEADS');
        const lines = Array.isArray(overheadSection?.lines) ? overheadSection.lines : [];
        const getLine = (name: string) =>
          lines.find((l: { label?: string }) => (l?.label ?? '').toUpperCase() === name.toUpperCase()) ?? { proposed: 0, actual: 0 };
        setOverheadAmounts({
          Accountancy: { proposed: Number(getLine('Accountancy').proposed ?? 0), actual: Number(getLine('Accountancy').actual ?? 0) },
          Insurance: { proposed: Number(getLine('Insurance').proposed ?? 0), actual: Number(getLine('Insurance').actual ?? 0) },
          Contingency: { proposed: Number(getLine('Contingency').proposed ?? 0), actual: Number(getLine('Contingency').actual ?? 0) },
        });
      }
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
    else if (field === 'label') {
      const t = String(value).trim();
      body.label = t || 'Commission';
    }
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

  const saveOverheadPct = useCallback(
    async (field: keyof OverheadSettings, value: number) => {
      const pct = Math.max(0, Number(value) || 0) / 100;
      const next = { ...overheadSettings, [field]: pct };
      setOverheadSettings(next);
      setSavingOverheads(true);
      try {
        const res = await fetch('/api/budget/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tour_id: tourId,
            insurance_pct: next.insurance_pct,
            contingency_pct: next.contingency_pct,
            accountancy_pct: next.accountancy_pct,
          }),
        });
        if (!res.ok) throw new Error('Failed to save standard overheads');
        await fetchData();
      } finally {
        setSavingOverheads(false);
      }
    },
    [fetchData, overheadSettings, tourId]
  );

  if (loading) return <div className="text-sm text-lp-text-secondary py-4">Loading…</div>;
  if (error) return <div className="text-sm text-lp-error py-4">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
        <div className="border-b border-lp-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
          Standard Overheads
        </div>
        <GridTable
          columns={[
            { key: 'label', label: 'Label', width: '140px' },
            { key: 'percentage', label: 'Percentage', width: '100px', align: 'right' as const },
            { key: 'proposed', label: 'Proposed Amount', width: '120px', align: 'right' as const },
            { key: 'actual', label: 'Actual Amount', width: '120px', align: 'right' as const },
          ]}
        >
          {([
            ['Accountancy', 'accountancy_pct'],
            ['Insurance', 'insurance_pct'],
            ['Contingency', 'contingency_pct'],
          ] as const).map(([label, field]) => (
            <tr key={label}>
              <td className="px-3 py-2 text-lp-text">{label}</td>
              <td className="p-0">
                <InlineEditCell
                  value={Number((overheadSettings[field] * 100).toFixed(1))}
                  type="percentage"
                  onSave={async (v) => saveOverheadPct(field, Number(v))}
                  align="right"
                />
              </td>
              <td className="px-3 py-2 text-right text-lp-text-secondary font-[tabular-nums]">
                {overheadAmounts[label].proposed.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </td>
              <td className="px-3 py-2 text-right text-lp-text-secondary font-[tabular-nums]">
                {overheadAmounts[label].actual.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </td>
            </tr>
          ))}
        </GridTable>
        {savingOverheads && (
          <div className="border-t border-lp-border px-3 py-2 text-xs text-lp-text-tertiary">Saving standard overheads…</div>
        )}
      </div>

      <div className="text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Commissions</div>
      <GridTable columns={COLS}>
        {commissions.map((c) => (
          <tr key={c.id}>
            <td className="p-0">
              <InlineEditCell
                value={c.label}
                type="text"
                onSave={async (v) => saveCommission(c.id, 'label', String(v))}
              />
            </td>
            <td className="p-0">
              <InlineEditCell
                value={c.percentage}
                type="percentage"
                onSave={async (v) => saveCommission(c.id, 'percentage', v)}
                align="right"
              />
            </td>
            <td className="p-0">
              <InlineEditCell
                value={c.basis}
                type="select"
                options={BASIS_OPTIONS}
                onSave={async (v) => saveCommission(c.id, 'basis', String(v))}
              />
            </td>
            <td className="text-right text-lp-text-secondary font-[tabular-nums]">
              —
            </td>
            <td className="text-right text-lp-text-secondary font-[tabular-nums]">
              —
            </td>
            <td className="p-0">
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
