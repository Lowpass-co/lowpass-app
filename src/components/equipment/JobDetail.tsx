/* ============================================
   LOWPASS — Equipment / Job Detail View
   ============================================ */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Trash2, Plus, FileDown } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { effectiveInventoryDayRate } from '@/lib/rental-pricing';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';
import {
  STATUS_OPTIONS, calcDays, fmtUSD, fmtDate,
  type EquipmentArtistOption,
  type EquipmentTourOption,
  type RentalJob, type RentalInventoryItem, type RentalJobItem,
} from './types';
import { exportJobPdf } from './exportJobPdf';

interface Props {
  job: RentalJob;
  inventory: RentalInventoryItem[];
  artists: EquipmentArtistOption[];
  tours: EquipmentTourOption[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onJobUpdated: (job: RentalJob) => void;
}

export function JobDetail({ job, inventory, artists, tours, onBack, onEdit, onDelete, onJobUpdated }: Props) {
  const [jobItems, setJobItems] = useState<RentalJobItem[]>([]);
  const [loading, setLoading]   = useState(true);

  // Add-item form
  const [selInv,   setSelInv]   = useState('');
  const [qty,      setQty]      = useState('1');
  const [rateOvr,  setRateOvr]  = useState('');
  const [adding,   setAdding]   = useState(false);

  // Discount / status (local, debounce-saved)
  const [discPct,   setDiscPct]   = useState(String(job.discount_percent ?? ''));
  const [discFixed, setDiscFixed] = useState(String(job.discount_fixed   ?? ''));
  const [status,    setStatus]    = useState(job.status);
  const [exporting, setExporting] = useState(false);

  // PDF export
  const [exporting, setExporting] = useState(false);

  const supabase = createClient();
  const days = calcDays(job.start_date, job.end_date);

  const invSelectOptions: StyledSelectOption<string>[] = [
    { value: '', label: '— select from inventory —' },
    ...inventory.map((i) => ({
      value: i.id,
      label: `${i.name}${i.category ? ` (${i.category})` : ''} — ${fmtUSD(effectiveInventoryDayRate(i))}/day`,
    })),
  ];

  const statusSelectOptions: StyledSelectOption<RentalJob['status']>[] = STATUS_OPTIONS.map((s) => ({
    value: s,
    label: s.charAt(0).toUpperCase() + s.slice(1),
  }));

  const artistLabel =
    job.artist?.name ?? artists.find((a) => a.id === job.artist_id)?.name ?? null;
  const tourLabel = job.tour?.name ?? tours.find((t) => t.id === job.tour_id)?.name ?? null;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('rental_job_items').select('*').eq('job_id', job.id);
    setJobItems(data ?? []);
    setLoading(false);
  }, [job.id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  /* ── Pricing ── */
  let subtotal = 0;
  for (const it of jobItems) {
    const inv  = inventory.find(i => i.id === it.inventory_id);
    const rate = it.day_rate_override ?? (inv ? effectiveInventoryDayRate(inv) ?? 0 : 0);
    subtotal  += (it.quantity || 1) * days * rate;
  }
  const dp       = parseFloat(discPct)   || 0;
  const df       = parseFloat(discFixed) || 0;
  const discAmt  = subtotal * (dp / 100) + df;
  const total    = Math.max(0, subtotal - discAmt);

  /* ── Add item ── */
  async function handleAdd() {
    if (!selInv) return;
    setAdding(true);
    const { data, error } = await supabase
      .from('rental_job_items')
      .insert({
        job_id: job.id,
        inventory_id: selInv,
        quantity: parseInt(qty) || 1,
        day_rate_override: rateOvr ? parseFloat(rateOvr) : null,
      })
      .select().single();
    setAdding(false);
    if (error) { alert('Failed to add: ' + error.message); return; }
    setJobItems(prev => [...prev, data as RentalJobItem]);
    setSelInv(''); setQty('1'); setRateOvr('');
  }

  /* ── Remove item ── */
  async function handleRemove(id: string) {
    const { error } = await supabase.from('rental_job_items').delete().eq('id', id);
    if (error) { alert('Failed to remove: ' + error.message); return; }
    setJobItems(prev => prev.filter(i => i.id !== id));
  }

  /* ── Discount save (debounced) ── */
  useEffect(() => {
    const t = setTimeout(async () => {
      const updates = { discount_percent: parseFloat(discPct) || 0, discount_fixed: parseFloat(discFixed) || 0 };
      await supabase.from('rental_jobs').update(updates).eq('id', job.id);
      onJobUpdated({ ...job, ...updates });
    }, 800);
    return () => clearTimeout(t);
  }, [discPct, discFixed]);

  /* ── Export branded PDF ── */
  async function handleExportPdf() {
    if (exporting) return;
    setExporting(true);
    try {
      await exportJobPdf({
        job,
        jobItems,
        inventory,
        artistLabel,
        tourLabel,
        discPct: dp,
        discFixed: df,
      });
    } catch (err) {
      console.error('PDF export failed', err);
      alert('PDF export failed. See console for details.');
    } finally {
      setExporting(false);
    }
  }

  /* ── Status save ── */
  async function handleStatusChange(val: string) {
    setStatus(val as RentalJob['status']);
    await supabase.from('rental_jobs').update({ status: val }).eq('id', job.id);
    onJobUpdated({ ...job, status: val as RentalJob['status'] });
  }

  function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      window.print();
    } finally {
      setTimeout(() => setExporting(false), 250);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* Back + title row */}
      <div>
        <button
          onClick={onBack}
          className="mb-3 flex items-center gap-1.5 text-xs font-medium transition-colors"
          style={{ color: 'var(--lp-text-tertiary)' }}
          onMouseOver={e => (e.currentTarget.style.color = 'var(--lp-text)')}
          onMouseOut={e => (e.currentTarget.style.color = 'var(--lp-text-tertiary)')}
        >
          <ArrowLeft size={14} /> Back to Jobs
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--lp-text)' }}>{job.name}</h2>
            <div className="mt-1.5 flex flex-wrap gap-4 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
              {artistLabel && <span>🎤 {artistLabel}</span>}
              {tourLabel && <span>🗺 {tourLabel}</span>}
              {job.client_name && <span>👤 {job.client_name}</span>}
              <span>📅 {fmtDate(job.start_date)} → {fmtDate(job.end_date)}</span>
              <span title="3-day-week billing: each 7 calendar days = 3 billable days">
                ⏱ {days} billable day{days !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void handleExportPdf()}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)', backgroundColor: 'transparent' }}
              onMouseOver={e => {
                if (exporting) return;
                e.currentTarget.style.borderColor = '#FF4500';
                e.currentTarget.style.color = '#FF4500';
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'var(--lp-border)';
                e.currentTarget.style.color = 'var(--lp-text-secondary)';
              }}
              title="Download as branded PDF"
            >
              <FileDown size={13} strokeWidth={2.5} />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60"
              style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)', backgroundColor: 'transparent' }}
              onMouseOver={e => {
                if (exporting) return;
                e.currentTarget.style.borderColor = '#FF4500';
                e.currentTarget.style.color = '#FF4500';
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'var(--lp-border)';
                e.currentTarget.style.color = 'var(--lp-text-secondary)';
              }}
              title="Export this rental job"
            >
              <FileDown size={13} strokeWidth={2.5} />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            <button
              onClick={onEdit}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)', backgroundColor: 'transparent' }}
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ borderColor: '#EF444440', color: '#EF4444', backgroundColor: 'transparent' }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Main layout: items + pricing panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">

        {/* ── Left: line items ── */}
        <div className="space-y-4">

          {/* Add item row */}
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-bg-secondary)' }}
          >
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[180px] space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--lp-text-secondary)' }}>Item</label>
                <StyledSelect
                  value={selInv}
                  onChange={setSelInv}
                  options={invSelectOptions}
                  placeholder="— select from inventory —"
                  size="sm"
                />
              </div>
              <div className="w-20 space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--lp-text-secondary)' }}>Qty</label>
                <input
                  type="number" value={qty} onChange={e => setQty(e.target.value)}
                  min="1"
                  className="w-full rounded-lg border px-3 py-2 text-sm text-center"
                  style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)', color: 'var(--lp-text)' }}
                />
              </div>
              <div className="w-32 space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--lp-text-secondary)' }}>Rate Override</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>$</span>
                  <input
                    type="number" value={rateOvr} onChange={e => setRateOvr(e.target.value)}
                    placeholder="Default" min="0" step="0.01"
                    className="w-full rounded-lg border pl-5 pr-3 py-2 text-sm"
                    style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)', color: 'var(--lp-text)' }}
                  />
                </div>
              </div>
              <button
                onClick={handleAdd}
                disabled={!selInv || adding}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40 transition-colors"
                style={{ backgroundColor: '#FF4500' }}
              >
                <Plus size={13} strokeWidth={2.5} />
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>

          {/* Items table */}
          <div
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
                Loading…
              </div>
            ) : jobItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12">
                <div className="text-2xl">📦</div>
                <p className="text-sm" style={{ color: 'var(--lp-text-secondary)' }}>No items added yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--lp-border)', backgroundColor: 'var(--lp-bg-secondary)' }}>
                      {['', 'Item', 'Qty', 'Billable days', 'Day Rate', 'Subtotal', ''].map((h, i) => (
                        <th
                          key={i}
                          className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider"
                          style={{ color: 'var(--lp-text-tertiary)' }}
                        >{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jobItems.map((it, idx) => {
                      const inv     = inventory.find(i => i.id === it.inventory_id);
                      const rate    = it.day_rate_override ?? (inv ? effectiveInventoryDayRate(inv) ?? 0 : 0);
                      const lineAmt = (it.quantity || 1) * days * rate;
                      return (
                        <tr
                          key={it.id}
                          style={{ borderBottom: idx < jobItems.length - 1 ? '1px solid var(--lp-border-light)' : 'none' }}
                        >
                          <td className="px-4 py-2.5">
                            {inv?.image_url ? (
                              <img src={inv.image_url} alt="" className="h-9 w-9 rounded-lg object-cover" style={{ border: '1px solid var(--lp-border)' }} />
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg text-base" style={{ backgroundColor: 'var(--lp-bg-secondary)', border: '1px solid var(--lp-border)' }}>📦</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium" style={{ color: 'var(--lp-text)' }}>{inv?.name ?? 'Unknown'}</div>
                            {inv?.category && <div className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>{inv.category}</div>}
                            {inv?.weight_kg && <div className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>{inv.weight_kg} kg</div>}
                          </td>
                          <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>{it.quantity}</td>
                          <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>{days}</td>
                          <td className="px-4 py-2.5">
                            <div className="text-sm" style={{ color: 'var(--lp-text-secondary)' }}>{fmtUSD(rate)}/day</div>
                            {it.day_rate_override != null && (
                              <div className="text-xs font-medium" style={{ color: '#F59E0B' }}>override</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--lp-text)' }}>{fmtUSD(lineAmt)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => handleRemove(it.id)}
                              className="rounded-md p-1.5 transition-colors"
                              style={{ color: 'var(--lp-text-tertiary)' }}
                              onMouseOver={e => (e.currentTarget.style.color = '#EF4444')}
                              onMouseOut={e => (e.currentTarget.style.color = 'var(--lp-text-tertiary)')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: pricing panel ── */}
        <div
          className="rounded-xl border p-5 space-y-4 self-start lg:sticky lg:top-20"
          style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}
        >
          <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }}>Pricing</h3>

          <div className="space-y-1.5">
            <div className="flex justify-between text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
              <span>Items subtotal</span><span>{fmtUSD(subtotal)}</span>
            </div>
            {discAmt > 0 && (
              <div className="flex justify-between text-sm font-medium" style={{ color: '#F59E0B' }}>
                <span>
                  {dp > 0 && df > 0 ? `${dp}% + fixed` : dp > 0 ? `${dp}% discount` : 'Fixed discount'}
                </span>
                <span>−{fmtUSD(discAmt)}</span>
              </div>
            )}
            <div
              className="flex justify-between pt-2 text-base font-bold"
              style={{ borderTop: '1px solid var(--lp-border)', color: 'var(--lp-text)' }}
            >
              <span>Total</span><span>{fmtUSD(total)}</span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--lp-border)', paddingTop: '1rem' }} className="space-y-3">
            <PricingField label="Discount %">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>%</span>
                <input
                  type="number" value={discPct}
                  onChange={e => setDiscPct(e.target.value)}
                  min="0" max="100" step="0.5" placeholder="0"
                  className="w-full rounded-lg border pl-6 pr-3 py-2 text-sm"
                  style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-bg)', color: 'var(--lp-text)' }}
                />
              </div>
            </PricingField>
            <PricingField label="Fixed Discount ($)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>$</span>
                <input
                  type="number" value={discFixed}
                  onChange={e => setDiscFixed(e.target.value)}
                  min="0" step="0.01" placeholder="0.00"
                  className="w-full rounded-lg border pl-5 pr-3 py-2 text-sm"
                  style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-bg)', color: 'var(--lp-text)' }}
                />
              </div>
            </PricingField>
          </div>

          <div style={{ borderTop: '1px solid var(--lp-border)', paddingTop: '1rem' }}>
            <PricingField label="Status">
              <StyledSelect
                value={status}
                onChange={(v) => void handleStatusChange(v)}
                options={statusSelectOptions}
                placeholder="Status"
                size="sm"
              />
            </PricingField>
          </div>
        </div>
      </div>
    </div>
  );
}

function PricingField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--lp-text-secondary)' }}>{label}</label>
      {children}
    </div>
  );
}
