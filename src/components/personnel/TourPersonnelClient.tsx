'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, UserPlus, X } from 'lucide-react';
import type { Personnel, PersonnelRate } from '@/types';
import { cn } from '@/lib/utils';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { useToast } from '@/components/ui/Toast';
import { TourPersonnelDetailSlideOver } from './TourPersonnelDetailSlideOver';

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
  const router = useRouter();
  const [rates, setRates] = useState(initialRates);
  const [roster, setRoster] = useState(initialRoster);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState<PersonnelRate | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [detailRate, setDetailRate] = useState<PersonnelRate | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRates(initialRates);
  }, [tourId, initialRates]);

  useEffect(() => {
    setRoster(initialRoster);
  }, [tourId, initialRoster]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set(rates.map((r) => r.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      if (prev.size !== next.size) changed = true;
      return changed ? next : prev;
    });
  }, [rates]);

  const assignedRosterIds = useMemo(
    () => new Set(rates.map((r) => r.roster_personnel_id).filter(Boolean) as string[]),
    [rates]
  );

  const availableRoster = useMemo(
    () => roster.filter((p) => !assignedRosterIds.has(p.id)),
    [roster, assignedRosterIds]
  );

  const allRatesSelected = rates.length > 0 && rates.every((r) => selectedIds.has(r.id));
  const someRatesSelected = rates.some((r) => selectedIds.has(r.id));

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = someRatesSelected && !allRatesSelected;
  }, [someRatesSelected, allRatesSelected]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllRates = () => setSelectedIds(new Set(rates.map((r) => r.id)));
  const clearSelection = () => setSelectedIds(new Set());

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
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        router.refresh();
      }, 200);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Remove failed', 'error');
    }
  };

  const confirmBulkRemove = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/budget/personnel-rates/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour_id: tourId, ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Remove failed');
      const gone = new Set((data.deleted_ids as string[] | undefined) ?? ids);
      setRates((prev) => prev.filter((r) => !gone.has(r.id)));
      if (detailRate && gone.has(detailRate.id)) {
        setDetailOpen(false);
        setDetailRate(null);
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        gone.forEach((id) => next.delete(id));
        return next;
      });
      showToast(`Removed ${data.deleted ?? gone.size} from tour`);
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Remove failed', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-lp-text">Tour personnel</h1>
          <p className="mt-1 text-sm text-lp-text-secondary">
            {tourName} — people on this tour appear in budget, payroll, and rooming ({currency}). Click a row for details.
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

      {rates.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-lp-border bg-lp-surface px-3 py-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-lp-text">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allRatesSelected}
              onChange={(e) => (e.target.checked ? selectAllRates() : clearSelection())}
              className="lp-checkbox"
            />
            <span>
              Select all<span className="ml-1 text-lp-text-secondary">({rates.length})</span>
            </span>
          </label>
          {selectedIds.size > 0 ? (
            <>
              <span className="text-xs text-lp-text-secondary">{selectedIds.size} selected</span>
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(true)}
                className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-300 dark:hover:bg-red-500/15"
              >
                Remove from tour
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs font-medium text-lp-text-tertiary hover:text-lp-text"
              >
                Clear
              </button>
            </>
          ) : null}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-lp-border bg-lp-surface">
        {rates.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-lp-text-secondary">
            No one on this tour yet. Add people from your workspace roster, or add ad-hoc names in{' '}
            <Link href={`/budget?tour_id=${tourId}`} className="text-lp-orange hover:underline">
              Budget
            </Link>
            .
          </div>
        ) : (
          <ul className="divide-y divide-lp-border">
            {rates.map((r) => (
              <li
                key={r.id}
                className={cn(
                  'group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-lp-surface-hover/80',
                  removingId === r.id && 'opacity-40'
                )}
                onClick={() => {
                  setDetailRate(r);
                  setDetailOpen(true);
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.id)}
                  onChange={() => toggleSelect(r.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="lp-checkbox"
                  aria-label={`Select ${r.person_name}`}
                />
                <div className="h-10 w-0.5 shrink-0 rounded-full bg-lp-border group-hover:bg-lp-orange/60" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-lp-text">{r.person_name}</p>
                  <p className="mt-0.5 text-xs text-lp-text-secondary">
                    {(r.role || '—') + ' · '}
                    <span className="capitalize">{r.person_type}</span>
                    {' · '}
                    <span className="tabular-nums">
                      {r.show_rate} / {r.off_rate} / {r.per_diem}
                    </span>
                    {r.roster_personnel_id ? (
                      <span className="text-lp-text-tertiary"> · Roster</span>
                    ) : (
                      <span className="text-lp-text-tertiary"> · Manual</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRemoveOpen(r);
                  }}
                  className="shrink-0 rounded-lg p-2 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                  title="Remove from tour"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-lp-text-tertiary">
        Full workspace profiles live under{' '}
        <Link href="/personnel" className="text-lp-orange hover:underline">
          Data → Personnel
        </Link>
        . Run SQL migrations 025 and 026 in Supabase so roster links and extended profiles work end-to-end.
      </p>

      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-[85] bg-black/20" aria-hidden onClick={() => setPickerOpen(false)} />
          <div className="fixed top-0 right-0 z-[90] flex h-full w-full flex-col border-l border-lp-border bg-lp-bg shadow-2xl md:w-[min(100vw,420px)]">
            <header className="flex items-start justify-between gap-3 border-b border-lp-border p-4">
              <div>
                <h2 className="text-lg font-bold text-lp-text">Add from roster</h2>
                <p className="mt-1 text-xs text-lp-text-secondary">People already on this tour are hidden.</p>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-lg p-1.5 text-lp-text-secondary hover:bg-lp-surface"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </header>
            <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-lp-border">
              {availableRoster.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={addingId === p.id}
                    onClick={() => addFromRoster(p.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-lp-surface-hover/80 disabled:opacity-50"
                  >
                    <div className="h-8 w-0.5 shrink-0 rounded-full bg-lp-border" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-lp-text">{p.name}</p>
                      <p className="text-xs text-lp-text-tertiary">
                        {p.lp_id}
                        {p.role ? ` · ${p.role}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-lp-orange">{addingId === p.id ? '…' : <Plus size={18} />}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <TourPersonnelDetailSlideOver
        open={detailOpen}
        rate={detailRate}
        tourId={tourId}
        onClose={() => {
          setDetailOpen(false);
          setDetailRate(null);
        }}
        onSaved={(updated) => {
          setRates((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        }}
      />

      <DeleteConfirmationModal
        open={!!removeOpen}
        itemName={removeOpen?.person_name ?? 'Person'}
        onClose={() => setRemoveOpen(null)}
        onConfirm={confirmRemove}
        description="Removes this line from tour budget / payroll. Rooming rows that used this name may need a quick check."
      />

      <DeleteConfirmationModal
        open={bulkDeleteOpen}
        itemName={`${selectedIds.size} tour personnel line${selectedIds.size === 1 ? '' : 's'}`}
        onClose={() => !bulkDeleting && setBulkDeleteOpen(false)}
        onConfirm={confirmBulkRemove}
        description="Removes selected people from this tour only (workspace roster is unchanged). Payroll and rooming rows for those names may need a quick check."
      />
    </>
  );
}
