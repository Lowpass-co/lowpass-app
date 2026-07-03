'use client';

/* ============================================
   LOWPASS — <PayrollSummary> (read-only totals · b2 rate-lines)

   The Summary is now purely read-only: it sums each person's rate lines
   (personnel_rate_lines × rate_types) via computeTotals over their aggregated
   day counts. Rate editing lives in the Rates grid above; this mirror always
   agrees with it (same amountMap + same engine). Reconciles to the legacy math
   for the defaults — reconcile.harness.ts.
   ============================================ */

import { useMemo } from 'react';
import { GridTable } from '@/components/spreadsheet-view/GridTable';
import { countDayStatuses, type DayCounts } from '@/lib/payroll/fees';
import type { RateTypeMeta } from '@/lib/payroll/rateLines';
import { personTotals, type LineAmountMap } from './rateLinesClient';

function splitName(name: string): { forename: string; surname: string } {
  const parts = (name ?? '').trim().split(/\s+/);
  if (parts.length === 0) return { forename: '', surname: '' };
  if (parts.length === 1) return { forename: parts[0], surname: '' };
  return { forename: parts[0], surname: parts.slice(1).join(' ') };
}

interface PayrollSummaryProps {
  currency: string;
  personnelRates: Record<string, unknown>[];
  payrollEntries: Record<string, unknown>[];
  rateTypes: RateTypeMeta[];
  amountMap: LineAmountMap;
}

export function PayrollSummary({ currency, personnelRates, payrollEntries, rateTypes, amountMap }: PayrollSummaryProps) {
  const rows = useMemo(() => {
    const entriesByPerson = new Map<string, DayCounts>();
    for (const e of payrollEntries) {
      const pid = e.personnel_id as string;
      const c = countDayStatuses((e.day_statuses as Record<string, string>) ?? {});
      const ex = entriesByPerson.get(pid) ?? { show: 0, offTravel: 0, rehearsal: 0, active: 0 };
      ex.show += c.show; ex.offTravel += c.offTravel; ex.rehearsal += c.rehearsal; ex.active += c.active;
      entriesByPerson.set(pid, ex);
    }

    return personnelRates.map((pr) => {
      const id = pr.id as string;
      const { forename, surname } = splitName((pr.person_name as string) ?? '');
      const counts = entriesByPerson.get(id) ?? { show: 0, offTravel: 0, rehearsal: 0, active: 0 };
      const { totalFee, totalPerDiem } = personTotals(amountMap, id, rateTypes, counts);
      return {
        id,
        role: (pr.role as string) ?? '',
        forename,
        surname,
        showDays: counts.show,
        offTravelDays: counts.offTravel,
        totalFee,
        totalPerDiem,
      };
    });
  }, [personnelRates, payrollEntries, rateTypes, amountMap]);

  const totals = useMemo(() => {
    let fee = 0; let pd = 0;
    for (const r of rows) { fee += r.totalFee; pd += r.totalPerDiem; }
    return { totalFee: fee, totalPerDiem: pd };
  }, [rows]);

  const COLS = [
    { key: 'role', label: 'Role', width: '140px' },
    { key: 'forename', label: 'Forename', width: '120px' },
    { key: 'surname', label: 'Surname', width: '120px' },
    { key: 'show_days', label: 'Show Days', width: '90px', align: 'right' as const },
    { key: 'off_days', label: 'Off/Travel Days', width: '110px', align: 'right' as const },
    { key: 'total_fee', label: 'Total Fee', width: '120px', align: 'right' as const },
    { key: 'total_per_diem', label: 'Total Per Diem', width: '120px', align: 'right' as const },
  ];

  const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2 });

  return (
    <GridTable
      columns={COLS}
      footer={
        <>
          <td colSpan={5} className="px-2 py-2 font-bold text-lp-text">TOTALS</td>
          <td className="px-2 py-2 text-right tabular-nums font-semibold">{formatter.format(totals.totalFee)}</td>
          <td className="px-2 py-2 text-right tabular-nums font-semibold">{formatter.format(totals.totalPerDiem)}</td>
        </>
      }
    >
      {rows.map((r) => (
        <tr key={r.id} className="even:bg-lp-surface/30">
          <td className="px-2 py-1 text-sm text-lp-text">{r.role}</td>
          <td className="px-2 py-1 text-sm text-lp-text">{r.forename}</td>
          <td className="px-2 py-1 text-sm text-lp-text">{r.surname}</td>
          <td className="px-2 py-1 text-sm text-lp-text-secondary text-right tabular-nums">{r.showDays}</td>
          <td className="px-2 py-1 text-sm text-lp-text-secondary text-right tabular-nums">{r.offTravelDays}</td>
          <td className="px-2 py-1 text-sm text-right tabular-nums">{formatter.format(r.totalFee)}</td>
          <td className="px-2 py-1 text-sm text-right tabular-nums">{formatter.format(r.totalPerDiem)}</td>
        </tr>
      ))}
    </GridTable>
  );
}
