'use client';

/* ============================================
   LOWPASS — <PayrollView> (Stage B host · b2 rate-lines)

   Two views:
     Rates & Summary — editable dynamic-column Rates grid (columns from the
                       workspace rate_types catalog; cells write
                       personnel_rate_lines.amount) + read-only Summary totals.
     Days matrix     — days DOWN the shared rail, people across, week-grouped.

   This component is the state hub: it owns the rate_types catalog + the rate
   line amounts, so an edit in the Rates grid (or an Add/Manage type) flows to
   the Summary and Days matrix without a reload. Fee math is fees.ts/computeTotals
   throughout (reconciles to legacy — reconcile.harness.ts).
   ============================================ */

import { useCallback, useMemo, useState } from 'react';
import type { PersonnelRate } from '@/types';
import type { RateBucket, RateBasis, DayStatus } from '@/lib/payroll/fees';
import type { RateTypeMeta } from '@/lib/payroll/rateLines';
import { PayrollSummary } from './PayrollSummary';
import { PayrollRatesSpreadsheet } from './PayrollRatesSpreadsheet';
import { PayrollDaysMatrix } from './PayrollDaysMatrix';
import { RateTypeToolbar } from './RateTypeToolbar';
import { buildAmountMap, type RateLineRecord } from './rateLinesClient';
import { usePayrollGrid, type RoutingDay } from './usePayrollGrid';
import { AddPersonToTourButton } from '@/components/operations/personnel/AddPersonToTourButton';
import { PayrollExportButton } from '@/components/payroll/PayrollExportButton';

interface RateTypeRow { id: string; name: string; bucket: string; basis: string; day_statuses: string[] | null; order_index: number; }

interface PayrollViewProps {
  tourId: string;
  tourName: string;
  currency: string;
  routingDates: { id: string; date: string; day_type?: string; venue_name?: string; city?: string }[];
  personnelRates: Record<string, unknown>[];
  payrollEntries: Record<string, unknown>[];
  /** b2 — the workspace rate_types catalog (global defaults + customs). */
  rateTypes?: RateTypeRow[];
  /** b2 — every person's rate line amounts for this tour. */
  rateLines?: RateLineRecord[];
}

type ViewId = 'rates' | 'days';
const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'rates', label: 'Rates & Summary' },
  { id: 'days', label: 'Days matrix' },
];

function toMeta(r: RateTypeRow): RateTypeMeta {
  return {
    id: r.id,
    name: r.name,
    bucket: r.bucket as RateBucket,
    basis: r.basis as RateBasis,
    dayStatuses: (r.day_statuses ?? []) as DayStatus[],
    orderIndex: r.order_index,
  };
}
const byOrder = (a: RateTypeMeta, b: RateTypeMeta) => a.orderIndex - b.orderIndex;

export function PayrollView({
  tourId,
  tourName,
  currency,
  routingDates,
  personnelRates,
  payrollEntries,
  rateTypes = [],
  rateLines = [],
}: PayrollViewProps) {
  const [rates, setRates] = useState<Record<string, unknown>[]>(personnelRates);
  const [view, setView] = useState<ViewId>('rates');

  // b2 — the catalog + amounts are the hub's state, shared by all grids.
  const [types, setTypes] = useState<RateTypeMeta[]>(() => rateTypes.map(toMeta).sort(byOrder));
  const [lines, setLines] = useState<RateLineRecord[]>(rateLines);
  const amountMap = useMemo(() => buildAmountMap(lines), [lines]);

  const excludePersonIds = useMemo(
    () => rates.map((r) => r.person_id).filter((id): id is string => typeof id === 'string'),
    [rates],
  );

  const { statusOf, saveDayStatus, entries } = usePayrollGrid(tourId, routingDates as RoutingDay[], payrollEntries);

  // Persist one rate-line cell edit; optimistic, reverts on failure.
  const onRateLineCommit = useCallback(
    async (personnelRateId: string, rateTypeId: string, amount: number) => {
      const prev = lines;
      setLines((cur) => {
        const i = cur.findIndex((l) => l.personnel_rate_id === personnelRateId && l.rate_type_id === rateTypeId);
        if (i === -1) return [...cur, { personnel_rate_id: personnelRateId, rate_type_id: rateTypeId, amount }];
        const next = cur.slice();
        next[i] = { ...next[i], amount };
        return next;
      });
      const res = await fetch('/api/budget/rate-lines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personnel_rate_id: personnelRateId, rate_type_id: rateTypeId, amount }),
      });
      if (!res.ok) {
        setLines(prev); // revert
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === 'string' ? j.error : 'Save failed');
      }
    },
    [lines],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--lp-text)' }}>{tourName} — Payroll</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PayrollExportButton tourId={tourId} />
          <AddPersonToTourButton
            tourId={tourId}
            excludePersonIds={excludePersonIds}
            onAdded={(result) => { if (result?.rateCard) setRates((prev) => [...prev, result.rateCard as Record<string, unknown>]); }}
          />
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Payroll view"
        style={{ display: 'inline-flex', alignSelf: 'flex-start', gap: 2, border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-full)', padding: 3, background: 'var(--lp-panel)' }}
      >
        {VIEWS.map((v) => {
          const on = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setView(v.id)}
              style={{ border: 0, cursor: 'pointer', borderRadius: 'var(--lp-radius-full)', padding: '5px 16px', fontSize: 13, fontWeight: 600, background: on ? 'var(--lp-orange)' : 'transparent', color: on ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)', transition: 'background 0.16s ease, color 0.16s ease' }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div style={{ minHeight: 300 }}>
        {view === 'rates' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <TwoGridHeading label="Rates" hint="editable · columns from your rate types" />
                <RateTypeToolbar
                  tourId={tourId}
                  types={types}
                  onAdded={(t) => setTypes((prev) => [...prev, t].sort(byOrder))}
                  onChanged={(t) => setTypes((prev) => prev.map((x) => (x.id === t.id ? t : x)).sort(byOrder))}
                  onDeleted={(id) => {
                    setTypes((prev) => prev.filter((x) => x.id !== id));
                    setLines((prev) => prev.filter((l) => l.rate_type_id !== id));
                  }}
                />
              </div>
              <PayrollRatesSpreadsheet
                currency={currency}
                initialRates={rates as unknown as PersonnelRate[]}
                payrollEntries={entries}
                canSeeCommission={false}
                rateTypes={types}
                amountMap={amountMap}
                onRateLineCommit={onRateLineCommit}
              />
            </section>
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <TwoGridHeading label="Summary" hint="totals · read-only" />
              <PayrollSummary
                currency={currency}
                personnelRates={rates}
                payrollEntries={entries}
                rateTypes={types}
                amountMap={amountMap}
              />
            </section>
          </div>
        ) : (
          <PayrollDaysMatrix
            routingDates={routingDates}
            personnelRates={rates}
            currency={currency}
            statusOf={statusOf}
            saveDayStatus={saveDayStatus}
            rateTypes={types}
            amountMap={amountMap}
          />
        )}
      </div>
    </div>
  );
}

function TwoGridHeading({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--lp-text-secondary)' }}>{label}</h2>
      <span style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>· {hint}</span>
    </div>
  );
}
