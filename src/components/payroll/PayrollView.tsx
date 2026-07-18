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

import { useCallback, useMemo, useState, type ReactNode } from 'react';
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
import { PageTitle } from '@/components/ui/PageHeader';

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

  // b2 — the catalog + amounts are the hub's state, shared by all grids.
  const [types, setTypes] = useState<RateTypeMeta[]>(() => rateTypes.map(toMeta).sort(byOrder));
  const [lines, setLines] = useState<RateLineRecord[]>(rateLines);
  const amountMap = useMemo(() => buildAmountMap(lines), [lines]);

  const excludePersonIds = useMemo(
    () => rates.map((r) => r.person_id).filter((id): id is string => typeof id === 'string'),
    [rates],
  );

  const { statusOf, saveDayStatus, saveDayType, tourDayTypeOf, isExplicit, fillDays, entries } = usePayrollGrid(tourId, routingDates as RoutingDay[], payrollEntries);

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
        <PageTitle style={{ fontSize: 22 }}>{tourName} — Payroll</PageTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PayrollExportButton tourId={tourId} />
          <AddPersonToTourButton
            tourId={tourId}
            excludePersonIds={excludePersonIds}
            onAdded={(result) => { if (result?.rateCard) setRates((prev) => [...prev, result.rateCard as Record<string, unknown>]); }}
          />
        </div>
      </div>

      {/* G2-1b — the DAYS MATRIX is the work surface and dominates. Rates + Summary
          collapse to disclosures (Rates is reference while painting; Summary is
          read-only derived data), so opening Payroll shows the matrix ready to
          work with rates/summary one click away. */}
      <Disclosure label="Rates" hint={`${rates.length} ${rates.length === 1 ? 'person' : 'people'} · click to edit rates & types`}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
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
      </Disclosure>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
        <PayrollDaysMatrix
          routingDates={routingDates}
          personnelRates={rates}
          currency={currency}
          statusOf={statusOf}
          saveDayStatus={saveDayStatus}
          saveDayType={saveDayType}
          tourDayTypeOf={tourDayTypeOf}
          isExplicit={isExplicit}
          fillDays={fillDays}
          rateTypes={types}
          amountMap={amountMap}
        />
      </section>

      <Disclosure label="Summary" hint="totals · read-only">
        <PayrollSummary
          currency={currency}
          personnelRates={rates}
          payrollEntries={entries}
          rateTypes={types}
          amountMap={amountMap}
        />
      </Disclosure>
    </div>
  );
}

/** Collapsed-by-default disclosure — the compact chrome for Rates / Summary so
 *  the Days matrix dominates the page (G2-1b). Native <details> for the toggle. */
function Disclosure({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <details style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', background: 'var(--lp-panel)' }}>
      <summary
        style={{
          cursor: 'pointer', padding: '8px 12px', display: 'flex', alignItems: 'baseline', gap: 8,
          fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--lp-text-secondary)',
        }}
      >
        {label}
        {hint ? <span style={{ fontSize: 11, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--lp-text-tertiary)' }}>· {hint}</span> : null}
      </summary>
      <div style={{ padding: '4px 12px 12px' }}>{children}</div>
    </details>
  );
}

