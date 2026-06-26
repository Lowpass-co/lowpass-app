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
// Phase 3 — deal types. VS auto-projects overage; PLUS is manual; FLAT = no backend.
const DEAL_TYPES = ['VS', 'PLUS', 'FLAT'];
// Editing any of these projection inputs re-runs the engine server-side → reload +
// remount the grid so the materialised overage / merch / VIP appear.
const PROJECTION_INPUT_COLS = new Set([
  'cap', 'sellthru', 'face', 'deal', 'dealpct', 'dealthr', 'dealabove',
  'perhead', 'feepct', 'viptix', 'vipprice', 'guarantee', 'wh',
]);

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
  versionLocked = false,
  fxRates = {},
}: {
  tourId: string;
  tourCurrency: string;
  initialRows: IncomeRow[];
  /** B2 — approved version → projected (proposed) income columns read-only. */
  versionLocked?: boolean;
  /** Phase 2 — per-tour FX map; its keys are the selectable foreign currencies. */
  fxRates?: Record<string, number>;
}) {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const native = (tourCurrency || 'GBP').toUpperCase();
  // Phase 2 — the per-show currency options: the tour currency + any currency
  // with an FX rate. (Add more rates in budget Settings to widen the picker.)
  const currencyOptions = useMemo(() => Array.from(new Set([native, ...Object.keys(fxRates)])), [native, fxRates]);
  const display = (searchParams.get('display') ?? native).toUpperCase();
  // Prop-fed (server-fetched) → synchronous render, no client-fetch loading gate
  // that could get stuck (BUD-50). The client GET stays ONLY for the post-edit
  // failure resync below.
  const [rows, setRows] = useState<IncomeRow[]>(initialRows);
  const [view, setView] = useState<'projected' | 'actual'>('projected');
  // Phase 3 — bumped after a projection-input edit to remount the grid with the
  // engine-materialised value columns (the Grid is ref-sourced post-mount).
  const [reseed, setReseed] = useState(0);

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
        // Phase 3 — projection inputs (drive the engine; materialise the values above).
        if (columnId === 'cap') return { capacity: value };
        if (columnId === 'sellthru') return { est_sell_thru: clamp(value, 0, 100) };
        if (columnId === 'face') return { face_value: value };
        if (columnId === 'dealpct') return { deal_pct: clamp(value, 0, 100) };
        if (columnId === 'dealthr') return { deal_threshold: value };
        if (columnId === 'dealabove') return { deal_pct_above: clamp(value, 0, 100) };
        if (columnId === 'perhead') return { dollars_per_head: value };
        if (columnId === 'feepct') return { merch_fee_pct: clamp(value, 0, 100) };
        if (columnId === 'viptix') return { vip_tickets: value };
        if (columnId === 'vipprice') return { vip_price: value };
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
      // Phase 2/3 — currency + deal type are STRING dropdowns, not numbers. The
      // tour currency clears to null. Everything else routes through patchFor.
      const patch: Partial<IncomeRow> | null =
        columnId === 'currency'
          ? { currency: String(value).toUpperCase() === native ? null : String(value).toUpperCase() }
          : columnId === 'deal'
            ? { deal_type: String(value).toUpperCase() || null }
            : patchFor(columnId, num(value));
      if (!patch) return; // show / posttax / total — not persisted
      setRows((prev) => prev?.map((r) => (r.routing_id === routingId ? { ...r, ...patch } : r)) ?? prev);
      void fetch('/api/budget/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routing_id: routingId, ...patch }),
      })
        .then(async (res) => {
          if (res.status === 423) {
            showToast('This budget is approved & locked.', 'error');
            void load();
          } else if (!res.ok) {
            showToast('Could not save income', 'error');
            void load();
          } else if (PROJECTION_INPUT_COLS.has(columnId)) {
            // Pull the engine-materialised overage / merch / VIP and remount.
            await load();
            setReseed((x) => x + 1);
          }
        })
        .catch(() => {
          showToast('Could not save income', 'error');
          void load();
        });
    },
    [patchFor, showToast, load, native],
  );

  const columns: Column[] = useMemo(() => {
    const idx: Column = { id: 'idx', label: '#', type: 'idx', w: 46, min: 40, resize: false };
    // INC-01 — read-only routing context (mirrors the matrices' day headers).
    const routingCols: Column[] = [
      { id: 'date', label: 'Date', type: 'text', ro: true, w: 72, min: 58, resize: true },
      { id: 'daytype', label: 'Type', type: 'text', ro: true, w: 78, min: 56, resize: true },
      { id: 'venue', label: 'Venue', type: 'text', ro: true, w: 168, min: 110, resize: true },
      { id: 'city', label: 'City', type: 'text', ro: true, w: 110, min: 80, resize: true },
      // Phase 2 — per-show currency (proposed structure → read-only when locked).
      { id: 'currency', label: 'Ccy', type: 'dropdown', options: currencyOptions, ro: versionLocked, w: 70, min: 56, resize: true },
    ];
    const money = (id: string, label: string): Column => ({ id, label, type: 'money', w: 120, min: 90, resize: true });
    if (view === 'projected') {
      // B2 — projected (proposed) income is read-only on an approved version;
      // the ACTUALS view (below) always stays editable.
      const pMoney = (id: string, label: string): Column => ({ ...money(id, label), ro: versionLocked });
      // Phase 3 — projection INPUT cell (number; read-only when locked).
      const pNum = (id: string, label: string, w = 72, min = 56): Column =>
        ({ id, label, type: 'number', w, min, resize: true, ro: versionLocked });
      return [
        idx,
        ...routingCols,
        // ── box-office inputs ──
        pNum('cap', 'Cap'),
        pNum('sellthru', 'Sell %'),
        pMoney('face', 'Face'),
        // ── deal (VS auto-projects overage; PLUS manual; FLAT none) ──
        { id: 'deal', label: 'Deal', type: 'dropdown', options: DEAL_TYPES, ro: versionLocked, w: 74, min: 60, resize: true },
        pNum('dealpct', 'Deal %'),
        pNum('dealthr', '@ Tix', 64, 52),
        pNum('dealabove', '↑ %', 60, 50),
        // ── guarantee block ──
        pMoney('guarantee', 'Guarantee'),
        pNum('wh', 'WH %', 80, 60),
        { id: 'posttax', label: 'Post-tax', type: 'calc', w: 120, min: 90, resize: true, calc: (r: Row) => postTax(num(r.guarantee), num(r.wh)) },
        // Overage — materialised by the engine for VS; editable (override). Post-tax
        // (WH applied) flows into the Total + the P&L, mirroring the guarantee block.
        pMoney('overage', 'Overage'),
        // ── merch inputs → merch ──
        pMoney('perhead', '$/Head'),
        pNum('feepct', 'Fee %'),
        pMoney('merch', 'Merch'),
        // ── VIP inputs → VIP ──
        pNum('viptix', 'VIP Tix'),
        pMoney('vipprice', 'VIP £'),
        pMoney('vip', 'VIP'),
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
      // Phase 1 — settlement-fed deductions (read-only; reduces the actual total).
      { id: 'deductions', label: 'Deductions', type: 'money', w: 120, min: 90, resize: true, ro: true },
      { id: 'total', label: 'Total', type: 'calc', w: 130, min: 100, resize: true, calc: (r: Row) => num(r.guarantee) + num(r.overage) + num(r.merch) + num(r.vip) - num(r.deductions) },
    ];
  }, [view, versionLocked, currencyOptions]);

  const data: Section[] = useMemo(() => {
    // Phase 2 — `cur` = the row's native currency drives the money cells' source
    // display (€1000 ≈ £…); `currency` is the picker cell value.
    const gridRows: Row[] = (rows ?? []).map((r) => {
      const rowCur = r.currency || native;
      return view === 'projected'
        ? {
            _uid: r.routing_id, cur: rowCur, currency: rowCur, ...routingFields(r),
            guarantee: r.pre_tax_guarantee, wh: r.withholding_pct, overage: r.pre_tax_overage, merch: r.merch_income, vip: r.vip_income,
            // Phase 3 — projection inputs (null → blank cell, falls back to tour default).
            cap: r.capacity, sellthru: r.est_sell_thru, face: r.face_value,
            deal: r.deal_type ?? '', dealpct: r.deal_pct, dealthr: r.deal_threshold, dealabove: r.deal_pct_above,
            perhead: r.dollars_per_head, feepct: r.merch_fee_pct, viptix: r.vip_tickets, vipprice: r.vip_price,
          }
        : { _uid: r.routing_id, cur: rowCur, currency: rowCur, ...routingFields(r), guarantee: r.actual_guarantee, overage: r.actual_overage, merch: r.actual_merch, vip: r.actual_vip, deductions: r.actual_deductions };
    });
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
          key={`income:${tourId}:${view}:${rows.length}:${versionLocked ? 'locked' : 'draft'}:${reseed}`}
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
