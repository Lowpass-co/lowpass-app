'use client';

/* ============================================
   LOWPASS — <BudgetIncomeGrid> (Income on the canonical <Grid>)

   Migrates the bespoke BudgetIncomeTab onto the same <Grid> as Expenses.
   Rows = the tour's shows (routing-anchored — populated from the GET's
   income + routing_only merge; NO add/delete → allowAddRows={false}). A
   segmented Projected/Actual toggle swaps the column set (re-key by view).

   THE BRIDGE (must not move): the income field names, the
   post_tax = pre_tax × (1 − wh/100) rule, and the /api/budget/income upsert
   stay identical — so computeBudgetPnl's income_gross is unchanged. This file
   only changes how the cells render. (BUD-50..54.)
   ============================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Grid } from '@/components/grid/Grid';
import type { Column, GridFx, Row, Section } from '@/components/grid/types';
import { convertToCurrency } from '@/lib/budget/fx';
import { useToast } from '@/components/ui/Toast';

const CUR_SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$', JPY: '¥' };
const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY'];

interface IncomeRow {
  routing_id: string;
  date: string | null;
  venue_name: string | null;
  city: string | null;
  pre_tax_guarantee: number;
  withholding_pct: number;
  pre_tax_overage: number;
  merch_income: number;
  vip_income: number;
  actual_guarantee: number;
  actual_overage: number;
  actual_merch: number;
  actual_vip: number;
}
type ServerIncome = Partial<IncomeRow> & {
  routing_id: string;
  routing?: { date?: string; venue_name?: string; city?: string } | null;
};
type RoutingOnly = { id: string; date?: string | null; venue_name?: string | null; city?: string | null };

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const postTax = (pre: number, wh: number) => pre * (1 - clamp(wh, 0, 100) / 100);
const showLabel = (r: IncomeRow) =>
  `${r.date ? r.date.slice(5) + ' · ' : ''}${r.venue_name || r.city || 'Show'}`;

export function BudgetIncomeGrid({ tourId, tourCurrency }: { tourId: string; tourCurrency: string }) {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const native = (tourCurrency || 'GBP').toUpperCase();
  const display = (searchParams.get('display') ?? native).toUpperCase();
  const [rows, setRows] = useState<IncomeRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<'projected' | 'actual'>('projected');

  const fx: GridFx = useMemo(
    () => ({
      displayCurrency: display,
      currencies: CURRENCIES,
      toDisplay: (amount, from) => convertToCurrency(amount, (from || native).toUpperCase(), display),
      symbol: (c) => CUR_SYMBOL[(c || display).toUpperCase()] ?? `${(c || display).toUpperCase()} `,
      formatDisplay: (amount) => (CUR_SYMBOL[display] ?? `${display} `) + Math.round(num(amount)).toLocaleString('en-US'),
    }),
    [display, native],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/budget/income?tour_id=${encodeURIComponent(tourId)}`);
      if (!res.ok) throw new Error(`Failed to load income (${res.status})`);
      const body = (await res.json()) as { income?: ServerIncome[]; routing_only?: RoutingOnly[] };
      const fromIncome: IncomeRow[] = (body.income ?? []).map((i) => ({
        routing_id: i.routing_id,
        date: i.routing?.date ?? null,
        venue_name: i.routing?.venue_name ?? null,
        city: i.routing?.city ?? null,
        pre_tax_guarantee: num(i.pre_tax_guarantee),
        withholding_pct: num(i.withholding_pct),
        pre_tax_overage: num(i.pre_tax_overage),
        merch_income: num(i.merch_income),
        vip_income: num(i.vip_income),
        actual_guarantee: num(i.actual_guarantee),
        actual_overage: num(i.actual_overage),
        actual_merch: num(i.actual_merch),
        actual_vip: num(i.actual_vip),
      }));
      const fromRouting: IncomeRow[] = (body.routing_only ?? []).map((r) => ({
        routing_id: r.id,
        date: r.date ?? null,
        venue_name: r.venue_name ?? null,
        city: r.city ?? null,
        pre_tax_guarantee: 0,
        withholding_pct: 0,
        pre_tax_overage: 0,
        merch_income: 0,
        vip_income: 0,
        actual_guarantee: 0,
        actual_overage: 0,
        actual_merch: 0,
        actual_vip: 0,
      }));
      setRows([...fromIncome, ...fromRouting].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load income');
    }
  }, [tourId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Grid column id → income field, by view. Returns null for non-persisting
  // columns (idx/show/posttax/total). Keeps the field names byte-identical.
  const patchFor = useCallback(
    (columnId: string, value: number): Partial<IncomeRow> | null => {
      if (view === 'projected') {
        if (columnId === 'guarantee') return { pre_tax_guarantee: value };
        if (columnId === 'wh') return { withholding_pct: clamp(value, 0, 100) };
        if (columnId === 'overage') return { pre_tax_overage: value };
        if (columnId === 'merch') return { merch_income: value };
        if (columnId === 'vip') return { vip_income: value };
        return null;
      }
      if (columnId === 'guarantee') return { actual_guarantee: value };
      if (columnId === 'overage') return { actual_overage: value };
      if (columnId === 'merch') return { actual_merch: value };
      if (columnId === 'vip') return { actual_vip: value };
      return null;
    },
    [view],
  );

  const onEdit = useCallback(
    (routingId: string, columnId: string, value: unknown) => {
      const patch = patchFor(columnId, num(value));
      if (!patch) return; // show / posttax / total — not persisted
      setRows((prev) => prev?.map((r) => (r.routing_id === routingId ? { ...r, ...patch } : r)) ?? prev);
      void fetch('/api/budget/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routing_id: routingId, ...patch }),
      })
        .then((res) => {
          if (!res.ok) {
            showToast('Could not save income', 'error');
            void load();
          }
        })
        .catch(() => {
          showToast('Could not save income', 'error');
          void load();
        });
    },
    [patchFor, showToast, load],
  );

  const columns: Column[] = useMemo(() => {
    const idx: Column = { id: 'idx', label: '#', type: 'idx', w: 46, min: 40, resize: false };
    const show: Column = { id: 'show', label: 'Show', type: 'text', ro: true, w: 240, min: 150, resize: true };
    const money = (id: string, label: string): Column => ({ id, label, type: 'money', w: 120, min: 90, resize: true });
    if (view === 'projected') {
      return [
        idx,
        show,
        money('guarantee', 'Guarantee'),
        { id: 'wh', label: 'WH %', type: 'number', w: 80, min: 60, resize: true },
        { id: 'posttax', label: 'Post-tax', type: 'calc', w: 120, min: 90, resize: true, calc: (r: Row) => postTax(num(r.guarantee), num(r.wh)) },
        money('overage', 'Overage'),
        money('merch', 'Merch'),
        money('vip', 'VIP'),
        {
          id: 'total',
          label: 'Total',
          type: 'calc',
          w: 130,
          min: 100,
          resize: true,
          calc: (r: Row) => postTax(num(r.guarantee), num(r.wh)) + postTax(num(r.overage), num(r.wh)) + num(r.merch) + num(r.vip),
        },
      ];
    }
    return [
      idx,
      show,
      money('guarantee', 'Guarantee'),
      money('overage', 'Overage'),
      money('merch', 'Merch'),
      money('vip', 'VIP'),
      { id: 'total', label: 'Total', type: 'calc', w: 130, min: 100, resize: true, calc: (r: Row) => num(r.guarantee) + num(r.overage) + num(r.merch) + num(r.vip) },
    ];
  }, [view]);

  const data: Section[] = useMemo(() => {
    const gridRows: Row[] = (rows ?? []).map((r) =>
      view === 'projected'
        ? { _uid: r.routing_id, cur: native, show: showLabel(r), guarantee: r.pre_tax_guarantee, wh: r.withholding_pct, overage: r.pre_tax_overage, merch: r.merch_income, vip: r.vip_income }
        : { _uid: r.routing_id, cur: native, show: showLabel(r), guarantee: r.actual_guarantee, overage: r.actual_overage, merch: r.actual_merch, vip: r.actual_vip },
    );
    return [{ name: 'Shows', kind: 'normal', _uid: 'income', rows: gridRows }];
  }, [rows, view, native]);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Projected / Actual toggle */}
      <div
        role="tablist"
        aria-label="Income view"
        style={{ display: 'inline-flex', alignSelf: 'flex-start', gap: 2, border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-full)', padding: 3, background: 'var(--lp-panel)' }}
      >
        {(['projected', 'actual'] as const).map((v) => {
          const on = view === v;
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setView(v)}
              style={{ border: 0, cursor: 'pointer', borderRadius: 'var(--lp-radius-full)', padding: '5px 16px', fontSize: 13, fontWeight: 600, textTransform: 'capitalize', background: on ? 'var(--lp-orange)' : 'transparent', color: on ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)', transition: 'background 0.16s ease, color 0.16s ease' }}
            >
              {v}
            </button>
          );
        })}
      </div>

      {loadError ? (
        <div style={{ borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--color-lp-status-needs-review)', background: 'color-mix(in srgb, var(--color-lp-status-needs-review) 10%, transparent)', color: 'var(--lp-text)', fontSize: 13, padding: 12 }}>
          {loadError}
        </div>
      ) : rows === null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '40px 0', color: 'var(--lp-text-tertiary)', fontSize: 13 }}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading income…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ borderRadius: 'var(--lp-radius-lg)', border: '1px solid var(--lp-border-strong)', background: 'var(--lp-bg)', color: 'var(--lp-text-tertiary)', fontSize: 13, padding: '32px 16px', textAlign: 'center' }}>
          No shows on this tour yet — add routing dates to enter income.
        </div>
      ) : (
        <Grid
          key={`income:${tourId}:${view}:${rows.length}`}
          initialColumns={columns}
          initialData={data}
          fx={fx}
          onEdit={onEdit}
          allowAddRows={false}
        />
      )}
    </section>
  );
}
