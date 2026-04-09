'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Search, User } from 'lucide-react';
import type { Personnel } from '@/types';
import { cn } from '@/lib/utils';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { useToast } from '@/components/ui/Toast';
import { PersonnelModal } from './PersonnelModal';

function formatRates(sr: unknown): string {
  const o = (sr && typeof sr === 'object' ? sr : {}) as Record<string, unknown>;
  const cur = typeof o.currency === 'string' ? o.currency : 'GBP';
  const show = Number(o.show_day_rate) || 0;
  const off = Number(o.off_day_rate) || 0;
  const pd = Number(o.per_diem_rate) || 0;
  return `${cur} · show ${show} · off ${off} · PD ${pd}`;
}

export function PersonnelRosterClient({ initial }: { initial: Personnel[] }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Personnel | null>(null);
  const [deleteOpen, setDeleteOpen] = useState<Personnel | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const handleSaved = (row: Personnel) => {
    setRows((prev) => {
      const i = prev.findIndex((p) => p.id === row.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = row;
        return next;
      }
      return [...prev, row].sort((a, b) => a.lp_id.localeCompare(b.lp_id));
    });
    showToast(editing ? 'Personnel updated' : 'Personnel added');
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
      }, 250);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={18} />
          Add personnel
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-lp-border bg-lp-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-lp-border bg-lp-bg-tertiary/40 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
                <th className="px-4 py-3">LP ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Default rates</th>
                <th className="w-12 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-lp-text-secondary">
                    {rows.length === 0
                      ? 'No one on the roster yet. Add people here, then assign them on a tour’s Personnel page.'
                      : 'No matches for your search.'}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={cn(
                      'border-b border-lp-border/80 transition-colors hover:bg-lp-surface-hover/80',
                      deletingId === p.id && 'opacity-40'
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-lp-orange">{p.lp_id}</td>
                    <td className="px-4 py-3 font-medium text-lp-text">{p.name}</td>
                    <td className="max-w-[140px] truncate px-4 py-3 text-lp-text-secondary">
                      {p.role || '—'}
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-xs text-lp-text-secondary">
                      <div className="truncate">{p.email || '—'}</div>
                      <div className="truncate text-lp-text-tertiary">{p.phone || ''}</div>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-xs tabular-nums text-lp-text-secondary">
                      {formatRates(p.standard_rates)}
                    </td>
                    <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <ContextMenu
                        align="right"
                        items={[
                          {
                            label: 'Edit',
                            icon: Pencil,
                            onClick: () => {
                              setEditing(p);
                              setModalOpen(true);
                            },
                          },
                          {
                            label: 'Remove from roster',
                            icon: Trash2,
                            variant: 'danger',
                            onClick: () => setDeleteOpen(p),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-lp-text-tertiary">
        Roster is shared across your workspace (not tied to an artist).{' '}
        <Link href="/profile" className="inline-flex items-center gap-1 text-lp-orange hover:underline">
          <User size={12} />
          Profile
        </Link>{' '}
        is still for your own account details.
      </p>

      <PersonnelModal
        open={modalOpen}
        initial={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />

      <DeleteConfirmationModal
        open={!!deleteOpen}
        itemName={deleteOpen?.name ?? 'Person'}
        onClose={() => setDeleteOpen(null)}
        onConfirm={handleDeleteConfirm}
        description="Tour budget lines keep their names and rates; the link back to this roster row is cleared (after migration 025)."
      />
    </>
  );
}
