'use client';

import { useMemo } from 'react';
import { GridTable } from '@/components/spreadsheet-view/GridTable';
import { InlineEditCell } from '@/components/spreadsheet-view/InlineEditCell';
import { formatCurrency } from '@/lib/utils';

function splitName(name: string): { forename: string; surname: string } {
  const parts = (name ?? '').trim().split(/\s+/);
  if (parts.length === 0) return { forename: '', surname: '' };
  if (parts.length === 1) return { forename: parts[0], surname: '' };
  return { forename: parts[0], surname: parts.slice(1).join(' ') };
}

interface PayrollSummaryProps {
  tourId: string;
  currency: string;
  personnelRates: Record<string, unknown>[];
  routingDates: { date?: string; day_type?: string }[];
  payrollEntries: Record<string, unknown>[];
}

export function PayrollSummary({
  tourId,
  currency,
  personnelRates,
  routingDates,
  payrollEntries,
}: PayrollSummaryProps) {
  const rows = useMemo(() => {
    type Agg = { show: number; offTravel: number; rehearsal: number; advanceFee: number };
    const entriesByPerson = new Map<string, Agg>();
    const emptyAgg = (): Agg => ({ show: 0, offTravel: 0, rehearsal: 0, advanceFee: 0 });
    for (const e of payrollEntries) {
      const pid = e.personnel_id as string;
      const statuses = (e.day_statuses as Record<string, string>) ?? {};
      let show = 0;
      let offTravel = 0;
      let rehearsal = 0;
      for (const v of Object.values(statuses)) {
        if (v === 'show') show++;
        else if (v === 'off_travel') offTravel++;
        else if (v === 'rehearsal') rehearsal++;
      }
      const existing = entriesByPerson.get(pid) ?? emptyAgg();
      existing.show += show;
      existing.offTravel += offTravel;
      existing.rehearsal += rehearsal;
      existing.advanceFee += Number((e as { advance_fee?: number }).advance_fee) || 0;
      entriesByPerson.set(pid, existing);
    }

    return personnelRates.map((pr) => {
      const id = pr.id as string;
      const personName = (pr.person_name as string) ?? '';
      const { forename, surname } = splitName(personName);
      const showRate = Number(pr.show_rate) || 0;
      const offRate = Number(pr.off_rate) || 0;
      const rehearsalRate = Number((pr as { rehearsal_rate?: number }).rehearsal_rate) || 0;
      const perDiemRate = Number(pr.per_diem) || 0;
      const rateType = String(pr.rate_type ?? 'day_rate');
      const agg = entriesByPerson.get(id) ?? emptyAgg();
      const active = agg.show + agg.offTravel + agg.rehearsal;
      let totalFee: number;
      if (rateType === 'split_rate') {
        totalFee =
          agg.show * showRate + agg.offTravel * offRate + agg.rehearsal * rehearsalRate + agg.advanceFee;
      } else {
        totalFee = active * offRate + agg.advanceFee;
      }
      const totalDays = active;
      const totalPerDiem = active * perDiemRate;

      return {
        id,
        role: (pr.role as string) ?? '',
        forename,
        surname,
        showRate,
        offRate: offRate,
        perDiemRate,
        showDays: agg.show,
        offTravelDays: agg.offTravel,
        totalFee,
        totalPerDiem,
      };
    });
  }, [personnelRates, payrollEntries]);

  const totals = useMemo(() => {
    let fee = 0;
    let pd = 0;
    for (const r of rows) {
      fee += r.totalFee;
      pd += r.totalPerDiem;
    }
    return { totalFee: fee, totalPerDiem: pd };
  }, [rows]);

  const saveRate = async (id: string, field: string, value: string | number) => {
    const res = await fetch('/api/budget/personnel-rates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: value }),
    });
    if (!res.ok) throw new Error('Save failed');
  };

  const COLS = [
    { key: 'role', label: 'Role', width: '120px' },
    { key: 'forename', label: 'Forename', width: '100px' },
    { key: 'surname', label: 'Surname', width: '100px' },
    { key: 'show_rate', label: 'Show Rate', width: '90px', align: 'right' as const },
    { key: 'travel_rate', label: 'Travel Rate', width: '90px', align: 'right' as const },
    { key: 'per_diem', label: 'Per Diem', width: '80px', align: 'right' as const },
    { key: 'show_days', label: 'Show Days', width: '80px', align: 'right' as const },
    { key: 'off_days', label: 'Off/Travel Days', width: '100px', align: 'right' as const },
    { key: 'total_fee', label: 'Total Fee', width: '100px', align: 'right' as const },
    { key: 'per_diem_rate', label: 'Per Diem Rate', width: '90px', align: 'right' as const },
    { key: 'total_per_diem', label: 'Total Per Diem', width: '110px', align: 'right' as const },
  ];

  const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2 });

  return (
    <GridTable
      columns={COLS}
      footer={
        <>
          <td colSpan={8} className="px-2 py-2 font-bold text-lp-text">TOTALS</td>
          <td className="px-2 py-2 text-right tabular-nums">{formatter.format(totals.totalFee)}</td>
          <td className="px-2 py-2" />
          <td className="px-2 py-2 text-right tabular-nums">{formatter.format(totals.totalPerDiem)}</td>
        </>
      }
    >
      {rows.map((r) => (
          <tr key={r.id} className="even:bg-lp-surface/30">
            <td className="px-2 py-0">
              <InlineEditCell value={r.role} type="text" onSave={(v) => saveRate(r.id, 'role', String(v))} />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell value={r.forename} type="text" onSave={(v) => saveRate(r.id, 'person_name', [v, r.surname].filter(Boolean).join(' '))} />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell value={r.surname} type="text" onSave={(v) => saveRate(r.id, 'person_name', [r.forename, v].filter(Boolean).join(' '))} />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell value={r.showRate} type="currency" currency={currency} onSave={(v) => saveRate(r.id, 'show_rate', v)} align="right" />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell value={r.offRate} type="currency" currency={currency} onSave={(v) => saveRate(r.id, 'off_rate', v)} align="right" />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell value={r.perDiemRate} type="currency" currency={currency} onSave={(v) => saveRate(r.id, 'per_diem', v)} align="right" />
            </td>
            <td className="px-2 py-1 text-sm text-lp-text-secondary text-right tabular-nums">{r.showDays}</td>
            <td className="px-2 py-1 text-sm text-lp-text-secondary text-right tabular-nums">{r.offTravelDays}</td>
            <td className="px-2 py-1 text-sm text-right tabular-nums">{formatter.format(r.totalFee)}</td>
            <td className="px-2 py-1 text-sm text-lp-text-secondary text-right tabular-nums">{formatter.format(r.perDiemRate)}</td>
            <td className="px-2 py-1 text-sm text-right tabular-nums">{formatter.format(r.totalPerDiem)}</td>
          </tr>
      ))}
    </GridTable>
  );
}
