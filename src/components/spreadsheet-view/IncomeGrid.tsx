'use client';

import { useCallback, useEffect, useState } from 'react';
import { GridTable } from './GridTable';
import { InlineEditCell } from './InlineEditCell';
import { SpreadsheetCurrencyAmount } from './SpreadsheetCurrencyAmount';

interface IncomeRow {
  routing_id: string;
  date: string;
  day_type: string;
  venue_name: string | null;
  city: string;
  cap: number | null;
  pre_tax_guarantee: number;
  withholding_pct: number;
  post_tax_guarantee: number;
  pre_tax_overage: number;
  post_tax_overage: number;
  merch_income: number;
  vip_income: number;
  drop_count: number | null;
  notes: string | null;
}

function postTax(pre: number, pct: number): number {
  return pre * (1 - pct / 100);
}

function mergeIncomeWithRouting(income: unknown[], routingOnly: unknown[]): IncomeRow[] {
  const byRoutingId = new Map<string, IncomeRow>();
  for (const r of routingOnly as { id: string; date: string; venue_name?: string; city: string; day_type: string }[]) {
    byRoutingId.set(r.id, {
      routing_id: r.id,
      date: r.date ?? '',
      day_type: r.day_type ?? 'show',
      venue_name: r.venue_name ?? null,
      city: r.city ?? '',
      cap: null,
      pre_tax_guarantee: 0,
      withholding_pct: 0,
      post_tax_guarantee: 0,
      pre_tax_overage: 0,
      post_tax_overage: 0,
      merch_income: 0,
      vip_income: 0,
      drop_count: null,
      notes: null,
    });
  }
  for (const row of income as Array<{
    routing_id: string;
    routing?: { date: string; venue_name?: string; city: string; day_type: string };
    pre_tax_guarantee?: number;
    withholding_pct?: number;
    post_tax_guarantee?: number;
    pre_tax_overage?: number;
    post_tax_overage?: number;
    merch_income?: number;
    vip_income?: number;
    drop_count?: number | null;
    notes?: string | null;
  }>) {
    const r = row.routing as { date?: string; venue_name?: string; city?: string; day_type?: string } | undefined;
    byRoutingId.set(row.routing_id, {
      routing_id: row.routing_id,
      date: r?.date ?? '',
      day_type: r?.day_type ?? 'show',
      venue_name: r?.venue_name ?? null,
      city: r?.city ?? '',
      cap: null,
      pre_tax_guarantee: Number(row.pre_tax_guarantee) || 0,
      withholding_pct: Number(row.withholding_pct) || 0,
      post_tax_guarantee: Number(row.post_tax_guarantee) || 0,
      pre_tax_overage: Number(row.pre_tax_overage) || 0,
      post_tax_overage: Number(row.post_tax_overage) || 0,
      merch_income: Number(row.merch_income) || 0,
      vip_income: Number(row.vip_income) || 0,
      drop_count: row.drop_count ?? null,
      notes: row.notes ?? null,
    });
  }
  return Array.from(byRoutingId.values()).sort((a, b) => a.date.localeCompare(b.date));
}

const COLS = [
  { key: 'date', label: 'Date', width: '100px' },
  { key: 'day_type', label: 'Day Type', width: '80px' },
  { key: 'venue_name', label: 'Venue', width: '140px' },
  { key: 'city', label: 'City', width: '100px' },
  { key: 'cap', label: 'Cap', width: '70px' },
  { key: 'pre_tax_guarantee', label: 'Pre-TX Guarantee', width: '110px', align: 'right' as const },
  { key: 'withholding_pct', label: 'Withholding %', width: '90px', align: 'right' as const },
  { key: 'post_tax_guarantee', label: 'Post-TX Guarantee', width: '110px', align: 'right' as const },
  { key: 'pre_tax_overage', label: 'Pre-TX Overage', width: '100px', align: 'right' as const },
  { key: 'post_tax_overage', label: 'Post-TX Overage', width: '110px', align: 'right' as const },
  { key: 'merch_income', label: 'Merch', width: '80px', align: 'right' as const },
  { key: 'vip_income', label: 'VIP', width: '80px', align: 'right' as const },
  { key: 'drop_count', label: 'Drop Count', width: '80px', align: 'right' as const },
  { key: 'notes', label: 'Notes', width: '140px' },
];

function formatDate(d: string): string {
  if (!d) return '—';
  const date = new Date(d + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function IncomeGrid({ tourId, currency }: { tourId: string; currency: string }) {
  const [rows, setRows] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/budget/income?tour_id=${tourId}`);
      if (!res.ok) throw new Error('Failed to load income');
      const json = await res.json();
      setRows(mergeIncomeWithRouting(json.income ?? [], json.routing_only ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveField = useCallback(
    async (routingId: string, field: string, value: string | number) => {
      const row = rows.find((r) => r.routing_id === routingId);
      if (!row) return;
      const payload = {
        routing_id: routingId,
        pre_tax_guarantee: row.pre_tax_guarantee,
        withholding_pct: row.withholding_pct,
        pre_tax_overage: row.pre_tax_overage,
        merch_income: row.merch_income,
        vip_income: row.vip_income,
        drop_count: row.drop_count,
        notes: row.notes,
        [field]: value,
      };
      const res = await fetch('/api/budget/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      setRows((prev) =>
        prev.map((r) =>
          r.routing_id === routingId
            ? {
                ...r,
                ...updated,
                routing_id: r.routing_id,
                date: r.date,
                day_type: r.day_type,
                venue_name: r.venue_name,
                city: r.city,
              }
            : r
        )
      );
    },
    [rows]
  );

  if (loading) return <div className="text-sm text-lp-text-secondary py-4">Loading…</div>;
  if (error) return <div className="text-sm text-lp-error py-4">{error}</div>;

  const totals = rows.reduce(
    (acc, r) => ({
      pre_tax_guarantee: acc.pre_tax_guarantee + r.pre_tax_guarantee,
      withholding_pct: 0,
      post_tax_guarantee: acc.post_tax_guarantee + r.post_tax_guarantee,
      pre_tax_overage: acc.pre_tax_overage + r.pre_tax_overage,
      post_tax_overage: acc.post_tax_overage + r.post_tax_overage,
      merch_income: acc.merch_income + r.merch_income,
      vip_income: acc.vip_income + r.vip_income,
      drop_count: null as number | null,
    }),
    { pre_tax_guarantee: 0, post_tax_guarantee: 0, pre_tax_overage: 0, post_tax_overage: 0, merch_income: 0, vip_income: 0 }
  );

  return (
    <GridTable
      columns={COLS}
      footer={
        <>
          <td colSpan={5} className="px-2 py-2 text-lp-text font-bold">
            TOTALS
          </td>
          <td className="px-2 py-2">
            <SpreadsheetCurrencyAmount amount={totals.pre_tax_guarantee} currency={currency} />
          </td>
          <td className="px-2 py-2 text-right">—</td>
          <td className="px-2 py-2">
            <SpreadsheetCurrencyAmount amount={totals.post_tax_guarantee} currency={currency} />
          </td>
          <td className="px-2 py-2">
            <SpreadsheetCurrencyAmount amount={totals.pre_tax_overage} currency={currency} />
          </td>
          <td className="px-2 py-2">
            <SpreadsheetCurrencyAmount amount={totals.post_tax_overage} currency={currency} />
          </td>
          <td className="px-2 py-2">
            <SpreadsheetCurrencyAmount amount={totals.merch_income} currency={currency} />
          </td>
          <td className="px-2 py-2">
            <SpreadsheetCurrencyAmount amount={totals.vip_income} currency={currency} />
          </td>
          <td className="px-2 py-2 text-right">—</td>
          <td className="px-2 py-2">—</td>
        </>
      }
    >
      {rows.map((row, idx) => (
        <tr key={row.routing_id}>
          <td className="px-2 py-1 text-sm text-lp-text-secondary">{formatDate(row.date)}</td>
          <td className="px-2 py-1 text-sm text-lp-text-secondary uppercase">{row.day_type}</td>
          <td className="px-2 py-1 text-sm text-lp-text-secondary">{row.venue_name ?? '—'}</td>
          <td className="px-2 py-1 text-sm text-lp-text-secondary">{row.city}</td>
          <td className="px-2 py-1 text-sm text-lp-text-secondary text-right">—</td>
          <td className="px-2 py-0">
            <InlineEditCell
              value={row.pre_tax_guarantee}
              type="currency"
              currency={currency}
              onSave={async (v) => saveField(row.routing_id, 'pre_tax_guarantee', v)}
              align="right"
            />
          </td>
          <td className="px-2 py-0">
            <InlineEditCell
              value={row.withholding_pct}
              type="percentage"
              onSave={async (v) => saveField(row.routing_id, 'withholding_pct', v)}
              align="right"
            />
          </td>
          <td className="px-2 py-1 text-sm text-lp-text-secondary">
            {row.post_tax_guarantee === 0 && row.pre_tax_guarantee === 0 ? (
              '—'
            ) : (
              <SpreadsheetCurrencyAmount amount={postTax(row.pre_tax_guarantee, row.withholding_pct)} currency={currency} />
            )}
          </td>
          <td className="px-2 py-0">
            <InlineEditCell
              value={row.pre_tax_overage}
              type="currency"
              currency={currency}
              onSave={async (v) => saveField(row.routing_id, 'pre_tax_overage', v)}
              align="right"
            />
          </td>
          <td className="px-2 py-1 text-sm text-lp-text-secondary">
            {row.pre_tax_overage === 0 ? (
              '—'
            ) : (
              <SpreadsheetCurrencyAmount amount={postTax(row.pre_tax_overage, row.withholding_pct)} currency={currency} />
            )}
          </td>
          <td className="px-2 py-0">
            <InlineEditCell
              value={row.merch_income}
              type="currency"
              currency={currency}
              onSave={async (v) => saveField(row.routing_id, 'merch_income', v)}
              align="right"
            />
          </td>
          <td className="px-2 py-0">
            <InlineEditCell
              value={row.vip_income}
              type="currency"
              currency={currency}
              onSave={async (v) => saveField(row.routing_id, 'vip_income', v)}
              align="right"
            />
          </td>
          <td className="px-2 py-0">
            <InlineEditCell
              value={row.drop_count}
              type="number"
              onSave={async (v) => saveField(row.routing_id, 'drop_count', typeof v === 'number' ? v : parseFloat(String(v)))}
              align="right"
            />
          </td>
          <td className="px-2 py-0">
            <InlineEditCell
              value={row.notes}
              type="text"
              onSave={async (v) => saveField(row.routing_id, 'notes', String(v))}
            />
          </td>
        </tr>
      ))}
    </GridTable>
  );
}
