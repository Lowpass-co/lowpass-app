'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

type DayStatus = 'show' | 'off_travel' | 'rehearsal' | 'no_tour';

type PersonnelRate = {
  id: string;
  person_name: string;
  role: string | null;
  person_type: string;
  rate_type: string;
  show_rate: number;
  off_rate: number;
  rehearsal_rate: number;
  per_diem: number;
  advance_fee: number;
  order_index: number;
};

type PayrollEntry = {
  id: string;
  personnel_id: string;
  week_start: string;
  day_statuses: Record<string, DayStatus>;
  advance_fee: number;
  total_fee: number;
  total_per_diem: number;
  notes: string | null;
  personnel?: PersonnelRate;
};

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function weekDates(weekStart: string): string[] {
  const out: string[] = [];
  const d = new Date(weekStart + 'T12:00:00Z');
  for (let i = 0; i < 7; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function countDayStatuses(dayStatuses: Record<string, DayStatus>): { show: number; off: number; rehearsal: number; active: number } {
  let show = 0, off = 0, rehearsal = 0;
  for (const v of Object.values(dayStatuses ?? {})) {
    if (v === 'show') show++;
    else if (v === 'off_travel') off++;
    else if (v === 'rehearsal') rehearsal++;
  }
  return { show, off, rehearsal, active: show + off + rehearsal };
}

/** Week fee per math spec §6; includes rehearsal_rate for split_rate */
function weekFee(
  rateType: string,
  show: number,
  off: number,
  rehearsal: number,
  active: number,
  showRate: number,
  offRate: number,
  rehearsalRate: number,
  advanceFee: number
): number {
  if (rateType === 'split_rate') {
    return show * showRate + off * offRate + rehearsal * rehearsalRate + advanceFee;
  }
  return active * offRate + advanceFee;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATUS_OPTIONS: { value: DayStatus; label: string; bg: string }[] = [
  { value: 'show', label: 'S', bg: 'bg-white border border-lp-border' },
  { value: 'off_travel', label: 'O', bg: 'bg-[#e0e0e0] dark:bg-gray-600' },
  { value: 'rehearsal', label: 'R', bg: 'bg-[#d0e8ff] dark:bg-blue-900/40' },
  { value: 'no_tour', label: '–', bg: 'bg-[#f5f5f5] dark:bg-gray-800' },
];

export function PayrollTab({ tourId }: { tourId: string }) {
  const [loading, setLoading] = useState(true);
  const [personnel, setPersonnel] = useState<PersonnelRate[]>([]);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string>('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tourFirstDate, setTourFirstDate] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string>('');

  const load = useCallback(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/budget/personnel-rates?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { personnel_rates: [] })),
      fetch(`/api/budget/payroll?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { entries: [] })),
      fetch(`/api/tours/${tourId}/routing`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([personnelRes, payrollRes, routing]: [unknown, { entries?: PayrollEntry[] }, { date: string }[]]) => {
        const rates = (personnelRes as { personnel_rates?: PersonnelRate[] })?.personnel_rates ?? [];
        const payrollEntries = payrollRes?.entries ?? [];
        setPersonnel(rates);
        setEntries(payrollEntries);
        const firstDate = routing?.[0]?.date ?? null;
        setTourFirstDate(firstDate);
        if (!selectedPersonId && rates.length > 0) setSelectedPersonId(rates[0].id);
        const starts = [...new Set(payrollEntries.map((e: PayrollEntry) => e.week_start))].sort();
        const defaultWeek = starts.length > 0 ? starts[0] : (firstDate ? getWeekStart(firstDate) : '');
        if (!weekStart && defaultWeek) setWeekStart(defaultWeek);
      })
      .catch((err) => setError(err?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => load(), [load]);

  const selectedPerson = personnel.find((p) => p.id === selectedPersonId);
  const personEntryForEffect = selectedPersonId && weekStart
    ? entries.find((e) => e.personnel_id === selectedPersonId && e.week_start === weekStart)
    : null;

  useEffect(() => {
    setNotesDraft(personEntryForEffect?.notes ?? '');
  }, [selectedPersonId, weekStart, personEntryForEffect?.notes]);

  const personEntry = personEntryForEffect;
  const dayStatuses = personEntry?.day_statuses ?? {};
  const dates = weekStart ? weekDates(weekStart) : [];
  const roles = [...new Set(personnel.map((p) => p.role).filter(Boolean))] as string[];
  const filteredPersonnel = personnel.filter((p) => {
    if (search && !p.person_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter && p.role !== roleFilter) return false;
    return true;
  });

  const counts = countDayStatuses(dayStatuses);
  const advanceFee = personEntry?.advance_fee ?? (weekStart && selectedPerson ? selectedPerson.advance_fee : 0);
  const isWeekOne = Boolean(tourFirstDate && weekStart && getWeekStart(tourFirstDate) === weekStart);
  const weekFeeVal = selectedPerson
    ? weekFee(
        selectedPerson.rate_type ?? 'day_rate',
        counts.show,
        counts.off,
        counts.rehearsal,
        counts.active,
        Number(selectedPerson.show_rate) || 0,
        Number(selectedPerson.off_rate) || 0,
        Number(selectedPerson.rehearsal_rate) || 0,
        isWeekOne ? advanceFee : 0
      )
    : 0;
  const weekPerDiem = selectedPerson ? counts.active * (Number(selectedPerson.per_diem) || 0) : 0;

  const setDayStatus = (dateStr: string, status: DayStatus) => {
    const next = { ...dayStatuses, [dateStr]: status };
    if (!selectedPersonId || !weekStart) return;
    setSaving(true);
    fetch('/api/budget/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tour_id: tourId,
        personnel_id: selectedPersonId,
        week_start: weekStart,
        day_statuses: next,
        advance_fee: isWeekOne ? advanceFee : 0,
        notes: notesDraft || null,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Save failed'))))
      .then(() => load())
      .catch(() => setError('Failed to save'))
      .finally(() => setSaving(false));
  };

  const setAdvanceFee = (value: number) => {
    if (!selectedPersonId || !weekStart || !isWeekOne) return;
    setSaving(true);
    fetch('/api/budget/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tour_id: tourId,
        personnel_id: selectedPersonId,
        week_start: weekStart,
        day_statuses: dayStatuses,
        advance_fee: value,
        notes: notesDraft || null,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Save failed'))))
      .then(() => load())
      .catch(() => setError('Failed to save'))
      .finally(() => setSaving(false));
  };

  const saveNotes = (value: string) => {
    if (!selectedPersonId || !weekStart) return;
    setSaving(true);
    fetch('/api/budget/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tour_id: tourId,
        personnel_id: selectedPersonId,
        week_start: weekStart,
        day_statuses: dayStatuses,
        advance_fee: isWeekOne ? advanceFee : 0,
        notes: value || null,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Save failed'))))
      .then(() => load())
      .catch(() => setError('Failed to save'))
      .finally(() => setSaving(false));
  };

  const allStarts = [...new Set(entries.map((e) => e.week_start))].sort();
  const currentIndex = weekStart ? allStarts.indexOf(weekStart) : -1;
  const baseWeek = weekStart || tourFirstDate ? getWeekStart(tourFirstDate || '') : '';
  const goPrev = () => {
    if (currentIndex > 0) setWeekStart(allStarts[currentIndex - 1]);
    else if (baseWeek) {
      const d = new Date(baseWeek + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - 7);
      setWeekStart(d.toISOString().slice(0, 10));
    }
  };
  const goNext = () => {
    if (currentIndex >= 0 && currentIndex < allStarts.length - 1) setWeekStart(allStarts[currentIndex + 1]);
    else {
      const ref = weekStart || baseWeek || new Date().toISOString().slice(0, 10);
      const d = new Date(getWeekStart(ref) + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 7);
      setWeekStart(d.toISOString().slice(0, 10));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading payroll…
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

  return (
    <div className="flex gap-6">
      <aside className="w-56 shrink-0 space-y-3 rounded-xl border border-lp-border bg-lp-surface p-4">
        <input
          type="text"
          placeholder="Search person"
          className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-sm text-lp-text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {roles.length > 0 && (
          <select
            className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-sm text-lp-text"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}
        <div className="max-h-80 overflow-y-auto">
          {filteredPersonnel.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPersonId(p.id)}
              className={cn(
                'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                selectedPersonId === p.id
                  ? 'bg-lp-orange-subtle text-lp-orange font-medium'
                  : 'text-lp-text hover:bg-lp-bg-tertiary'
              )}
            >
              <div className="font-medium">{p.person_name}</div>
              {p.role && <div className="text-xs text-lp-text-tertiary">{p.role}</div>}
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-4 rounded-xl border border-lp-border bg-lp-surface p-6">
        {!selectedPerson ? (
          <p className="text-lp-text-secondary">Select a person from the list.</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-lp-text">
                {selectedPerson.person_name}
                {selectedPerson.role && (
                  <span className="ml-2 text-sm font-normal text-lp-text-tertiary">{selectedPerson.role}</span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  className="rounded p-1.5 text-lp-text-tertiary hover:bg-lp-bg-tertiary"
                  aria-label="Previous week"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="min-w-[140px] text-center font-medium text-lp-text">
                  Week of {weekStart ? formatDate(weekStart) : '—'}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded p-1.5 text-lp-text-tertiary hover:bg-lp-bg-tertiary"
                  aria-label="Next week"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {DAY_LABELS.map((label, i) => (
                <div key={label} className="text-center text-xs font-medium text-lp-text-tertiary">
                  {label}
                  {dates[i] && <div className="text-[10px]">{formatDate(dates[i]).replace(/\/\d{2}$/, '')}</div>}
                </div>
              ))}
              {dates.map((dateStr) => {
                const status = (dayStatuses[dateStr] ?? 'no_tour') as DayStatus;
                const opt = STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[3];
                return (
                  <div key={dateStr} className="flex justify-center">
                    <select
                      value={status}
                      onChange={(e) => setDayStatus(dateStr, e.target.value as DayStatus)}
                      className={cn(
                        'h-12 w-full max-w-[64px] rounded border text-center text-sm font-medium cursor-pointer focus:ring-2 focus:ring-lp-orange focus:outline-none',
                        opt.bg,
                        'border-lp-border dark:border-gray-600'
                      )}
                      title={dateStr}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label} ({o.value.replace('_', ' ')})</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-lp-border pt-4 space-y-2 text-sm">
              <div className="flex gap-6">
                <span className="text-lp-text-secondary">Show Days: <strong className="text-lp-text">{counts.show}</strong></span>
                <span className="text-lp-text-secondary">Off Days: <strong className="text-lp-text">{counts.off}</strong></span>
                <span className="text-lp-text-secondary">Rehearsal Days: <strong className="text-lp-text">{counts.rehearsal}</strong></span>
                <span className="text-lp-text-secondary">Active Days: <strong className="text-lp-text">{counts.active}</strong></span>
              </div>
              <div className="text-base font-semibold">
                Week Fee: {weekFeeVal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-base font-semibold">
                Week Per Diem: {weekPerDiem.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-lg font-bold text-lp-text">
                Total for Week: {(weekFeeVal + weekPerDiem).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="border-t border-lp-border pt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-lp-text-tertiary mb-1">Advance Fee (week 1 only)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={cn(
                    'w-full max-w-[120px] rounded border border-lp-border px-2 py-1.5 text-lp-text tabular-nums',
                    isWeekOne ? 'bg-lp-bg' : 'bg-lp-bg-tertiary cursor-not-allowed'
                  )}
                  value={isWeekOne ? advanceFee : ''}
                  onChange={(e) => isWeekOne && setAdvanceFee(e.target.value ? Number(e.target.value) : 0)}
                  disabled={!isWeekOne}
                />
                {!isWeekOne && <p className="mt-1 text-xs text-lp-text-tertiary">Only editable on week 1</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-lp-text-tertiary mb-1">Notes</label>
                <input
                  type="text"
                  className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-sm text-lp-text"
                  placeholder="e.g. 1 show, 2 rehearsals"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={() => saveNotes(notesDraft)}
                />
              </div>
            </div>

            {saving && (
              <div className="flex items-center gap-2 text-sm text-lp-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
