'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GridTable } from './GridTable';
import { InlineEditCell } from './InlineEditCell';
import { computeCommissionContext, type CommissionContextIncomeRow } from '@/lib/commission-context';
import { normalizeCommissionPct } from '@/lib/commission-pct';
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

function overheadAmountsFromSummaryJson(summaryJson: { sections?: unknown }): OverheadAmounts {
  const sections = Array.isArray(summaryJson?.sections) ? summaryJson.sections : [];
  const overheadSection = sections.find((s: { title?: string }) => (s?.title ?? '').toUpperCase() === 'OVERHEADS');
  const lines = Array.isArray(overheadSection?.lines) ? overheadSection.lines : [];
  const getLine = (name: string) =>
    lines.find((l: { label?: string }) => (l?.label ?? '').toUpperCase() === name.toUpperCase()) ?? { proposed: 0, actual: 0 };
  return {
    Accountancy: { proposed: Number(getLine('Accountancy').proposed ?? 0), actual: Number(getLine('Accountancy').actual ?? 0) },
    Insurance: { proposed: Number(getLine('Insurance').proposed ?? 0), actual: Number(getLine('Insurance').actual ?? 0) },
    Contingency: { proposed: Number(getLine('Contingency').proposed ?? 0), actual: Number(getLine('Contingency').actual ?? 0) },
  };
}

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
  const [commissionContext, setCommissionContext] = useState<ReturnType<typeof computeCommissionContext> | null>(
    null
  );
  const overheadsRef = useRef(overheadSettings);
  overheadsRef.current = overheadSettings;

  const fetchData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [
        commissionsRes,
        settingsRes,
        summaryRes,
        incomeRes,
        routingRes,
        personnelRes,
        payrollRes,
        lineItemsRes,
        flightsRes,
      ] = await Promise.all([
        fetch(`/api/budget/commissions?tour_id=${tourId}`),
        fetch(`/api/budget/settings?tour_id=${tourId}`),
        fetch(`/api/budget/summary?tour_id=${tourId}`),
        fetch(`/api/budget/income?tour_id=${tourId}`),
        fetch(`/api/tours/${tourId}/routing`),
        fetch(`/api/budget/personnel-rates?tour_id=${tourId}`),
        fetch(`/api/budget/payroll?tour_id=${tourId}`),
        fetch(`/api/budget/line-items?tour_id=${tourId}`),
        fetch(`/api/budget/flights?tour_id=${tourId}`),
      ]);
      if (!commissionsRes.ok) throw new Error('Failed to load commissions');
      const [commissionsJson, settingsJson, summaryJson, incomeData, routingRows, personnelData, payrollData, lineItemsData, flightsData] =
        await Promise.all([
          commissionsRes.json(),
          settingsRes.ok ? settingsRes.json() : Promise.resolve(null),
          summaryRes.ok ? summaryRes.json() : Promise.resolve(null),
          incomeRes.ok ? incomeRes.json() : Promise.resolve({ income: [] }),
          routingRes.ok ? routingRes.json() : Promise.resolve([]),
          personnelRes.ok ? personnelRes.json() : Promise.resolve({ personnel_rates: [] }),
          payrollRes.ok ? payrollRes.json() : Promise.resolve({ entries: [] }),
          lineItemsRes.ok ? lineItemsRes.json() : Promise.resolve({ line_items: [] }),
          flightsRes.ok ? flightsRes.json() : Promise.resolve({ flights: [] }),
        ]);
      setCommissions(commissionsJson.commissions ?? []);

      if (settingsJson) {
        setOverheadSettings({
          insurance_pct: Number(settingsJson?.insurance_pct ?? 0.03),
          contingency_pct: Number(settingsJson?.contingency_pct ?? 0.02),
          accountancy_pct: Number(settingsJson?.accountancy_pct ?? 0),
        });
      }

      if (summaryJson) {
        setOverheadAmounts(overheadAmountsFromSummaryJson(summaryJson));
      }

      const routing = Array.isArray(routingRows) ? routingRows : [];
      const showDays = routing.filter(
        (r: { day_type: string }) => r.day_type === 'show' || r.day_type === 'festival'
      ).length;
      const offDays = routing.filter((r: { day_type: string }) =>
        ['off', 'travel', 'press', 'radio', 'tv'].includes(r.day_type)
      ).length;
      const rehearsalDays = routing.filter((r: { day_type: string }) => r.day_type === 'rehearsal').length;
      const totalDays = showDays + offDays + rehearsalDays;
      const incomeRows: CommissionContextIncomeRow[] = incomeData?.income ?? [];
      setCommissionContext(
        computeCommissionContext(
          incomeRows,
          lineItemsData?.line_items ?? [],
          personnelData?.personnel_rates ?? [],
          payrollData?.entries ?? [],
          flightsData?.flights ?? [],
          settingsJson
            ? {
                insurance_pct: Number(settingsJson?.insurance_pct ?? 0.03),
                contingency_pct: Number(settingsJson?.contingency_pct ?? 0.02),
                accountancy_pct: Number(settingsJson?.accountancy_pct ?? 0),
              }
            : null,
          showDays,
          offDays,
          rehearsalDays,
          totalDays
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      if (!silent) setLoading(false);
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
      // InlineEditCell with type="percentage" already converts the user's
      // typed percent (e.g. "14") into the stored fraction (0.14) on blur,
      // so we must NOT divide by 100 again here.
      const pct = Math.max(0, Number(value) || 0);
      const next = { ...overheadsRef.current, [field]: pct };
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
        await fetchData({ silent: true });
      } catch {
        await fetchData({ silent: true });
      } finally {
        setSavingOverheads(false);
      }
    },
    [fetchData, tourId]
  );

  const sortedCommissions = useMemo(
    () => [...commissions].sort((a, b) => a.order_index - b.order_index),
    [commissions]
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
              <td className="px-3 py-2 text-right text-lp-text-secondary tabular-nums">
                {overheadAmounts[label].proposed.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </td>
              <td className="px-3 py-2 text-right text-lp-text-secondary tabular-nums">
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
        {sortedCommissions.map((c) => {
          const basis = c.basis ?? 'gross';
          const pct = normalizeCommissionPct(c.percentage);
          const proposedAmt = commissionContext ? commissionContext.amountProposed(pct, basis) : null;
          const actualAmt = commissionContext ? commissionContext.amountActual(pct, basis) : null;
          return (
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
              <td className="px-3 py-2 text-right text-lp-text-secondary tabular-nums">
                {proposedAmt == null ? '—' : proposedAmt.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2 text-right text-lp-text-secondary tabular-nums">
                {actualAmt == null ? '—' : actualAmt.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </td>
              <td className="p-0">
                <InlineEditCell
                  value={c.notes}
                  type="text"
                  onSave={async (v) => saveCommission(c.id, 'notes', String(v))}
                />
              </td>
            </tr>
          );
        })}
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
