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
    <div className="w-full min-w-0 space-y-6 lp-job-detail-root">
      <style dangerouslySetInnerHTML={{ __html: JOB_PRINT_CSS }} />

      {/* Branded export sheet — visible only when printing */}
      <JobExportSheet
        job={job}
        jobItems={jobItems}
        inventory={inventory}
        artistLabel={artistLabel}
        tourLabel={tourLabel}
        days={days}
        subtotal={subtotal}
        discPct={dp}
        discFixed={df}
        discAmt={discAmt}
        total={total}
      />

      {/* On-screen UI (hidden when printing) */}
      <div className="lp-job-screen-only space-y-6">
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
          <div className="flex gap-2 lp-job-no-print">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)', backgroundColor: 'transparent' }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = '#FF4500';
                e.currentTarget.style.color = '#FF4500';
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'var(--lp-border)';
                e.currentTarget.style.color = 'var(--lp-text-secondary)';
              }}
              title="Export as branded PDF"
            >
              <FileDown size={13} strokeWidth={2.5} />
              Export
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
      </div> {/* /lp-job-screen-only */}
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

/* ============================================================
   Branded Export Sheet — Rental Quote / Pull Sheet
   Hidden on screen, revealed via @media print (window.print()
   → "Save as PDF" produces the branded client-ready document).
   Mirrors the existing print pattern used in AdvanceShowReadView.
   ============================================================ */

const JOB_PRINT_CSS = `
@media screen {
  .lp-job-export-sheet { display: none; }
}
@media print {
  @page { size: A4; margin: 14mm 14mm 16mm 14mm; }

  /* Hide everything chrome-y on the page */
  aside, nav, header { display: none !important; }
  body { margin: 0 !important; background: #fff !important; }

  /* Hide the on-screen job detail UI */
  .lp-job-screen-only,
  .lp-job-no-print { display: none !important; }

  /* Reveal & lay out the printable */
  .lp-job-export-sheet {
    display: block !important;
    color: #111;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.4;
  }

  .lp-job-export-sheet table { page-break-inside: auto; }
  .lp-job-export-sheet tr    { page-break-inside: avoid; page-break-after: auto; }
  .lp-job-export-sheet thead { display: table-header-group; }
  .lp-job-export-sheet tfoot { display: table-footer-group; }
}
`;

interface JobExportSheetProps {
  job: RentalJob;
  jobItems: RentalJobItem[];
  inventory: RentalInventoryItem[];
  artistLabel: string | null;
  tourLabel: string | null;
  days: number;
  subtotal: number;
  discPct: number;
  discFixed: number;
  discAmt: number;
  total: number;
}

function JobExportSheet({
  job, jobItems, inventory,
  artistLabel, tourLabel,
  days, subtotal, discPct, discFixed, discAmt, total,
}: JobExportSheetProps) {
  const ORANGE = '#FF4500';
  const INK = '#111111';
  const MUTED = '#6B7280';
  const HAIR = '#E5E7EB';

  const documentNumber = `LP-${job.id.slice(0, 8).toUpperCase()}`;
  const issueDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const docTitle =
    job.status === 'invoiced' ? 'RENTAL INVOICE'
      : job.status === 'completed' ? 'RENTAL RECEIPT'
        : job.status === 'confirmed' ? 'PULL SHEET / QUOTE'
          : 'RENTAL QUOTE';

  return (
    <div className="lp-job-export-sheet">
      {/* ─── HEADER ────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 24,
        paddingBottom: 16,
        borderBottom: `3px solid ${ORANGE}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lowpass-logo.png" alt="Lowpass" style={{ height: 56, width: 'auto', display: 'block' }} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: INK,
            textTransform: 'uppercase',
          }}>{docTitle}</div>
          <div style={{ marginTop: 6, fontSize: 9.5, color: MUTED, letterSpacing: '0.04em' }}>
            <div><span style={{ color: MUTED, fontWeight: 600 }}>No.</span> <span style={{ color: INK, fontWeight: 600 }}>{documentNumber}</span></div>
            <div><span style={{ color: MUTED, fontWeight: 600 }}>Issued</span> <span style={{ color: INK }}>{issueDate}</span></div>
          </div>
        </div>
      </div>

      {/* ─── META BLOCK ────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 24,
        marginTop: 18,
        marginBottom: 22,
      }}>
        <div>
          <SheetLabel>Bill To</SheetLabel>
          <div style={{ fontSize: 11, color: INK, fontWeight: 700 }}>
            {job.client_name || '—'}
          </div>
          {artistLabel && (
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{artistLabel}</div>
          )}
          {tourLabel && (
            <div style={{ fontSize: 10, color: MUTED }}>{tourLabel}</div>
          )}
        </div>
        <div>
          <SheetLabel>Job</SheetLabel>
          <div style={{ fontSize: 11, color: INK, fontWeight: 700 }}>{job.name}</div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 2, textTransform: 'capitalize' }}>
            Status: {job.status}
          </div>
        </div>
        <div>
          <SheetLabel>Rental Period</SheetLabel>
          <div style={{ fontSize: 11, color: INK, fontWeight: 700 }}>
            {fmtDate(job.start_date)} → {fmtDate(job.end_date)}
          </div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
            {days} billable day{days !== 1 ? 's' : ''} <span style={{ color: '#9CA3AF' }}>(3-day-week)</span>
          </div>
        </div>
      </div>

      {/* ─── LINE ITEMS TABLE ──────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr style={{ backgroundColor: '#111111', color: '#fff' }}>
            <th style={thStyle('left',   '46%')}>Item</th>
            <th style={thStyle('center', '8%')}>Qty</th>
            <th style={thStyle('center', '12%')}>Days</th>
            <th style={thStyle('right',  '17%')}>Day Rate</th>
            <th style={thStyle('right',  '17%')}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {jobItems.length === 0 ? (
            <tr>
              <td colSpan={5} style={{
                padding: '20px 10px',
                textAlign: 'center',
                color: MUTED,
                fontStyle: 'italic',
                borderBottom: `1px solid ${HAIR}`,
              }}>
                No items on this job.
              </td>
            </tr>
          ) : jobItems.map((it) => {
            const inv  = inventory.find(i => i.id === it.inventory_id);
            const rate = it.day_rate_override ?? (inv ? effectiveInventoryDayRate(inv) ?? 0 : 0);
            const lineAmt = (it.quantity || 1) * days * rate;
            return (
              <tr key={it.id} style={{ borderBottom: `1px solid ${HAIR}` }}>
                <td style={tdStyle('left')}>
                  <div style={{ fontWeight: 600, color: INK }}>{inv?.name ?? 'Unknown'}</div>
                  {inv?.category && (
                    <div style={{ fontSize: 8.5, color: MUTED, marginTop: 1 }}>{inv.category}</div>
                  )}
                  {it.day_rate_override != null && (
                    <div style={{ fontSize: 8.5, color: ORANGE, fontWeight: 600, marginTop: 1 }}>
                      Custom rate
                    </div>
                  )}
                </td>
                <td style={tdStyle('center')}>{it.quantity}</td>
                <td style={tdStyle('center')}>{days}</td>
                <td style={tdStyle('right')}>{fmtUSD(rate)}</td>
                <td style={{ ...tdStyle('right'), fontWeight: 700 }}>{fmtUSD(lineAmt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ─── TOTALS BLOCK ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <table style={{ width: '46%', borderCollapse: 'collapse', fontSize: 10 }}>
          <tbody>
            <tr>
              <td style={{ padding: '6px 10px', color: MUTED }}>Subtotal</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', color: INK, fontWeight: 600 }}>
                {fmtUSD(subtotal)}
              </td>
            </tr>
            {discAmt > 0 && (
              <tr>
                <td style={{ padding: '6px 10px', color: MUTED }}>
                  {discPct > 0 && discFixed > 0 ? `Discount (${discPct}% + fixed)`
                    : discPct > 0 ? `Discount (${discPct}%)`
                      : 'Discount'}
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'right', color: ORANGE, fontWeight: 600 }}>
                  −{fmtUSD(discAmt)}
                </td>
              </tr>
            )}
            <tr>
              <td style={{
                padding: '10px',
                borderTop: `2px solid ${INK}`,
                color: INK,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontSize: 11,
              }}>
                Total Due
              </td>
              <td style={{
                padding: '10px',
                borderTop: `2px solid ${INK}`,
                textAlign: 'right',
                color: ORANGE,
                fontWeight: 800,
                fontSize: 14,
              }}>
                {fmtUSD(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ─── NOTES ─────────────────────────────────────────────────── */}
      {job.notes && (
        <div style={{ marginTop: 26 }}>
          <SheetLabel>Notes</SheetLabel>
          <div style={{
            fontSize: 9.5,
            color: INK,
            whiteSpace: 'pre-wrap',
            padding: '10px 12px',
            border: `1px solid ${HAIR}`,
            borderRadius: 4,
            backgroundColor: '#FAFAFA',
          }}>
            {job.notes}
          </div>
        </div>
      )}

      {/* ─── TERMS ─────────────────────────────────────────────────── */}
      <div style={{ marginTop: 26 }}>
        <SheetLabel>Terms</SheetLabel>
        <ol style={{
          margin: 0,
          paddingLeft: 16,
          fontSize: 8.5,
          color: MUTED,
          lineHeight: 1.55,
        }}>
          <li>All equipment remains the property of the lessor and must be returned in the condition supplied.</li>
          <li>Billable days follow the 3-day-week rule (each 7 calendar days = 3 billable days).</li>
          <li>Lessee assumes responsibility for loss, theft, and damage during the rental period.</li>
          <li>Quote is valid for 30 days from issue date. Final invoice may vary based on additions or losses.</li>
        </ol>
      </div>

      {/* ─── FOOTER ────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 32,
        paddingTop: 12,
        borderTop: `1px solid ${HAIR}`,
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 8,
        color: '#9CA3AF',
        letterSpacing: '0.04em',
      }}>
        <span>Generated by Lowpass · Tour Management Platform</span>
        <span>{documentNumber} · {issueDate}</span>
      </div>
    </div>
  );
}

function SheetLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 8,
      fontWeight: 800,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: '#FF4500',
      marginBottom: 4,
    }}>
      {children}
    </div>
  );
}

function thStyle(align: 'left' | 'center' | 'right', width: string): React.CSSProperties {
  return {
    padding: '8px 10px',
    textAlign: align,
    width,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };
}

function tdStyle(align: 'left' | 'center' | 'right'): React.CSSProperties {
  return {
    padding: '8px 10px',
    textAlign: align,
    verticalAlign: 'top',
    color: '#111111',
  };
}
