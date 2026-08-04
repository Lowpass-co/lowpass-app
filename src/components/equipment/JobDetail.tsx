/* ============================================
   LOWPASS — Equipment / Job Detail View
   ============================================ */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Trash2, Plus, FileDown, Sun, Moon, Package, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { useToast } from '@/components/ui/Toast';
import { effectiveInventoryDayRate } from '@/lib/rental-pricing';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';
import {
  STATUS_OPTIONS, calcDays, fmtUSD, fmtDate,
  type EquipmentArtistOption,
  type EquipmentTourOption,
  type RentalJob, type RentalInventoryItem, type RentalJobItem,
} from './types';
import { exportJobPdf, type PdfMode } from './exportJobPdf';

interface Props {
  job: RentalJob;
  /** Sprint 12 §1 — required for rental_job_items INSERTs after
   *  the canonical RLS swap in migration 095. */
  workspaceId: string | null;
  inventory: RentalInventoryItem[];
  artists: EquipmentArtistOption[];
  tours: EquipmentTourOption[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onJobUpdated: (job: RentalJob) => void;
}

export function JobDetail({ job, workspaceId, inventory, artists, tours, onBack, onEdit, onDelete, onJobUpdated }: Props) {
  const { showToast } = useToast();
  const [jobItems, setJobItems] = useState<RentalJobItem[]>([]);
  const [loading, setLoading]   = useState(true);

  // Add-item form
  /* Items 3+4 — the picker was a single <select> over all inventory, so adding
     six things to a quote was six round trips through a dropdown. Now: a search
     box, a checkbox list, shift-click ranges, and ONE insert for the batch. */
  const [search,   setSearch]   = useState('');
  const [selIds,   setSelIds]   = useState<Set<string>>(new Set());
  const lastIdxRef = useRef<number | null>(null);
  const [qty,      setQty]      = useState('1');
  const [rateOvr,  setRateOvr]  = useState('');
  const [adding,   setAdding]   = useState(false);

  // Discount / status (local, debounce-saved)
  const [discPct,   setDiscPct]   = useState(String(job.discount_percent ?? ''));
  const [discFixed, setDiscFixed] = useState(String(job.discount_fixed   ?? ''));
  const [status,    setStatus]    = useState(job.status);
  // PDF export — `pdfMode` chooses light/dark output, defaulting to the
  // app's current theme so the export feels native by default. Detected
  // once on mount via the `.dark` class on <html>.
  const [exporting, setExporting] = useState(false);
  const [pdfMode, setPdfMode] = useState<PdfMode>('light');
  useEffect(() => {
    if (typeof document === 'undefined') return;
    setPdfMode(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const supabase = createClient();
  const days = calcDays(job.start_date, job.end_date);

  /* Item 3 — search. Client-side is right here: Adam's audit put the inventory
     at 33 rows, so a filter is instant and a server round-trip would be slower
     than typing. Fields are the ones that EXIST — name, category, serial. The
     spec also asked for manufacturer/model; rental_inventory has no such
     column, so there is nothing to match on. */
  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter((i) =>
      [i.name, i.category, i.serial_number].some((f) => (f ?? '').toLowerCase().includes(q)),
    );
  }, [inventory, search]);

  /** Item 4 — click toggles; shift-click extends from the last click, over the
   *  FILTERED order, which is the order on screen. Ranging over the unfiltered
   *  list would select rows the user cannot see. */
  function toggleAt(idx: number, shiftKey: boolean) {
    const item = filteredInventory[idx];
    if (!item) return;
    setSelIds((prev) => {
      const next = new Set(prev);
      const from = shiftKey && lastIdxRef.current != null ? lastIdxRef.current : idx;
      const [lo, hi] = from <= idx ? [from, idx] : [idx, from];
      const turningOn = !prev.has(item.id);
      for (let i = lo; i <= hi; i++) {
        const id = filteredInventory[i]?.id;
        if (!id) continue;
        if (turningOn) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    lastIdxRef.current = idx;
  }

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

  /* ── Add selected items ──
     Two behaviours the old single-add did not have:

     1. ONE INSERT for the whole batch, not N. Six selected items used to mean
        six sequential round trips; now it is one call with six rows.
     2. AN ITEM ALREADY ON THE JOB INCREMENTS ITS QUANTITY. The old path always
        inserted, so adding the same item twice produced two identical lines and
        a quote that read as if you were renting two separate consoles. Confirmed
        as the pre-existing behaviour before changing it.

     Increments are per-row UPDATEs — Supabase has no "add to existing value"
     bulk verb — so a batch that is all increments is still N calls. That is the
     uncommon path (re-adding what you already added) and it is bounded by the
     selection size. The common path, adding new items, is one call. */
  async function handleAddSelected() {
    if (selIds.size === 0) return;
    setAdding(true);

    const addQty = Math.max(1, parseInt(qty) || 1);
    const override = rateOvr ? parseFloat(rateOvr) : null;

    const existing = jobItems.filter((it) => selIds.has(it.inventory_id));
    const existingIds = new Set(existing.map((it) => it.inventory_id));
    const freshIds = [...selIds].filter((id) => !existingIds.has(id));

    let failed = false;

    if (freshIds.length > 0) {
      /* Sprint 12 §1 — workspace_id required by the canonical RLS WITH CHECK
         clause from migration 095. */
      const rows = freshIds.map((inventory_id) => {
        const row: Record<string, unknown> = {
          job_id: job.id,
          inventory_id,
          quantity: addQty,
          day_rate_override: override,
        };
        if (workspaceId) row.workspace_id = workspaceId;
        return row;
      });
      const { data, error } = await supabase.from('rental_job_items').insert(rows).select();
      if (error) { showToast('Failed to add: ' + error.message, 'error'); failed = true; }
      else setJobItems((prev) => [...prev, ...((data ?? []) as RentalJobItem[])]);
    }

    for (const it of existing) {
      const nextQty = (it.quantity || 1) + addQty;
      const { error } = await supabase
        .from('rental_job_items')
        .update({ quantity: nextQty })
        .eq('id', it.id);
      if (error) { showToast('Failed to update quantity: ' + error.message, 'error'); failed = true; continue; }
      setJobItems((prev) => prev.map((r) => (r.id === it.id ? { ...r, quantity: nextQty } : r)));
    }

    setAdding(false);
    if (failed) return;

    /* Selection clears only on success — a failed add that also wiped the
       selection would make the retry a re-pick. */
    setSelIds(new Set());
    lastIdxRef.current = null;
    setQty('1');
    setRateOvr('');
  }

  /* ── Remove item ── */
  async function handleRemove(id: string) {
    const { error } = await supabase.from('rental_job_items').delete().eq('id', id);
    if (error) { showToast('Failed to remove: ' + error.message, 'error'); return; }
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
        mode: pdfMode,
      });
    } catch (err) {
      console.error('PDF export failed', err);
      showToast('PDF export failed. See console for details.', 'error');
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
            {/* Light/Dark toggle for the PDF export. Sits attached to the
                Export button on the left so it reads as one control. */}
            <PdfModeToggle mode={pdfMode} onChange={setPdfMode} disabled={exporting} />
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
              title={`Download as branded PDF (${pdfMode === 'dark' ? 'dark' : 'light'} mode)`}
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

          {/* Add items — search, multi-select, one batched add (items 3+4) */}
          <div
            className="rounded-xl border p-4 space-y-3"
            style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-bg-secondary)' }}
          >
            {/* Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--lp-text-tertiary)' }}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search inventory — name, category, serial"
                aria-label="Search inventory"
                className="w-full rounded-lg border pl-9 pr-8 py-2 text-sm"
                style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)', color: 'var(--lp-text)' }}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>

            {/* Checkbox list. Shift-click extends from the last row you clicked. */}
            <div
              className="max-h-56 overflow-y-auto rounded-lg border"
              style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}
            >
              {filteredInventory.length === 0 ? (
                <p className="px-3 py-4 text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
                  {inventory.length === 0 ? 'No inventory in this workspace.' : `Nothing matches “${search}”.`}
                </p>
              ) : (
                filteredInventory.map((i, idx) => {
                  const checked = selIds.has(i.id);
                  const onJob = jobItems.some((it) => it.inventory_id === i.id);
                  return (
                    <label
                      key={i.id}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
                      style={{ backgroundColor: checked ? 'color-mix(in srgb, var(--lp-orange) 10%, transparent)' : undefined }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => { /* click handled below so shift is available */ }}
                        onClick={(e) => toggleAt(idx, (e as unknown as { shiftKey: boolean }).shiftKey)}
                        className="h-4 w-4 shrink-0 accent-[#FF4500]"
                      />
                      <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--lp-text)' }}>
                        {i.name}
                        {i.category ? (
                          <span style={{ color: 'var(--lp-text-tertiary)' }}> · {i.category}</span>
                        ) : null}
                        {onJob ? (
                          <span className="lp-mono ml-2 text-[10px] uppercase" style={{ color: 'var(--lp-text-tertiary)' }}>
                            on quote
                          </span>
                        ) : null}
                      </span>
                      <span className="lp-mono shrink-0 text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
                        {fmtUSD(effectiveInventoryDayRate(i))}/day
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="w-20 space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--lp-text-secondary)' }}>Qty each</label>
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

              <span className="flex-1 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                {selIds.size > 0
                  ? `${selIds.size} selected · qty and rate apply to each`
                  : 'Select items to add. Shift-click for a range.'}
              </span>

              {selIds.size > 0 ? (
                <button
                  onClick={() => { setSelIds(new Set()); lastIdxRef.current = null; }}
                  className="rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--lp-text-secondary)' }}
                >
                  Clear
                </button>
              ) : null}

              <button
                onClick={handleAddSelected}
                disabled={selIds.size === 0 || adding}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40 transition-colors"
                style={{ backgroundColor: '#FF4500' }}
              >
                <Plus size={13} strokeWidth={2.5} />
                {adding ? 'Adding…' : selIds.size > 1 ? `Add ${selIds.size}` : 'Add'}
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
                <Package size={24} strokeWidth={1.5} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
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
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--lp-bg-secondary)', border: '1px solid var(--lp-border)' }}><Package size={16} strokeWidth={1.75} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} /></div>
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

/** Segmented Light/Dark toggle for PDF export. Two icon buttons sharing
 *  one rounded border, matching the visual weight of the Export/Edit
 *  buttons next to it. */
function PdfModeToggle({
  mode, onChange, disabled,
}: { mode: PdfMode; onChange: (m: PdfMode) => void; disabled?: boolean }) {
  const options: Array<{ value: PdfMode; label: string; Icon: typeof Sun }> = [
    { value: 'light', label: 'Light PDF', Icon: Sun },
    { value: 'dark',  label: 'Dark PDF',  Icon: Moon },
  ];
  return (
    <div
      className="flex items-stretch overflow-hidden rounded-lg border"
      style={{ borderColor: 'var(--lp-border)', backgroundColor: 'transparent' }}
      role="group"
      aria-label="PDF export mode"
    >
      {options.map(({ value, label, Icon }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            disabled={disabled}
            title={label}
            aria-pressed={active}
            className="flex items-center justify-center px-2.5 text-xs transition-colors disabled:opacity-50"
            style={{
              backgroundColor: active
                ? 'color-mix(in srgb, var(--color-lp-orange) 12%, var(--lp-panel))'
                : 'transparent',
              color: active ? 'var(--color-lp-orange)' : 'var(--lp-text-secondary)',
            }}
          >
            <Icon size={13} strokeWidth={2.5} />
          </button>
        );
      })}
    </div>
  );
}
