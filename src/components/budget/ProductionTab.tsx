'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Pencil, Trash2, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import { useDetailPanel } from '@/contexts/DetailPanelContext';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { cn } from '@/lib/utils';

const PROD_CATEGORIES = [
  { value: 'prod_audio', label: 'Audio' },
  { value: 'prod_lighting', label: 'Lighting' },
  { value: 'prod_freight', label: 'Freight' },
  { value: 'prod_equipment', label: 'Equipment' },
  { value: 'prod_programming', label: 'Programming' },
  { value: 'prod_set_wardrobe', label: 'Set & Wardrobe' },
  { value: 'prod_misc', label: 'Misc' },
] as const;

type ProdCategory = (typeof PROD_CATEGORIES)[number]['value'];

type LineItem = {
  id: string;
  category: string;
  label: string;
  quantity: number;
  proposed_cost: number;
  actual_cost: number;
  notes: string | null;
  order_index: number;
};

function subtotalsByCategory(items: LineItem[], categoryValues: readonly { value: string }[]) {
  const byCat: Record<string, { proposed: number; actual: number }> = {};
  for (const c of categoryValues) {
    byCat[c.value] = { proposed: 0, actual: 0 };
  }
  for (const i of items) {
    if (!byCat[i.category]) byCat[i.category] = { proposed: 0, actual: 0 };
    byCat[i.category].proposed += Number(i.proposed_cost) || 0;
    byCat[i.category].actual += Number(i.actual_cost) || 0;
  }
  return byCat;
}

export function ProductionTab({ tourId }: { tourId: string }) {
  const { openLineItem } = useDetailPanel();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Partial<LineItem> | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newRow, setNewRow] = useState<Partial<LineItem> & { category: ProdCategory }>({
    category: 'prod_audio',
    label: '',
    quantity: 1,
    proposed_cost: 0,
    actual_cost: 0,
    notes: null,
  });
  const [deleteModal, setDeleteModal] = useState<{ id: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/budget/line-items?tour_id=${tourId}`)
      .then((r) => (r.ok ? r.json() : { line_items: [] }))
      .then((data) => {
        const all = data.line_items ?? [];
        setItems(all.filter((i: LineItem) => i.category.startsWith('prod_')));
      })
      .catch((err) => setError(err?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      setItems((prev) => prev.filter((item) => item.id !== id));
      setDeleteModal((prev) => (prev?.id === id ? null : prev));
      if (editingId === id) {
        setEditingId(null);
        setEditRow(null);
      }
    };
    window.addEventListener('lp-line-item-deleted', handler);
    return () => window.removeEventListener('lp-line-item-deleted', handler);
  }, [editingId]);

  const sortedItems = [...items].sort(
    (a, b) => PROD_CATEGORIES.findIndex((c) => c.value === a.category) - PROD_CATEGORIES.findIndex((c) => c.value === b.category) || a.order_index - b.order_index
  );

  const subtotals = subtotalsByCategory(items, PROD_CATEGORIES);
  const totalProposed = items.reduce((s, i) => s + (Number(i.proposed_cost) || 0), 0);
  const totalActual = items.reduce((s, i) => s + (Number(i.actual_cost) || 0), 0);

  const createItem = async () => {
    if (!newRow.label?.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/budget/line-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          category: newRow.category,
          label: newRow.label.trim(),
          quantity: Number(newRow.quantity) || 1,
          proposed_cost: Number(newRow.proposed_cost) || 0,
          actual_cost: Number(newRow.actual_cost) || 0,
          notes: newRow.notes?.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Create failed');
      setAddingNew(false);
      setNewRow({ category: 'prod_audio', label: '', quantity: 1, proposed_cost: 0, actual_cost: 0, notes: null });
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const saveItem = async (id: string, payload: Partial<LineItem>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/line-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...payload }),
      });
      if (!res.ok) throw new Error('Save failed');
      setEditingId(null);
      setEditRow(null);
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/line-items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Delete failed');
      setDeleteModal(null);
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  const moveItem = (item: LineItem, direction: 'up' | 'down') => {
    const sameCategory = sortedItems.filter((i) => i.category === item.category);
    const idx = sameCategory.findIndex((i) => i.id === item.id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameCategory.length) return;
    const other = sameCategory[swapIdx];
    setSaving(true);
    Promise.all([
      fetch('/api/budget/line-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, order_index: other.order_index }),
      }),
      fetch('/api/budget/line-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: other.id, order_index: item.order_index }),
      }),
    ])
      .then(([r1, r2]) => {
        if (!r1.ok || !r2.ok) throw new Error('Reorder failed');
        load();
      })
      .catch((e) => setError((e as Error)?.message ?? 'Reorder failed'))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading…
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
    <div className="space-y-6">
      <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lp-border bg-lp-bg-tertiary">
                <th className="w-16 p-2" />
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Category</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Label / Description</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text w-20">Quantity</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text w-28">Proposed Cost</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text w-28">Actual Cost</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Notes</th>
                <th className="w-28 p-3" />
              </tr>
            </thead>
            <tbody>
              {addingNew && (
                <tr className="border-b border-lp-border bg-lp-orange-subtle/30">
                  <td className="p-2" />
                  <td className="p-2">
                    <select
                      className="rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-lp-text"
                      value={newRow.category}
                      onChange={(e) => setNewRow((r) => ({ ...r, category: e.target.value as ProdCategory }))}
                    >
                      {PROD_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      className="w-full min-w-[140px] rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-lp-text"
                      value={newRow.label ?? ''}
                      onChange={(e) => setNewRow((r) => ({ ...r, label: e.target.value }))}
                      placeholder="Description"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-right text-lp-text"
                      value={newRow.quantity ?? ''}
                      onChange={(e) => setNewRow((r) => ({ ...r, quantity: e.target.value === '' ? undefined : parseInt(e.target.value, 10) }))}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-right text-lp-text"
                      value={newRow.proposed_cost ?? ''}
                      onChange={(e) => setNewRow((r) => ({ ...r, proposed_cost: e.target.value === '' ? undefined : parseFloat(e.target.value) }))}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-right text-lp-text"
                      value={newRow.actual_cost ?? ''}
                      onChange={(e) => setNewRow((r) => ({ ...r, actual_cost: e.target.value === '' ? undefined : parseFloat(e.target.value) }))}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="w-full min-w-[100px] rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-lp-text"
                      value={newRow.notes ?? ''}
                      onChange={(e) => setNewRow((r) => ({ ...r, notes: e.target.value || null }))}
                      placeholder="Notes"
                    />
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={createItem}
                      disabled={saving || !newRow.label?.trim()}
                      className="text-lp-orange hover:underline disabled:opacity-50 text-sm"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingNew(false)}
                      className="ml-2 text-lp-text-tertiary hover:underline text-sm"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              )}
              {sortedItems.map((item) => {
                const isEditing = editingId === item.id;
                const row = isEditing ? (editRow ?? item) : item;
                const catLabel = PROD_CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category;
                const sameCategory = sortedItems.filter((i) => i.category === item.category);
                const idx = sameCategory.findIndex((i) => i.id === item.id);
                const canMoveUp = idx > 0;
                const canMoveDown = idx >= 0 && idx < sameCategory.length - 1;
                return (
                  <tr
                    key={item.id}
                    role={!isEditing ? 'button' : undefined}
                    tabIndex={!isEditing ? 0 : undefined}
                    onClick={(e) => {
                      if (isEditing) return;
                      if ((e.target as HTMLElement).closest('button, input, select, textarea, a, label')) return;
                      openLineItem(item.id);
                    }}
                    onKeyDown={(e) => {
                      if (isEditing) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openLineItem(item.id);
                      }
                    }}
                    className={cn(
                      'border-b border-lp-border',
                      !isEditing && 'cursor-pointer hover:bg-lp-surface-hover'
                    )}
                  >
                    <td className="p-2">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveItem(item, 'up');
                          }}
                          disabled={saving || !canMoveUp}
                          className="rounded p-0.5 text-lp-text-tertiary hover:bg-lp-bg-tertiary disabled:opacity-30"
                          title="Move up"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveItem(item, 'down');
                          }}
                          disabled={saving || !canMoveDown}
                          className="rounded p-0.5 text-lp-text-tertiary hover:bg-lp-bg-tertiary disabled:opacity-30"
                          title="Move down"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    <td className="p-3 text-lp-text-secondary">
                      {isEditing ? (
                        <select
                          className="rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                          value={row.category ?? item.category}
                          onChange={(e) => setEditRow((r) => ({ ...r, category: e.target.value }))}
                        >
                          {PROD_CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      ) : (
                        catLabel
                      )}
                    </td>
                    <td className="p-3 text-lp-text">
                      {isEditing ? (
                        <input
                          className="w-full min-w-[140px] rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                          value={row.label ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, label: e.target.value }))}
                        />
                      ) : (
                        item.label
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-lp-text">
                      {isEditing ? (
                        <input
                          type="number"
                          min={1}
                          className="w-16 rounded border border-lp-border bg-lp-bg px-2 py-1 text-right text-lp-text"
                          value={row.quantity ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, quantity: e.target.value === '' ? undefined : parseInt(e.target.value, 10) }))}
                        />
                      ) : (
                        item.quantity
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-lp-text">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          className="w-24 rounded border border-lp-border bg-lp-bg px-2 py-1 text-right text-lp-text"
                          value={row.proposed_cost ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, proposed_cost: e.target.value === '' ? undefined : parseFloat(e.target.value) }))}
                        />
                      ) : (
                        (Number(item.proposed_cost) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-lp-text">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          className="w-24 rounded border border-lp-border bg-lp-bg px-2 py-1 text-right text-lp-text"
                          value={row.actual_cost ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, actual_cost: e.target.value === '' ? undefined : parseFloat(e.target.value) }))}
                        />
                      ) : (
                        (Number(item.actual_cost) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })
                      )}
                    </td>
                    <td className="p-3 text-lp-text-secondary max-w-[160px] truncate" title={item.notes ?? undefined}>
                      {isEditing ? (
                        <input
                          className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                          value={row.notes ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, notes: e.target.value || null }))}
                        />
                      ) : (
                        item.notes ?? '—'
                      )}
                    </td>
                    <td className="p-3">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (editRow) saveItem(item.id, editRow);
                            }}
                            disabled={saving}
                            className="text-lp-orange hover:underline text-xs"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(null);
                              setEditRow(null);
                            }}
                            className="text-lp-text-tertiary hover:underline text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(item.id);
                              setEditRow({ ...item });
                            }}
                            className="rounded p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-lp-text"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteModal({ id: item.id, label: item.label });
                            }}
                            className="rounded p-1 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <ChevronRight size={14} className="text-lp-text-tertiary shrink-0 ml-0.5" aria-hidden />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-bg-tertiary"
        >
          <Plus className="h-4 w-4" />
          Add Line Item
        </button>
      </div>

      <div className="rounded-xl border border-lp-border bg-lp-surface p-4 space-y-2 text-sm">
        {PROD_CATEGORIES.map((c) => (
          <div key={c.value} className="flex justify-between items-baseline">
            <span className="font-medium text-lp-text">{c.label}:</span>
            <span className="tabular-nums text-lp-text">
              {(subtotals[c.value]?.proposed ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / {(subtotals[c.value]?.actual ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        ))}
        <div className="border-t border-lp-border pt-2 mt-2 flex justify-between items-baseline font-semibold text-lp-text">
          <span>TOTAL PRODUCTION & MISC:</span>
          <span className="tabular-nums">
            {totalProposed.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / {totalActual.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      <DeleteConfirmationModal
        open={!!deleteModal}
        itemName={deleteModal?.label ?? ''}
        onClose={() => setDeleteModal(null)}
        onConfirm={async () => { if (deleteModal) await deleteItem(deleteModal.id); }}
      />
    </div>
  );
}
