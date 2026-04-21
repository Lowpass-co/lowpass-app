'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Pencil, Trash2, Upload, ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'company_card', label: 'Company Card' },
];

const CATEGORY_OPTIONS = [
  'hotels', 'flights',
  'transport_bus', 'transport_taxis', 'transport_fuel', 'transport_parking', 'transport_misc', 'transport_agent',
  'prod_audio', 'prod_lighting', 'prod_freight', 'prod_equipment', 'prod_programming', 'prod_set_wardrobe', 'prod_misc',
];

type ReceiptRow = {
  id: string;
  receipt_number: string;
  date: string | null;
  vendor: string | null;
  category: string | null;
  description: string | null;
  payment_method: string;
  cost_tour_currency: number;
  cost_home_currency: number;
  receipt_file_url: string | null;
  in_budget: boolean;
  linked_line_item_id: string | null;
  notes: string | null;
};
type LineItemOption = { id: string; category: string; label: string };

export function ReceiptsTab({ tourId }: { tourId: string }) {
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [lineItems, setLineItems] = useState<LineItemOption[]>([]);
  const [settings, setSettings] = useState<{ currency_tour: string; currency_home: string; exchange_rate: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Partial<ReceiptRow> | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newRow, setNewRow] = useState<Partial<ReceiptRow>>({
    date: null,
    vendor: null,
    category: null,
    description: null,
    payment_method: 'card',
    cost_tour_currency: 0,
    cost_home_currency: 0,
    in_budget: false,
    linked_line_item_id: null,
    notes: null,
  });
  const [deleteModal, setDeleteModal] = useState<{ id: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [filterInBudget, setFilterInBudget] = useState<'all' | 'yes' | 'no'>('all');

  const load = useCallback(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/budget/receipts?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { receipts: [] })),
      fetch(`/api/budget/line-items?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { line_items: [] })),
      fetch(`/api/budget/settings?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([recRes, lineRes, setRes]) => {
        setReceipts(recRes?.receipts ?? []);
        setLineItems((lineRes?.line_items ?? []).map((i: { id: string; category: string; label: string }) => ({ id: i.id, category: i.category, label: i.label })));
        setSettings(setRes ? { currency_tour: setRes.currency_tour ?? 'USD', currency_home: setRes.currency_home ?? 'GBP', exchange_rate: setRes.exchange_rate ?? null } : null);
      })
      .catch((err) => setError(err?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => load(), [load]);

  const exchangeRate = settings?.exchange_rate ?? null;
  const filteredReceipts = receipts.filter((r) => {
    if (filterDateFrom && (r.date ?? '') < filterDateFrom) return false;
    if (filterDateTo && (r.date ?? '') > filterDateTo) return false;
    if (filterVendor && !(r.vendor ?? '').toLowerCase().includes(filterVendor.toLowerCase())) return false;
    if (filterCategory && r.category !== filterCategory) return false;
    if (filterPayment && r.payment_method !== filterPayment) return false;
    if (filterInBudget === 'yes' && !r.in_budget) return false;
    if (filterInBudget === 'no' && r.in_budget) return false;
    return true;
  });

  const inBudgetReceipts = filteredReceipts.filter((r) => r.in_budget);
  const totalTourCurrency = inBudgetReceipts.reduce((s, r) => s + (Number(r.cost_tour_currency) || 0), 0);
  const totalHomeCurrency = exchangeRate != null ? totalTourCurrency * exchangeRate : null;

  const createReceipt = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          date: newRow.date || null,
          vendor: newRow.vendor || null,
          category: newRow.category || null,
          description: newRow.description || null,
          payment_method: newRow.payment_method ?? 'card',
          cost_tour_currency: Number(newRow.cost_tour_currency) || 0,
          cost_home_currency: Number(newRow.cost_home_currency) || 0,
          in_budget: !!newRow.in_budget,
          linked_line_item_id: newRow.in_budget ? (newRow.linked_line_item_id || null) : null,
          notes: newRow.notes || null,
        }),
      });
      if (!res.ok) throw new Error('Create failed');
      setAddingNew(false);
      setNewRow({ date: null, vendor: null, category: null, description: null, payment_method: 'card', cost_tour_currency: 0, cost_home_currency: 0, in_budget: false, linked_line_item_id: null, notes: null });
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const saveReceipt = async (id: string, payload: Partial<ReceiptRow>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/receipts', {
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

  const deleteReceipt = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/receipts', {
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

  const toggleInBudget = (r: ReceiptRow, checked: boolean) => {
    saveReceipt(r.id, {
      in_budget: checked,
      linked_line_item_id: checked ? r.linked_line_item_id : null,
    });
  };

  const uploadFile = async (receiptId: string, file: File) => {
    setUploadingId(receiptId);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('tour_id', tourId);
      form.append('receipt_id', receiptId);
      const res = await fetch('/api/budget/receipts/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      await saveReceipt(receiptId, { receipt_file_url: data.url });
    } catch (e) {
      setError((e as Error)?.message ?? 'Upload failed');
    } finally {
      setUploadingId(null);
    }
  };

  const currencySymbol = (c: string) => (c === 'GBP' ? '£' : c === 'USD' ? '$' : c);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading receipts…
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
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-lp-border bg-lp-surface p-4">
        <input type="date" className="rounded-md border border-lp-border bg-transparent px-2 py-1.5 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} placeholder="From" />
        <input type="date" className="rounded-md border border-lp-border bg-transparent px-2 py-1.5 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} placeholder="To" />
        <input type="text" className="rounded-md border border-lp-border bg-transparent px-2 py-1.5 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 w-40" value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)} placeholder="Vendor" />
        <select className="rounded-md border border-lp-border bg-transparent px-2 py-1.5 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select className="rounded-md border border-lp-border bg-transparent px-2 py-1.5 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}>
          <option value="">All payment</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select className="rounded-md border border-lp-border bg-transparent px-2 py-1.5 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={filterInBudget} onChange={(e) => setFilterInBudget(e.target.value as 'all' | 'yes' | 'no')}>
          <option value="all">In budget: All</option>
          <option value="yes">In budget: Yes</option>
          <option value="no">In budget: No</option>
        </select>
      </div>

      <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lp-border">
                <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Receipt #</th>
                <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Date</th>
                <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Vendor</th>
                <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Category</th>
                <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Description</th>
                <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Payment</th>
                <th className="text-right p-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Cost (Tour)</th>
                <th className="text-right p-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Cost (Home)</th>
                <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">In Budget</th>
                <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Linked Line</th>
                <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Notes</th>
                <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">File</th>
                <th className="w-20 p-2" />
              </tr>
            </thead>
            <tbody>
              {addingNew && (
                <tr className="border-b border-lp-border bg-lp-orange-subtle/30">
                  <td className="p-2 text-lp-text-tertiary">—</td>
                  <td className="p-2"><input type="date" className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={newRow.date ?? ''} onChange={(e) => setNewRow((r) => ({ ...r, date: e.target.value || null }))} /></td>
                  <td className="p-2"><input className="w-28 rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={newRow.vendor ?? ''} onChange={(e) => setNewRow((r) => ({ ...r, vendor: e.target.value || null }))} placeholder="Vendor" /></td>
                  <td className="p-2">
                    <select className="w-full min-w-[100px] rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={newRow.category ?? ''} onChange={(e) => setNewRow((r) => ({ ...r, category: e.target.value || null }))}>
                      <option value="">—</option>
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2"><input className="w-32 rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={newRow.description ?? ''} onChange={(e) => setNewRow((r) => ({ ...r, description: e.target.value || null }))} placeholder="Description" /></td>
                  <td className="p-2">
                    <select className="rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={newRow.payment_method ?? 'card'} onChange={(e) => setNewRow((r) => ({ ...r, payment_method: e.target.value }))}>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2"><input type="number" step="0.01" className="w-20 rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-right text-lp-text" value={newRow.cost_tour_currency ?? ''} onChange={(e) => setNewRow((r) => ({ ...r, cost_tour_currency: e.target.value === '' ? undefined : parseFloat(e.target.value) }))} /></td>
                  <td className="p-2"><input type="number" step="0.01" className="w-20 rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-right text-lp-text text-red-600" value={newRow.cost_home_currency ?? ''} onChange={(e) => setNewRow((r) => ({ ...r, cost_home_currency: e.target.value === '' ? undefined : parseFloat(e.target.value) }))} /></td>
                  <td className="p-2"><input type="checkbox" className="lp-checkbox" checked={!!newRow.in_budget} onChange={(e) => setNewRow((r) => ({ ...r, in_budget: e.target.checked }))} /></td>
                  <td className="p-2">
                    {newRow.in_budget && (
                      <select className="min-w-[120px] rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={newRow.linked_line_item_id ?? ''} onChange={(e) => setNewRow((r) => ({ ...r, linked_line_item_id: e.target.value || null }))}>
                        <option value="">—</option>
                        {lineItems.map((li) => (
                          <option key={li.id} value={li.id}>{li.label} ({li.category})</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-2"><input className="w-24 rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={newRow.notes ?? ''} onChange={(e) => setNewRow((r) => ({ ...r, notes: e.target.value || null }))} placeholder="Notes" /></td>
                  <td className="p-2">—</td>
                  <td className="p-2">
                    <button type="button" onClick={createReceipt} disabled={saving} className="text-lp-orange hover:underline text-xs">Save</button>
                    <button type="button" onClick={() => setAddingNew(false)} className="ml-2 text-lp-text-tertiary hover:underline text-xs">Cancel</button>
                  </td>
                </tr>
              )}
              {filteredReceipts.map((r) => {
                const isEditing = editingId === r.id;
                const row = isEditing ? (editRow ?? r) : r;
                const homeConverted = exchangeRate != null ? (Number(r.cost_tour_currency) || 0) * exchangeRate : null;
                const linkedLabel = lineItems.find((li) => li.id === r.linked_line_item_id)?.label ?? (r.linked_line_item_id ? '—' : '—');
                return (
                  <tr key={r.id} className="border-b border-lp-border">
                    <td className="p-2 font-medium text-lp-text">{r.receipt_number}</td>
                    <td className="p-2 text-lp-text-secondary">{isEditing ? <input type="date" className="rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={row.date ?? ''} onChange={(e) => setEditRow((x) => ({ ...x, date: e.target.value || null }))} /> : (r.date ? formatDate(r.date) : '—')}</td>
                    <td className="p-2 text-lp-text">{isEditing ? <input className="w-28 rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={row.vendor ?? ''} onChange={(e) => setEditRow((x) => ({ ...x, vendor: e.target.value || null }))} /> : (r.vendor ?? '—')}</td>
                    <td className="p-2 text-lp-text-secondary">
                      {isEditing ? (
                        <select className="rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={row.category ?? ''} onChange={(e) => setEditRow((x) => ({ ...x, category: e.target.value || null }))}>
                          <option value="">—</option>
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      ) : (
                        (r.category ?? '—').replace(/_/g, ' ')
                      )}
                    </td>
                    <td className="p-2 text-lp-text-secondary max-w-[120px] truncate" title={r.description ?? undefined}>{isEditing ? <input className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={row.description ?? ''} onChange={(e) => setEditRow((x) => ({ ...x, description: e.target.value || null }))} /> : (r.description ?? '—')}</td>
                    <td className="p-2 text-lp-text-secondary">{isEditing ? <select className="rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={row.payment_method ?? 'card'} onChange={(e) => setEditRow((x) => ({ ...x, payment_method: e.target.value }))}>{PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select> : (PAYMENT_METHODS.find((m) => m.value === r.payment_method)?.label ?? r.payment_method)}</td>
                    <td className="p-2 text-right tabular-nums text-lp-text">{isEditing ? <input type="number" step="0.01" className="w-20 rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-right text-lp-text" value={row.cost_tour_currency ?? ''} onChange={(e) => setEditRow((x) => ({ ...x, cost_tour_currency: e.target.value === '' ? undefined : parseFloat(e.target.value) }))} /> : (Number(r.cost_tour_currency) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
                    <td className="p-2 text-right tabular-nums">
                      {isEditing ? (
                        <input type="number" step="0.01" className="w-20 rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-right text-lp-text text-red-600" value={row.cost_home_currency ?? ''} onChange={(e) => setEditRow((x) => ({ ...x, cost_home_currency: e.target.value === '' ? undefined : parseFloat(e.target.value) }))} />
                      ) : exchangeRate != null ? (
                        <span className="text-red-600 dark:text-red-400" title={`Converted from ${settings?.currency_tour ?? ''} ${(Number(r.cost_tour_currency) || 0).toLocaleString('en-GB')}`}>
                          {(homeConverted ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        (Number(r.cost_home_currency) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })
                      )}
                    </td>
                    <td className="p-2"><input type="checkbox" className="lp-checkbox" checked={r.in_budget} onChange={(e) => toggleInBudget(r, e.target.checked)} disabled={saving} /></td>
                    <td className="p-2 text-lp-text-secondary">
                      {r.in_budget && (isEditing ? (
                        <select className="min-w-[120px] rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={row.linked_line_item_id ?? ''} onChange={(e) => setEditRow((x) => ({ ...x, linked_line_item_id: e.target.value || null }))}>
                          <option value="">—</option>
                          {lineItems.map((li) => (
                            <option key={li.id} value={li.id}>{li.label}</option>
                          ))}
                        </select>
                      ) : (
                        linkedLabel
                      ))}
                    </td>
                    <td className="p-2 text-lp-text-tertiary max-w-[100px] truncate" title={r.notes ?? undefined}>{isEditing ? <input className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 text-lp-text" value={row.notes ?? ''} onChange={(e) => setEditRow((x) => ({ ...x, notes: e.target.value || null }))} /> : (r.notes ?? '—')}</td>
                    <td className="p-2">
                      {r.receipt_file_url ? (
                        <a href={r.receipt_file_url} target="_blank" rel="noopener noreferrer" className="text-lp-orange hover:underline inline-flex items-center gap-1 text-xs"><ExternalLink className="h-3 w-3" /> View</a>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-lp-text-tertiary hover:text-lp-orange">
                          <input type="file" accept=".pdf,image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(r.id, f); e.target.value = ''; }} disabled={!!uploadingId} />
                          {uploadingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          Upload
                        </label>
                      )}
                    </td>
                    <td className="p-2">
                      {isEditing ? (
                        <><button type="button" onClick={() => editRow && saveReceipt(r.id, editRow)} disabled={saving} className="text-lp-orange hover:underline text-xs">Save</button><button type="button" onClick={() => { setEditingId(null); setEditRow(null); }} className="ml-2 text-lp-text-tertiary hover:underline text-xs">Cancel</button></>
                      ) : (
                        <><button type="button" onClick={() => { setEditingId(r.id); setEditRow({ ...r }); }} className="rounded p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-lp-text" title="Edit"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => setDeleteModal({ id: r.id, label: r.receipt_number })} className="rounded p-1 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button></>
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
        <button type="button" onClick={() => setAddingNew(true)} className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-bg-tertiary">
          <Plus className="h-4 w-4" /> Add Receipt
        </button>
      </div>

      <div className="rounded-xl border border-lp-border bg-lp-surface p-4 flex flex-wrap items-baseline gap-6 text-sm">
        <span className="font-semibold text-lp-text">
          Total Receipts (Tour Currency) = {totalTourCurrency.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {settings?.currency_tour ?? ''}
        </span>
        {totalHomeCurrency != null && (
          <span className="font-semibold text-red-600 dark:text-red-400">
            Total Receipts (Home Currency) = {totalHomeCurrency.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {settings?.currency_home ?? ''}
          </span>
        )}
        <span className="text-lp-text-tertiary">(Only receipts with In Budget = Yes)</span>
      </div>

      <DeleteConfirmationModal open={!!deleteModal} itemName={deleteModal?.label ?? ''} onClose={() => setDeleteModal(null)} onConfirm={async () => { if (deleteModal) await deleteReceipt(deleteModal.id); }} />
    </div>
  );
}
