/* ============================================
   LOWPASS — Budget Income tab (Stage 3 finishing — Phase 2)

   Per-show income from the tour's routing: guarantee, withholding %,
   (computed) post-tax = pre_tax × (1 − withholding/100), overage, merch,
   VIP — Projected vs Actual via a segmented toggle. Same inline-edit +
   optimistic pattern as the expense grid: edits update local state
   instantly and POST in the background (merge-safe upsert), NO reload
   (pitfall #1). The P&L's income_gross consumes exactly these fields.

   Token-clean.
   ============================================ */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BudgetCellInput } from '@/components/budget/cells/BudgetCellInput';
import { useToast } from '@/components/ui/Toast';
import { useAppDensity } from '@/lib/density/appDensity';

interface IncomeRow {
  routing_id: string;
  date: string | null;
  venue_name: string | null;
  city: string | null;
  day_type: string | null;
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
  routing?: { date?: string; venue_name?: string; city?: string; day_type?: string } | null;
};
type RoutingOnly = {
  id: string;
  date?: string | null;
  venue_name?: string | null;
  city?: string | null;
  day_type?: string | null;
};

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function fmt(value: number, currency: string): string {
  try {
    return value.toLocaleString('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } catch {
    return `${currency} ${Math.round(value)}`;
  }
}

const postTax = (preTax: number, wh: number) => preTax * (1 - wh / 100);

export function BudgetIncomeTab({
  tourId,
  tourCurrency,
}: {
  tourId: string;
  tourCurrency: string;
}) {
  const { showToast } = useToast();
  const { density } = useAppDensity();
  const cur = (tourCurrency || 'GBP').toUpperCase();
  const [rows, setRows] = useState<IncomeRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<'projected' | 'actual'>('projected');

  const load = useMemo(
    () => async () => {
      try {
        const res = await fetch(
          `/api/budget/income?tour_id=${encodeURIComponent(tourId)}`,
        );
        if (!res.ok) throw new Error(`Failed to load income (${res.status})`);
        const body = (await res.json()) as {
          income?: ServerIncome[];
          routing_only?: RoutingOnly[];
        };
        const fromIncome: IncomeRow[] = (body.income ?? []).map((i) => ({
          routing_id: i.routing_id,
          date: i.routing?.date ?? null,
          venue_name: i.routing?.venue_name ?? null,
          city: i.routing?.city ?? null,
          day_type: i.routing?.day_type ?? null,
          pre_tax_guarantee: n(i.pre_tax_guarantee),
          withholding_pct: n(i.withholding_pct),
          pre_tax_overage: n(i.pre_tax_overage),
          merch_income: n(i.merch_income),
          vip_income: n(i.vip_income),
          actual_guarantee: n(i.actual_guarantee),
          actual_overage: n(i.actual_overage),
          actual_merch: n(i.actual_merch),
          actual_vip: n(i.actual_vip),
        }));
        const fromRouting: IncomeRow[] = (body.routing_only ?? []).map((r) => ({
          routing_id: r.id,
          date: r.date ?? null,
          venue_name: r.venue_name ?? null,
          city: r.city ?? null,
          day_type: r.day_type ?? null,
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
        const all = [...fromIncome, ...fromRouting].sort((a, b) =>
          (a.date ?? '').localeCompare(b.date ?? ''),
        );
        setRows(all);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load income');
      }
    },
    [tourId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /* Optimistic per-cell commit: apply locally, POST the single field,
     re-fetch to resync on failure (no per-edit refresh on success). */
  const commit = (routingId: string, patch: Partial<IncomeRow>) => {
    setRows(
      (prev) =>
        prev?.map((r) => (r.routing_id === routingId ? { ...r, ...patch } : r)) ?? prev,
    );
    void (async () => {
      try {
        const res = await fetch('/api/budget/income', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routing_id: routingId, ...patch }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Save failed', 'error');
        void load();
      }
    })();
  };

  const totals = useMemo(() => {
    const t = { guarantee: 0, overage: 0, merch: 0, vip: 0, total: 0 };
    for (const r of rows ?? []) {
      if (view === 'projected') {
        const g = postTax(r.pre_tax_guarantee, r.withholding_pct);
        const o = postTax(r.pre_tax_overage, r.withholding_pct);
        t.guarantee += g;
        t.overage += o;
        t.merch += r.merch_income;
        t.vip += r.vip_income;
        t.total += g + o + r.merch_income + r.vip_income;
      } else {
        t.guarantee += r.actual_guarantee;
        t.overage += r.actual_overage;
        t.merch += r.actual_merch;
        t.vip += r.actual_vip;
        t.total += r.actual_guarantee + r.actual_overage + r.actual_merch + r.actual_vip;
      }
    }
    return t;
  }, [rows, view]);

  const th: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--lp-text-tertiary)',
    padding: '6px 8px',
    borderBottom: '1px solid var(--lp-border-subtle)',
  };
  const moneyCell = (value: number, onCommit: (v: number) => void) => (
    <BudgetCellInput
      value={value}
      currency={cur}
      formatDisplay={(x) => fmt(x, cur)}
      onCommit={onCommit}
    />
  );

  return (
    <section className="space-y-3">
      {/* Projected / Actual segmented toggle */}
      <div
        className="inline-flex items-center gap-1 rounded-md border p-0.5"
        style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg)' }}
        role="tablist"
        aria-label="Income view"
      >
        {(['projected', 'actual'] as const).map((v) => {
          const active = view === v;
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(v)}
              className="btn-transition rounded px-3 py-1"
              style={{
                fontSize: '12px',
                fontWeight: 500,
                textTransform: 'capitalize',
                background: active
                  ? 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)'
                  : 'transparent',
                color: active ? 'var(--color-lp-orange)' : 'var(--lp-text-secondary)',
              }}
            >
              {v}
            </button>
          );
        })}
      </div>

      {loadError ? (
        <div
          className="rounded-md border p-3"
          style={{
            borderColor: 'var(--color-lp-status-needs-review)',
            background:
              'color-mix(in srgb, var(--color-lp-status-needs-review) 10%, transparent)',
            color: 'var(--lp-text)',
            fontSize: '13px',
          }}
        >
          {loadError}
        </div>
      ) : rows === null ? (
        <div
          className="flex items-center gap-2 py-10"
          style={{ color: 'var(--lp-text-tertiary)', fontSize: '13px' }}
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading income…
        </div>
      ) : rows.length === 0 ? (
        <div
          className="rounded-md border px-4 py-8 text-center"
          style={{
            borderColor: 'var(--lp-border-strong)',
            background: 'var(--lp-bg)',
            color: 'var(--lp-text-tertiary)',
            fontSize: '13px',
          }}
        >
          No shows on this tour yet — add routing dates to enter income.
        </div>
      ) : (
        <div
          className="w-full overflow-x-auto rounded-xl border"
          style={{
            borderColor: 'var(--lp-border-strong)',
            background: 'var(--lp-bg)',
            boxShadow: 'var(--lp-shadow-sm)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <table
            className="lp-dense w-full"
            style={{ borderCollapse: 'separate', borderSpacing: 0 }}
          >
            <thead
              className="sticky top-0 z-10"
              style={{
                background: 'var(--lp-panel)',
                borderBottom: '1px solid var(--lp-border-strong)',
              }}
            >
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Show</th>
                <th style={{ ...th, textAlign: 'right' }}>Guarantee</th>
                {view === 'projected' ? (
                  <>
                    <th style={{ ...th, textAlign: 'right' }}>WH %</th>
                    <th style={{ ...th, textAlign: 'right' }}>Post-tax</th>
                  </>
                ) : null}
                <th style={{ ...th, textAlign: 'right' }}>Overage</th>
                <th style={{ ...th, textAlign: 'right' }}>Merch</th>
                <th style={{ ...th, textAlign: 'right' }}>VIP</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rowBg = i % 2 === 0 ? 'var(--lp-bg)' : 'var(--lp-bg-deep)';
                const rowTotal =
                  view === 'projected'
                    ? postTax(r.pre_tax_guarantee, r.withholding_pct) +
                      postTax(r.pre_tax_overage, r.withholding_pct) +
                      r.merch_income +
                      r.vip_income
                    : r.actual_guarantee +
                      r.actual_overage +
                      r.actual_merch +
                      r.actual_vip;
                const td: React.CSSProperties = {
                  // Grid-system parity — row size + type follow the shared
                  // app density (Compact / Comfortable / Spacious).
                  padding: `var(--lp-row-cell-padding-y-${density}) 8px`,
                  fontSize: `var(--lp-cell-font-size-${density})`,
                  borderBottom: '1px solid var(--lp-border-subtle)',
                  textAlign: 'right',
                };
                return (
                  <tr key={r.routing_id} style={{ background: rowBg }}>
                    <td
                      style={{
                        ...td,
                        textAlign: 'left',
                        color: 'var(--lp-text)',
                        fontWeight: 500,
                      }}
                    >
                      {r.date ? `${r.date.slice(5)} · ` : ''}
                      {r.venue_name || r.city || 'Show'}
                    </td>
                    {view === 'projected' ? (
                      <>
                        <td style={td} className="lp-mono">
                          {moneyCell(r.pre_tax_guarantee, (v) =>
                            commit(r.routing_id, { pre_tax_guarantee: v }),
                          )}
                        </td>
                        <td style={td} className="lp-mono">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={r.withholding_pct}
                            onChange={(e) =>
                              commit(r.routing_id, {
                                withholding_pct: Number(e.target.value) || 0,
                              })
                            }
                            aria-label="Withholding %"
                            style={{
                              width: 56,
                              textAlign: 'right',
                              border: '1px solid transparent',
                              background: 'transparent',
                              color: 'var(--lp-text)',
                              font: 'inherit',
                              outline: 'none',
                            }}
                          />
                        </td>
                        <td
                          style={{ ...td, color: 'var(--lp-text-tertiary)' }}
                          className="lp-mono"
                          title="Computed: guarantee × (1 − WH%)"
                        >
                          {fmt(postTax(r.pre_tax_guarantee, r.withholding_pct), cur)}
                        </td>
                        <td style={td} className="lp-mono">
                          {moneyCell(r.pre_tax_overage, (v) =>
                            commit(r.routing_id, { pre_tax_overage: v }),
                          )}
                        </td>
                        <td style={td} className="lp-mono">
                          {moneyCell(r.merch_income, (v) =>
                            commit(r.routing_id, { merch_income: v }),
                          )}
                        </td>
                        <td style={td} className="lp-mono">
                          {moneyCell(r.vip_income, (v) =>
                            commit(r.routing_id, { vip_income: v }),
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={td} className="lp-mono">
                          {moneyCell(r.actual_guarantee, (v) =>
                            commit(r.routing_id, { actual_guarantee: v }),
                          )}
                        </td>
                        <td style={td} className="lp-mono">
                          {moneyCell(r.actual_overage, (v) =>
                            commit(r.routing_id, { actual_overage: v }),
                          )}
                        </td>
                        <td style={td} className="lp-mono">
                          {moneyCell(r.actual_merch, (v) =>
                            commit(r.routing_id, { actual_merch: v }),
                          )}
                        </td>
                        <td style={td} className="lp-mono">
                          {moneyCell(r.actual_vip, (v) =>
                            commit(r.routing_id, { actual_vip: v }),
                          )}
                        </td>
                      </>
                    )}
                    <td
                      style={{ ...td, color: 'var(--lp-text)', fontWeight: 600 }}
                      className="lp-mono"
                    >
                      {fmt(rowTotal, cur)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td
                  style={{
                    padding: '8px',
                    fontWeight: 700,
                    color: 'var(--lp-text)',
                    borderTop: '2px solid var(--lp-border-strong)',
                  }}
                >
                  Total income
                </td>
                <td className="lp-mono" style={tfootCell}>
                  {fmt(totals.guarantee, cur)}
                </td>
                {view === 'projected' ? (
                  <>
                    <td style={tfootCell} />
                    <td style={tfootCell} />
                  </>
                ) : null}
                <td className="lp-mono" style={tfootCell}>
                  {fmt(totals.overage, cur)}
                </td>
                <td className="lp-mono" style={tfootCell}>
                  {fmt(totals.merch, cur)}
                </td>
                <td className="lp-mono" style={tfootCell}>
                  {fmt(totals.vip, cur)}
                </td>
                <td className="lp-mono" style={{ ...tfootCell, fontWeight: 700 }}>
                  {fmt(totals.total, cur)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p style={{ fontSize: '11px', color: 'var(--lp-text-tertiary)' }}>
        Post-tax = guarantee × (1 − withholding%). These feed the Summary
        P&amp;L gross income. Edits save automatically.
      </p>
    </section>
  );
}

const tfootCell: React.CSSProperties = {
  textAlign: 'right',
  padding: '8px',
  fontWeight: 600,
  color: 'var(--lp-text)',
  borderTop: '2px solid var(--lp-border-strong)',
};
