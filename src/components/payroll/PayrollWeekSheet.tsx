'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { weekDates } from './payroll-utils';
import { InlineEditCell } from '@/components/spreadsheet-view/InlineEditCell';
import { cn } from '@/lib/utils';

const DAY_OPTIONS = [
  { value: 'show', label: 'SHOW DAY' },
  { value: 'off_travel', label: 'OFF/TRAVEL DAY' },
  { value: 'no_tour', label: 'NO TOUR' },
];

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }).slice(0, 3);
}

function dayTypeToStatus(dayType: string): string {
  const t = (dayType ?? '').toLowerCase();
  if (t === 'show' || t === 'festival') return 'show';
  if (t === 'rehearsal') return 'off_travel';
  if (['off', 'travel', 'press', 'radio', 'tv'].includes(t)) return 'off_travel';
  return 'no_tour';
}

interface PayrollWeekSheetProps {
  tourId: string;
  weekStart: string;
  personnelRates: Record<string, unknown>[];
  routingDates: { id: string; date: string; day_type?: string; venue_name?: string; city?: string }[];
  payrollEntries: Record<string, unknown>[];
}

export function PayrollWeekSheet({
  tourId,
  weekStart,
  personnelRates,
  routingDates,
  payrollEntries,
}: PayrollWeekSheetProps) {
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const [entries, setEntries] = useState<Record<string, unknown>[]>(payrollEntries);
  const [generating, setGenerating] = useState(false);

  const routingByDate = useMemo(() => {
    const m = new Map<string, (typeof routingDates)[0]>();
    for (const r of routingDates) {
      const d = (r.date ?? '').slice(0, 10);
      if (d) m.set(d, r);
    }
    return m;
  }, [routingDates]);

  const entriesForWeek = useMemo(() => {
    return entries.filter((e) => e.week_start === weekStart);
  }, [entries, weekStart]);

  const entryByPerson = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    for (const e of entriesForWeek) {
      const pid = e.personnel_id as string;
      m.set(pid, e);
    }
    return m;
  }, [entriesForWeek]);

  const autoGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/budget/payroll/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour_id: tourId }),
      });
      if (res.ok) {
        const listRes = await fetch(`/api/budget/payroll?tour_id=${tourId}`);
        if (listRes.ok) {
          const json = await listRes.json();
          const rows = json.entries ?? [];
          setEntries(rows.map((row: { personnel_rates?: unknown; personnel?: unknown }) => ({
            ...row,
            personnel: Array.isArray(row.personnel_rates) ? row.personnel_rates[0] : row.personnel_rates ?? row.personnel,
          })));
        }
      }
    } finally {
      setGenerating(false);
    }
  }, [tourId]);

  useEffect(() => {
    const hasEntries = entriesForWeek.length > 0;
    const hasPersonnel = personnelRates.length > 0;
    if (!hasEntries && hasPersonnel) {
      autoGenerate();
    }
  }, [weekStart, personnelRates.length, entriesForWeek.length, autoGenerate]);

  const saveDayStatus = useCallback(
    async (personnelId: string, dateStr: string, status: string) => {
      const entry = entryByPerson.get(personnelId);
      const statuses = { ...((entry?.day_statuses as Record<string, string>) ?? {}) };
      statuses[dateStr] = status;

      const res = await fetch('/api/budget/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          personnel_id: personnelId,
          week_start: weekStart,
          day_statuses: statuses,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      setEntries((prev) => {
        const out = prev.filter((e) => !(e.personnel_id === personnelId && e.week_start === weekStart));
        return [...out, updated].sort((a, b) => (a.week_start as string).localeCompare(b.week_start as string));
      });
    },
    [tourId, weekStart, entryByPerson]
  );

  const saveAdvanceFee = useCallback(
    async (personnelId: string, value: number) => {
      const entry = entryByPerson.get(personnelId);
      const statuses = (entry?.day_statuses as Record<string, string>) ?? {};

      const res = await fetch('/api/budget/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          personnel_id: personnelId,
          week_start: weekStart,
          day_statuses: statuses,
          advance_fee: value,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      setEntries((prev) => {
        const out = prev.filter((e) => !(e.personnel_id === personnelId && e.week_start === weekStart));
        return [...out, updated];
      });
    },
    [tourId, weekStart, entryByPerson]
  );

  const currency = 'GBP';
  const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2 });

  let weekTotalFee = 0;
  let weekTotalPD = 0;

  return (
    <div className="space-y-4 overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="bg-lp-surface text-xs font-bold uppercase tracking-wider text-lp-text-secondary">
            <th className="border-b border-lp-border/30 px-2 py-2 text-left w-24">Role</th>
            <th className="border-b border-lp-border/30 px-2 py-2 text-left w-24">Forename</th>
            <th className="border-b border-lp-border/30 px-2 py-2 text-left w-24">Surname</th>
            {dates.map((d) => (
              <th key={d} className="border-b border-lp-border/30 px-1 py-2 text-center w-20">
                {formatShortDate(d)}
              </th>
            ))}
            <th className="border-b border-lp-border/30 px-2 py-2 text-left w-20">Advance</th>
            <th className="border-b border-lp-border/30 px-2 py-2 text-right w-24">Total Fee</th>
            <th className="border-b border-lp-border/30 px-2 py-2 text-right w-24">Total PD</th>
            <th className="border-b border-lp-border/30 px-2 py-2 text-left w-28">Notes</th>
          </tr>
          <tr className="bg-lp-surface/50 text-xs text-lp-text-secondary">
            <td colSpan={3} className="border-b border-lp-border/30 px-2 py-1" />
            {dates.map((d) => {
              const r = routingByDate.get(d);
              return (
                <td key={d} className="border-b border-lp-border/30 px-1 py-1 text-center truncate" title={r?.venue_name ?? ''}>
                  {r?.venue_name ?? '—'}
                </td>
              );
            })}
            <td colSpan={4} className="border-b border-lp-border/30" />
          </tr>
          <tr className="bg-lp-surface/50 text-xs text-lp-text-secondary">
            <td colSpan={3} className="border-b border-lp-border/30 px-2 py-1" />
            {dates.map((d) => {
              const r = routingByDate.get(d);
              return (
                <td key={d} className="border-b border-lp-border/30 px-1 py-1 text-center">
                  {r?.city ?? '—'}
                </td>
              );
            })}
            <td colSpan={4} className="border-b border-lp-border/30" />
          </tr>
        </thead>
        <tbody>
          {personnelRates.map((pr) => {
            const pid = pr.id as string;
            const entry = entryByPerson.get(pid);
            const statuses = (entry?.day_statuses as Record<string, string>) ?? {};
            const personName = (pr.person_name as string) ?? '';
            const parts = personName.trim().split(/\s+/);
            const forename = parts[0] ?? '';
            const surname = parts.slice(1).join(' ') ?? '';

            let show = 0;
            let offTravel = 0;
            for (const v of Object.values(statuses)) {
              if (v === 'show') show++;
              else if (v === 'off_travel' || v === 'rehearsal') offTravel++;
            }
            const advanceFee = Number(entry?.advance_fee ?? pr.advance_fee) || 0;
            const showRate = Number(pr.show_rate) || 0;
            const offRate = Number(pr.off_rate) || 0;
            const perDiemRate = Number(pr.per_diem) || 0;
            const rateType = (pr.rate_type as string) ?? 'day_rate';
            const totalFee =
              rateType === 'split_rate'
                ? show * showRate + offTravel * offRate + advanceFee
                : (show + offTravel) * offRate + advanceFee;
            const totalPD = (show + offTravel) * perDiemRate;
            weekTotalFee += totalFee;
            weekTotalPD += totalPD;

            return (
              <tr key={pid} className="even:bg-lp-surface/30">
                <td className="border-b border-lp-border/30 px-2 py-1">{pr.role as string}</td>
                <td className="border-b border-lp-border/30 px-2 py-1">{forename}</td>
                <td className="border-b border-lp-border/30 px-2 py-1">{surname}</td>
                {dates.map((dateStr) => {
                  const status = statuses[dateStr] ?? (routingByDate.get(dateStr) ? dayTypeToStatus(routingByDate.get(dateStr)!.day_type ?? '') : 'no_tour');
                  return (
                    <td key={dateStr} className={cn('border-b border-lp-border/30 px-1 py-0', status === 'show' && 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400', status === 'off_travel' && 'bg-amber-500/20 text-amber-700 dark:text-amber-400', status === 'no_tour' && 'bg-gray-500/10 text-gray-500')}>
                      <InlineEditCell
                        value={status}
                        type="select"
                        options={DAY_OPTIONS}
                        onSave={async (v) => saveDayStatus(pid, dateStr, String(v))}
                      />
                    </td>
                  );
                })}
                <td className="border-b border-lp-border/30 px-2 py-0">
                  <InlineEditCell
                    value={advanceFee}
                    type="currency"
                    currency={currency}
                    onSave={async (v) => saveAdvanceFee(pid, typeof v === 'number' ? v : parseFloat(String(v)))}
                    align="right"
                  />
                </td>
                <td className="border-b border-lp-border/30 px-2 py-1 text-right font-[tabular-nums]">{formatter.format(totalFee)}</td>
                <td className="border-b border-lp-border/30 px-2 py-1 text-right font-[tabular-nums]">{formatter.format(totalPD)}</td>
                <td className="border-b border-lp-border/30 px-2 py-1 text-lp-text-secondary">—</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex items-center gap-6 rounded-lg bg-lp-surface/40 px-4 py-2 text-sm font-semibold">
        <span>Week Total Fee: {formatter.format(weekTotalFee)}</span>
        <span>Week Total PD: {formatter.format(weekTotalPD)}</span>
      </div>

      {generating && <p className="text-sm text-lp-text-secondary">Generating payroll…</p>}
    </div>
  );
}
