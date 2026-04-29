'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, UserPlus, X } from 'lucide-react';
import type { Personnel, PersonnelRate } from '@/types';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { useToast } from '@/components/ui/Toast';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import { useEntityRouting } from '@/components/entity/EntityRoutingContext';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkRoleSaving, setBulkRoleSaving] = useState(false);
  const entityRouting = useEntityRouting();

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
      setTimeout(() => {
        setRates((prev) => prev.filter((r) => r.id !== id));
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

  const bulkAssignRole = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const nextRole = window.prompt('Assign role to selected people', '')?.trim();
    if (!nextRole) return;
    setBulkRoleSaving(true);
    try {
      await Promise.all(
        ids.map(async (id) => {
          const res = await fetch('/api/budget/personnel-rates', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, role: nextRole }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? 'Role update failed');
          return data as PersonnelRate;
        })
      );
      setRates((prev) => prev.map((r) => (selectedIds.has(r.id) ? { ...r, role: nextRole } : r)));
      showToast(`Assigned role "${nextRole}"`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Bulk role assignment failed', 'error');
    } finally {
      setBulkRoleSaving(false);
    }
  };

  const rosterMap = useMemo(() => {
    const m = new Map<string, Personnel>();
    for (const p of roster) m.set(p.id, p);
    return m;
  }, [roster]);

  type TableRow = PersonnelRate & { email: string | null; phone: string | null; status: 'active' | 'inactive' };
  const rows: TableRow[] = useMemo(
    () =>
      rates.map((r) => {
        const linked = r.roster_personnel_id ? rosterMap.get(r.roster_personnel_id) : undefined;
        return {
          ...r,
          email: linked?.email ?? null,
          phone: linked?.phone ?? null,
          status: linked ? 'active' : 'inactive',
        };
      }),
    [rates, rosterMap]
  );

  const roleOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.role).filter((v): v is string => !!v))).map((value) => ({
        value,
        label: value,
      })),
    [rows]
  );

  const columns = useMemo<ColumnDef<TableRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessor: 'person_name',
        sortable: true,
        frozen: true,
      },
      {
        id: 'role',
        header: 'Role',
        accessor: (r) => r.role ?? '',
        sortable: true,
        filter: { kind: 'select', options: roleOptions },
        cell: (value) => String(value || '—'),
      },
      {
        id: 'employment',
        header: 'Employment type',
        accessor: 'person_type',
        sortable: true,
        filter: {
          kind: 'select',
          options: [
            { value: 'principal', label: 'principal' },
            { value: 'band', label: 'band' },
            { value: 'crew', label: 'crew' },
          ],
        },
      },
      {
        id: 'rate',
        header: 'Rate',
        accessor: (r) => r.show_rate,
        sortable: true,
        align: 'right',
        cell: (_, r) => `${currency} ${Number(r.show_rate ?? 0).toLocaleString()}`,
      },
      {
        id: 'email',
        header: 'Email',
        accessor: (r) => r.email ?? '',
        cell: (value) => String(value || '—'),
      },
      {
        id: 'phone',
        header: 'Phone',
        accessor: (r) => r.phone ?? '',
        cell: (value) => String(value || '—'),
      },
      {
        id: 'status',
        header: 'Status',
        accessor: 'status',
        filter: {
          kind: 'select',
          options: [
            { value: 'active', label: 'active' },
            { value: 'inactive', label: 'inactive' },
          ],
        },
        cell: (value) => (
          <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize border border-lp-border">
            {String(value)}
          </span>
        ),
      },
      {
        id: 'remove',
        header: '',
        accessor: (r) => r.id,
        align: 'right',
        cell: (_, r) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRemoveOpen(r);
            }}
            className="rounded border border-lp-border px-2 py-1 text-xs hover:bg-lp-bg-tertiary"
          >
            Remove
          </button>
        ),
      },
    ],
    [currency, roleOptions]
  );

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

      <DataTable<TableRow>
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        searchable
        searchPlaceholder="Search people…"
        selectable
        selectedIds={[...selectedIds]}
        onSelectionChange={(ids) => setSelectedIds(new Set(ids))}
        selectionActions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void bulkAssignRole()}
              disabled={selectedIds.size === 0 || bulkRoleSaving}
              className="rounded border border-lp-border px-2 py-1 text-xs hover:bg-lp-bg-tertiary disabled:opacity-50"
            >
              {bulkRoleSaving ? 'Assigning…' : 'Assign role to selection'}
            </button>
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={selectedIds.size === 0 || bulkDeleting}
              className="rounded border border-red-500/50 px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 disabled:opacity-50"
            >
              Remove from tour
            </button>
          </div>
        }
        onRowClick={(row) => {
          if (row.roster_personnel_id) {
            entityRouting.open({ kind: 'person', id: row.roster_personnel_id });
            return;
          }
          showToast('This manual row is not linked to a person record yet.', 'error');
        }}
        emptyState={
          <div className="px-4 py-14 text-center text-sm text-lp-text-secondary">
            No one on this tour yet. Add people from your workspace roster, or add ad-hoc names in{' '}
            <Link href={`/budget?tour_id=${tourId}`} className="text-lp-orange hover:underline">
              Budget
            </Link>
            .
          </div>
        }
      />

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
