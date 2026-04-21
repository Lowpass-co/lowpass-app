'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { normalizeCommissionPct, formatCommissionDisplayPercentString } from '@/lib/commission-pct';

/** Math spec §7: basis options and formulas for calculated amount */
const BASIS_OPTIONS = [
  { value: 'gross', label: 'Gross Income' },
  { value: 'net', label: 'Net Income' },
  { value: 'gross_merch', label: 'Gross Merch' },
  { value: 'net_merch', label: 'Net Merch' },
  { value: 'gross_minus_tax', label: 'Gross Minus Tax' },
] as const;

type CommissionBasis = (typeof BASIS_OPTIONS)[number]['value'];

type CommissionRow = {
  id: string;
  label: string;
  percentage: number;
  basis: string;
  notes: string | null;
  order_index: number;
};

type IncomeRow = {
  post_tax_guarantee: number;
  post_tax_overage?: number;
  pre_tax_guarantee?: number;
  pre_tax_overage?: number;
  withholding_pct?: number;
  merch_income: number;
  vip_income: number;
  actual_guarantee: number | null;
  actual_overage: number | null;
  actual_merch: number | null;
  actual_vip: number | null;
};
type LineItemRow = { category: string; proposed_cost: number; actual_cost: number };
type PersonnelRateRow = {
  rate_type: string;
  show_rate: number;
  off_rate: number;
  rehearsal_rate?: number;
  per_diem: number;
  advance_fee: number;
};
type PayrollEntryRow = { total_fee: number; total_per_diem: number };
type FlightRow = { proposed_cost: number; actual_cost: number };
type SettingsRow = { insurance_pct: number; contingency_pct: number; accountancy_pct: number };

function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}
function n(x: number | null | undefined): number {
  return x == null ? 0 : Number(x);
}

function derivedPostTaxGuarantee(row: IncomeRow): number {
  const preTax = n(row.pre_tax_guarantee);
  const withholdingPct = n(row.withholding_pct);
  return preTax * (1 - withholdingPct / 100);
}

function derivedPostTaxOverage(row: IncomeRow): number {
  const preTax = n(row.pre_tax_overage);
  const withholdingPct = n(row.withholding_pct);
  return preTax * (1 - withholdingPct / 100);
}

/** Compute basis values and then commission amounts (math spec §7). */
function computeCommissionContext(
  incomeRows: IncomeRow[],
  lineItems: LineItemRow[],
  personnel: PersonnelRateRow[],
  payrollEntries: PayrollEntryRow[],
  flights: FlightRow[],
  settings: SettingsRow | null,
  routingShowDays: number,
  routingOffDays: number,
  routingRehearsalDays: number,
  totalDays: number
) {
  const proposedGrossIncome =
    sum(incomeRows.map((i) => {
      const postTax = i.post_tax_guarantee;
      // Income uses post-tax guarantee for projected totals; derive from pre-tax + withholding when needed.
      return postTax == null ? derivedPostTaxGuarantee(i) : n(postTax);
    })) +
    sum(incomeRows.map((i) => {
      const postTaxOverage = i.post_tax_overage;
      return postTaxOverage == null ? derivedPostTaxOverage(i) : n(postTaxOverage);
    })) +
    sum(incomeRows.map((i) => i.merch_income)) +
    sum(incomeRows.map((i) => i.vip_income));
  const actualGrossIncome =
    sum(incomeRows.map((i) => n(i.actual_guarantee))) +
    sum(incomeRows.map((i) => n(i.actual_overage))) +
    sum(incomeRows.map((i) => n(i.actual_merch))) +
    sum(incomeRows.map((i) => n(i.actual_vip)));

  const proposedSalaries = personnel.reduce((acc, p) => {
    const rateType = p.rate_type ?? 'day_rate';
    if (rateType === 'split_rate') {
      return (
        acc +
        routingShowDays * Number(p.show_rate) +
        routingOffDays * Number(p.off_rate) +
        routingRehearsalDays * Number(p.rehearsal_rate ?? 0) +
        Number(p.advance_fee ?? 0)
      );
    }
    return acc + totalDays * Number(p.off_rate) + Number(p.advance_fee ?? 0);
  }, 0);
  const actualSalaries = sum(payrollEntries.map((e) => Number(e.total_fee)));
  const proposedPerDiem = personnel.reduce((acc, p) => acc + totalDays * Number(p.per_diem ?? 0), 0);
  const actualPerDiem = sum(payrollEntries.map((e) => Number(e.total_per_diem)));

  const hotelsItems = lineItems.filter((i) => i.category === 'hotels');
  const transportItems = lineItems.filter((i) => i.category.startsWith('transport_'));
  const prodItems = lineItems.filter((i) => i.category.startsWith('prod_'));
  const proposedHotels = sum(hotelsItems.map((i) => i.proposed_cost));
  const actualHotels = sum(hotelsItems.map((i) => i.actual_cost));
  const proposedFlights = sum(flights.map((f) => f.proposed_cost));
  const actualFlights = sum(flights.map((f) => f.actual_cost));
  const proposedTransport = sum(transportItems.map((i) => i.proposed_cost));
  const actualTransport = sum(transportItems.map((i) => i.actual_cost));
  const proposedProd = sum(prodItems.map((i) => i.proposed_cost));
  const actualProd = sum(prodItems.map((i) => i.actual_cost));

  const subtotalDirectProposed =
    proposedSalaries + proposedPerDiem + proposedHotels + proposedFlights + proposedTransport + proposedProd;
  const subtotalDirectActual =
    actualSalaries + actualPerDiem + actualHotels + actualFlights + actualTransport + actualProd;

  const insurancePct = Number(settings?.insurance_pct ?? 0.03);
  const contingencyPct = Number(settings?.contingency_pct ?? 0.02);
  const accountancyPct = Number(settings?.accountancy_pct ?? 0);
  const accountancyProposed = accountancyPct * proposedGrossIncome;
  const accountancyActual = accountancyPct * actualGrossIncome;
  const insuranceProposed = insurancePct * proposedGrossIncome;
  const insuranceActual = insurancePct * actualGrossIncome;
  const contingencyProposed =
    contingencyPct * (subtotalDirectProposed + accountancyProposed + insuranceProposed);
  const contingencyActual = contingencyPct * (subtotalDirectActual + accountancyActual + insuranceActual);

  const expensesBeforeCommProposed =
    subtotalDirectProposed + accountancyProposed + insuranceProposed + contingencyProposed;
  const expensesBeforeCommActual =
    subtotalDirectActual + accountancyActual + insuranceActual + contingencyActual;

  const merchExpensesProposed = 0;
  const merchExpensesActual = 0;
  const sumMerchProposed = sum(incomeRows.map((i) => i.merch_income));
  const sumMerchActual = sum(incomeRows.map((i) => n(i.actual_merch)));
  const sumPreTaxProposed =
    sum(incomeRows.map((i) => i.pre_tax_guarantee ?? i.post_tax_guarantee)) +
    sumMerchProposed +
    sum(incomeRows.map((i) => i.vip_income));
  const sumPreTaxActual =
    sum(incomeRows.map((i) => n(i.actual_guarantee))) +
    sum(incomeRows.map((i) => n(i.actual_overage))) +
    sumMerchActual +
    sum(incomeRows.map((i) => n(i.actual_vip)));

  const basisValueProposed = (basis: string): number => {
    switch (basis) {
      case 'gross':
        return proposedGrossIncome;
      case 'net':
        return Math.max(0, proposedGrossIncome - expensesBeforeCommProposed);
      case 'gross_merch':
        return sumMerchProposed;
      case 'net_merch':
        return Math.max(0, sumMerchProposed - merchExpensesProposed);
      case 'gross_minus_tax':
        return sumPreTaxProposed;
      default:
        return proposedGrossIncome;
    }
  };
  const basisValueActual = (basis: string): number => {
    switch (basis) {
      case 'gross':
        return actualGrossIncome;
      case 'net':
        return Math.max(0, actualGrossIncome - expensesBeforeCommActual);
      case 'gross_merch':
        return sumMerchActual;
      case 'net_merch':
        return Math.max(0, sumMerchActual - merchExpensesActual);
      case 'gross_minus_tax':
        return sumPreTaxActual;
      default:
        return actualGrossIncome;
    }
  };

  const amountProposed = (pct: number, basis: string) => pct * basisValueProposed(basis);
  const amountActual = (pct: number, basis: string) => pct * basisValueActual(basis);

  return {
    amountProposed,
    amountActual,
    proposedGrossIncome,
    actualGrossIncome,
    subtotalDirectProposed,
    subtotalDirectActual,
    accountancyPct,
    insurancePct,
    contingencyPct,
    accountancyProposed,
    accountancyActual,
    insuranceProposed,
    insuranceActual,
    contingencyProposed,
    contingencyActual,
  };
}

export function CommissionsTab({ tourId }: { tourId: string }) {
  const [loading, setLoading] = useState(true);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [context, setContext] = useState<ReturnType<typeof computeCommissionContext> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Partial<CommissionRow> | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newRow, setNewRow] = useState<Partial<CommissionRow> & { label: string; percentage: number; basis: CommissionBasis }>({
    label: '',
    percentage: 0,
    basis: 'gross',
    notes: null,
  });
  const [deleteModal, setDeleteModal] = useState<{ id: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<{ insurance: number; contingency: number; accountancy: number }>({
    insurance: 3,
    contingency: 2,
    accountancy: 0,
  });
  const [savingOverheads, setSavingOverheads] = useState(false);

  const load = useCallback(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/budget/commissions?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { commissions: [] })),
      fetch(`/api/budget/settings?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/budget/income?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { income: [] })),
      fetch(`/api/tours/${tourId}/routing`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/budget/personnel-rates?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { personnel_rates: [] })),
      fetch(`/api/budget/payroll?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { entries: [] })),
      fetch(`/api/budget/line-items?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { line_items: [] })),
      fetch(`/api/budget/flights?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { flights: [] })),
    ])
      .then(
        ([commRes, settings, incomeRes, routing, personnelRes, payrollRes, lineItemsRes, flightsRes]) => {
          setCommissions(commRes?.commissions ?? []);
          const incomeRows: IncomeRow[] = incomeRes?.income ?? [];
          const routingRows = Array.isArray(routing) ? routing : [];
          const showDays = routingRows.filter((r: { day_type: string }) => r.day_type === 'show' || r.day_type === 'festival').length;
          const offDays = routingRows.filter((r: { day_type: string }) =>
            ['off', 'travel', 'press', 'radio', 'tv'].includes(r.day_type)
          ).length;
          const rehearsalDays = routingRows.filter((r: { day_type: string }) => r.day_type === 'rehearsal').length;
          const totalDays = showDays + offDays + rehearsalDays;
          const ctx = computeCommissionContext(
            incomeRows,
            lineItemsRes?.line_items ?? [],
            personnelRes?.personnel_rates ?? [],
            payrollRes?.entries ?? [],
            flightsRes?.flights ?? [],
            settings,
            showDays,
            offDays,
            rehearsalDays,
            totalDays
          );
          setContext(ctx);
          setSettingsDraft({
            insurance: Number((Number(settings?.insurance_pct ?? 0.03) * 100).toFixed(1)),
            contingency: Number((Number(settings?.contingency_pct ?? 0.02) * 100).toFixed(1)),
            accountancy: Number((Number(settings?.accountancy_pct ?? 0) * 100).toFixed(1)),
          });
        }
      )
      .catch((err) => setError(err?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => load(), [load]);

  const sortedCommissions = [...commissions].sort((a, b) => a.order_index - b.order_index);
  const totalProposed = context
    ? sum(
        sortedCommissions.map((c) =>
          context.amountProposed(normalizeCommissionPct(c.percentage), c.basis ?? 'gross')
        )
      )
    : 0;
  const totalActual = context
    ? sum(
        sortedCommissions.map((c) =>
          context.amountActual(normalizeCommissionPct(c.percentage), c.basis ?? 'gross')
        )
      )
    : 0;
  const projectedIncomeTotal = context?.proposedGrossIncome ?? 0;

  const saveStandardOverheads = async () => {
    setSavingOverheads(true);
    setError(null);
    try {
      const res = await fetch('/api/budget/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          insurance_pct: Math.max(0, Number(settingsDraft.insurance) || 0) / 100,
          contingency_pct: Math.max(0, Number(settingsDraft.contingency) || 0) / 100,
          accountancy_pct: Math.max(0, Number(settingsDraft.accountancy) || 0) / 100,
        }),
      });
      if (!res.ok) throw new Error('Failed to save standard overheads');
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to save standard overheads');
    } finally {
      setSavingOverheads(false);
    }
  };

  const createCommission = async () => {
    if (!newRow.label?.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/budget/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          label: newRow.label.trim(),
          percentage: Number(newRow.percentage) || 0,
          basis: newRow.basis ?? 'gross',
          notes: newRow.notes?.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Create failed');
      setAddingNew(false);
      setNewRow({ label: '', percentage: 0, basis: 'gross', notes: null });
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const saveCommission = async (id: string, payload: Partial<CommissionRow>) => {
    if (payload.label !== undefined && !String(payload.label).trim()) {
      setError('Label cannot be empty');
      return;
    }
    const sanitized = { ...payload };
    if (typeof sanitized.label === 'string') sanitized.label = sanitized.label.trim();
    if (sanitized.percentage !== undefined) {
      sanitized.percentage = normalizeCommissionPct(Number(sanitized.percentage));
    }
    setSaving(true);
    try {
      const res = await fetch('/api/budget/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...sanitized }),
      });
      if (!res.ok) throw new Error('Save failed');
      setEditingId(null);
      setEditRow(null);
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const deleteCommission = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/commissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Delete failed');
      setDeleteModal(null);
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  const moveCommission = (item: CommissionRow, direction: 'up' | 'down') => {
    const idx = sortedCommissions.findIndex((c) => c.id === item.id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedCommissions.length) return;
    const other = sortedCommissions[swapIdx];
    setSaving(true);
    Promise.all([
      fetch('/api/budget/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, order_index: other.order_index }),
      }),
      fetch('/api/budget/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: other.id, order_index: item.order_index }),
      }),
    ])
      .then(([r1, r2]) => {
        if (!r1.ok || !r2.ok) throw new Error('Reorder failed');
        load();
      })
      .catch((e) => setError((e as Error)?.message ?? 'Reorder failed'))
      .finally(() => setSaving(false));
  };

  function decimalFromDisplayPctInput(raw: string): number {
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return 0;
    const clamped = Math.min(100, Math.max(0, Math.round(v * 10) / 10));
    return clamped / 100;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-lp-border bg-lp-surface px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium text-lp-text-tertiary">Current Projected Income Total</span>
          <span className="tabular-nums font-semibold text-lp-text">
            {projectedIncomeTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
        <div className="border-b border-lp-border px-4 py-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest lp-table-header-text">
            Standard Overheads
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lp-border">
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Label</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text w-24">Percentage</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text w-32">Calculated (Proposed)</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text w-32">Calculated (Actual)</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const accountancyPctDraft = Math.max(0, Number(settingsDraft.accountancy) || 0) / 100;
                const insurancePctDraft = Math.max(0, Number(settingsDraft.insurance) || 0) / 100;
                const contingencyPctDraft = Math.max(0, Number(settingsDraft.contingency) || 0) / 100;
                const grossP = context?.proposedGrossIncome ?? 0;
                const grossA = context?.actualGrossIncome ?? 0;
                const directP = context?.subtotalDirectProposed ?? 0;
                const directA = context?.subtotalDirectActual ?? 0;
                const acctP = accountancyPctDraft * grossP;
                const acctA = accountancyPctDraft * grossA;
                const insP = insurancePctDraft * grossP;
                const insA = insurancePctDraft * grossA;
                const contP = contingencyPctDraft * (directP + acctP + insP);
                const contA = contingencyPctDraft * (directA + acctA + insA);
                return (
                  <>
              <tr className="border-b border-lp-border">
                <td className="p-3 text-lp-text">Accountancy</td>
                <td className="p-3 text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      className="w-16 max-w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={settingsDraft.accountancy}
                      onChange={(e) => setSettingsDraft((p) => ({ ...p, accountancy: Number(e.target.value) || 0 }))}
                    />
                    <span className="shrink-0 text-lp-text-tertiary">%</span>
                  </span>
                </td>
                <td className="p-3 text-right tabular-nums text-lp-text-secondary bg-lp-bg-tertiary/50">
                  {acctP.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                </td>
                <td className="p-3 text-right tabular-nums text-lp-text-secondary bg-lp-bg-tertiary/50">
                  {acctA.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr className="border-b border-lp-border">
                <td className="p-3 text-lp-text">Insurance</td>
                <td className="p-3 text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      className="w-16 max-w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={settingsDraft.insurance}
                      onChange={(e) => setSettingsDraft((p) => ({ ...p, insurance: Number(e.target.value) || 0 }))}
                    />
                    <span className="shrink-0 text-lp-text-tertiary">%</span>
                  </span>
                </td>
                <td className="p-3 text-right tabular-nums text-lp-text-secondary bg-lp-bg-tertiary/50">
                  {insP.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                </td>
                <td className="p-3 text-right tabular-nums text-lp-text-secondary bg-lp-bg-tertiary/50">
                  {insA.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr>
                <td className="p-3 text-lp-text">Contingency</td>
                <td className="p-3 text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      className="w-16 max-w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={settingsDraft.contingency}
                      onChange={(e) => setSettingsDraft((p) => ({ ...p, contingency: Number(e.target.value) || 0 }))}
                    />
                    <span className="shrink-0 text-lp-text-tertiary">%</span>
                  </span>
                </td>
                <td className="p-3 text-right tabular-nums text-lp-text-secondary bg-lp-bg-tertiary/50">
                  {contP.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                </td>
                <td className="p-3 text-right tabular-nums text-lp-text-secondary bg-lp-bg-tertiary/50">
                  {contA.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                </td>
              </tr>
                  </>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-start">
        <button
          type="button"
          onClick={saveStandardOverheads}
          disabled={savingOverheads}
          className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-bg-tertiary disabled:opacity-50"
        >
          {savingOverheads ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save Standard Overheads
        </button>
      </div>
      <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
        <div className="border-b border-lp-border px-4 py-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest lp-table-header-text">
            Commissions
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lp-border">
                <th className="w-16 p-2" />
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Label</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text w-24">Percentage</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Basis</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text w-32">Calculated (Proposed)</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text w-32">Calculated (Actual)</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Notes</th>
                <th className="w-28 p-3" />
              </tr>
            </thead>
            <tbody>
              {addingNew && (
                <tr className="border-b border-lp-border bg-lp-orange-subtle/30">
                  <td className="p-2" />
                  <td className="p-2">
                    <input
                      className="w-full min-w-[120px] rounded-md border border-lp-border bg-transparent px-2 py-1.5 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={newRow.label ?? ''}
                      onChange={(e) => setNewRow((r) => ({ ...r, label: e.target.value }))}
                      placeholder="e.g. Management"
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={100}
                        className="min-w-0 flex-1 max-w-[5.5rem] rounded-md border border-lp-border bg-transparent px-2 py-1.5 text-right text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                        value={formatCommissionDisplayPercentString(newRow.percentage ?? 0)}
                        onChange={(e) =>
                          setNewRow((r) => ({ ...r, percentage: decimalFromDisplayPctInput(e.target.value) }))
                        }
                        placeholder="10.0"
                      />
                      <span className="shrink-0 text-lp-text-tertiary">%</span>
                    </div>
                  </td>
                  <td className="p-2">
                    <select
                      className="w-full min-w-[140px] rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-lp-text"
                      value={newRow.basis ?? 'gross'}
                      onChange={(e) => setNewRow((r) => ({ ...r, basis: e.target.value as CommissionBasis }))}
                    >
                      {BASIS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-right tabular-nums text-lp-text-tertiary">
                    {context
                      ? context
                          .amountProposed(normalizeCommissionPct(newRow.percentage ?? 0), newRow.basis ?? 'gross')
                          .toLocaleString('en-GB', {
                          minimumFractionDigits: 2,
                        })
                      : '—'}
                  </td>
                  <td className="p-2 text-right tabular-nums text-lp-text-tertiary">
                    {context
                      ? context
                          .amountActual(normalizeCommissionPct(newRow.percentage ?? 0), newRow.basis ?? 'gross')
                          .toLocaleString('en-GB', {
                          minimumFractionDigits: 2,
                        })
                      : '—'}
                  </td>
                  <td className="p-2">
                    <input
                      className="w-full min-w-[100px] rounded-md border border-lp-border bg-transparent px-2 py-1.5 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={newRow.notes ?? ''}
                      onChange={(e) => setNewRow((r) => ({ ...r, notes: e.target.value || null }))}
                      placeholder="Notes"
                    />
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={createCommission}
                      disabled={saving || !newRow.label?.trim()}
                      className="text-lp-orange hover:underline disabled:opacity-50 text-sm"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingNew(false)}
                      className="ml-2 text-lp-text-tertiary hover:underline text-sm"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              )}
              {sortedCommissions.map((c) => {
                const isEditing = editingId === c.id;
                const row = isEditing ? (editRow ?? c) : c;
                const pct = normalizeCommissionPct(c.percentage);
                const basis = c.basis ?? 'gross';
                const proposedAmt = context ? context.amountProposed(pct, basis) : 0;
                const actualAmt = context ? context.amountActual(pct, basis) : 0;
                const idx = sortedCommissions.findIndex((x) => x.id === c.id);
                const canMoveUp = idx > 0;
                const canMoveDown = idx >= 0 && idx < sortedCommissions.length - 1;
                return (
                  <tr key={c.id} className="border-b border-lp-border">
                    <td className="p-2">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveCommission(c, 'up')}
                          disabled={saving || !canMoveUp}
                          className="rounded p-0.5 text-lp-text-tertiary hover:bg-lp-bg-tertiary disabled:opacity-30"
                          title="Move up"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCommission(c, 'down')}
                          disabled={saving || !canMoveDown}
                          className="rounded p-0.5 text-lp-text-tertiary hover:bg-lp-bg-tertiary disabled:opacity-30"
                          title="Move down"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    <td className="p-3 text-lp-text">
                      {isEditing ? (
                        <input
                          className="w-full min-w-[120px] rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                          value={row.label ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, label: e.target.value }))}
                        />
                      ) : (
                        c.label
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {isEditing ? (
                        <span className="inline-flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            max={100}
                            className="w-16 max-w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                            value={formatCommissionDisplayPercentString(Number(row.percentage) || 0)}
                            onChange={(e) =>
                              setEditRow((r) => ({
                                ...r,
                                percentage: decimalFromDisplayPctInput(e.target.value),
                              }))
                            }
                          />
                          <span className="shrink-0 text-lp-text-tertiary">%</span>
                        </span>
                      ) : (
                        <span className="tabular-nums text-lp-text">{formatCommissionDisplayPercentString(c.percentage)}%</span>
                      )}
                    </td>
                    <td className="p-3 text-lp-text-secondary">
                      {isEditing ? (
                        <select
                          className="w-full min-w-[140px] rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                          value={row.basis ?? c.basis}
                          onChange={(e) => setEditRow((r) => ({ ...r, basis: e.target.value }))}
                        >
                          {BASIS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        BASIS_OPTIONS.find((o) => o.value === basis)?.label ?? basis
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-lp-text-secondary bg-lp-bg-tertiary/50">
                      {isEditing && context && editRow
                        ? context
                            .amountProposed(
                              normalizeCommissionPct(Number(editRow.percentage) || pct),
                              editRow.basis ?? basis
                            )
                            .toLocaleString('en-GB', { minimumFractionDigits: 2 })
                        : proposedAmt.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-right tabular-nums text-lp-text-secondary bg-lp-bg-tertiary/50">
                      {isEditing && context && editRow
                        ? context
                            .amountActual(
                              normalizeCommissionPct(Number(editRow.percentage) || pct),
                              editRow.basis ?? basis
                            )
                            .toLocaleString('en-GB', { minimumFractionDigits: 2 })
                        : actualAmt.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-lp-text-tertiary max-w-[160px] truncate" title={c.notes ?? undefined}>
                      {isEditing ? (
                        <input
                          className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                          value={row.notes ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, notes: e.target.value || null }))}
                        />
                      ) : (
                        c.notes ?? '—'
                      )}
                    </td>
                    <td className="p-3">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => editRow && saveCommission(c.id, editRow)}
                            disabled={saving}
                            className="text-lp-orange hover:underline text-xs"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingId(null); setEditRow(null); }}
                            className="text-lp-text-tertiary hover:underline text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditingId(c.id); setEditRow({ ...c }); }}
                            className="rounded p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-lp-text"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteModal({ id: c.id, label: c.label })}
                            className="rounded p-1 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-bg-tertiary"
        >
          <Plus className="h-4 w-4" />
          Add Commission
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-lp-border bg-lp-surface text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-lp-border px-4 py-3 font-semibold text-lp-text">
          <span>Total Commission Amount (Proposed)</span>
          <span className="tabular-nums">
            {totalProposed.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
        <div
          className="flex flex-wrap items-baseline justify-between gap-4 px-4 py-3 font-semibold"
          style={{ background: 'rgba(255,69,0,0.06)', color: '#FF4500' }}
        >
          <span>Total Commission Amount (Actual)</span>
          <span className="tabular-nums">
            {totalActual.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      <DeleteConfirmationModal
        open={!!deleteModal}
        itemName={deleteModal?.label ?? ''}
        onClose={() => setDeleteModal(null)}
        onConfirm={async () => { if (deleteModal) await deleteCommission(deleteModal.id); }}
      />
    </div>
  );
}
