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

import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Grid, type GridHandle } from '@/components/grid/Grid';
import type { Column, GridFx, Row, Section } from '@/components/grid/types';
import { convertToCurrency } from '@/lib/budget/fx';
import { toIncomeRows, type IncomeRow } from '@/lib/budget/income';
import { labelForDayType } from '@/lib/routing/dayType';
import { useToast } from '@/components/ui/Toast';
import { VersionLockModal } from '@/components/budget/versioning/VersionLockModal';
import type { VersionStatus, BudgetVersionVm } from '@/components/budget/versioning/versionApi';

// State-fix B1 — the editable PROPOSED columns (projected view). When the viewed
// version is locked these fire the Unlock/New-version modal on an edit attempt
// (via the Grid's versionLockedCols). The Actual view passes [] so actuals never
// lock (settled figures stay editable on any version).
const INCOME_PROPOSED_COLS = [
  'currency', 'cap', 'sellthru', 'face', 'deal', 'dealpct', 'dealthr', 'dealabove',
  'guarantee', 'wh', 'overage', 'perhead', 'feepct', 'merch', 'viptix', 'vipprice', 'vip',
];

const CUR_SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$', JPY: '¥' };
const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY'];
// #4 — the per-show currency picker offers a STANDARD list (not just rates that
// already exist), so you can set a EUR show before any FX rate is configured. A
// currency with no rate converts 1:1 (Phase-2 toTourCurrency) + nudges to Settings.
const STD_CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'NZD', 'MXN'];
// Phase 3 — deal types. VS auto-projects overage; PLUS is manual; FLAT = no backend.
const DEAL_TYPES = ['VS', 'PLUS', 'FLAT'];
// Editing any of these projection inputs re-runs the engine server-side; we patch
// the materialised overage / merch / VIP back in place (no remount → no cursor jump).
const PROJECTION_INPUT_COLS = new Set([
  'cap', 'sellthru', 'face', 'deal', 'dealpct', 'dealthr', 'dealabove',
  'perhead', 'feepct', 'viptix', 'vipprice', 'guarantee', 'wh',
]);
// #2 — projected OUTPUT cells the engine materialises (vs hand-entered inputs);
// their headers carry a small ƒ + "computed" tooltip.
const PROJECTED_OUTPUT_COLS = new Set(['overage', 'merch', 'vip']);
// #5 — plain-English header tooltips: what each projection input feeds.
const HEADER_TIP: Record<string, string> = {
  currency: 'The show’s native currency. Converted to the tour currency in the P&L.',
  cap: 'Venue capacity (tickets available).',
  sellthru: 'Estimated % of capacity sold. Blank → tour default (Settings).',
  face: 'Ticket face value, in the show’s currency.',
  deal: 'Deal type. VS auto-projects overage; PLUS is manual; FLAT has no backend.',
  dealpct: 'Base deal percentage of net box office.',
  dealthr: 'Tiered VS: ticket count above which the higher rate applies.',
  dealabove: 'Tiered VS: the escalated rate on tickets above the threshold.',
  wh: 'Withholding tax %. Applied to guarantee + overage in the P&L.',
  posttax: 'Guarantee after withholding (pre_tax × (1 − WH%)). Computed.',
  overage: 'Projected for VS deals from the inputs (editable). Pre-withholding.',
  perhead: 'Net merch spend per head. Blank → tour default (Settings).',
  feepct: 'Average merch fee %. Blank → tour default (Settings).',
  merch: 'Cap × Sell-thru × $/head × Fee%. Computed (editable).',
  viptix: 'Number of VIP tickets.',
  vipprice: 'VIP ticket price, in the show’s currency.',
  vip: 'VIP tickets × price. Computed (editable).',
  guarantee: 'Pre-tax guaranteed fee for the show.',
};

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
  lockedVersionId = null,
  canApprove = false,
  viewedStatus = 'draft',
  draftVersionId = null,
  versions = [],
  fxRates = {},
}: {
  tourId: string;
  tourCurrency: string;
  initialRows: IncomeRow[];
  /** B2 — viewed version is non-draft → projected (proposed) income cells lock. */
  versionLocked?: boolean;
  /** State-fix B1 — the viewed version + its status, for the lock modal (parity
   *  with Expenses: edit a locked proposed cell → the modal, not a toast). */
  lockedVersionId?: string | null;
  canApprove?: boolean;
  viewedStatus?: VersionStatus;
  /** The editable draft head (for "switch to draft" on a historical version). */
  draftVersionId?: string | null;
  /** B2 — the full version list, for the historical lock modal's rollback path. */
  versions?: BudgetVersionVm[];
  /** Phase 2 — per-tour FX map; its keys are the selectable foreign currencies. */
  fxRates?: Record<string, number>;
}) {
  const { showToast } = useToast();
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const searchParams = useSearchParams();
  const native = (tourCurrency || 'GBP').toUpperCase();
  // #4 — the picker offers the tour currency + a standard ISO list + any currency
  // that already has an FX rate. No more chicken-and-egg "only GBP" when the tour
  // has no rates configured.
  const currencyOptions = useMemo(
    () => Array.from(new Set([native, ...STD_CURRENCIES, ...Object.keys(fxRates)])),
    [native, fxRates],
  );
  // #3 — imperative handle so engine-materialised cells update in place (no remount).
  const gridRef = useRef<GridHandle | null>(null);
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
      let patch: Partial<IncomeRow> | null;
      if (columnId === 'currency') {
        const picked = String(value).toUpperCase();
        const newCur = picked === native ? null : picked;
        // #4 — frictionless: a currency with no rate yet converts 1:1; nudge to Settings.
        if (newCur && fxRates[newCur] === undefined) {
          showToast(`${newCur} has no FX rate — converting 1:1. Add one in Settings → FX rates.`);
        }
        patch = { currency: newCur };
      } else if (columnId === 'deal') {
        patch = { deal_type: String(value).toUpperCase() || null };
      } else {
        patch = patchFor(columnId, num(value));
      }
      if (!patch) return; // show / posttax / total — not persisted
      setRows((prev) => prev?.map((r) => (r.routing_id === routingId ? { ...r, ...patch } : r)) ?? prev);
      void fetch('/api/budget/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routing_id: routingId, ...patch }),
      })
        .then(async (res) => {
          if (res.status === 423) {
            // Backstop — a locked proposed edit normally fires the modal on the
            // edit ATTEMPT (Grid versionLockedCols → onLockedEdit) before this
            // POST; if one slips through, show the modal too, not a toast.
            setLockModalOpen(true);
            void load();
          } else if (!res.ok) {
            showToast('Could not save income', 'error');
            void load();
          } else if (PROJECTION_INPUT_COLS.has(columnId)) {
            // #3 — patch the engine-materialised overage / merch / VIP back in
            // place (imperative, by routing_id) so they update with NO cursor
            // jump or full-grid flash. The Grid is ref-sourced post-mount.
            const updated = (await res.json().catch(() => null)) as Record<string, unknown> | null;
            if (updated) {
              const overage = num(updated.pre_tax_overage);
              const merch = num(updated.merch_income);
              const vip = num(updated.vip_income);
              gridRef.current?.updateRowCells(routingId, { overage, merch, vip });
              // keep React state coherent for the next legitimate remount (view switch).
              setRows((prev) => prev?.map((r) => (r.routing_id === routingId
                ? { ...r, pre_tax_overage: overage, merch_income: merch, vip_income: vip }
                : r)) ?? prev);
            }
          }
        })
        .catch(() => {
          showToast('Could not save income', 'error');
          void load();
        });
    },
    [patchFor, showToast, load, native, fxRates],
  );

  const columns: Column[] = useMemo(() => {
    const idx: Column = { id: 'idx', label: '#', type: 'idx', w: 46, min: 40, resize: false };
    // INC-01 — read-only routing context (mirrors the matrices' day headers).
    const routingCols: Column[] = [
      { id: 'date', label: 'Date', type: 'text', ro: true, w: 74, min: 60, resize: true },
      { id: 'daytype', label: 'Type', type: 'text', ro: true, w: 80, min: 58, resize: true },
      { id: 'venue', label: 'Venue', type: 'text', ro: true, w: 188, min: 124, resize: true },
      { id: 'city', label: 'City', type: 'text', ro: true, w: 128, min: 90, resize: true },
    ];
    // #1 — per-show currency is the FIRST editable column, right after the frozen
    // routing reference block. State-fix B1 — the version-lock is applied by the
    // Grid (versionLockedCols, PROJECTED view only) so a locked proposed edit fires
    // the modal; in the Actual view currency is the live settlement ccy → editable.
    const currency: Column = { id: 'currency', label: 'Currency', type: 'dropdown', options: currencyOptions, w: 96, min: 76, resize: true };
    const money = (id: string, label: string): Column => ({ id, label, type: 'money', w: 120, min: 90, resize: true });
    if (view === 'projected') {
      // B2/state-fix — proposed cells are normal columns; the Grid locks them
      // (versionLockedCols) when the viewed version is non-draft → the modal fires
      // on an edit attempt. The Actual view (below) never locks.
      const pMoney = money;
      // Phase 3 — projection INPUT cell (number).
      const pNum = (id: string, label: string, w = 72, min = 56): Column =>
        ({ id, label, type: 'number', w, min, resize: true });
      return [
        idx,
        ...routingCols,
        currency,
        // ── box-office inputs ──
        pNum('cap', 'Cap'),
        pNum('sellthru', 'Sell %'),
        pMoney('face', 'Face'),
        // ── deal (VS auto-projects overage; PLUS manual; FLAT none) ──
        { id: 'deal', label: 'Deal type', type: 'dropdown', options: DEAL_TYPES, w: 92, min: 72, resize: true },
        pNum('dealpct', 'Deal %', 78, 60),
        pNum('dealthr', 'Tier @ (tix)', 98, 74),
        pNum('dealabove', 'Tier rate %', 96, 74),
        // ── guarantee block ──
        pMoney('guarantee', 'Guarantee'),
        pNum('wh', 'Withhold %', 96, 76),
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
      currency,
      money('guarantee', 'Guarantee'),
      money('overage', 'Overage'),
      money('merch', 'Merch'),
      money('vip', 'VIP'),
      // Phase 1 — settlement-fed deductions (read-only; reduces the actual total).
      { id: 'deductions', label: 'Deductions', type: 'money', w: 120, min: 90, resize: true, ro: true },
      // Actuals total IS net (guarantee + overage + merch + vip − deductions) —
      // labelled "Net" to match settlement's reconciled_net. Projected stays "Total".
      { id: 'total', label: 'Net', type: 'calc', w: 130, min: 100, resize: true, calc: (r: Row) => num(r.guarantee) + num(r.overage) + num(r.merch) + num(r.vip) - num(r.deductions) },
    ];
  }, [view, currencyOptions]);

  // State-fix B1 — the version-lock applies to the PROPOSED columns in the
  // PROJECTED view only; the Actual view passes [] so settled actuals never lock.
  const versionLockedCols = useMemo(
    () => (view === 'projected' ? INCOME_PROPOSED_COLS : []),
    [view],
  );

  // #5 — human-readable header tooltips; #2 — a small ƒ on engine-materialised
  // outputs (overage/merch/VIP) so it's clear they're computed-but-editable.
  const labelById = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, c.label])) as Record<string, string>,
    [columns],
  );
  const headerFor = useCallback(
    (colId: string) => {
      const label = labelById[colId] ?? colId;
      const tip = HEADER_TIP[colId];
      const computed = view === 'projected' && PROJECTED_OUTPUT_COLS.has(colId);
      return (
        <span title={tip} style={tip ? { cursor: 'help' } : undefined}>
          {label}
          {computed ? (
            <span aria-hidden style={{ marginLeft: 3, color: 'var(--lp-orange)', fontWeight: 700, fontStyle: 'italic' }}>
              ƒ
            </span>
          ) : null}
        </span>
      );
    },
    [labelById, view],
  );

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

  // #2 — make the active view unmistakable: a one-line context cue + a per-view
  // accent so a glance tells you whether you're looking at forecast or settled
  // numbers. Projected = orange (forecast); Actual = green (settled/real).
  const isProjected = view === 'projected';
  const viewAccent = isProjected ? 'var(--lp-orange)' : 'var(--color-lp-status-complete)';
  const viewCue = isProjected
    ? 'Projected — forecast from the deal inputs (VS overage, merch & VIP are computed, marked ƒ).'
    : 'Actual — settled figures from reconciliation; deductions reduce the net.';

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* #2 — loud Projected / Actual toggle + context cue */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div
          role="tablist"
          aria-label="Income view"
          style={{ display: 'inline-flex', gap: 2, border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-full)', padding: 3, background: 'var(--lp-panel)' }}
        >
          {(['projected', 'actual'] as const).map((v) => {
            const on = view === v;
            const accent = v === 'projected' ? 'var(--lp-orange)' : 'var(--color-lp-status-complete)';
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setView(v)}
                style={{
                  border: 0, cursor: 'pointer', borderRadius: 'var(--lp-radius-full)', padding: '6px 18px',
                  fontSize: 13, fontWeight: 700, textTransform: 'capitalize',
                  background: on ? accent : 'transparent',
                  color: on ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)',
                  boxShadow: on ? 'var(--lp-shadow-sm)' : 'none',
                  transition: 'background 0.16s ease, color 0.16s ease',
                }}
              >
                {v}
              </button>
            );
          })}
        </div>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 'var(--lp-radius-md)',
            padding: '5px 12px', fontSize: 'var(--lp-text-xs)', fontWeight: 500,
            color: 'var(--lp-text-secondary)',
            background: `color-mix(in srgb, ${viewAccent} 9%, transparent)`,
            border: `1px solid color-mix(in srgb, ${viewAccent} 28%, transparent)`,
          }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: viewAccent }} />
          {viewCue}
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ borderRadius: 'var(--lp-radius-lg)', border: '1px solid var(--lp-border-strong)', background: 'var(--lp-bg)', color: 'var(--lp-text-tertiary)', fontSize: 13, padding: '32px 16px', textAlign: 'center' }}>
          No shows on this tour yet — add routing dates to enter income.
        </div>
      ) : (
        // #2 — subtle per-view tint: a left accent rail so the whole grid reads
        // as forecast (orange) or settled (green) at a glance.
        <div style={{ borderLeft: `3px solid ${viewAccent}`, borderRadius: 'var(--lp-radius-md)', paddingLeft: 8, background: `color-mix(in srgb, ${viewAccent} 3%, transparent)` }}>
          <Grid
            ref={gridRef}
            key={`income:${tourId}:${view}:${rows.length}:${versionLocked ? 'locked' : 'draft'}`}
            initialColumns={columns}
            initialData={data}
            fx={fx}
            onEdit={onEdit}
            headerFor={headerFor}
            referenceCols={['idx', 'date', 'daytype', 'venue', 'city']}
            versionLocked={versionLocked}
            versionLockedCols={versionLockedCols}
            onLockedEdit={() => setLockModalOpen(true)}
            allowAddRows={false}
            fillHandle
          />
        </div>
      )}

      {/* State-fix B1 — parity with Expenses: a locked proposed-income edit raises
          the Unlock/New-version modal (status-aware), not a bottom toast. */}
      <VersionLockModal
        open={lockModalOpen}
        versionId={lockedVersionId}
        canApprove={canApprove}
        tourId={tourId}
        viewedStatus={viewedStatus}
        draftVersionId={draftVersionId}
        versions={versions}
        onClose={() => setLockModalOpen(false)}
      />
    </section>
  );
}
