'use client';

/* ============================================
   LOWPASS — <PayrollView> (Stage B host)

   Three views, view switcher; the shared rail is the constant:
     Rates & totals — re-skinned <SpreadsheetGrid> rate cards + explicit
                      computed totals (default)
     Days matrix    — days DOWN the shared rail, people across, week-grouped
     Summary        — kept as-is
   Fee math (fees.ts), the budget Salary feed, and internal_rate gating are
   unchanged. Per-week tabs are replaced by the all-weeks Days matrix.
   ============================================ */

import { useMemo, useState } from 'react';
import type { PersonnelRate } from '@/types';
import { PayrollSummary } from './PayrollSummary';
import { PayrollRatesSpreadsheet } from './PayrollRatesSpreadsheet';
import { PayrollDaysMatrix } from './PayrollDaysMatrix';
import { AddPersonToTourButton } from '@/components/operations/personnel/AddPersonToTourButton';

interface PayrollViewProps {
  tourId: string;
  tourName: string;
  currency: string;
  routingDates: { id: string; date: string; day_type?: string; venue_name?: string; city?: string }[];
  personnelRates: Record<string, unknown>[];
  payrollEntries: Record<string, unknown>[];
}

type ViewId = 'rates' | 'days' | 'summary';
const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'rates', label: 'Rates & totals' },
  { id: 'days', label: 'Days matrix' },
  { id: 'summary', label: 'Summary' },
];

export function PayrollView({
  tourId,
  tourName,
  currency,
  routingDates,
  personnelRates,
  payrollEntries,
}: PayrollViewProps) {
  const [rates, setRates] = useState<Record<string, unknown>[]>(personnelRates);
  const [view, setView] = useState<ViewId>('rates');
  const excludePersonIds = useMemo(
    () => rates.map((r) => r.person_id).filter((id): id is string => typeof id === 'string'),
    [rates],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--lp-text)' }}>{tourName} — Payroll</h1>
        <AddPersonToTourButton
          tourId={tourId}
          excludePersonIds={excludePersonIds}
          onAdded={(result) => {
            if (result?.rateCard) setRates((prev) => [...prev, result.rateCard as Record<string, unknown>]);
          }}
        />
      </div>

      <div
        role="tablist"
        aria-label="Payroll view"
        style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          gap: 2,
          border: '1px solid var(--lp-border)',
          borderRadius: 'var(--lp-radius-full)',
          padding: 3,
          background: 'var(--lp-panel)',
        }}
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
              style={{
                border: 0,
                cursor: 'pointer',
                borderRadius: 'var(--lp-radius-full)',
                padding: '5px 16px',
                fontSize: 13,
                fontWeight: 600,
                background: on ? 'var(--lp-orange)' : 'transparent',
                color: on ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)',
                transition: 'background 0.16s ease, color 0.16s ease',
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div style={{ minHeight: 300 }}>
        {view === 'rates' ? (
          <PayrollRatesSpreadsheet
            currency={currency}
            initialRates={rates as unknown as PersonnelRate[]}
            payrollEntries={payrollEntries}
            canSeeCommission={false}
          />
        ) : view === 'days' ? (
          <PayrollDaysMatrix
            tourId={tourId}
            routingDates={routingDates}
            personnelRates={rates}
            payrollEntries={payrollEntries}
          />
        ) : (
          <PayrollSummary
            tourId={tourId}
            currency={currency}
            personnelRates={rates}
            routingDates={routingDates}
            payrollEntries={payrollEntries}
          />
        )}
      </div>
    </div>
  );
}
