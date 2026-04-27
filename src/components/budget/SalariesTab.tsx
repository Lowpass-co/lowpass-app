'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { budgetCurrencySymbol } from '@/lib/budget-currency';
import { BrandedSelect } from '@/components/ui/BrandedSelect';
import type { Personnel, PersonType } from '@/types';

const PERSON_TYPE_LABEL: Record<PersonType, string> = {
  principal: 'Principal',
  band: 'Band',
  crew: 'Crew',
};

const PERSON_TYPES_ORDER: PersonType[] = ['principal', 'band', 'crew'];

function personTypeCellClass(personType: string): string {
  const t = (personType ?? '').toLowerCase();
  if (t === 'principal') return 'font-semibold text-red-600 dark:text-red-400';
  if (t === 'band') return 'font-semibold text-blue-600 dark:text-blue-400';
  if (t === 'crew') return 'font-semibold text-amber-600 dark:text-amber-400';
  return 'font-medium capitalize text-lp-text-tertiary';
}

/** One-line headers aligned with spreadsheet Person column (text-sm uppercase). */
const salaryThBase =
  'whitespace-nowrap px-3 py-2.5 text-sm font-semibold uppercase leading-tight tracking-wide lp-table-header-text align-bottom';

/** Hotels-style: narrow symbol + whole pounds (no .00), right-aligned group. */
function SalaryCurrencyCell({
  symbol,
  amount,
  className,
}: {
  symbol: string;
  amount: number;
  className?: string;
}) {
  const n = Number(amount);
  const text = Number.isFinite(n)
    ? n.toLocaleString('en-GB', { maximumFractionDigits: 0, minimumFractionDigits: 0 })
    : '0';
  return (
    <span className={cn('inline-flex items-baseline justify-end gap-0.5 tabular-nums', className)}>
      <span className="shrink-0 text-lp-text-secondary">{symbol}</span>
      <span>{text}</span>
    </span>
  );
}

type DayStatus = 'show' | 'off_travel' | 'rehearsal' | 'no_tour';

type PersonnelRate = {
  id: string;
  roster_personnel_id?: string | null;
  person_name: string;
  role: string | null;
  person_type: string;
  rate_type: string;
  show_rate: number;
  off_rate: number;
  rehearsal_rate: number;
  per_diem: number;
  advance_fee: number;
  commission?: number;
  order_index: number;
};

type PayrollEntry = {
  personnel_id: string;
  week_start: string;
  day_statuses: Record<string, DayStatus>;
  total_fee: number;
  total_per_diem: number;
  advance_fee: number;
  personnel?: PersonnelRate;
};

type RoutingRow = { id: string; date: string; day_type: string };

function countFromDayStatuses(dayStatuses: Record<string, DayStatus>): { show: number; off: number; rehearsal: number; active: number } {
  let show = 0, off = 0, rehearsal = 0;
  for (const v of Object.values(dayStatuses ?? {})) {
    if (v === 'show') show++;
    else if (v === 'off_travel') off++;
    else if (v === 'rehearsal') rehearsal++;
  }
  return { show, off, rehearsal, active: show + off + rehearsal };
}

/** Projected fee per math spec §4 */
function projectedFee(
  rateType: string,
  showDays: number,
  offDays: number,
  rehearsalDays: number,
  activeDays: number,
  showRate: number,
  offRate: number,
  rehearsalRate: number,
  advanceFee: number
): number {
  if (rateType === 'split_rate') {
    return showDays * showRate + offDays * offRate + rehearsalDays * rehearsalRate + advanceFee;
  }
  return activeDays * offRate + advanceFee;
}

/** Advance fee auto-suggest: (total_tour_days / 2) × (day_rate / 2). day_rate = off_rate for day_rate, show_rate for split_rate. §4 */
function suggestedAdvanceFee(
  totalTourDays: number,
  rateType: string,
  showRate: number,
  offRate: number
): number {
  const dayRate = rateType === 'split_rate' ? showRate : offRate;
  return (totalTourDays / 2) * (dayRate / 2);
}

type Counts = { show: number; off: number; rehearsal: number; active: number };

type RowMoney = { fee: number; commissionAmount: number; feeWithCommission: number; perDiemTotal: number };

/** Fee + per-diem: advance is in `fee`; commission column is the add-on; Projected = fee + commission add-on. */
function computeRowMoney(
  form: PersonnelRate,
  counts: Counts,
  totalTourDays: number,
  showComm: boolean
): RowMoney {
  const rateType = form.rate_type ?? 'day_rate';
  const activeForDiem = counts.active || totalTourDays;
  const daysForComm = counts.active || totalTourDays;
  const fee = projectedFee(
    rateType,
    counts.show,
    counts.off,
    counts.rehearsal,
    activeForDiem,
    Number(form.show_rate) || 0,
    Number(form.off_rate) || 0,
    Number(form.rehearsal_rate) || 0,
    Number(form.advance_fee) || 0
  );
  const commissionAmount =
    showComm && (form.commission ?? 0) ? daysForComm * Number(form.commission) : 0;
  const perDiemTotal = (Number(form.per_diem) || 0) * activeForDiem;
  return { fee, commissionAmount, feeWithCommission: fee + commissionAmount, perDiemTotal };
}

export function SalariesTab({
  tourId,
  currency = 'GBP',
  showCommission = false,
}: {
  tourId: string;
  /** Tour currency from budget shell (matches header selector). */
  currency?: string;
  showCommission?: boolean;
}) {
  const tourCurrency = useMemo(
    () => (currency?.trim() ? currency.trim().toUpperCase() : 'GBP'),
    [currency]
  );
  const currencySymbol = useMemo(() => budgetCurrencySymbol(tourCurrency), [tourCurrency]);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [personnel, setPersonnel] = useState<PersonnelRate[]>([]);
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([]);
  const [routing, setRouting] = useState<RoutingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PersonnelRate>>({});
  const [addingMember, setAddingMember] = useState(false);
  const [newMember, setNewMember] = useState({
    roster_id: '' as string,
    person_type: 'crew' as 'principal' | 'band' | 'crew',
    rate_type: 'day_rate' as 'day_rate' | 'split_rate',
  });
  const [roster, setRoster] = useState<Personnel[]>([]);
  const [personSearch, setPersonSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | PersonType>('all');

  const load = useCallback(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/budget/personnel-rates?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { personnel_rates: [] })),
      fetch(`/api/budget/payroll?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { entries: [] })),
      fetch(`/api/tours/${tourId}/routing`).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/personnel').then((r) => (r.ok ? r.json() : { personnel: [] })),
    ])
      .then(([personnelRes, payrollRes, routingData, peopleRes]) => {
        setPersonnel(personnelRes?.personnel_rates ?? []);
        setPayrollEntries(payrollRes?.entries ?? []);
        setRouting(Array.isArray(routingData) ? routingData : []);
        setRoster(peopleRes?.personnel ?? []);
      })
      .catch((err) => setError(err?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => load(), [load]);

  const totalTourDays = routing.filter(
    (r) => ['show', 'festival', 'off', 'travel', 'rehearsal', 'press', 'radio', 'tv'].includes(r.day_type)
  ).length;

  const canSeeCommission = personnel.length > 0 && Object.prototype.hasOwnProperty.call(personnel[0], 'commission');
  const effectiveShowCommission = showCommission || canSeeCommission;

  const dayCountsByPerson: Map<string, Counts> = (() => {
    const map = new Map<string, Counts>();
    for (const entry of payrollEntries) {
      const counts = countFromDayStatuses(entry.day_statuses ?? {});
      const existing = map.get(entry.personnel_id) ?? { show: 0, off: 0, rehearsal: 0, active: 0 };
      map.set(entry.personnel_id, {
        show: existing.show + counts.show,
        off: existing.off + counts.off,
        rehearsal: existing.rehearsal + counts.rehearsal,
        active: existing.active + counts.active,
      });
    }
    return map;
  })();

  const showComm = effectiveShowCommission;
  const assignedRosterIds = useMemo(
    () => new Set((personnel.map((r) => r.roster_personnel_id).filter(Boolean) as string[])),
    [personnel]
  );
  const availableRoster = useMemo(
    () => roster.filter((p) => !assignedRosterIds.has(p.id)),
    [roster, assignedRosterIds]
  );

  const rowMoneyForPerson = useCallback(
    (p: PersonnelRate) => {
      const form = (editingId === p.id ? { ...p, ...editForm } : p) as PersonnelRate;
      const c = dayCountsByPerson.get(p.id) ?? { show: 0, off: 0, rehearsal: 0, active: 0 };
      return computeRowMoney(form, c, totalTourDays, showComm);
    },
    [editingId, editForm, dayCountsByPerson, totalTourDays, showComm]
  );

  const displayPersonnel = useMemo(() => {
    const q = personSearch.trim().toLowerCase();
    return personnel
      .filter((p) => {
        if (q && !p.person_name.toLowerCase().includes(q)) return false;
        if (typeFilter !== 'all' && p.person_type !== typeFilter) return false;
        return true;
      })
      .slice()
      .sort((a, b) => a.person_name.localeCompare(b.person_name));
  }, [personnel, personSearch, typeFilter]);

  /** Full-roster totals and by-type breakdown (unaffected by search / type filter). */
  const { grandFooterTotals, typeBreakdownRows } = useMemo(() => {
    const byTypeSal = new Map<string, number>();
    const byTypePd = new Map<string, number>();
    for (const t of PERSON_TYPES_ORDER) {
      byTypeSal.set(t, 0);
      byTypePd.set(t, 0);
    }
    let totalSal = 0;
    let totalPd = 0;
    for (const p of personnel) {
      const m = rowMoneyForPerson(p);
      totalSal += m.feeWithCommission;
      totalPd += m.perDiemTotal;
      const raw = (p.person_type ?? 'crew').toLowerCase();
      const key = PERSON_TYPES_ORDER.includes(raw as PersonType) ? raw : 'other';
      if (!byTypeSal.has(key)) {
        byTypeSal.set(key, 0);
        byTypePd.set(key, 0);
      }
      byTypeSal.set(key, (byTypeSal.get(key) ?? 0) + m.feeWithCommission);
      byTypePd.set(key, (byTypePd.get(key) ?? 0) + m.perDiemTotal);
    }
    const typeBreakdownRows: { key: string; label: string; salary: number; perDiem: number }[] =
      PERSON_TYPES_ORDER.map((t) => ({
        key: t,
        label: PERSON_TYPE_LABEL[t],
        salary: byTypeSal.get(t) ?? 0,
        perDiem: byTypePd.get(t) ?? 0,
      }));
    if ((byTypeSal.get('other') ?? 0) > 0 || (byTypePd.get('other') ?? 0) > 0) {
      typeBreakdownRows.push({
        key: 'other',
        label: 'Other',
        salary: byTypeSal.get('other') ?? 0,
        perDiem: byTypePd.get('other') ?? 0,
      });
    }
    return { grandFooterTotals: { totalSal, totalPd }, typeBreakdownRows };
  }, [personnel, rowMoneyForPerson]);

  const handleSave = (id: string) => {
    setSavingId(id);
    fetch('/api/budget/personnel-rates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editForm }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Save failed'))))
      .then(() => {
        setEditingId(null);
        setEditForm({});
        load();
      })
      .catch(() => setError('Failed to save'))
      .finally(() => setSavingId(null));
  };

  const handleDelete = (id: string) => {
    if (!confirm('Remove this person from tour rates?')) return;
    fetch('/api/budget/personnel-rates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
      .then((r) => (r.ok ? true : Promise.reject(new Error('Delete failed'))))
      .then(() => load())
      .catch(() => setError('Failed to delete'));
  };

  const handleUseSuggested = (rateType: string, showRate: number, offRate: number) => {
    const suggested = suggestedAdvanceFee(totalTourDays, rateType, showRate, offRate);
    setEditForm((prev) => ({ ...prev, advance_fee: suggested }));
  };

  const handleCreateMember = () => {
    if (!newMember.roster_id) {
      setError('Select someone from the roster');
      return;
    }
    setSavingId('__new__');
    setError(null);
    fetch('/api/budget/personnel-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tour_id: tourId,
        roster_personnel_id: newMember.roster_id,
        person_type: newMember.person_type,
        rate_type: newMember.rate_type,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Create failed'))))
      .then(() => {
        setAddingMember(false);
        setNewMember({ roster_id: '', person_type: 'crew', rate_type: 'day_rate' });
        load();
      })
      .catch(() => setError('Failed to add member'))
      .finally(() => setSavingId(null));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading salaries…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center text-red-600">
        {error}
      </div>
    );
  }

  const fmtMoney = (n: number) =>
    n.toLocaleString('en-GB', { maximumFractionDigits: 0, minimumFractionDigits: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-lp-border bg-lp-surface px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-4">
          <div className="min-w-[12rem] max-w-md flex-1">
            <label
              htmlFor="salaries-person-search"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide lp-table-header-text"
            >
              Search person
            </label>
            <input
              id="salaries-person-search"
              type="search"
              value={personSearch}
              onChange={(e) => setPersonSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-full rounded-md border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange/50 focus:outline-none focus:ring-1 focus:ring-lp-orange/20"
            />
          </div>
          <div className="min-w-[10rem] shrink-0">
            <label
              htmlFor="salaries-type-filter"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide lp-table-header-text"
            >
              Type
            </label>
            <BrandedSelect
              value={typeFilter}
              onChange={(v) => setTypeFilter((v as 'all' | PersonType) || 'all')}
              options={[
                { value: 'all', label: 'ALL' },
                { value: 'principal', label: 'PRINCIPAL' },
                { value: 'band', label: 'BAND' },
                { value: 'crew', label: 'CREW' },
              ]}
              ariaLabel="Filter by person type"
              className="w-full"
            />
          </div>
        </div>
        <div className="shrink-0 pb-0.5">
          <Link
            href={`/tours/${tourId}/payroll`}
            className="text-sm font-semibold text-lp-orange hover:text-lp-orange/90 hover:underline"
          >
            Go to Payroll <span aria-hidden className="whitespace-nowrap">→</span>
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-lp-border bg-lp-surface">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-lp-border">
              <th
                className={cn(
                  salaryThBase,
                  'sticky left-0 z-10 min-w-[140px] max-w-[200px] border-r border-lp-border bg-lp-surface text-left'
                )}
              >
                Person
              </th>
              <th className={cn(salaryThBase, 'text-left')}>Role</th>
              <th className={cn(salaryThBase, 'w-[120px] border-r border-lp-border bg-lp-surface text-left')}>Type</th>
              <th className={cn(salaryThBase, 'text-left')}>Rate type</th>
              <th className={cn(salaryThBase, 'text-right')}>Daily rate</th>
              <th className={cn(salaryThBase, 'text-right')}>Show rate</th>
              <th className={cn(salaryThBase, 'text-right')}>Off rate</th>
              <th className={cn(salaryThBase, 'text-right')}>Rehearsal</th>
              <th className={cn(salaryThBase, 'border-r border-lp-border bg-lp-surface text-right')}>Per diem</th>
              <th className={cn(salaryThBase, 'text-right')}>Advance fee</th>
              <th
                className={cn(salaryThBase, 'w-[8.5rem] text-right')}
                title="Salary, advance, plus per-day commission add-on when shown."
              >
                Projected fee
              </th>
              {showComm && (
                <th className={cn(salaryThBase, 'text-right italic')}>Comm.</th>
              )}
              <th className="w-24 px-2 py-2.5 align-bottom" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {displayPersonnel.map((p) => {
              const isEditing = editingId === p.id;
              const form: PersonnelRate = (isEditing ? { ...p, ...editForm } : p) as PersonnelRate;
              const { feeWithCommission, commissionAmount, perDiemTotal } = rowMoneyForPerson(p);
              const rateType = form.rate_type ?? 'day_rate';
              const suggestedAdv = suggestedAdvanceFee(
                totalTourDays,
                rateType,
                Number(form.show_rate) || 0,
                Number(form.off_rate) || 0
              );

              return (
                <tr key={p.id} className="border-b border-lp-border/30 hover:bg-lp-surface-hover">
                  <td className="px-3 py-2 text-lp-text font-medium">{p.person_name}</td>
                  <td className="px-3 py-2 text-lp-text-secondary">{p.role ?? '—'}</td>
                  <td className={cn('px-3 py-2 capitalize', personTypeCellClass(p.person_type))}>{p.person_type}</td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <BrandedSelect
                        value={form.rate_type ?? 'day_rate'}
                        onChange={(v) => setEditForm((prev) => ({ ...prev, rate_type: v }))}
                        options={[
                          { value: 'day_rate', label: 'Day Rate' },
                          { value: 'split_rate', label: 'Split Rate' },
                        ]}
                        ariaLabel="Rate type"
                        className="w-full"
                        size="sm"
                      />
                    ) : (
                      <span className="text-lp-text">{rateType === 'split_rate' ? 'Split Rate' : 'Day Rate'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {rateType === 'day_rate' && (
                      isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-sm tabular-nums text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                          value={form.off_rate ?? ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, off_rate: e.target.value === '' ? undefined : Number(e.target.value) }))}
                        />
                      ) : (
                        <div className="flex justify-end">
                          <SalaryCurrencyCell symbol={currencySymbol} amount={form.off_rate ?? 0} className="text-lp-text" />
                        </div>
                      )
                    )}
                    {rateType === 'split_rate' && <span className="text-lp-text-tertiary">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {rateType === 'split_rate' ? (
                      isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-sm tabular-nums text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                          value={form.show_rate ?? ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, show_rate: e.target.value === '' ? undefined : Number(e.target.value) }))}
                        />
                      ) : (
                        <div className="flex justify-end">
                          <SalaryCurrencyCell symbol={currencySymbol} amount={form.show_rate ?? 0} className="text-lp-text" />
                        </div>
                      )
                    ) : (
                      <span className="text-lp-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {rateType === 'split_rate' ? (
                      isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-sm tabular-nums text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                          value={form.off_rate ?? ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, off_rate: e.target.value === '' ? undefined : Number(e.target.value) }))}
                        />
                      ) : (
                        <div className="flex justify-end">
                          <SalaryCurrencyCell symbol={currencySymbol} amount={form.off_rate ?? 0} className="text-lp-text" />
                        </div>
                      )
                    ) : (
                      <span className="text-lp-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {rateType === 'split_rate' ? (
                      isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-sm tabular-nums text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                          value={form.rehearsal_rate ?? ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, rehearsal_rate: e.target.value === '' ? undefined : Number(e.target.value) }))}
                        />
                      ) : (
                        <div className="flex justify-end">
                          <SalaryCurrencyCell symbol={currencySymbol} amount={form.rehearsal_rate ?? 0} className="text-lp-text" />
                        </div>
                      )
                    ) : (
                      <span className="text-lp-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-sm tabular-nums text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                        value={form.per_diem ?? ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, per_diem: e.target.value === '' ? undefined : Number(e.target.value) }))}
                      />
                    ) : (
                      <div className="flex justify-end">
                        <SalaryCurrencyCell symbol={currencySymbol} amount={form.per_diem ?? 0} className="text-lp-text" />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <div className="flex items-center gap-1 justify-end">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-20 rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-sm tabular-nums text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                          value={form.advance_fee ?? ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, advance_fee: e.target.value === '' ? undefined : Number(e.target.value) }))}
                        />
                        <button
                          type="button"
                          className="rounded bg-lp-bg-tertiary px-2 py-1 text-xs text-lp-text-secondary hover:text-lp-text"
                          onClick={() => handleUseSuggested(rateType, Number(form.show_rate) || 0, Number(form.off_rate) || 0)}
                        >
                          {`Use suggested (${currencySymbol}${fmtMoney(suggestedAdv)})`}
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <SalaryCurrencyCell symbol={currencySymbol} amount={form.advance_fee ?? 0} className="text-lp-text" />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-lp-text-secondary">
                    <div className="flex justify-end">
                      <SalaryCurrencyCell symbol={currencySymbol} amount={feeWithCommission} className="font-medium" />
                    </div>
                  </td>
                  {showComm && (
                    <td className="px-3 py-2 text-right text-xs italic text-lp-text-tertiary">
                      {commissionAmount > 0 ? (
                        <div className="flex justify-end">
                          <SalaryCurrencyCell symbol={currencySymbol} amount={commissionAmount} className="text-xs italic text-lp-text-tertiary" />
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="rounded p-1 text-lp-orange hover:bg-lp-orange-subtle"
                            onClick={() => handleSave(p.id)}
                            disabled={!!savingId}
                          >
                            {savingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary"
                            onClick={() => { setEditingId(null); setEditForm({}); }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="rounded p-1 text-lp-text-tertiary hover:bg-lp-surface-hover"
                            onClick={() => { setEditingId(p.id); setEditForm({}); }}
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-lp-text-tertiary hover:bg-red-100 dark:hover:bg-red-900/20"
                            onClick={() => handleDelete(p.id)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        <div className="border-t border-lp-border bg-lp-surface p-5">
          <div className="ml-auto max-w-[500px] space-y-3">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-lp-text-tertiary">Total Salaries</span>
              <span className="font-mono tabular-nums tracking-wide text-lp-text">
                <span className="mr-1 text-lp-text-secondary">{currencySymbol}</span>
                {fmtMoney(grandFooterTotals.totalSal)}
              </span>
            </div>
            {typeBreakdownRows.map((row) => (
              <div
                key={`sal-${row.key}`}
                className="flex items-center justify-between pl-3 text-[12px] text-lp-text-secondary"
              >
                <span className={cn('font-normal', personTypeCellClass(row.key))}>{row.label}</span>
                <span className="font-mono tabular-nums tracking-wide">
                  <span className="mr-1 text-lp-text-tertiary">{currencySymbol}</span>
                  {fmtMoney(row.salary)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between text-[13px] pt-1">
              <span className="font-medium text-lp-text-tertiary">Total Per Diem</span>
              <span className="font-mono tabular-nums tracking-wide text-lp-text">
                <span className="mr-1 text-lp-text-secondary">{currencySymbol}</span>
                {fmtMoney(grandFooterTotals.totalPd)}
              </span>
            </div>
            {typeBreakdownRows.map((row) => (
              <div
                key={`pd-${row.key}`}
                className="flex items-center justify-between pl-3 text-[12px] text-lp-text-secondary"
              >
                <span className={cn('font-normal', personTypeCellClass(row.key))}>{row.label}</span>
                <span className="font-mono tabular-nums tracking-wide">
                  <span className="mr-1 text-lp-text-tertiary">{currencySymbol}</span>
                  {fmtMoney(row.perDiem)}
                </span>
              </div>
            ))}
            <div className="my-3 h-px w-full bg-lp-border opacity-60" />
            <div className="flex items-center justify-between text-[15px]">
              <span className="font-bold text-lp-text">Total (Salaries + Per Diem)</span>
              <span className="font-mono font-bold tabular-nums tracking-wide text-lp-orange">
                <span className="mr-1 text-lp-orange/60">{currencySymbol}</span>
                {fmtMoney(grandFooterTotals.totalSal + grandFooterTotals.totalPd)}
              </span>
            </div>
          </div>
        </div>
        <div className="border-t border-lp-border px-4 py-3">
          {addingMember && (
            <div className="mb-3 grid gap-2 rounded-lg border border-lp-border bg-lp-bg p-3 sm:grid-cols-4">
              {availableRoster.length === 0 ? (
                <p className="text-sm text-lp-text-secondary sm:col-span-4">
                  Everyone from the workspace roster is already on the rate sheet. Add people in{' '}
                  <span className="text-lp-text">Personnel</span> or the tour personnel view first.
                </p>
              ) : (
                <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                  <BrandedSelect
                    value={newMember.roster_id}
                    onChange={(v) => {
                      if (v === '__add_personnel__') {
                        router.push(`/tours/${tourId}/personnel`);
                        return;
                      }
                      setNewMember((prev) => ({ ...prev, roster_id: v }));
                    }}
                    options={[
                      { value: '', label: 'Select from roster…' },
                      { value: '__add_personnel__', label: 'Add new Personnel…' },
                      ...availableRoster.map((person) => ({
                        value: person.id,
                        label: `${person.name} (${person.lp_id})`,
                      })),
                    ]}
                    placeholder="Select from roster…"
                    ariaLabel="Roster member"
                    className="w-full"
                  />
                  <div className="flex flex-col gap-0.5 text-xs">
                    <Link
                      href="/personnel"
                      className="w-fit font-medium text-lp-orange hover:underline"
                    >
                      Add new person to roster
                    </Link>
                    <Link
                      href={`/tours/${tourId}/personnel`}
                      className="w-fit text-lp-text-tertiary hover:text-lp-text hover:underline"
                    >
                      Tour personnel (assign to this tour)
                    </Link>
                  </div>
                </div>
              )}
              <BrandedSelect
                value={newMember.person_type}
                onChange={(v) =>
                  setNewMember((prev) => ({ ...prev, person_type: v as 'principal' | 'band' | 'crew' }))
                }
                options={[
                  { value: 'principal', label: 'Principal' },
                  { value: 'band', label: 'Band' },
                  { value: 'crew', label: 'Crew' },
                ]}
                ariaLabel="Person type"
              />
              <BrandedSelect
                value={newMember.rate_type}
                onChange={(v) =>
                  setNewMember((prev) => ({ ...prev, rate_type: v as 'day_rate' | 'split_rate' }))
                }
                options={[
                  { value: 'day_rate', label: 'Day Rate' },
                  { value: 'split_rate', label: 'Split Rate' },
                ]}
                ariaLabel="Rate type"
              />
              <div className="sm:col-span-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-lp-border px-3 py-1.5 text-sm text-lp-text hover:bg-lp-bg-tertiary"
                  onClick={() => {
                    setAddingMember(false);
                    setNewMember({ roster_id: '', person_type: 'crew', rate_type: 'day_rate' });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-lp-orange px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  onClick={handleCreateMember}
                  disabled={savingId === '__new__' || !newMember.roster_id}
                >
                  {savingId === '__new__' ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-bg-tertiary"
            onClick={() => setAddingMember(true)}
          >
            <Plus className="h-4 w-4" />
            Add Member
          </button>
        </div>
      </div>
    </div>
  );
}
