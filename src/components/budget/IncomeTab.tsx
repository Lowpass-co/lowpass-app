'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

/** post_tax = pre_tax × (1 - withholding_pct / 100) — math spec §1 */
function postTaxFromPreTax(preTax: number, withholdingPct: number): number {
  return preTax * (1 - withholdingPct / 100);
}

type IncomeRow = {
  id?: string;
  routing_id: string;
  pre_tax_guarantee: number;
  withholding_pct: number;
  post_tax_guarantee: number;
  pre_tax_overage: number;
  post_tax_overage: number;
  merch_income: number;
  vip_income: number;
  drop_count: number | null;
  actual_guarantee: number | null;
  actual_overage: number | null;
  actual_merch: number | null;
  actual_vip: number | null;
  notes: string | null;
  routing?: { date: string; venue_name: string; city: string; day_type: string };
};

type RoutingOnlyRow = { id: string; date: string; venue_name: string | null; city: string; day_type: string };

export function IncomeTab({ tourId }: { tourId: string }) {
  const [loading, setLoading] = useState(true);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [routingOnly, setRoutingOnly] = useState<RoutingOnlyRow[]>([]);
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<IncomeRow>>>({});
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/budget/income?tour_id=${tourId}`)
      .then((r) => (r.ok ? r.json() : { income: [], routing_only: [] }))
      .then((data) => {
        setIncomeRows(data.income ?? []);
        setRoutingOnly(data.routing_only ?? []);
      })
      .catch((err) => setError(err?.message ?? 'Failed to load income'))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => load(), [load]);

  const baseRows: Array<IncomeRow & { routing: { date: string; venue_name: string; city: string; day_type: string }; isNew?: boolean }> = [
    ...incomeRows.map((r) => ({
      ...r,
      routing: (r.routing ?? { date: '', venue_name: '', city: '', day_type: '' }) as { date: string; venue_name: string; city: string; day_type: string },
      isNew: false,
    })),
    ...routingOnly.map((r) => ({
      id: undefined,
      routing_id: r.id,
      pre_tax_guarantee: 0,
      withholding_pct: 0,
      post_tax_guarantee: 0,
      pre_tax_overage: 0,
      post_tax_overage: 0,
      merch_income: 0,
      vip_income: 0,
      drop_count: null as number | null,
      actual_guarantee: null,
      actual_overage: null,
      actual_merch: null,
      actual_vip: null,
      notes: null,
      routing: { date: r.date, venue_name: r.venue_name ?? '', city: r.city, day_type: r.day_type },
      isNew: true,
    })),
  ].sort((a, b) => a.routing.date.localeCompare(b.routing.date));

  const mergeRow = (base: IncomeRow & { routing: { date: string; venue_name: string; city: string; day_type: string }; isNew?: boolean }) => {
    const edits = localEdits[base.routing_id] ?? {};
    let merged = { ...base, ...edits } as IncomeRow & { routing: { date: string; venue_name: string; city: string; day_type: string }; isNew?: boolean };
    merged.post_tax_guarantee = postTaxFromPreTax(Number(merged.pre_tax_guarantee), Number(merged.withholding_pct));
    merged.post_tax_overage = postTaxFromPreTax(Number(merged.pre_tax_overage), Number(merged.withholding_pct));
    return merged;
  };

  const allRows = baseRows.map(mergeRow);

  const handleFieldChange = (
    routingId: string,
    field: keyof IncomeRow,
    value: number | string | null
  ) => {
    setLocalEdits((prev) => ({
      ...prev,
      [routingId]: {
        ...prev[routingId],
        [field]: value,
      },
    }));
  };

  const saveRow = (row: IncomeRow & { routing?: { date: string; venue_name: string; city: string; day_type: string }; isNew?: boolean }) => {
    setSavingId(row.routing_id);
    fetch('/api/budget/income', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_id: row.routing_id,
        pre_tax_guarantee: row.pre_tax_guarantee,
        withholding_pct: row.withholding_pct,
        pre_tax_overage: row.pre_tax_overage,
        merch_income: row.merch_income,
        vip_income: row.vip_income,
        drop_count: row.drop_count,
        notes: row.notes,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Save failed'))))
      .then(() => {
        setLocalEdits((prev) => {
          const next = { ...prev };
          delete next[row.routing_id];
          return next;
        });
        load();
      })
      .catch(() => setError('Failed to save'))
      .finally(() => setSavingId(null));
  };

  const proposedTotal =
    allRows.reduce((a, r) => a + r.post_tax_guarantee + r.merch_income + r.vip_income, 0);
  const actualTotal = allRows.reduce(
    (a, r) =>
      a +
      (r.actual_guarantee ?? 0) +
      (r.actual_overage ?? 0) +
      (r.actual_merch ?? 0) +
      (r.actual_vip ?? 0),
    0
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading income…
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
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-lp-border bg-lp-surface">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-lp-border bg-lp-bg-tertiary/50">
              <th className="px-3 py-2 text-left font-semibold text-lp-text">Date</th>
              <th className="px-3 py-2 text-left font-semibold text-lp-text">Venue</th>
              <th className="px-3 py-2 text-left font-semibold text-lp-text">City</th>
              <th className="px-3 py-2 text-left font-semibold text-lp-text">Day Type</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-28">Pre-Tax Guar.</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-20">Withhold %</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-28">Post-Tax Guar.</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-24">Pre-Tax Overage</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-24">Post-Tax Overage</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-24">Merch</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-24">VIP</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-16">Drop</th>
              <th className="px-3 py-2 text-left font-semibold text-lp-text min-w-[120px]">Notes</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((row) => (
              <tr key={row.routing_id} className="border-b border-lp-border/60 hover:bg-lp-bg-tertiary/20">
                <td className="px-3 py-2 text-lp-text">{formatDate(row.routing.date)}</td>
                <td className="px-3 py-2 text-lp-text">{row.routing.venue_name || '—'}</td>
                <td className="px-3 py-2 text-lp-text">{row.routing.city || '—'}</td>
                <td className="px-3 py-2 text-lp-text-tertiary">{row.routing.day_type || '—'}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-right text-lp-text tabular-nums"
                    value={row.pre_tax_guarantee || ''}
                    onChange={(e) =>
                      handleFieldChange(row.routing_id, 'pre_tax_guarantee', e.target.value ? Number(e.target.value) : 0)
                    }
                    onBlur={() => saveRow(row)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-right text-lp-text tabular-nums"
                    value={row.withholding_pct || ''}
                    onChange={(e) =>
                      handleFieldChange(row.routing_id, 'withholding_pct', e.target.value ? Number(e.target.value) : 0)
                    }
                    onBlur={() => saveRow(row)}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-lp-text-secondary">
                  {row.post_tax_guarantee.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={cn(
                      'w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-right tabular-nums',
                      'text-lp-text'
                    )}
                    value={row.pre_tax_overage || ''}
                    onChange={(e) =>
                      handleFieldChange(row.routing_id, 'pre_tax_overage', e.target.value ? Number(e.target.value) : 0)
                    }
                    onBlur={() => saveRow(row)}
                  />
                  <p className="text-xs text-lp-text-tertiary mt-0.5">Actual only</p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-lp-text-tertiary">
                  {row.post_tax_overage.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="block text-xs">Actual only</span>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-right text-lp-text tabular-nums"
                    value={row.merch_income || ''}
                    onChange={(e) =>
                      handleFieldChange(row.routing_id, 'merch_income', e.target.value ? Number(e.target.value) : 0)
                    }
                    onBlur={() => saveRow(row)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-right text-lp-text tabular-nums"
                    value={row.vip_income || ''}
                    onChange={(e) =>
                      handleFieldChange(row.routing_id, 'vip_income', e.target.value ? Number(e.target.value) : 0)
                    }
                    onBlur={() => saveRow(row)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-right text-lp-text tabular-nums w-14"
                    value={row.drop_count ?? ''}
                    onChange={(e) =>
                      handleFieldChange(row.routing_id, 'drop_count', e.target.value === '' ? null : Number(e.target.value))
                    }
                    onBlur={() => saveRow(row)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                    placeholder="Notes"
                    value={row.notes ?? ''}
                    onChange={(e) => handleFieldChange(row.routing_id, 'notes', e.target.value || null)}
                    onBlur={() => saveRow(row)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-lp-border bg-lp-bg-tertiary/30 font-bold">
              <td colSpan={6} className="px-3 py-3 text-lp-text">
                Proposed Totals (excl. overages)
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-lp-text">
                {proposedTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td colSpan={2} className="px-3 py-3 text-lp-text-tertiary text-xs">—</td>
              <td colSpan={4} />
            </tr>
            <tr className="border-b border-lp-border bg-lp-bg-tertiary/30 font-bold">
              <td colSpan={9} className="px-3 py-2 text-lp-text">
                Actual Totals (incl. overages)
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-lp-text" colSpan={2}>
                {actualTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-sm text-lp-text-tertiary">
        Proposed totals at the bottom exclude overages. Overages are included in Actual totals only.
      </p>
      {savingId && (
        <div className="flex items-center gap-2 text-sm text-lp-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving…
        </div>
      )}
    </div>
  );
}
