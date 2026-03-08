'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
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

export function SalariesTab({
  tourId,
  showCommission = false,
}: {
  tourId: string;
  showCommission?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [personnel, setPersonnel] = useState<PersonnelRate[]>([]);
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([]);
  const [routing, setRouting] = useState<RoutingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PersonnelRate>>({});

  const load = useCallback(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/budget/personnel-rates?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { personnel_rates: [] })),
      fetch(`/api/budget/payroll?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { entries: [] })),
      fetch(`/api/tours/${tourId}/routing`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([personnelRes, payrollRes, routingData]) => {
        setPersonnel(personnelRes?.personnel_rates ?? []);
        setPayrollEntries(payrollRes?.entries ?? []);
        setRouting(Array.isArray(routingData) ? routingData : []);
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

  const dayCountsByPerson = (() => {
    const map = new Map<string, { show: number; off: number; rehearsal: number; active: number }>();
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

  let totalSalaries = 0;
  let totalPerDiemSum = 0;
  const showComm = effectiveShowCommission;

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

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-lp-border bg-lp-surface">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-lp-border bg-lp-bg-tertiary/50">
              <th className="px-3 py-2 text-left font-semibold text-lp-text">Person</th>
              <th className="px-3 py-2 text-left font-semibold text-lp-text">Role</th>
              <th className="px-3 py-2 text-left font-semibold text-lp-text w-24">Type</th>
              <th className="px-3 py-2 text-left font-semibold text-lp-text w-28">Rate Type</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-24">Daily Rate</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-24">Show Rate</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-24">Off Rate</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-24">Rehearsal</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-24">Per Diem</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-28">Advance Fee</th>
              <th className="px-3 py-2 text-right font-semibold text-lp-text w-28">Projected Fee</th>
              {showComm && (
                <th className="px-3 py-2 text-right font-semibold text-lp-text w-20 italic">Comm.</th>
              )}
              <th className="px-3 py-2 w-24" />
            </tr>
          </thead>
          <tbody>
            {personnel.map((p) => {
              const counts = dayCountsByPerson.get(p.id) ?? {
                show: 0,
                off: 0,
                rehearsal: 0,
                active: 0,
              };
              const activeDays = counts.active || totalTourDays;
              const isEditing = editingId === p.id;
              const form = isEditing ? { ...p, ...editForm } : p;
              const rateType = form.rate_type ?? 'day_rate';
              const fee = projectedFee(
                rateType,
                counts.show,
                counts.off,
                counts.rehearsal,
                counts.active || totalTourDays,
                Number(form.show_rate) || 0,
                Number(form.off_rate) || 0,
                Number(form.rehearsal_rate) || 0,
                Number(form.advance_fee) || 0
              );
              const commissionAmount = showComm && (form.commission ?? 0) ? (counts.active || totalTourDays) * Number(form.commission) : 0;
              const feeWithCommission = fee + commissionAmount;
              const perDiemTotal = (Number(form.per_diem) || 0) * activeDays;
              totalSalaries += feeWithCommission;
              totalPerDiemSum += perDiemTotal;

              const suggestedAdv = suggestedAdvanceFee(totalTourDays, rateType, Number(form.show_rate) || 0, Number(form.off_rate) || 0);

              return (
                <tr key={p.id} className="border-b border-lp-border/60 hover:bg-lp-bg-tertiary/20">
                  <td className="px-3 py-2 text-lp-text font-medium">{p.person_name}</td>
                  <td className="px-3 py-2 text-lp-text-secondary">{p.role ?? '—'}</td>
                  <td className="px-3 py-2 text-lp-text-tertiary capitalize">{p.person_type}</td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <select
                        className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                        value={form.rate_type}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, rate_type: e.target.value }))}
                      >
                        <option value="day_rate">Day Rate</option>
                        <option value="split_rate">Split Rate</option>
                      </select>
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
                          className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-right tabular-nums"
                          value={form.off_rate ?? ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, off_rate: e.target.value ? Number(e.target.value) : 0 }))}
                        />
                      ) : (
                        <span className="tabular-nums text-lp-text">
                          {(form.off_rate ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        </span>
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
                          className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-right tabular-nums"
                          value={form.show_rate ?? ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, show_rate: e.target.value ? Number(e.target.value) : 0 }))}
                        />
                      ) : (
                        <span className="tabular-nums text-lp-text">{(form.show_rate ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
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
                          className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-right tabular-nums"
                          value={form.off_rate ?? ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, off_rate: e.target.value ? Number(e.target.value) : 0 }))}
                        />
                      ) : (
                        <span className="tabular-nums text-lp-text">{(form.off_rate ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
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
                          className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-right tabular-nums"
                          value={form.rehearsal_rate ?? ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, rehearsal_rate: e.target.value ? Number(e.target.value) : 0 }))}
                        />
                      ) : (
                        <span className="tabular-nums text-lp-text">{(form.rehearsal_rate ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
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
                        className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-right tabular-nums"
                        value={form.per_diem ?? ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, per_diem: e.target.value ? Number(e.target.value) : 0 }))}
                      />
                    ) : (
                      <span className="tabular-nums text-lp-text">{(form.per_diem ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <div className="flex items-center gap-1 justify-end">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-20 rounded border border-lp-border bg-lp-bg px-2 py-1 text-right tabular-nums"
                          value={form.advance_fee ?? ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, advance_fee: e.target.value ? Number(e.target.value) : 0 }))}
                        />
                        <button
                          type="button"
                          className="rounded bg-lp-bg-tertiary px-2 py-1 text-xs text-lp-text-secondary hover:text-lp-text"
                          onClick={() => handleUseSuggested(rateType, Number(form.show_rate) || 0, Number(form.off_rate) || 0)}
                        >
                          Use suggested ({suggestedAdv.toFixed(0)})
                        </button>
                      </div>
                    ) : (
                      <span className="tabular-nums text-lp-text">{(form.advance_fee ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-lp-text-secondary font-medium">
                    {feeWithCommission.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  {showComm && (
                    <td className="px-3 py-2 text-right text-xs italic text-lp-text-tertiary">
                      {commissionAmount > 0 ? commissionAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 }) : '—'}
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
          <tfoot>
            <tr className="border-t-2 border-lp-border bg-lp-bg-tertiary/30 font-bold">
              <td colSpan={showComm ? 10 : 9} className="px-3 py-3 text-lp-text">
                Total Salaries
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-lp-text">
                {totalSalaries.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              {showComm && <td />}
              <td />
            </tr>
            <tr className="border-b border-lp-border bg-lp-bg-tertiary/30 font-bold">
              <td colSpan={showComm ? 10 : 9} className="px-3 py-2 text-lp-text">
                Total Per Diem
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-lp-text">
                {totalPerDiemSum.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              {showComm && <td />}
              <td />
            </tr>
            <tr className="border-b border-lp-border bg-lp-bg-tertiary/30 font-bold text-base">
              <td colSpan={showComm ? 10 : 9} className="px-3 py-3 text-lp-text">
                Total (Salaries + Per Diem)
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-lp-text">
                {(totalSalaries + totalPerDiemSum).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              {showComm && <td />}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
