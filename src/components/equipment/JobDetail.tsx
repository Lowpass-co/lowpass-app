/* ============================================
   LOWPASS — Equipment / Job Detail View
   ============================================ */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Trash2, Plus, FileDown, Sun, Moon, Package, Search, X, ChevronDown, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { useToast } from '@/components/ui/Toast';
import { effectiveInventoryDayRate } from '@/lib/rental-pricing';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';
import {
  STATUS_OPTIONS, QUOTE_CURRENCIES, calcDays, fmtMoney, jobCurrency, fmtDate,
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
  /* R2-1 — selection is a MAP, not a Set: each selected row carries its OWN qty
     and rate. The previous design applied one global "QTY EACH" across the whole
     selection, which is wrong the moment you want 3 of one thing and 1 of
     another — the normal case, and Adam's actual objection. */
  const [sel, setSel] = useState<Map<string, { qty: string; rate: string }>>(new Map());
  const lastIdxRef = useRef<number | null>(null);
  /* R2-2 — the add panel is a BUILDING tool, not an editing one: open while the
     quote is empty, collapsed once it has lines, and the user's own choice wins
     from then on. Persisted like the nav rail's collapse. */
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);

  /* ── Item 2: the quote's currency ──
     The job carries it, not the line: a quote is denominated once. Items keep
     their own value_currency as the SOURCE unit; conversion happens at render.

     LIVE WHILE DRAFTING, FROZEN ON COMMIT. job.fx_rate is null for a draft, so
     the rate is re-fetched and the numbers move with the market — right while
     you are still quoting. The moment the job leaves 'draft' the rate it last
     showed is stamped onto the row, because a client who accepted Tuesday's
     number must not open the same quote on Friday and find a different one.
     Same live-until-committed rule as tour FX. */
  const cur = jobCurrency(job);
  const isDraft = job.status === 'draft';
  const [liveRate, setLiveRate] = useState<number | null>(null);
  const [rateAt, setRateAt] = useState<string | null>(null);
  const [rateMissing, setRateMissing] = useState(false);

  /** Rate in force: the frozen one once committed, else the live one. */
  const fxRate = !isDraft && job.fx_rate != null ? Number(job.fx_rate) : liveRate;
  const fxRateAt = !isDraft && job.fx_rate_at ? job.fx_rate_at : rateAt;

  useEffect(() => {
    /* USD source → USD quote needs no rate, and a frozen job must never
       re-fetch: that would silently re-price a signed document. */
    if (!isDraft || cur === 'USD') { setLiveRate(cur === 'USD' ? 1 : null); setRateMissing(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/budget/exchange-rate?from=USD&to=${encodeURIComponent(cur)}`);
        const body = (await res.json()) as { rate?: number; fetched_at?: string };
        if (cancelled) return;
        if (typeof body.rate === 'number') {
          setLiveRate(body.rate);
          setRateAt(body.fetched_at ?? new Date().toISOString());
          setRateMissing(false);
        } else {
          /* Surface it rather than converting 1:1 — a silent identity rate
             prints a euro quote at dollar numbers. */
          setLiveRate(null);
          setRateMissing(true);
        }
      } catch {
        if (!cancelled) { setLiveRate(null); setRateMissing(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [cur, isDraft]);

  /** USD-denominated figure → the quote's currency. */
  const conv = useCallback((usd: number) => (fxRate == null ? usd : usd * fxRate), [fxRate]);

  async function handleCurrencyChange(next: string) {
    const patch = { display_currency: next };
    const { error } = await supabase.from('rental_jobs').update(patch).eq('id', job.id);
    if (error) { showToast('Failed to set currency: ' + error.message, 'error'); return; }
    onJobUpdated({ ...job, ...patch });
  }

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

  /** Defaults for a newly selected row: one of it, at its own effective day
   *  rate. Per row, so a mixed selection is expressible. */
  function draftFor(it: RentalInventoryItem) {
    return { qty: '1', rate: String(effectiveInventoryDayRate(it) ?? 0) };
  }

  /** R2-1 — CLICK THE ROW to select; no checkbox. Shift-click still extends
   *  from the last click over the FILTERED order, which is the order on screen —
   *  ranging over the unfiltered list would select rows you cannot see. */
  function toggleAt(idx: number, shiftKey: boolean) {
    const item = filteredInventory[idx];
    if (!item) return;
    setSel((prev) => {
      const next = new Map(prev);
      const from = shiftKey && lastIdxRef.current != null ? lastIdxRef.current : idx;
      const [lo, hi] = from <= idx ? [from, idx] : [idx, from];
      const turningOn = !prev.has(item.id);
      for (let i = lo; i <= hi; i++) {
        const row = filteredInventory[i];
        if (!row) continue;
        if (turningOn) { if (!next.has(row.id)) next.set(row.id, draftFor(row)); }
        else next.delete(row.id);
      }
      return next;
    });
    lastIdxRef.current = idx;
  }

  /** Edit one selected row without disturbing the others. */
  function setDraft(id: string, patch: Partial<{ qty: string; rate: string }>) {
    setSel((prev) => {
      const cur0 = prev.get(id);
      if (!cur0) return prev;
      const next = new Map(prev);
      next.set(id, { ...cur0, ...patch });
      return next;
    });
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

  /* R2-2 — default OPEN while the quote is empty, COLLAPSED once it has lines;
     the user's own choice overrides both and persists. Read lazily so there is
     no hydration mismatch and no set-state-in-effect. */
  const PANEL_KEY = 'lowpass:quote:addpanel:open';
  useEffect(() => {
    if (panelOpen !== null) return;
    try {
      const stored = window.localStorage.getItem(PANEL_KEY);
      if (stored !== null) { setPanelOpen(stored === '1'); return; }
    } catch { /* private mode */ }
  }, [panelOpen]);
  const addOpen = panelOpen ?? jobItems.length === 0;
  function setPanelOpenPersisted(next: boolean) {
    setPanelOpen(next);
    try { window.localStorage.setItem(PANEL_KEY, next ? '1' : '0'); } catch { /* nicety */ }
  }

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
    if (sel.size === 0) return;
    setAdding(true);

    const onJobBy = new Map(jobItems.map((it) => [it.inventory_id, it] as const));
    const fresh: Array<{ id: string; qty: number; rate: number }> = [];
    const bump: Array<{ row: RentalJobItem; qty: number }> = [];

    for (const [invId, d] of sel) {
      const q = Math.max(1, parseInt(d.qty) || 1);
      const r = parseFloat(d.rate);
      const existing = onJobBy.get(invId);
      if (existing) bump.push({ row: existing, qty: q });
      else fresh.push({ id: invId, qty: q, rate: Number.isFinite(r) ? r : 0 });
    }

    let failed = false;

    if (fresh.length > 0) {
      /* ONE insert for the batch, each row carrying ITS OWN qty and rate.
         Sprint 12 §1 — workspace_id required by the canonical RLS WITH CHECK
         clause from migration 095. */
      const rows = fresh.map(({ id, qty: q, rate: r }) => {
        const row: Record<string, unknown> = {
          job_id: job.id,
          inventory_id: id,
          quantity: q,
          /* Store the rate only when it DIFFERS from what the item derives —
             an override equal to the auto rate is not an override, and pinning
             it would silently freeze the line against future rate changes. */
          day_rate_override:
            Math.abs(r - (effectiveInventoryDayRate(
              inventory.find((i) => i.id === id) ?? { day_rate: null, purchase_cost: null },
            ) ?? 0)) < 0.005 ? null : r,
        };
        if (workspaceId) row.workspace_id = workspaceId;
        return row;
      });
      const { data, error } = await supabase.from('rental_job_items').insert(rows).select();
      if (error) { showToast('Failed to add: ' + error.message, 'error'); failed = true; }
      else setJobItems((prev) => [...prev, ...((data ?? []) as RentalJobItem[])]);
    }

    /* Already-on-the-quote items increment instead of duplicating. Per-row
       UPDATEs — Supabase has no bulk add-to-value — but this is the uncommon
       path and it is bounded by the selection. */
    for (const { row, qty: q } of bump) {
      const nextQty = (row.quantity || 1) + q;
      const { error } = await supabase
        .from('rental_job_items')
        .update({ quantity: nextQty })
        .eq('id', row.id);
      if (error) { showToast('Failed to update quantity: ' + error.message, 'error'); failed = true; continue; }
      setJobItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, quantity: nextQty } : r)));
    }

    setAdding(false);
    if (failed) return;

    /* Clears only on SUCCESS — a failed add that also wiped the selection would
       make the retry a re-pick. */
    setSel(new Map());
    lastIdxRef.current = null;
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
  /** Freeze the FX rate the first time this job leaves 'draft'.
   *
   *  Live rates are right while quoting and wrong afterwards. Stamping happens
   *  HERE, on the transition, rather than on send-a-PDF, because the status is
   *  the thing that actually means "this is no longer a working draft" — and
   *  there is no 'sent' status in this model to hang it on. Never re-stamped:
   *  once frozen, a later status change leaves the original rate alone. */
  async function handleStatusChange(val: string) {
    setStatus(val as RentalJob['status']);
    const patch: Record<string, unknown> = { status: val };
    const leavingDraft = job.status === 'draft' && val !== 'draft';
    const alreadyFrozen = job.fx_rate != null;
    if (leavingDraft && !alreadyFrozen && cur !== 'USD' && fxRate != null) {
      patch.fx_rate = fxRate;
      patch.fx_rate_at = fxRateAt ?? new Date().toISOString();
    }
    await supabase.from('rental_jobs').update(patch).eq('id', job.id);
    onJobUpdated({ ...job, ...patch, status: val as RentalJob['status'] });
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

          {/* Add items — row-click selection with per-row qty/rate (R2-1),
              collapsible (R2-2) */}
          <div
            className="rounded-xl border"
            style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-bg-secondary)' }}
          >
            <button
              type="button"
              onClick={() => setPanelOpenPersisted(!addOpen)}
              aria-expanded={addOpen}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              {addOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--lp-text-secondary)' }}>
                Add items
              </span>
              {!addOpen && sel.size > 0 ? (
                <span className="lp-mono text-[10px]" style={{ color: 'var(--lp-orange)' }}>
                  {sel.size} selected
                </span>
              ) : null}
              <span className="ml-auto lp-mono text-[10px]" style={{ color: 'var(--lp-text-tertiary)' }}>
                {inventory.length} in inventory
              </span>
            </button>

            {addOpen ? (
              <div className="space-y-3 px-4 pb-4">
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

                {/* Rows. CLICK to select; shift-click extends. A selected row
                    reveals its OWN qty and rate — no global "qty each". */}
                <div
                  className="max-h-64 overflow-y-auto rounded-lg border"
                  style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}
                >
                  {filteredInventory.length === 0 ? (
                    <p className="px-3 py-4 text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
                      {inventory.length === 0 ? 'No inventory in this workspace.' : `Nothing matches “${search}”.`}
                    </p>
                  ) : (
                    filteredInventory.map((i, idx) => {
                      const draft = sel.get(i.id);
                      const selected = !!draft;
                      const onJob = jobItems.some((it) => it.inventory_id === i.id);
                      return (
                        <div
                          key={i.id}
                          role="option"
                          aria-selected={selected}
                          tabIndex={0}
                          onClick={(e) => toggleAt(idx, e.shiftKey)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAt(idx, e.shiftKey); }
                          }}
                          className="flex cursor-pointer select-none items-center gap-3 px-3 py-2 text-sm"
                          style={{
                            /* G2-2b selected-row grammar: inset ring + tint, NOT
                               a border — a border changes the box and shifts every
                               row below it on select. */
                            backgroundColor: selected ? 'color-mix(in srgb, var(--lp-orange) 12%, transparent)' : undefined,
                            boxShadow: selected ? 'inset 2px 0 0 var(--lp-orange)' : undefined,
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--lp-text)' }}>
                            {i.name}
                            {i.category ? <span style={{ color: 'var(--lp-text-tertiary)' }}> · {i.category}</span> : null}
                            {onJob ? (
                              <span className="lp-mono ml-2 text-[10px] uppercase" style={{ color: 'var(--lp-text-tertiary)' }}>
                                on quote
                              </span>
                            ) : null}
                          </span>

                          {selected ? (
                            /* stopPropagation so typing in these doesn't toggle
                               the row out from under the cursor. */
                            <span className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <label className="lp-mono text-[10px] uppercase" style={{ color: 'var(--lp-text-tertiary)' }}>Qty</label>
                              <input
                                type="number" min="1" value={draft.qty}
                                onChange={(e) => setDraft(i.id, { qty: e.target.value })}
                                aria-label={`Quantity for ${i.name}`}
                                className="w-14 rounded border px-2 py-1 text-center text-xs"
                                style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)', color: 'var(--lp-text)' }}
                              />
                              <label className="lp-mono text-[10px] uppercase" style={{ color: 'var(--lp-text-tertiary)' }}>Rate</label>
                              <input
                                type="number" min="0" step="0.01" value={draft.rate}
                                onChange={(e) => setDraft(i.id, { rate: e.target.value })}
                                aria-label={`Day rate for ${i.name}`}
                                className="w-20 rounded border px-2 py-1 text-right text-xs"
                                style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)', color: 'var(--lp-text)' }}
                              />
                            </span>
                          ) : (
                            <span className="lp-mono shrink-0 text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
                              {fmtMoney(conv(effectiveInventoryDayRate(i) ?? 0), cur)}/day
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex-1 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                    {sel.size > 0
                      ? `${sel.size} selected · each row carries its own qty and rate`
                      : 'Click a row to select. Shift-click for a range.'}
                  </span>
                  {sel.size > 0 ? (
                    <button
                      onClick={() => { setSel(new Map()); lastIdxRef.current = null; }}
                      className="rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--lp-text-secondary)' }}
                    >
                      Clear
                    </button>
                  ) : null}
                  <button
                    onClick={handleAddSelected}
                    disabled={sel.size === 0 || adding}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40 transition-colors"
                    style={{ backgroundColor: '#FF4500' }}
                  >
                    <Plus size={13} strokeWidth={2.5} />
                    {adding ? 'Adding…' : sel.size > 1 ? `Add ${sel.size}` : 'Add'}
                  </button>
                </div>
              </div>
            ) : null}
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
                            <div className="text-sm" style={{ color: 'var(--lp-text-secondary)' }}>{fmtMoney(conv(rate), cur)}/day</div>
                            {it.day_rate_override != null && (
                              <div className="text-xs font-medium" style={{ color: '#F59E0B' }}>override</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--lp-text)' }}>{fmtMoney(conv(lineAmt), cur)}</td>
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
            <div className="flex items-baseline justify-between gap-3 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
              {/* Currency + rate provenance. A converted price with no visible
                  rate and date is unauditable, and this document goes to a
                  client. Frozen quotes say so; drafts say the rate is live. */}
              <div className="mb-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--lp-text-secondary)' }}>
                    Currency
                  </span>
                  <select
                    value={cur}
                    onChange={(e) => void handleCurrencyChange(e.target.value)}
                    disabled={!isDraft}
                    aria-label="Quote currency"
                    title={isDraft ? undefined : 'Locked — the rate froze when this left draft'}
                    className="ml-auto rounded-lg border px-2 py-1 text-xs disabled:opacity-50"
                    style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)', color: 'var(--lp-text)' }}
                  >
                    {QUOTE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {cur !== 'USD' ? (
                  rateMissing ? (
                    <p className="lp-mono text-[10px] leading-snug" style={{ color: 'var(--lp-warning, #F0553D)' }}>
                      No FX rate available — figures shown are USD, unconverted.
                    </p>
                  ) : fxRate != null ? (
                    <p className="lp-mono text-[10px] leading-snug" style={{ color: 'var(--lp-text-tertiary)' }}>
                      1 USD = {fxRate.toFixed(4)} {cur}
                      {fxRateAt ? ` · ${fmtDate(fxRateAt.slice(0, 10))}` : ''}
                      {isDraft ? ' · live' : ' · frozen'}
                    </p>
                  ) : null
                ) : null}
              </div>

              {/* R2-4 — the label wrapped onto two lines and collided with the
                  figure. `flex justify-between` alone lets BOTH children wrap;
                  the fix is asymmetric on purpose: the label may shrink and
                  ellipsis, the money may not. min-w-0 makes truncate work
                  inside a flex child, shrink-0 + tabular-nums keeps the figures
                  on one line and on a shared right edge. */}
              <span className="min-w-0 truncate">Items subtotal</span>
              <span className="lp-mono shrink-0 tabular-nums">{fmtMoney(conv(subtotal), cur)}</span>
            </div>
            {discAmt > 0 && (
              <div className="flex items-baseline justify-between gap-3 text-sm font-medium" style={{ color: '#F59E0B' }}>
                <span className="min-w-0 truncate">
                  {dp > 0 && df > 0 ? `${dp}% + fixed` : dp > 0 ? `${dp}% discount` : 'Fixed discount'}
                </span>
                <span className="lp-mono shrink-0 tabular-nums">−{fmtMoney(conv(discAmt), cur)}</span>
              </div>
            )}
            <div
              className="flex items-baseline justify-between gap-3 pt-2 text-base font-bold"
              style={{ borderTop: '1px solid var(--lp-border)', color: 'var(--lp-text)' }}
            >
              <span className="min-w-0 truncate">Total</span>
              <span className="lp-mono shrink-0 tabular-nums">{fmtMoney(conv(total), cur)}</span>
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
