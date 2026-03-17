'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { BudgetAlerts } from '@/components/summary/BudgetAlerts';
import { cn } from '@/lib/utils';

interface SummaryLine {
  label: string;
  proposed: number;
  actual: number;
}

interface SummarySection {
  title: string;
  lines: SummaryLine[];
  subtotal?: SummaryLine;
}

interface DayCount {
  showDays: number;
  offDays: number;
  rehearsalDays: number;
  totalDays: number;
}

interface PersonnelRate {
  id: string;
  person_name: string;
  role: string | null;
  person_type: string;
  rate_type: string;
  show_rate: number;
  off_rate: number;
  rehearsal_rate: number;
  advance_fee: number;
}

interface PayrollEntry {
  personnel_id: string;
  total_fee: number;
}

interface Commission {
  id: string;
  label: string;
  percentage: number;
  basis: string;
}

const n = (x: number | null | undefined): number => (x == null ? 0 : Number(x) || 0);

function basisLabel(basis: string): string {
  const map: Record<string, string> = {
    gross: 'Gross',
    net: 'Net',
    gross_merch: 'Merch Gross',
    net_merch: 'Net Merch',
    gross_minus_tax: 'Gross (Pre-Tax)',
  };
  return map[basis] ?? basis;
}

export function SummaryView({
  tourId,
  artistName,
  tourName,
  currency,
  updatedAt,
}: {
  tourId: string;
  artistName: string;
  tourName: string;
  currency: string;
  updatedAt: string | null;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{ sections: SummarySection[]; dayCount: DayCount } | null>(null);
  const [personnel, setPersonnel] = useState<PersonnelRate[]>([]);
  const [payroll, setPayroll] = useState<PayrollEntry[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [summaryRes, personnelRes, payrollRes, commissionsRes] = await Promise.all([
          fetch(`/api/budget/summary?tour_id=${encodeURIComponent(tourId)}`),
          fetch(`/api/budget/personnel-rates?tour_id=${encodeURIComponent(tourId)}`),
          fetch(`/api/budget/payroll?tour_id=${encodeURIComponent(tourId)}`),
          fetch(`/api/budget/commissions?tour_id=${encodeURIComponent(tourId)}`),
        ]);
        if (cancelled) return;
        const summaryData = summaryRes.ok ? await summaryRes.json() : null;
        const personnelData = personnelRes.ok ? await personnelRes.json() : null;
        const payrollData = payrollRes.ok ? await payrollRes.json() : null;
        const commissionsData = commissionsRes.ok ? await commissionsRes.json() : null;
        if (summaryData?.sections) setSummary({ sections: summaryData.sections, dayCount: summaryData.dayCount ?? { showDays: 0, offDays: 0, rehearsalDays: 0, totalDays: 0 } });
        setPersonnel(personnelData?.personnel_rates ?? []);
        const entries = payrollData?.entries ?? [];
        setPayroll(Array.isArray(entries) ? entries : []);
        setCommissions(commissionsData?.commissions ?? []);
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tourId]);

  const fmt = useMemo(() => {
    return (value: number) =>
      new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value);
  }, [currency]);

  const incomeTotal = useMemo(() => {
    if (!summary) return { proposed: 0, actual: 0 };
    const income = summary.sections.find((s) => s.title === 'INCOME');
    return income?.subtotal ?? { proposed: 0, actual: 0 };
  }, [summary]);

  const totalsSection = useMemo(() => {
    if (!summary) return null;
    return summary.sections.find((s) => s.title === 'TOTALS');
  }, [summary]);

  const totalExpensesProposed = useMemo(() => {
    const line = totalsSection?.lines?.find((l) => l.label.toLowerCase().includes('total expense'));
    return line ? line.proposed : 0;
  }, [totalsSection]);

  const totalExpensesActual = useMemo(() => {
    const line = totalsSection?.lines?.find((l) => l.label.toLowerCase().includes('total expense'));
    return line ? line.actual : 0;
  }, [totalsSection]);

  const netProposed = useMemo(() => {
    const line = totalsSection?.lines?.find((l) => l.label.toLowerCase().includes('net'));
    return line ? line.proposed : 0;
  }, [totalsSection]);

  const netActual = useMemo(() => {
    const line = totalsSection?.lines?.find((l) => l.label.toLowerCase().includes('net'));
    return line ? line.actual : 0;
  }, [totalsSection]);

  const maxBar = Math.max(incomeTotal.proposed, incomeTotal.actual, totalExpensesProposed, totalExpensesActual, 1);

  const expenseRows = useMemo(() => {
    if (!summary) return [];
    const direct = summary.sections.find((s) => s.title === 'DIRECT EXPENSES');
    const overheads = summary.sections.find((s) => s.title === 'OVERHEADS');
    const totals = summary.sections.find((s) => s.title === 'TOTALS');
    const rows: { label: string; proposed: number; actual: number; isTotal?: boolean; isNet?: boolean }[] = [];
    direct?.lines?.forEach((l) => rows.push({ label: l.label === 'Production & Misc' ? 'PRODUCTION+MISC' : l.label.toUpperCase(), proposed: l.proposed, actual: l.actual }));
    overheads?.lines?.forEach((l) => {
      let label = l.label.toUpperCase();
      if (l.label === 'Commissions') label = 'COMMISSIONS';
      else if (l.label === 'Accountancy') label = 'ACCOUNTANCY (0%)';
      else if (l.label === 'Insurance') label = 'INSURANCE (3%)';
      else if (l.label === 'Contingency') label = 'Contingency (2%)';
      rows.push({ label, proposed: l.proposed, actual: l.actual });
    });
    totals?.lines?.forEach((l, i) => {
      const isNet = l.label.toLowerCase().includes('net');
      rows.push({
        label: isNet ? 'NET P&L' : 'TOTAL EXPENSES',
        proposed: l.proposed,
        actual: l.actual,
        isTotal: !isNet,
        isNet,
      });
    });
    return rows;
  }, [summary]);

  const actualByPersonnel = useMemo(() => {
    const map: Record<string, number> = {};
    payroll.forEach((e) => {
      const id = e.personnel_id;
      map[id] = (map[id] ?? 0) + n(e.total_fee);
    });
    return map;
  }, [payroll]);

  const salaryRows = useMemo(() => {
    const dayCount = summary?.dayCount ?? { showDays: 0, offDays: 0, rehearsalDays: 0, totalDays: 0 };
    const { showDays, offDays, totalDays } = dayCount;
    const crew = personnel.filter((p) => (p.person_type ?? 'crew').toLowerCase() === 'crew');
    const band = personnel.filter((p) => (p.person_type ?? '').toLowerCase() === 'band');
    function projected(p: PersonnelRate): number {
      const rateType = p.rate_type ?? 'day_rate';
      if (rateType === 'split_rate') {
        return showDays * n(p.show_rate) + offDays * n(p.off_rate) + n(p.advance_fee);
      }
      return totalDays * n(p.off_rate) + n(p.advance_fee);
    }
    return {
      crew: crew.map((p) => ({
        role: p.role ? `${p.person_name}|${p.role}` : p.person_name,
        showRate: n(p.show_rate),
        offRate: n(p.off_rate),
        showDays,
        offDays,
        projected: projected(p),
        actual: actualByPersonnel[p.id] ?? 0,
        count: 1,
      })),
      band: band.map((p) => ({
        role: p.role || p.person_name,
        showRate: n(p.show_rate),
        offRate: n(p.off_rate),
        showDays,
        offDays,
        projected: projected(p),
        actual: actualByPersonnel[p.id] ?? 0,
        count: 1,
      })),
    };
  }, [personnel, summary?.dayCount, actualByPersonnel]);

  const commissionAmounts = useMemo(() => {
    const expensesBeforeCommProposed = totalExpensesProposed - (summary?.sections.find((s) => s.title === 'OVERHEADS')?.lines?.find((l) => l.label === 'Commissions')?.proposed ?? 0);
    const expensesBeforeCommActual = totalExpensesActual - (summary?.sections.find((s) => s.title === 'OVERHEADS')?.lines?.find((l) => l.label === 'Commissions')?.actual ?? 0);
    const income = incomeTotal;
    function basisVal(basis: string, isProposed: boolean): number {
      const gross = isProposed ? income.proposed : income.actual;
      const expenses = isProposed ? expensesBeforeCommProposed : expensesBeforeCommActual;
      switch (basis) {
        case 'gross': return gross;
        case 'net': return Math.max(0, gross - expenses);
        case 'gross_merch':
        case 'net_merch': return 0;
        case 'gross_minus_tax': return gross;
        default: return gross;
      }
    }
    return commissions.map((c) => {
      const pct = n(c.percentage);
      const proposed = pct * basisVal(c.basis, true);
      const actual = pct * basisVal(c.basis, false);
      return { ...c, proposed, actual };
    });
  }, [commissions, incomeTotal, totalExpensesProposed, totalExpensesActual, summary?.sections]);

  const totalCommissionActual = commissionAmounts.reduce((a, c) => a + c.actual, 0);

  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';
  const initials = '—';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-lp-text-tertiary" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-6 text-center text-lp-text-secondary">
        Could not load summary. Check budget data for this tour.
      </div>
    );
  }

  const { showDays, offDays } = summary.dayCount;

  return (
    <div className="space-y-6">
      <BudgetAlerts tourId={tourId} />
      <div className="rounded-xl border border-lp-border bg-lp-surface p-6">
        <h1 className="text-xl font-bold text-lp-text">{artistName}</h1>
        <p className="text-lp-text-secondary">{tourName}</p>
        <p className="mt-1 text-xs text-lp-text-tertiary">
          Updated: {updatedLabel} — {initials}
        </p>

        <div className="mt-6 border-t border-lp-border pt-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">Income</p>
          <div className="flex h-8 items-center gap-2">
            <div
              className="h-full rounded bg-emerald-500"
              style={{ width: `${Math.min(100, (Math.max(incomeTotal.proposed, incomeTotal.actual) / maxBar) * 100)}%` }}
            />
            <span className="shrink-0 text-sm font-medium text-lp-text">{fmt(Math.max(incomeTotal.proposed, incomeTotal.actual))}</span>
          </div>
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">Expenses</p>
          <div className="flex h-8 items-center gap-2">
            <div
              className="h-full rounded bg-red-500"
              style={{ width: `${Math.min(100, (Math.max(totalExpensesProposed, totalExpensesActual) / maxBar) * 100)}%` }}
            />
            <span className="shrink-0 text-sm font-medium text-lp-text">{fmt(Math.max(totalExpensesProposed, totalExpensesActual))}</span>
          </div>
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">Net P&L</p>
          <div className="flex h-8 items-center gap-2">
            <div
              className={cn(
                'h-full rounded',
                netProposed >= 0 ? 'bg-emerald-500' : 'bg-red-500'
              )}
              style={{ width: `${Math.min(100, (Math.abs(netProposed) / maxBar) * 100)}%` }}
            />
            <span className={cn('shrink-0 text-sm font-medium', netProposed >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {fmt(netProposed)}
            </span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-[1fr_auto_auto] gap-x-8 gap-y-1 text-sm">
          <div />
          <span className="text-right font-semibold text-lp-text-tertiary">PROPOSED</span>
          <span className="w-24 text-right font-semibold text-lp-text-tertiary">ACTUAL</span>
          {expenseRows.map((row) => (
            <span
              key={row.label}
              className={cn(
                row.isTotal && 'border-t-2 border-lp-border font-bold',
                row.isNet && 'text-xl font-bold',
                row.isNet && (row.proposed >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')
              )}
            >
              {row.label}
            </span>
            <span className={cn('text-right text-lp-text', row.isTotal && 'font-bold', row.isNet && 'text-xl font-bold', row.isNet && (row.proposed >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'))}>
              {row.isNet && row.label === 'NET P&L' ? fmt(row.proposed) : fmt(row.proposed)}
            </span>
            <span
              className={cn(
                'w-24 text-right',
                row.actual !== 0 ? 'text-lp-orange' : 'text-lp-text-tertiary',
                row.isTotal && 'font-bold',
                row.isNet && 'text-xl font-bold',
                row.isNet && (row.actual >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')
              )}
            >
              {row.label === 'Contingency (2%)' ? '—' : row.isNet && row.label === 'NET P&L' ? fmt(row.actual) : row.actual === 0 ? fmt(0) : fmt(row.actual)}
            </span>
          ))}
        </div>

        <p className="mt-8 text-xs text-lp-text-tertiary">
          — SHOW DAYS: {showDays}  │  OFF DAYS: {offDays} —
        </p>

        <div className="mt-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">— Salary table —</p>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold text-lp-text-tertiary">CREW</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-lp-border text-left text-xs text-lp-text-tertiary">
                      <th className="pb-1 pr-4">Role</th>
                      <th className="pb-1 pr-2 text-right">Show</th>
                      <th className="pb-1 pr-2 text-right">Off</th>
                      <th className="pb-1 pr-2 text-right">#Show</th>
                      <th className="pb-1 pr-2 text-right">#Off</th>
                      <th className="pb-1 pr-2 text-right">Projected</th>
                      <th className="pb-1 text-right">#</th>
                    </tr>
                  </thead>
                  <tbody className="text-lp-text">
                    {salaryRows.crew.map((row, i) => (
                      <tr key={i} className="border-b border-lp-border/60">
                        <td className="py-1.5 pr-4">{row.role}</td>
                        <td className="py-1.5 text-right">{fmt(row.showRate)}</td>
                        <td className="py-1.5 text-right">{fmt(row.offRate)}</td>
                        <td className="py-1.5 text-right">{row.showDays}</td>
                        <td className="py-1.5 text-right">{row.offDays}</td>
                        <td className="py-1.5 text-right">{fmt(row.projected)}</td>
                        <td className="py-1.5 text-right">{row.count}</td>
                      </tr>
                    ))}
                    {salaryRows.crew.length > 0 && (
                      <tr className="font-bold border-t-2 border-lp-border">
                        <td className="py-1.5 pr-4" colSpan={5}>TOTAL</td>
                        <td className="py-1.5 text-right">{fmt(salaryRows.crew.reduce((a, r) => a + r.projected, 0))}</td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-lp-text-tertiary">BAND</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-lp-border text-left text-xs text-lp-text-tertiary">
                      <th className="pb-1 pr-4">Role</th>
                      <th className="pb-1 pr-2 text-right">Show</th>
                      <th className="pb-1 pr-2 text-right">Off</th>
                      <th className="pb-1 pr-2 text-right">#Show</th>
                      <th className="pb-1 pr-2 text-right">#Off</th>
                      <th className="pb-1 pr-2 text-right">Projected</th>
                      <th className="pb-1 text-right">#</th>
                    </tr>
                  </thead>
                  <tbody className="text-lp-text">
                    {salaryRows.band.map((row, i) => (
                      <tr key={i} className="border-b border-lp-border/60">
                        <td className="py-1.5 pr-4">{row.role}</td>
                        <td className="py-1.5 text-right">{fmt(row.showRate)}</td>
                        <td className="py-1.5 text-right">{fmt(row.offRate)}</td>
                        <td className="py-1.5 text-right">{row.showDays}</td>
                        <td className="py-1.5 text-right">{row.offDays}</td>
                        <td className="py-1.5 text-right">{fmt(row.projected)}</td>
                        <td className="py-1.5 text-right">{row.count}</td>
                      </tr>
                    ))}
                    {salaryRows.band.length > 0 && (
                      <tr className="font-bold border-t-2 border-lp-border">
                        <td className="py-1.5 pr-4" colSpan={5}>TOTAL</td>
                        <td className="py-1.5 text-right">{fmt(salaryRows.band.reduce((a, r) => a + r.projected, 0))}</td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">— Commissions —</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-lp-border text-left text-xs text-lp-text-tertiary">
                  <th className="pb-1 pr-4">Type</th>
                  <th className="pb-1 pr-2 text-right">%</th>
                  <th className="pb-1 pr-2 text-right">Actual</th>
                  <th className="pb-1">Basis</th>
                </tr>
              </thead>
              <tbody className="text-lp-text">
                {commissionAmounts.map((c) => (
                  <tr key={c.id} className="border-b border-lp-border/60">
                    <td className="py-1.5 pr-4">{c.label}</td>
                    <td className="py-1.5 text-right">{Number(c.percentage).toFixed(1)}%</td>
                    <td className="py-1.5 text-right">{fmt(c.actual)}</td>
                    <td className="py-1.5">{basisLabel(c.basis)}</td>
                  </tr>
                ))}
                {commissionAmounts.length > 0 && (
                  <tr className="font-bold border-t-2 border-lp-border">
                    <td className="py-1.5 pr-4">TOTAL</td>
                    <td className="py-1.5" />
                    <td className="py-1.5 text-right">{fmt(totalCommissionActual)}</td>
                    <td className="py-1.5" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8">
          <button
            type="button"
            onClick={() => showToast('Excel export coming soon.')}
            className="text-sm font-medium text-lp-orange hover:underline"
          >
            [Export to Excel]
          </button>
        </div>
      </div>
    </div>
  );
}
