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

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Grid } from '@/components/grid/Grid';
import type { Column, GridFx, Row, Section } from '@/components/grid/types';
import { convertToCurrency } from '@/lib/budget/fx';
import { toIncomeRows, type IncomeRow } from '@/lib/budget/income';
import { labelForDayType } from '@/lib/routing/dayType';
import { useToast } from '@/components/ui/Toast';

const CUR_SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$', JPY: '¥' };
const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY'];

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const postTax = (pre: number, wh: number) => pre * (1 - clamp(wh, 0, 100) / 100);

/** INC-01 — read-only routing-context fields (Date · Type · Venue · City),
 *  from the routing each income row already carries. Display-only. */
const routingFields = (r: IncomeRow) => ({
  date: r.date ? r.date.slice(5) : '',
  daytype: r.day_type ? labelForDayType(r.day_type) || r.day_type : '—',
  venue: r.venue_name ?? '',
  city: r.city ?? '',
});

export function BudgetIncomeGrid({
  tourId,
  tourCurrency,
  initialRows,
}: {
  tourId: string;
  tourCurrency: string;
  initialRows: IncomeRow[];
}) {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const native = (tourCurrency || 'GBP').toUpperCase();
  const display = (searchParams.get('display') ?? native).toUpperCase();
  // Prop-fed (server-fetched) → synchronous render, no client-fetch loading gate
  // that could get stuck (BUD-50). The client GET stays ONLY for the post-edit
  // failure resync below.
  const [rows, setRows] = useState<IncomeRow[]>(initialRows);
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

  // Re-fetch on a failed save only (the initial render is prop-fed). Uses the
  // shared mapping so it can't drift from the server load.
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/budget/income?tour_id=${encodeURIComponent(tourId)}`);
      if (!res.ok) return;
      setRows(toIncomeRows(await res.json()));
    } catch {
      /* leave the optimistic rows in place */
    }
  }, [tourId]);

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
    // INC-01 — read-only routing context (mirrors the matrices' day headers).
    const routingCols: Column[] = [
      { id: 'date', label: 'Date', type: 'text', ro: true, w: 72, min: 58, resize: true },
      { id: 'daytype', label: 'Type', type: 'text', ro: true, w: 78, min: 56, resize: true },
      { id: 'venue', label: 'Venue', type: 'text', ro: true, w: 168, min: 110, resize: true },
      { id: 'city', label: 'City', type: 'text', ro: true, w: 110, min: 80, resize: true },
    ];
    const money = (id: string, label: string): Column => ({ id, label, type: 'money', w: 120, min: 90, resize: true });
    if (view === 'projected') {
      return [
        idx,
        ...routingCols,
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
      ...routingCols,
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
        ? { _uid: r.routing_id, cur: native, ...routingFields(r), guarantee: r.pre_tax_guarantee, wh: r.withholding_pct, overage: r.pre_tax_overage, merch: r.merch_income, vip: r.vip_income }
        : { _uid: r.routing_id, cur: native, ...routingFields(r), guarantee: r.actual_guarantee, overage: r.actual_overage, merch: r.actual_merch, vip: r.actual_vip },
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

      {rows.length === 0 ? (
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
          fillHandle
        />
      )}
    </section>
  );
}
