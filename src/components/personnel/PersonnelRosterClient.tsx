'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Search, User, Upload } from 'lucide-react';
import type { Personnel } from '@/types';
import { cn } from '@/lib/utils';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { useToast } from '@/components/ui/Toast';
import { PersonnelDetailSlideOver, type PersonnelPanelState } from './PersonnelDetailSlideOver';
import { PersonnelImportModal } from './PersonnelImportModal';

function formatRates(sr: unknown): string {
  const o = (sr && typeof sr === 'object' ? sr : {}) as Record<string, unknown>;
  const cur = typeof o.currency === 'string' ? o.currency : 'GBP';
  const show = Number(o.show_day_rate) || 0;
  const off = Number(o.off_day_rate) || 0;
  const pd = Number(o.per_diem_rate) || 0;
  return `${cur} · show ${show} · off ${off} · PD ${pd}`;
}

export function PersonnelRosterClient({
  initial,
  initialOpenPersonnelId,
}: {
  initial: Personnel[];
  initialOpenPersonnelId?: string | null;
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<PersonnelPanelState>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState<Personnel | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  useEffect(() => {
    if (!initialOpenPersonnelId) return;
    const exists = initial.some((p) => p.id === initialOpenPersonnelId);
    if (exists) setPanel({ mode: 'edit', id: initialOpenPersonnelId });
  }, [initialOpenPersonnelId, initial]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.role ?? '').toLowerCase().includes(q) ||
        p.lp_id.toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));
  const someFilteredSelected = filtered.some((p) => selectedIds.has(p.id));

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
  }, [someFilteredSelected, allFilteredSelected]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
        else changed = true;
      });
      if (prev.size !== next.size) changed = true;
      return changed ? next : prev;
    });
  }, [rows]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => setSelectedIds(new Set(filtered.map((p) => p.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleSaved = (row: Personnel, meta?: { source?: 'form' | 'document' }) => {
    setRows((prev) => {
      const i = prev.findIndex((p) => p.id === row.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = row;
        return next;
      }
      return [...prev, row].sort((a, b) => a.lp_id.localeCompare(b.lp_id));
    });
    if (meta?.source === 'document') return;
    showToast(panel?.mode === 'create' ? 'Personnel added' : 'Personnel updated');
  };

  const handleImported = (created: Personnel[]) => {
    if (created.length === 0) return;
    setRows((prev) => [...prev, ...created].sort((a, b) => a.lp_id.localeCompare(b.lp_id)));
  };

  const handleDeleteConfirm = async () => {
    if (!deleteOpen) return;
    const id = deleteOpen.id;
    try {
      const res = await fetch(`/api/personnel/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      showToast('Removed from roster');
      setDeleteOpen(null);
      setDeletingId(id);
      setTimeout(() => {
        setRows((prev) => prev.filter((p) => p.id !== id));
        setDeletingId(null);
        router.refresh();
      }, 250);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) throw new Error('Nothing selected');
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/personnel/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      const gone = new Set((data.deleted_ids as string[] | undefined) ?? ids);
      setRows((prev) => prev.filter((p) => !gone.has(p.id)));
      if (panel?.mode === 'edit' && gone.has(panel.id)) setPanel(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        gone.forEach((id) => next.delete(id));
        return next;
      });
      showToast(`Removed ${data.deleted ?? gone.size} from roster`);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-md flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lp-text-tertiary"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, LP ID, role, email…"
            className="w-full rounded-lg border border-lp-border bg-lp-surface py-2 pl-9 pr-3 text-sm text-lp-text outline-none focus:border-lp-orange"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-lp-border bg-lp-surface px-4 py-2 text-sm font-medium text-lp-text hover:border-lp-orange hover:text-lp-orange"
          >
            <Upload size={18} />
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => setPanel({ mode: 'create' })}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={18} />
            Add personnel
          </button>
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-lp-border bg-lp-surface px-3 py-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-lp-text">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allFilteredSelected}
              onChange={(e) => (e.target.checked ? selectAllFiltered() : clearSelection())}
              className="lp-checkbox"
            />
            <span>
              Select all{search.trim() ? ' matching' : ''}
              <span className="ml-1 text-lp-text-secondary">({filtered.length})</span>
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
                Delete selected
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
        {filtered.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-lp-text-secondary">
            {rows.length === 0
              ? 'No one on the roster yet. Add people or import CSV, then assign them on a tour’s Personnel page.'
              : 'No matches for your search.'}
          </div>
        ) : (
          <ul className="divide-y divide-lp-border">
            {filtered.map((p) => (
              <li
                key={p.id}
                className={cn(
                  'group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-lp-surface-hover/80',
                  deletingId === p.id && 'opacity-40'
                )}
                onClick={() => setPanel({ mode: 'edit', id: p.id })}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="lp-checkbox mt-1.5"
                  aria-label={`Select ${p.name}`}
                />
                <div className="mt-0.5 h-full w-0.5 shrink-0 rounded-full bg-lp-border group-hover:bg-lp-orange/60" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-mono text-xs text-lp-orange">{p.lp_id}</span>
                    <span className="font-medium text-lp-text">{p.name}</span>
                    {p.role ? <span className="text-sm text-lp-text-secondary">· {p.role}</span> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-lp-text-tertiary">
                    <span className="truncate">{p.email || '—'}</span>
                    <span className="tabular-nums text-lp-text-secondary">{formatRates(p.standard_rates)}</span>
                  </div>
                </div>
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <ContextMenu
                    align="right"
                    items={[
                      {
                        label: 'Open details',
                        onClick: () => setPanel({ mode: 'edit', id: p.id }),
                      },
                      {
                        label: 'Remove from roster',
                        icon: Trash2,
                        variant: 'danger',
                        onClick: () => setDeleteOpen(p),
                      },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-lp-text-tertiary">
        Click a row for the full profile (same slide-over pattern as budget line items). Roster is workspace-wide.{' '}
        <Link href="/profile" className="inline-flex items-center gap-1 text-lp-orange hover:underline">
          <User size={12} />
          Profile
        </Link>{' '}
        is for your account.
      </p>

      <PersonnelDetailSlideOver panel={panel} onClose={() => setPanel(null)} onSaved={handleSaved} />

      <PersonnelImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={handleImported} />

      <DeleteConfirmationModal
        open={!!deleteOpen}
        itemName={deleteOpen?.name ?? 'Person'}
        onClose={() => setDeleteOpen(null)}
        onConfirm={handleDeleteConfirm}
        description="Tour budget lines keep their names and rates; the link back to this roster row is cleared after migration 025."
      />

      <DeleteConfirmationModal
        open={bulkDeleteOpen}
        itemName={`${selectedIds.size} personnel record${selectedIds.size === 1 ? '' : 's'}`}
        onClose={() => !bulkDeleting && setBulkDeleteOpen(false)}
        onConfirm={handleBulkDeleteConfirm}
        description="They will be removed from your workspace roster in Supabase. Tour personnel lines may lose their roster link."
      />
    </>
  );
}
