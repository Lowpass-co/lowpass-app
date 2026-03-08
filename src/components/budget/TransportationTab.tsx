'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { BudgetTable } from '@/components/budget/BudgetTable';
import { InlineEdit } from '@/components/budget/InlineEdit';
import { InlineCurrencyCell } from '@/components/budget/InlineCurrencyCell';

const TRANSPORT_CATEGORIES = [
  { value: 'transport_bus', label: 'Bus' },
  { value: 'transport_taxis', label: 'Taxis' },
  { value: 'transport_fuel', label: 'Fuel' },
  { value: 'transport_parking', label: 'Parking' },
  { value: 'transport_agent', label: 'Travel Agent' },
  { value: 'transport_misc', label: 'Misc' },
] as const;

type TransportCategory = (typeof TRANSPORT_CATEGORIES)[number]['value'];

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

export function TransportationTab({ tourId }: { tourId: string }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Partial<LineItem> | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newRow, setNewRow] = useState<Partial<LineItem> & { category: TransportCategory }>({
    category: 'transport_bus',
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
        setItems(all.filter((i: LineItem) => i.category.startsWith('transport_')));
      })
      .catch((err) => setError(err?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => load(), [load]);

  const sortedItems = [...items].sort(
    (a, b) => TRANSPORT_CATEGORIES.findIndex((c) => c.value === a.category) - TRANSPORT_CATEGORIES.findIndex((c) => c.value === b.category) || a.order_index - b.order_index
  );

  const subtotals = subtotalsByCategory(items, TRANSPORT_CATEGORIES);
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
      setNewRow({ category: 'transport_bus', label: '', quantity: 1, proposed_cost: 0, actual_cost: 0, notes: null });
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

  const tableColumns = [
    { header: '', width: 'w-16', className: 'p-2' },
    { header: 'Category', align: 'left' as const, className: 'p-3' },
    { header: 'Label / Description', align: 'left' as const, className: 'p-3' },
    { header: 'Quantity', align: 'right' as const, width: 'w-20', className: 'p-3' },
    { header: 'Proposed Cost', align: 'right' as const, width: 'w-28', className: 'p-3' },
    { header: 'Actual Cost', align: 'right' as const, width: 'w-28', className: 'p-3' },
    { header: 'Notes', align: 'left' as const, className: 'p-3' },
    { header: '', width: 'w-28', className: 'p-3' },
  ];

  return (
    <div className="space-y-6">
      <BudgetTable columns={tableColumns}>
              {addingNew && (
                <tr className="border-b border-lp-border bg-lp-orange-subtle/30">
                  <td className="p-2" />
                  <td className="p-2">
                    <select
                      className="rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-lp-text"
                      value={newRow.category}
                      onChange={(e) => setNewRow((r) => ({ ...r, category: e.target.value as TransportCategory }))}
                    >
                      {TRANSPORT_CATEGORIES.map((c) => (
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
                      value={newRow.quantity ?? 1}
                      onChange={(e) => setNewRow((r) => ({ ...r, quantity: parseInt(e.target.value, 10) || 1 }))}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-right text-lp-text"
                      value={newRow.proposed_cost ?? 0}
                      onChange={(e) => setNewRow((r) => ({ ...r, proposed_cost: parseFloat(e.target.value) || 0 }))}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded border border-lp-border bg-lp-bg px-2 py-1.5 text-right text-lp-text"
                      value={newRow.actual_cost ?? 0}
                      onChange={(e) => setNewRow((r) => ({ ...r, actual_cost: parseFloat(e.target.value) || 0 }))}
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
                const catLabel = TRANSPORT_CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category;
                const sameCategory = sortedItems.filter((i) => i.category === item.category);
                const idx = sameCategory.findIndex((i) => i.id === item.id);
                const canMoveUp = idx > 0;
                const canMoveDown = idx >= 0 && idx < sameCategory.length - 1;
                return (
                  <tr key={item.id} className="border-b border-lp-border">
                    <td className="p-2">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveItem(item, 'up')}
                          disabled={saving || !canMoveUp}
                          className="rounded p-0.5 text-lp-text-tertiary hover:bg-lp-bg-tertiary disabled:opacity-30"
                          title="Move up"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(item, 'down')}
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
                          {TRANSPORT_CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      ) : (
                        catLabel
                      )}
                    </td>
                    <td className="p-3">
                      <InlineEdit
                        value={row.label ?? ''}
                        onChange={(v) => setEditRow((r) => ({ ...r, label: String(v) }))}
                        isEditing={isEditing}
                        displayValue={item.label}
                        type="text"
                        className="min-w-[140px]"
                        inputClassName="w-full min-w-[140px]"
                      />
                    </td>
                    <td className="p-3">
                      <InlineEdit
                        value={row.quantity ?? 1}
                        onChange={(v) => setEditRow((r) => ({ ...r, quantity: Number(v) || 1 }))}
                        isEditing={isEditing}
                        displayValue={item.quantity}
                        type="number"
                        min={1}
                        alignRight
                        inputClassName="w-16"
                      />
                    </td>
                    <td className="p-3">
                      <InlineCurrencyCell
                        value={isEditing ? (row.proposed_cost ?? item.proposed_cost) : item.proposed_cost}
                        onChange={(v) => setEditRow((r) => ({ ...r, proposed_cost: v }))}
                        isEditing={isEditing}
                        inputClassName="w-24"
                      />
                    </td>
                    <td className="p-3">
                      <InlineCurrencyCell
                        value={isEditing ? (row.actual_cost ?? item.actual_cost) : item.actual_cost}
                        onChange={(v) => setEditRow((r) => ({ ...r, actual_cost: v }))}
                        isEditing={isEditing}
                        inputClassName="w-24"
                      />
                    </td>
                    <td className="p-3 text-lp-text-secondary max-w-[160px] truncate" title={item.notes ?? undefined}>
                      <InlineEdit
                        value={row.notes ?? ''}
                        onChange={(v) => setEditRow((r) => ({ ...r, notes: v === '' ? null : String(v) }))}
                        isEditing={isEditing}
                        displayValue={item.notes ?? '—'}
                        type="text"
                        className="w-full"
                        inputClassName="w-full"
                      />
                    </td>
                    <td className="p-3">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => editRow && saveItem(item.id, editRow)}
                            disabled={saving}
                            className="text-lp-orange hover:underline text-xs"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingId(null); setEditRow(null); }}
                            className="text-lp-text-tertiary hover:underline text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditingId(item.id); setEditRow({ ...item }); }}
                            className="rounded p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-lp-text"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteModal({ id: item.id, label: item.label })}
                            className="rounded p-1 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
      </BudgetTable>

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
        {TRANSPORT_CATEGORIES.map((c) => (
          <div key={c.value} className="flex justify-between items-baseline">
            <span className="font-medium text-lp-text">{c.label}:</span>
            <span className="tabular-nums text-lp-text">
              {(subtotals[c.value]?.proposed ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })} / {(subtotals[c.value]?.actual ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
            </span>
          </div>
        ))}
        <div className="border-t border-lp-border pt-2 mt-2 flex justify-between items-baseline font-semibold text-lp-text">
          <span>TOTAL TRANSPORTATION:</span>
          <span className="tabular-nums">
            {totalProposed.toLocaleString('en-GB', { minimumFractionDigits: 2 })} / {totalActual.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <DeleteConfirmationModal
        open={!!deleteModal}
        itemName={deleteModal?.label ?? ''}
        onClose={() => setDeleteModal(null)}
        onConfirm={async () => deleteModal && deleteItem(deleteModal.id)}
      />
    </div>
  );
}
