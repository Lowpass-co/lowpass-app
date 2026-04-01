'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronRight, Upload, ExternalLink, X } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

/** Math spec §12: day_of_net = guarantee + overage + merch - deductions; reconciled_net = same */
function computeNet(
  guarantee: number | null | undefined,
  overage: number | null | undefined,
  merch: number | null | undefined,
  deductions: number | null | undefined
): number | null {
  if (guarantee == null && overage == null && merch == null && deductions == null) return null;
  const g = Number(guarantee) || 0;
  const o = Number(overage) || 0;
  const m = Number(merch) || 0;
  const d = Number(deductions) || 0;
  return g + o + m - d;
}

type RoutingInfo = { id: string; date: string; venue_name: string | null; city: string };
type SettlementRow = {
  id?: string;
  routing_id: string;
  status: string;
  day_of_guarantee: number | null;
  day_of_overage: number | null;
  day_of_merch: number | null;
  day_of_deductions: number | null;
  day_of_net: number | null;
  day_of_signed_by: string | null;
  day_of_notes: string | null;
  day_of_file_url: string | null;
  reconciled_guarantee: number | null;
  reconciled_overage: number | null;
  reconciled_merch: number | null;
  reconciled_deductions: number | null;
  reconciled_net: number | null;
  reconciled_notes: string | null;
  deal_memo_text: string | null;
  deal_memo_file_url: string | null;
};

type Row = { routing_id: string; routing: RoutingInfo; settlement: SettlementRow | null };

export function SettlementTab({ tourId }: { tourId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<SettlementRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/budget/settlement?tour_id=${tourId}`)
      .then((r) => (r.ok ? r.json() : { settlements: [], routing_without_settlement: [] }))
      .then((data) => {
        const settlements: (SettlementRow & { routing?: RoutingInfo })[] = data.settlements ?? [];
        const noSettlement: RoutingInfo[] = data.routing_without_settlement ?? [];
        const withSettlement = settlements.map((s) => ({
          routing_id: s.routing_id,
          routing: { id: s.routing_id, date: (s.routing as RoutingInfo)?.date ?? '', venue_name: (s.routing as RoutingInfo)?.venue_name ?? null, city: (s.routing as RoutingInfo)?.city ?? '' },
          settlement: s,
        }));
        const withoutSettlement = noSettlement.map((r) => ({
          routing_id: r.id,
          routing: r,
          settlement: null,
        }));
        const merged: Row[] = [...withSettlement, ...withoutSettlement].sort(
          (a, b) => (a.routing.date ?? '').localeCompare(b.routing.date ?? '')
        );
        setRows(merged);
      })
      .catch((err) => setError(err?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => load(), [load]);

  const saveSettlement = async (routingId: string, payload: Partial<SettlementRow>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routing_id: routingId, ...payload }),
      });
      if (!res.ok) throw new Error('Save failed');
      setExpandedId(null);
      setForm(null);
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (routingId: string, field: 'day_of_file' | 'deal_memo_file', file: File) => {
    setUploadingField(field);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('routing_id', routingId);
      fd.append('field', field);
      const res = await fetch('/api/budget/settlement/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      const urlKey = field === 'day_of_file' ? 'day_of_file_url' : 'deal_memo_file_url';
      await saveSettlement(routingId, { [urlKey]: data.url });
    } catch (e) {
      setError((e as Error)?.message ?? 'Upload failed');
    } finally {
      setUploadingField(null);
    }
  };

  const openExpand = (row: Row) => {
    setExpandedId(row.routing_id);
    setForm(row.settlement ? { ...row.settlement } : { routing_id: row.routing_id, status: 'pending', day_of_guarantee: null, day_of_overage: null, day_of_merch: null, day_of_deductions: null, day_of_net: null, day_of_signed_by: null, day_of_notes: null, day_of_file_url: null, reconciled_guarantee: null, reconciled_overage: null, reconciled_merch: null, reconciled_deductions: null, reconciled_net: null, reconciled_notes: null, deal_memo_text: null, deal_memo_file_url: null });
  };

  const dayOfNet = form ? computeNet(form.day_of_guarantee, form.day_of_overage, form.day_of_merch, form.day_of_deductions) : null;
  const reconciledNet = form ? computeNet(form.reconciled_guarantee, form.reconciled_overage, form.reconciled_merch, form.reconciled_deductions) : null;

  const statusBadge = (status: string) => {
    const s = (status ?? 'pending').toLowerCase();
    const cls =
      s === 'reconciled' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
      s === 'day_of_complete' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    const label = s === 'reconciled' ? 'Reconciled' : s === 'day_of_complete' ? 'Day-of Complete' : 'Pending';
    return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', cls)}>{label}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading settlement…
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
              <tr className="border-b border-lp-border">
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Date</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Venue</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">City</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Status</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Day-of Net</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Reconciled Net</th>
                <th className="w-20 p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const s = row.settlement;
                const dayNet = s ? computeNet(s.day_of_guarantee, s.day_of_overage, s.day_of_merch, s.day_of_deductions) : null;
                const recNet = s ? computeNet(s.reconciled_guarantee, s.reconciled_overage, s.reconciled_merch, s.reconciled_deductions) : null;
                return (
                  <tr key={row.routing_id} className="border-b border-lp-border">
                    <td className="p-3 text-lp-text">{row.routing.date ? formatDate(row.routing.date) : '—'}</td>
                    <td className="p-3 text-lp-text">{row.routing.venue_name ?? '—'}</td>
                    <td className="p-3 text-lp-text-secondary">{row.routing.city ?? '—'}</td>
                    <td className="p-3">{statusBadge(s?.status ?? 'pending')}</td>
                    <td className="p-3 text-right font-semibold tabular-nums text-lp-text">
                      {dayNet != null ? dayNet.toLocaleString('en-GB', { minimumFractionDigits: 2 }) : '—'}
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums text-lp-text">
                      {recNet != null ? recNet.toLocaleString('en-GB', { minimumFractionDigits: 2 }) : '—'}
                    </td>
                    <td className="p-3">
                      <button type="button" onClick={() => openExpand(row)} className="flex items-center gap-1 text-lp-orange hover:underline text-sm font-medium">
                        View <ChevronRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="text-center text-lp-text-secondary">No show or festival dates in routing. Add routing dates with day type Show or Festival.</p>
      )}

      {/* Expand modal */}
      {expandedId && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setExpandedId(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-lp-text">Settlement – {rows.find((r) => r.routing_id === expandedId)?.routing.date ? formatDate(rows.find((r) => r.routing_id === expandedId)!.routing.date) : ''} {rows.find((r) => r.routing_id === expandedId)?.routing.venue_name ?? ''}</h3>
              <button type="button" onClick={() => setExpandedId(null)} className="rounded p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-lp-text mb-1">Status</label>
                <select className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={form.status ?? 'pending'} onChange={(e) => setForm((f) => ({ ...f!, status: e.target.value }))}>
                  <option value="pending">Pending</option>
                  <option value="day_of_complete">Day-of Complete</option>
                  <option value="reconciled">Reconciled</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-lp-text mb-1">Day-of Guarantee</label><input type="number" step="0.01" className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={form.day_of_guarantee ?? ''} onChange={(e) => setForm((f) => ({ ...f!, day_of_guarantee: e.target.value ? parseFloat(e.target.value) : null }))} /></div>
                <div><label className="block text-sm font-medium text-lp-text mb-1">Day-of Overage</label><input type="number" step="0.01" className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={form.day_of_overage ?? ''} onChange={(e) => setForm((f) => ({ ...f!, day_of_overage: e.target.value ? parseFloat(e.target.value) : null }))} /></div>
                <div><label className="block text-sm font-medium text-lp-text mb-1">Day-of Merch</label><input type="number" step="0.01" className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={form.day_of_merch ?? ''} onChange={(e) => setForm((f) => ({ ...f!, day_of_merch: e.target.value ? parseFloat(e.target.value) : null }))} /></div>
                <div><label className="block text-sm font-medium text-lp-text mb-1">Day-of Deductions</label><input type="number" step="0.01" className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={form.day_of_deductions ?? ''} onChange={(e) => setForm((f) => ({ ...f!, day_of_deductions: e.target.value ? parseFloat(e.target.value) : null }))} /></div>
              </div>
              <div><span className="text-sm font-medium text-lp-text">Day-of Net (computed): </span><span className="font-bold text-lp-text">{dayOfNet != null ? dayOfNet.toLocaleString('en-GB', { minimumFractionDigits: 2 }) : '—'}</span></div>
              <div><label className="block text-sm font-medium text-lp-text mb-1">Signed by</label><input type="text" className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={form.day_of_signed_by ?? ''} onChange={(e) => setForm((f) => ({ ...f!, day_of_signed_by: e.target.value || null }))} placeholder="TM initials or name" /></div>
              <div><label className="block text-sm font-medium text-lp-text mb-1">Day-of Notes</label><textarea className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 min-h-[60px]" value={form.day_of_notes ?? ''} onChange={(e) => setForm((f) => ({ ...f!, day_of_notes: e.target.value || null }))} /></div>
              <div><label className="block text-sm font-medium text-lp-text mb-1">Day-of signed sheet</label>{form.day_of_file_url ? <a href={form.day_of_file_url} target="_blank" rel="noopener noreferrer" className="text-lp-orange hover:underline inline-flex items-center gap-1">View <ExternalLink className="h-4 w-4" /></a> : null}<label className="ml-2 inline-flex items-center gap-1 text-sm text-lp-text-tertiary cursor-pointer"><input type="file" accept=".pdf,image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(expandedId, 'day_of_file', f); e.target.value = ''; }} disabled={!!uploadingField} />{uploadingField === 'day_of_file' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload</label></div>

              <hr className="border-lp-border" />

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-lp-text mb-1">Reconciled Guarantee</label><input type="number" step="0.01" className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={form.reconciled_guarantee ?? ''} onChange={(e) => setForm((f) => ({ ...f!, reconciled_guarantee: e.target.value ? parseFloat(e.target.value) : null }))} /></div>
                <div><label className="block text-sm font-medium text-lp-text mb-1">Reconciled Overage</label><input type="number" step="0.01" className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={form.reconciled_overage ?? ''} onChange={(e) => setForm((f) => ({ ...f!, reconciled_overage: e.target.value ? parseFloat(e.target.value) : null }))} /></div>
                <div><label className="block text-sm font-medium text-lp-text mb-1">Reconciled Merch</label><input type="number" step="0.01" className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={form.reconciled_merch ?? ''} onChange={(e) => setForm((f) => ({ ...f!, reconciled_merch: e.target.value ? parseFloat(e.target.value) : null }))} /></div>
                <div><label className="block text-sm font-medium text-lp-text mb-1">Reconciled Deductions</label><input type="number" step="0.01" className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30" value={form.reconciled_deductions ?? ''} onChange={(e) => setForm((f) => ({ ...f!, reconciled_deductions: e.target.value ? parseFloat(e.target.value) : null }))} /></div>
              </div>
              <div><span className="text-sm font-medium text-lp-text">Reconciled Net (computed): </span><span className="font-bold text-lp-text">{reconciledNet != null ? reconciledNet.toLocaleString('en-GB', { minimumFractionDigits: 2 }) : '—'}</span></div>
              <div><label className="block text-sm font-medium text-lp-text mb-1">Reconciled Notes</label><textarea className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 min-h-[60px]" value={form.reconciled_notes ?? ''} onChange={(e) => setForm((f) => ({ ...f!, reconciled_notes: e.target.value || null }))} /></div>

              <hr className="border-lp-border" />

              <div><label className="block text-sm font-medium text-lp-text mb-1">Deal Memo (text)</label><textarea className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30 min-h-[80px]" value={form.deal_memo_text ?? ''} onChange={(e) => setForm((f) => ({ ...f!, deal_memo_text: e.target.value || null }))} placeholder="Deal memo summary or paste" /></div>
              <div><label className="block text-sm font-medium text-lp-text mb-1">Deal Memo (file)</label>{form.deal_memo_file_url ? <a href={form.deal_memo_file_url} target="_blank" rel="noopener noreferrer" className="text-lp-orange hover:underline inline-flex items-center gap-1">View <ExternalLink className="h-4 w-4" /></a> : null}<label className="ml-2 inline-flex items-center gap-1 text-sm text-lp-text-tertiary cursor-pointer"><input type="file" accept=".pdf,image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(expandedId, 'deal_memo_file', f); e.target.value = ''; }} disabled={!!uploadingField} />{uploadingField === 'deal_memo_file' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload PDF</label></div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setExpandedId(null)} className="rounded-lg border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-bg-tertiary">Cancel</button>
              <button type="button" onClick={() => saveSettlement(expandedId, form)} disabled={saving} className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange/90 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
