'use client';

/* ============================================
   LOWPASS — <BudgetIncomeGrid> (the LEAN income sheet, 2026-08-07)

   Adam's income ruling: the Projected/Actual TOGGLE dies. One stable grid,
   ATOM's grammar — every show row reads:

     Date · Type · Venue · City | Deal (summary) | Contracted | Settled |
     Variance  (+ AUTO/Manual provenance chip on the venue)

   The 17 deal/projection input columns moved to <IncomeDealSlideOver> (row
   open) — the sheet behaves like every other sheet: stable columns, no view
   morphing, no ambient editing of settled figures. SETTLED is walk-authored
   only (per-show Manual override lives in the slide-over as the one escape
   hatch), so the three-homes actuals refereeing can retire.

   THE BRIDGE (must not move): field names + the post_tax rule + the
   /api/budget/income upsert stay identical (saves happen in the slide-over,
   same POST). computeBudgetPnl's income_gross is untouched — this file only
   changes how rows render. Version locking still guards proposed edits (423 →
   the same VersionLockModal).
   ============================================ */

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Grid } from '@/components/grid/Grid';
import type { Column, GridFx, Row, Section } from '@/components/grid/types';
import { convertVia } from '@/lib/budget/fxRates';
import { toIncomeRows, type IncomeRow } from '@/lib/budget/income';
import { labelForDayType } from '@/lib/routing/dayType';
import { useToast } from '@/components/ui/Toast';
import { VersionLockModal } from '@/components/budget/versioning/VersionLockModal';
import type { VersionStatus, BudgetVersionVm } from '@/components/budget/versioning/versionApi';
import { IncomeDealSlideOver } from './IncomeDealSlideOver';

const CUR_SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$', JPY: '¥' };
const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY'];
const STD_CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'NZD', 'MXN'];

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const postTax = (pre: number, wh: number) => pre * (1 - clamp(wh, 0, 100) / 100);

/** Contracted = the deal's forecast total (post-tax gtd + post-tax overage +
 *  merch + VIP) — byte-identical to the old grid's projected Total calc. */
function contractedOf(r: IncomeRow): number {
  return (
    postTax(num(r.pre_tax_guarantee), num(r.withholding_pct)) +
    postTax(num(r.pre_tax_overage), num(r.withholding_pct)) +
    num(r.merch_income) +
    num(r.vip_income)
  );
}

/** Settled net (g + o + m + v − deductions) — null until anything settled. */
function settledOf(r: IncomeRow): number | null {
  const any =
    r.actual_guarantee != null || r.actual_overage != null || r.actual_merch != null ||
    r.actual_vip != null || r.actual_deductions != null;
  if (!any) return null;
  return num(r.actual_guarantee) + num(r.actual_overage) + num(r.actual_merch) + num(r.actual_vip) - num(r.actual_deductions);
}

/** One-line deal summary for the sheet ("VS 85% · 1,200 cap · £15k gtd"). */
function dealSummary(r: IncomeRow, sym: string): string {
  const bits: string[] = [];
  if (r.deal_type) bits.push(r.deal_pct != null ? `${r.deal_type} ${r.deal_pct}%` : r.deal_type);
  if (r.capacity != null) bits.push(`${r.capacity.toLocaleString('en-US')} cap`);
  if (r.pre_tax_guarantee != null) bits.push(`${sym}${Math.round(r.pre_tax_guarantee).toLocaleString('en-US')} gtd`);
  return bits.length ? bits.join(' · ') : '— set the deal';
}

/** The IncomeRow fields a server merge may update (numeric/deal fields only —
 *  routing context never merges). Keeps the merge shape explicit. */
const MERGE_FIELDS = [
  'currency', 'deal_type', 'deal_pct', 'deal_threshold', 'deal_pct_above',
  'capacity', 'est_sell_thru', 'face_value', 'pre_tax_guarantee', 'withholding_pct',
  'pre_tax_overage', 'dollars_per_head', 'merch_fee_pct', 'merch_income',
  'vip_tickets', 'vip_price', 'vip_income',
  'overage_is_override', 'merch_is_override', 'vip_is_override',
  'actual_guarantee', 'actual_overage', 'actual_merch', 'actual_vip',
  'actual_deductions', 'actual_tickets_sold', 'actual_gross', 'actual_capacity',
  'actuals_source', 'locked_fx_rate',
] as const;

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
  projectionDefaults,
}: {
  tourId: string;
  tourCurrency: string;
  initialRows: IncomeRow[];
  versionLocked?: boolean;
  lockedVersionId?: string | null;
  canApprove?: boolean;
  viewedStatus?: VersionStatus;
  draftVersionId?: string | null;
  versions?: BudgetVersionVm[];
  fxRates?: Record<string, number>;
  /** Kept for prop-compat with the page (the engine runs server-side). */
  projectionDefaults?: {
    sellThru: number | null;
    dollarsPerHead: number | null;
    merchFeePct: number | null;
    haircut?: number | null;
    taxPct?: number | null;
  };
}) {
  void projectionDefaults; // engine-side; the lean sheet doesn't recompute locally
  const { showToast } = useToast();
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [rows, setRows] = useState<IncomeRow[]>(initialRows);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const native = (tourCurrency || 'GBP').toUpperCase();
  const display = (searchParams.get('display') ?? native).toUpperCase();

  const currencyOptions = useMemo(
    () => Array.from(new Set([native, ...STD_CURRENCIES, ...Object.keys(fxRates)])),
    [native, fxRates],
  );

  const fx: GridFx = useMemo(
    () => ({
      displayCurrency: display,
      currencies: CURRENCIES,
      toDisplay: (amount, from) => convertVia(amount, (from || native).toUpperCase(), display, native, fxRates),
      symbol: (c) => CUR_SYMBOL[(c || display).toUpperCase()] ?? `${(c || display).toUpperCase()} `,
      formatDisplay: (amount) => (CUR_SYMBOL[display] ?? `${display} `) + Math.round(num(amount)).toLocaleString('en-US'),
    }),
    [display, native, fxRates],
  );

  // Post-failure resync only (initial render is prop-fed — BUD-50).
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/budget/income?tour_id=${encodeURIComponent(tourId)}`);
      if (!res.ok) return;
      setRows(toIncomeRows(await res.json()));
    } catch {
      /* keep optimistic rows */
    }
  }, [tourId]);
  void load; // reserved for slide-over error paths that want a full resync
  void showToast;

  /** The slide-over's saves come back as the server's merged row — fold the
   *  known fields into our copy so the sheet re-renders live. */
  const onRowMerged = useCallback((routingId: string, merged: Partial<IncomeRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.routing_id !== routingId) return r;
        const next = { ...r };
        for (const f of MERGE_FIELDS) {
          if (f in merged) (next as Record<string, unknown>)[f] = (merged as Record<string, unknown>)[f];
        }
        return next;
      }),
    );
  }, []);

  const columns: Column[] = useMemo(
    () => [
      { id: 'idx', label: '#', type: 'idx', w: 46, min: 40, resize: false },
      { id: 'date', label: 'Date', type: 'text', ro: true, w: 74, min: 60, resize: true },
      { id: 'daytype', label: 'Type', type: 'text', ro: true, w: 80, min: 58, resize: true },
      { id: 'venue', label: 'Venue', type: 'text', ro: true, w: 188, min: 124, resize: true },
      { id: 'city', label: 'City', type: 'text', ro: true, w: 128, min: 90, resize: true },
      // The whole deal in one glanceable read-only cell; open the row to edit.
      { id: 'deal', label: 'Deal', type: 'text', ro: true, w: 210, min: 140, resize: true },
      { id: 'contracted', label: 'Contracted', type: 'money', ro: true, w: 124, min: 96, resize: true },
      { id: 'settled', label: 'Settled', type: 'money', ro: true, w: 124, min: 96, resize: true },
      { id: 'variance', label: 'Variance', type: 'money', ro: true, w: 116, min: 90, resize: true },
    ],
    [],
  );

  const data: Section[] = useMemo(() => {
    const gridRows: Row[] = rows.map((r) => {
      const rowCur = r.currency || native;
      const sym = CUR_SYMBOL[rowCur.toUpperCase()] ?? `${rowCur.toUpperCase()} `;
      const contracted = contractedOf(r);
      const settled = settledOf(r);
      return {
        _uid: r.routing_id,
        cur: rowCur,
        date: r.date ? r.date.slice(5) : '',
        daytype: r.day_type ? labelForDayType(r.day_type) || r.day_type : '—',
        venue: r.venue_name ?? '',
        city: r.city ?? '',
        deal: dealSummary(r, sym),
        contracted,
        settled,           // null → blank "—" (not settled yet)
        variance: settled != null ? settled - contracted : null,
        // AUTO/Manual provenance + FX-lock chips (Grid renders these on chipCol).
        _provenance: r.actuals_source === 'settlement' ? 'auto' : r.actuals_source === 'manual' ? 'manual' : undefined,
        _provenanceSource: r.actuals_source === 'settlement' ? 'Settlement' : undefined,
        _fxLocked: r.locked_fx_rate != null,
      };
    });
    return [{ name: 'Shows', kind: 'normal', _uid: 'income', rows: gridRows }];
  }, [rows, native]);

  // Live FX strip — unchanged semantics (projected = live rate, settled = locked).
  const fxSummary = useMemo(() => {
    const nat = native.toUpperCase();
    const byCcy = new Map<string, { ccy: string; live: number | null; projected: number; settled: number }>();
    for (const r of rows) {
      const ccy = (r.currency || '').toUpperCase();
      if (!ccy || ccy === nat) continue;
      const e = byCcy.get(ccy) ?? { ccy, live: fxRates[ccy] ?? null, projected: 0, settled: 0 };
      if (r.locked_fx_rate != null) e.settled += 1;
      else e.projected += 1;
      byCcy.set(ccy, e);
    }
    return Array.from(byCcy.values()).sort((a, b) => a.ccy.localeCompare(b.ccy));
  }, [rows, native, fxRates]);

  const openRow = openRowId ? rows.find((r) => r.routing_id === openRowId) ?? null : null;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 'var(--lp-radius-md)',
            padding: '5px 12px', fontSize: 'var(--lp-text-xs)', fontWeight: 500,
            color: 'var(--lp-text-secondary)',
            background: 'color-mix(in srgb, var(--lp-orange) 7%, transparent)',
            border: '1px solid color-mix(in srgb, var(--lp-orange) 24%, transparent)',
          }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--lp-orange)' }} />
          Open a row to edit its deal. Settled figures come from the settlement walk (chip: Auto / Manual).
        </span>
      </div>

      {fxSummary.length > 0 ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border)', background: 'var(--lp-panel)' }}>
          <span style={{ fontSize: 'var(--lp-text-xs)', fontWeight: 700, color: 'var(--lp-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>FX</span>
          {fxSummary.map((f) => {
            const sym = CUR_SYMBOL[f.ccy] ?? `${f.ccy} `;
            const natSym = CUR_SYMBOL[native.toUpperCase()] ?? `${native.toUpperCase()} `;
            const liveLabel = f.live != null ? `1${sym}=${natSym}${f.live}` : '1:1 (no rate)';
            return (
              <span key={f.ccy} title={`${f.ccy}: ${f.projected} projected at the live rate, ${f.settled} locked at settlement`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 'var(--lp-text-xs)', padding: '3px 10px', borderRadius: 'var(--lp-radius-full)', border: '1px solid var(--lp-border)', background: 'var(--lp-surface)' }}>
                <span style={{ fontWeight: 700, color: 'var(--lp-text)' }}>{f.ccy}</span>
                {f.projected > 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-lp-error)' }}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-lp-error)' }} />
                    {f.projected} live {liveLabel}
                  </span>
                ) : null}
                {f.settled > 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-lp-info)' }}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-lp-info)' }} />
                    {f.settled} locked
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div style={{ borderRadius: 'var(--lp-radius-lg)', border: '1px solid var(--lp-border-strong)', background: 'var(--lp-bg)', color: 'var(--lp-text-tertiary)', fontSize: 13, padding: '32px 16px', textAlign: 'center' }}>
          No shows on this tour yet — add routing dates to enter income.
        </div>
      ) : (
        <Grid
          key={`income:${tourId}:${rows.length}`}
          initialColumns={columns}
          initialData={data}
          fx={fx}
          onOpenRow={(si, ri) => {
            const r = rows[ri];
            if (r) setOpenRowId(r.routing_id);
          }}
          chipCol="venue"
          referenceCols={['idx', 'date', 'daytype', 'venue', 'city']}
          columnPrefsKey={`income-cols-lean:${tourId}`}
          allowAddRows={false}
        />
      )}

      {openRow ? (
        <IncomeDealSlideOver
          tourId={tourId}
          row={openRow}
          currencyOptions={currencyOptions}
          nativeCurrency={native}
          versionLocked={versionLocked}
          onLockedEdit={() => setLockModalOpen(true)}
          onRowMerged={onRowMerged}
          onClose={() => setOpenRowId(null)}
        />
      ) : null}

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
