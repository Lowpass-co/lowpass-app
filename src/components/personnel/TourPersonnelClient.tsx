'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import type { Personnel, PersonnelRate } from '@/types';
import { cn } from '@/lib/utils';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { useToast } from '@/components/ui/Toast';

export function TourPersonnelClient({
  tourId,
  tourName,
  currency,
  initialRates,
  initialRoster,
}: {
  tourId: string;
  tourName: string;
  currency: string;
  initialRates: PersonnelRate[];
  initialRoster: Personnel[];
}) {
  const { showToast } = useToast();
  const [rates, setRates] = useState(initialRates);
  const [roster] = useState(initialRoster);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState<PersonnelRate | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const assignedRosterIds = useMemo(
    () => new Set(rates.map((r) => r.roster_personnel_id).filter(Boolean) as string[]),
    [rates]
  );

  const availableRoster = useMemo(
    () => roster.filter((p) => !assignedRosterIds.has(p.id)),
    [roster, assignedRosterIds]
  );

  const addFromRoster = async (personnelId: string) => {
    setAddingId(personnelId);
    try {
      const res = await fetch('/api/budget/personnel-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour_id: tourId, roster_personnel_id: personnelId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not add to tour');
      setRates((prev) => {
        const next = [...prev, data as PersonnelRate];
        next.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        return next;
      });
      showToast('Added to tour');
      setPickerOpen(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Add failed', 'error');
    } finally {
      setAddingId(null);
    }
  };

  const confirmRemove = async () => {
    if (!removeOpen) return;
    const id = removeOpen.id;
    try {
      const res = await fetch('/api/budget/personnel-rates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Remove failed');
      showToast('Removed from tour');
      setRemoveOpen(null);
      setRemovingId(id);
      setTimeout(() => {
        setRates((prev) => prev.filter((r) => r.id !== id));
        setRemovingId(null);
      }, 200);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Remove failed', 'error');
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-lp-text">Tour personnel</h1>
          <p className="mt-1 text-sm text-lp-text-secondary">
            {tourName} — people on this tour appear in budget, payroll, and rooming ({currency}).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={availableRoster.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <UserPlus size={18} />
            Add from roster
          </button>
          <Link
            href={`/budget?tour_id=${tourId}`}
            className="inline-flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface px-4 py-2 text-sm font-medium text-lp-text hover:border-lp-orange hover:text-lp-orange"
          >
            Open budget
          </Link>
          <Link
            href={`/tours/${tourId}/rooming`}
            className="inline-flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface px-4 py-2 text-sm font-medium text-lp-text hover:border-lp-orange hover:text-lp-orange"
          >
            Rooming
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-lp-border bg-lp-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-lp-border bg-lp-bg-tertiary/40 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Show / off / PD</th>
                <th className="px-4 py-3">Source</th>
                <th className="w-12 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {rates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-lp-text-secondary">
                    No one on this tour yet. Add people from your workspace roster, or add ad-hoc names in{' '}
                    <Link href={`/budget?tour_id=${tourId}`} className="text-lp-orange hover:underline">
                      Budget
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                rates.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      'border-b border-lp-border/80 hover:bg-lp-surface-hover/80',
                      removingId === r.id && 'opacity-40'
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-lp-text">{r.person_name}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-lp-text-secondary">
                      {r.role || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-lp-text-secondary">{r.person_type}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-lp-text-secondary">
                      {r.show_rate} / {r.off_rate} / {r.per_diem}
                    </td>
                    <td className="px-4 py-3 text-xs text-lp-text-tertiary">
                      {r.roster_personnel_id ? 'Roster' : 'Manual'}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setRemoveOpen(r)}
                        className="rounded-lg p-2 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                        title="Remove from tour"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-lp-text-tertiary">
        Editing commission, person type, and detailed rates is done in the budget personnel tab. Workspace roster lives under{' '}
        <Link href="/personnel" className="text-lp-orange hover:underline">
          Data → Personnel
        </Link>
        .
      </p>

      {pickerOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setPickerOpen(false)}
          />
          <div className="relative z-[81] max-h-[min(80vh,520px)] w-full max-w-md overflow-hidden rounded-xl border border-lp-border bg-lp-surface shadow-xl">
            <div className="border-b border-lp-border px-4 py-3">
              <h2 className="font-semibold text-lp-text">Add from workspace roster</h2>
              <p className="mt-0.5 text-xs text-lp-text-secondary">
                People already on this tour are hidden.
              </p>
            </div>
            <ul className="max-h-[min(60vh,400px)] overflow-y-auto p-2">
              {availableRoster.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-lp-bg-tertiary/60"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-lp-text">{p.name}</p>
                    <p className="truncate text-xs text-lp-text-tertiary">
                      {p.lp_id}
                      {p.role ? ` · ${p.role}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={addingId === p.id}
                    onClick={() => addFromRoster(p.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-lp-border px-3 py-1.5 text-xs font-medium text-lp-text hover:border-lp-orange hover:text-lp-orange disabled:opacity-50"
                  >
                    <Plus size={14} />
                    {addingId === p.id ? 'Adding…' : 'Add'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <DeleteConfirmationModal
        open={!!removeOpen}
        itemName={removeOpen?.person_name ?? 'Person'}
        onClose={() => setRemoveOpen(null)}
        onConfirm={confirmRemove}
        description="Removes this line from tour budget / payroll. Rooming rows that used this name may need a quick check."
      />
    </>
  );
}
